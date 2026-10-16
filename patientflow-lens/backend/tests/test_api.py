"""Integration tests: data invariants, leakage, model quality and the main API flows."""
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import TRAIN_END
from app.main import app
from app.store import store


@pytest.fixture(scope="module")
def c():
    with TestClient(app) as client:
        client.post("/api/v1/clock", json={"reset": True})
        yield client


# ---------------- data
def test_etl_invariants(c):
    e = store.enc
    assert len(e) == 8000 and len(store.tests) == 5000
    assert e["dq_wait_mismatch"].sum() == 0 and e["dq_service_mismatch"].sum() == 0
    assert e["dq_child_outside_pediatrics"].sum() == 1425 and e["dq_adult_in_pediatrics"].sum() == 544
    assert store.tests["dq_outside_encounter_window"].sum() == 4998


def test_history_features_look_backwards_only(c):
    e = store.enc.sort_values("arrival_time")
    first = e.groupby("patient_id").head(1)
    assert (first["prior_visits"] == 0).all()
    assert (e["dept_arrivals_prev_24h"] >= 0).all()


# ---------------- models
def test_wait_model_beats_baselines_and_is_calibrated(c):
    m = store.metrics["wait"]
    comp = m["comparison"]
    prod = comp["Ridge regression (production)"]["MAE"]
    assert prod < comp["Overall mean (naive)"]["MAE"]
    assert prod < comp["Triage-level mean"]["MAE"]
    assert 0.75 <= m["interval"]["coverage_test"] <= 0.85
    assert m["split"]["test"].startswith(">= " + str(TRAIN_END.date()))


def test_explanation_is_exact(c):
    r = c.post("/api/v1/predict/wait", json={"department_name": "Pediatrics", "triage_level": "Low"}).json()
    total = r["baseline"] + sum(x["minutes"] for x in r["contributions"])
    assert abs(total - r["expected"]) < 0.5


# ---------------- analytics endpoints
@pytest.mark.parametrize("path", ["/api/v1/overview/kpis", "/api/v1/overview/briefing", "/api/v1/overview/flow",
                                  "/api/v1/overview/heatmap", "/api/v1/investigate/queue", "/api/v1/forecast",
                                  "/api/v1/diagnostics", "/api/v1/insights/equity", "/api/v1/insights/lbc",
                                  "/api/v1/insights/clusters", "/api/v1/meta/data-quality", "/api/v1/meta/model-card",
                                  "/api/v1/live/day?date=2025-12-15", "/api/v1/live/pulse?date=2025-12-15",
                                  "/api/v1/departments/D03", "/api/v1/patients/P01936", "/api/v1/roster/coverage",
                                  "/api/v1/roster/optimize", "/api/v1/appointments-analytics", "/api/v1/public/wait-board",
                                  "/api/v1/doctors", "/api/v1/doctors/D03-01/timetable", "/api/v1/doctors/D03-01/stats",
                                  "/api/v1/alerts", "/api/v1/meta"])
def test_endpoints_ok(c, path):
    r = c.get(path)
    assert r.status_code == 200, r.text


def test_investigate_top_is_pediatrics(c):
    q = c.get("/api/v1/investigate/queue").json()["departments"]
    assert q[0]["department_name"] == "Pediatrics" and q[0]["confidence"] == "High"


def test_filters_change_results(c):
    a = c.get("/api/v1/overview/kpis").json()["visits"]
    b = c.get("/api/v1/overview/kpis?department_id=D03").json()["visits"]
    assert b < a


# ---------------- booking flow
def _free_slot(c, dept="D03", pid="P01936"):
    r = c.get(f"/api/v1/booking/slots?department_id={dept}&patient_id={pid}&mode=my_language").json()
    assert r["recommended"], "no recommended slots"
    return r


def test_booking_rules_and_waitlist(c):
    r = _free_slot(c)
    slot = r["recommended"][0]["slot_id"]
    a = c.post("/api/v1/appointments", json={"patient_id": "P01936", "slot_id": slot}).json()
    assert a["status"] == "booked"
    # Same slot again -> conflict; same department same day -> conflict.
    assert c.post("/api/v1/appointments", json={"patient_id": "P01739", "slot_id": slot}).status_code == 409
    other = [s for s in c.get(f"/api/v1/booking/slots?department_id=D03&day={r['recommended'][0]['date']}").json()["slots"]
             if s["slot_id"] != slot]
    if other:
        assert c.post("/api/v1/appointments", json={"patient_id": "P01936", "slot_id": other[0]["slot_id"]}).status_code == 409
    # Waitlist then cancel -> offer -> accept.
    w = c.post("/api/v1/waitlist", json={"patient_id": "P00916", "department_id": "D03", "earliest": r["recommended"][0]["date"],
                                         "latest": r["recommended"][0]["date"]}).json()
    res = c.post(f"/api/v1/appointments/{a['id']}/cancel", json={"reason": "test"}).json()
    assert res["waitlist_offer"] is not None
    acc = c.post(f"/api/v1/waitlist/{res['waitlist_offer']['waitlist_id']}/accept")
    assert acc.status_code == 200 and acc.json()["slot_id"] == slot


def test_past_slot_rejected(c):
    from sqlmodel import Session, select
    from app.db import SessionSlot, engine
    with Session(engine) as s:
        past = s.exec(select(SessionSlot).where(SessionSlot.status == "free", SessionSlot.start < pd.Timestamp("2026-01-05 08:00"))).first()
    assert c.post("/api/v1/appointments", json={"patient_id": "P00085", "slot_id": past.id}).status_code in (400, 409)


# ---------------- doctor workflow
def test_doctor_day_and_status_flow(c):
    d = c.get("/api/v1/doctors/D03-01/day").json()
    assert d["running_late"] >= 15
    nxt = next(a for a in d["appointments"] if a["status"] == "checked_in")
    r = c.post(f"/api/v1/appointments/{nxt['id']}/status", json={"action": "call_in"}).json()
    assert r["appointment"]["status"] == "in_consultation"
    t = c.get(f"/api/v1/appointments/{nxt['id']}/ticket").json()
    assert t["position"] == 0
    r = c.post(f"/api/v1/appointments/{nxt['id']}/status", json={"action": "complete"}).json()
    assert r["appointment"]["status"] == "completed"
    assert c.post(f"/api/v1/appointments/{nxt['id']}/status", json={"action": "complete"}).status_code == 409


def test_leave_proposals_and_apply(c):
    leaves = c.get("/api/v1/leave-requests").json()
    lr = next(l for l in leaves if l["status"] == "pending")
    prev = c.get(f"/api/v1/leave-requests/{lr['id']}/preview").json()
    accept = {str(p["appointment"]["id"]): p["proposal"]["slot_id"] for p in prev["proposals"] if p["proposal"]}
    res = c.post(f"/api/v1/leave-requests/{lr['id']}/apply", json={"accept": accept}).json()
    assert res["leave"]["status"] == "approved" and res["moved"] == len(accept)


def test_alert_action_flow(c):
    a = c.get("/api/v1/alerts?status=open").json()[0]
    r = c.post(f"/api/v1/alerts/{a['id']}/actions", json={"verb": "assign", "owner": "Pediatrics coordinator"}).json()
    assert r["status"] == "investigating" and r["owner"] == "Pediatrics coordinator"
    r = c.post(f"/api/v1/alerts/{a['id']}/actions", json={"verb": "resolve", "note": "done"}).json()
    assert r["status"] == "resolved" and len(r["actions"]) >= 2


def test_weekly_pdf(c):
    r = c.get("/api/v1/reports/weekly.pdf")
    assert r.status_code == 200 and r.content[:4] == b"%PDF"
