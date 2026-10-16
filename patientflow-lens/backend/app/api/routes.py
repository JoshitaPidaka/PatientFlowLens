"""REST API (/api/v1). Thin routers: validation here, logic in app.services."""
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import (Appointment, Doctor, Feedback, Notification, SessionSlot, Setting, TurnaroundTarget, WaitlistEntry,
                    get_session)
from app.services import alerts as al
from app.services import analytics as an
from app.services import live
from app.services import scheduling as sch
from app.services.reports import weekly_pdf
from app.store import store

router = APIRouter(prefix="/api/v1")
S = Depends(get_session)


def filters(date_from: Optional[str] = None, date_to: Optional[str] = None, department_id: Optional[str] = None,
            triage_level: Optional[str] = None, visit_type: Optional[str] = None):
    return {"date_from": date_from, "date_to": date_to, "department_id": department_id, "triage_level": triage_level,
            "visit_type": visit_type}


F = Depends(filters)


# ------------------------------------------------------------------ meta
@router.get("/health")
def health():
    return {"status": "ok", "models_loaded": store.loaded}


@router.get("/meta")
def meta(s: Session = S):
    now = sch.get_now(s)
    docs = s.exec(select(Doctor)).all()
    p = store.patients
    visits = store.enc.groupby("patient_id").size()
    from app.etl.simulate import preferred_language
    featured = []
    for pid in ["P01936", "P01739", "P00916", "P01122"]:
        r = p.set_index("patient_id").loc[pid]
        featured.append({"patient_id": pid, "age": int(r["age"]), "sex": r["sex"], "language": preferred_language(r["home_area"]),
                         "visits": int(visits.get(pid, 0))})
    return {
        "now": now.isoformat(), "data_range": ["2025-01-01", "2025-12-31"],
        "departments": [{"department_id": r.department_id, "department_name": r.department_name, "service_type": r.service_type,
                         "staff_count": int(r.staff_count)} for r in store.depts.itertuples()],
        "triage_levels": ["Critical", "High", "Medium", "Low"], "visit_types": ["Scheduled", "Walk-in", "Emergency", "Follow-up"],
        "doctors": [{"doctor_id": d.doctor_id, "name": d.name, "department_id": d.department_id, "department_name": d.department_name,
                     "kind": d.kind} for d in docs],
        "featured_patients": featured,
    }


@router.get("/meta/data-quality")
def data_quality():
    return an.data_quality()


@router.get("/meta/model-card")
def model_card():
    return an.model_card()


class ClockIn(BaseModel):
    minutes: Optional[int] = None
    reset: bool = False


@router.post("/clock")
def clock(body: ClockIn, s: Session = S):
    from app.config import DEMO_NOW
    if body.reset:
        return {"now": sch.set_now(s, DEMO_NOW).isoformat()}
    now = sch.get_now(s) + timedelta(minutes=body.minutes or 15)
    sch.set_now(s, now)
    for d in ("D03-01", "D04-02"):
        sch.notify_running_late(s, d, now)
    s.commit()
    return {"now": now.isoformat()}


# ------------------------------------------------------------------ command
@router.get("/overview/kpis")
def kpis(f: dict = F):
    return an.kpis(f)


@router.get("/overview/briefing")
def briefing():
    return an.briefing()


@router.get("/overview/flow")
def flow(f: dict = F):
    return {"funnel": an.flow_funnel(f), "sankey": an.sankey(f)}


@router.get("/overview/heatmap")
def heatmap(f: dict = F):
    return an.heatmap(f)


@router.get("/overview/hourly")
def hourly():
    return an.hourly_pattern()


@router.get("/investigate/queue")
def investigate():
    return an.investigate_queue()


class WhatIf(BaseModel):
    department_id: str
    target: str = "hospital"
    improvement_pct: float = 100
    triage_shift: float = 0


@router.post("/whatif")
def whatif(body: WhatIf):
    return an.whatif(body.department_id, body.target, body.improvement_pct, body.triage_shift)


# ------------------------------------------------------------------ alerts
@router.get("/alerts")
def alerts(status: Optional[str] = None, department_id: Optional[str] = None, kind: Optional[str] = None, s: Session = S):
    return al.list_alerts(s, status, department_id, kind)


@router.get("/alerts/{alert_id}")
def alert(alert_id: int, s: Session = S):
    return al.get_alert(s, alert_id)


class AlertAct(BaseModel):
    verb: str
    actor: str = "Ops manager"
    note: Optional[str] = None
    owner: Optional[str] = None
    due_at: Optional[datetime] = None
    status: Optional[str] = None


@router.post("/alerts/{alert_id}/actions")
def alert_action(alert_id: int, body: AlertAct, s: Session = S):
    return al.act(s, alert_id, body.actor, body.verb, body.note, body.owner, body.due_at, body.status)


class RuleIn(BaseModel):
    name: str
    metric: str = "excess_wait"
    threshold: float
    window_weeks: int = 2


@router.get("/alert-rules")
def rules(s: Session = S):
    from app.db import AlertRule
    return s.exec(select(AlertRule)).all()


@router.post("/alert-rules")
def add_rule(body: RuleIn, s: Session = S):
    from app.db import AlertRule
    r = AlertRule(**body.model_dump())
    s.add(r)
    s.commit()
    hits = al.evaluate_rule(s, r)
    s.commit()
    return {"rule": r, "alerts_created": hits}


# ------------------------------------------------------------------ live replay
@router.get("/live/day")
def live_day(date: str = "2025-12-15", department_id: Optional[str] = None):
    return live.day(date, department_id)


@router.get("/live/snapshot")
def live_snapshot(ts: str, department_id: Optional[str] = None):
    return live.snapshot(ts, department_id)


@router.get("/live/pulse")
def live_pulse(date: str = "2025-12-15"):
    return live.pulse(date)


@router.get("/live/busiest")
def busiest():
    return live.busiest_days()


# ------------------------------------------------------------------ departments + journeys + predict
@router.get("/departments/{department_id}")
def department(department_id: str):
    if department_id not in store.dept_name:
        raise HTTPException(404, "department not found")
    return an.department_view(department_id)


@router.get("/departments/{department_id}/sessions")
def dept_sessions(department_id: str, day: Optional[str] = None, s: Session = S):
    now = sch.get_now(s)
    d = date.fromisoformat(day) if day else now.date()
    docs = s.exec(select(Doctor).where(Doctor.department_id == department_id, Doctor.kind == "doctor")).all()
    out = []
    for doc in docs:
        dd = sch.doctor_day(s, doc.doctor_id, d)
        if not dd["appointments"] and not any(x["status"] == "scheduled" for x in dd["shifts"]):
            continue
        out.append({"doctor": dd["doctor"], "shifts": dd["shifts"], "counts": dd["counts"], "running_late": dd["running_late"],
                    "appointments": dd["appointments"]})
    return {"date": d.isoformat(), "now": now.isoformat(), "sessions": out}


@router.get("/patients")
def patients(q: str = "", limit: int = 20):
    return an.search_patients(q, limit)


@router.get("/patients/{pid}")
def patient(pid: str, s: Session = S):
    if pid not in store.patient_idx.index:
        raise HTTPException(404, "patient not found")
    d = an.patient_detail(pid)
    docs = sch.doctors_map(s)
    ed = {r[0]: r[1] for r in s.exec(select(Appointment.encounter_id, Appointment.doctor_id).where(Appointment.patient_id == pid)).all()}
    from app.db import EncounterDoctor
    for x in s.exec(select(EncounterDoctor).where(EncounterDoctor.encounter_id.in_([v["encounter_id"] for v in d["visits"]]))).all():
        ed.setdefault(x.encounter_id, x.doctor_id)
    for v in d["visits"]:
        doc = docs.get(ed.get(v["encounter_id"]))
        v["doctor_name"] = doc.name if doc else None
    appts = s.exec(select(Appointment).where(Appointment.patient_id == pid).order_by(Appointment.slot_start.desc())).all()
    d["appointments"] = [sch.appt_dict(a, docs) for a in appts]
    return d


@router.get("/encounters/{eid}/timeline")
def timeline(eid: str):
    return an.encounter_timeline(eid)


class PredictIn(BaseModel):
    department_name: str
    triage_level: str
    visit_type: str = "Walk-in"
    age: float = 45
    arrival_hour: int = 10
    sex: Optional[str] = None
    insurance_type: Optional[str] = None
    chronic_condition: Optional[str] = None
    prior_visits: Optional[int] = None
    dept_arrivals_prev_24h: Optional[int] = None


@router.post("/predict/wait")
def predict(body: PredictIn):
    row = {k: v for k, v in body.model_dump().items() if v is not None}
    return store.wait.explain(row)


# ------------------------------------------------------------------ forecast, diagnostics, insights
@router.get("/forecast")
def forecast(department_id: Optional[str] = None):
    return an.forecasts(department_id)


@router.get("/diagnostics")
def diagnostics(s: Session = S):
    targets = [{"id": t.id, "test_type": t.test_type, "priority": t.priority, "target_minutes": t.target_minutes}
               for t in s.exec(select(TurnaroundTarget)).all()]
    return {**an.diagnostics(targets), "support": an.support_scorecard()}


class TargetIn(BaseModel):
    test_type: str
    priority: str
    target_minutes: int


@router.post("/targets")
def add_target(body: TargetIn, s: Session = S):
    from app.db import Alert
    t = TurnaroundTarget(**body.model_dump())
    s.add(t)
    tests = store.tests[(store.tests["test_type"] == body.test_type) & (store.tests["priority"] == body.priority)]
    breaches = int((tests["turnaround_minutes"] > body.target_minutes).sum())
    if breaches:
        s.add(Alert(kind="target_breach", severity="medium", confidence="High", test_type=body.test_type,
                    title=f"{body.priority} {body.test_type}: {breaches} of {len(tests)} tests over the {body.target_minutes}-min target",
                    summary=f"{100 * breaches / len(tests):.0f}% breach rate against the new target.",
                    signals={"breaches": breaches, "n": int(len(tests)), "target": body.target_minutes},
                    evidence={"type": "tests"}, suggested_action="Review the slowest requests and the queueing rule for this test.",
                    detected_at=sch.get_now(s)))
    s.commit()
    return {"id": t.id, "breaches": breaches}


@router.delete("/targets/{tid}")
def del_target(tid: int, s: Session = S):
    t = s.get(TurnaroundTarget, tid)
    if t:
        s.delete(t)
        s.commit()
    return {"ok": True}


@router.get("/insights/equity")
def equity():
    return an.equity()


@router.get("/insights/lbc")
def lbc():
    return an.lbc()


@router.get("/insights/clusters")
def clusters():
    return an.clusters()


@router.get("/reports/weekly.pdf")
def report(s: Session = S):
    pdf = weekly_pdf(al.list_alerts(s, status="open"))
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=patientflow-weekly.pdf"})


@router.get("/export/{table}.csv")
def export(table: str, f: dict = F):
    if table == "encounters":
        df = an.filtered(f).drop(columns=[c for c in ["week", "arrival_date"] if c in store.enc])
    elif table == "bottlenecks":
        df = store.analytics["bottlenecks"].drop(columns=["per_triage"])
    elif table == "tests":
        df = store.tests
    else:
        raise HTTPException(404, "unknown table")
    return StreamingResponse(iter([df.to_csv(index=False)]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={table}.csv"})


# ------------------------------------------------------------------ doctors
@router.get("/doctors")
def doctors(department_id: Optional[str] = None, language: Optional[str] = None, available_on: Optional[str] = None, s: Session = S):
    return sch.list_doctors(s, department_id, language, available_on)


@router.get("/doctors/{doctor_id}/timetable")
def timetable(doctor_id: str, week: Optional[str] = None, s: Session = S):
    now = sch.get_now(s)
    ws = date.fromisoformat(week) if week else now.date() - timedelta(days=now.weekday())
    return sch.doctor_timetable(s, doctor_id, ws)


@router.get("/doctors/{doctor_id}/day")
def doctor_day(doctor_id: str, day: Optional[str] = None, s: Session = S):
    return sch.doctor_day(s, doctor_id, date.fromisoformat(day) if day else sch.get_now(s).date())


@router.get("/doctors/{doctor_id}/stats")
def doctor_stats(doctor_id: str, s: Session = S):
    from app.db import EncounterDoctor
    doc = s.get(Doctor, doctor_id)
    if not doc:
        raise HTTPException(404, "doctor not found")
    eids = s.exec(select(EncounterDoctor.encounter_id).where(EncounterDoctor.doctor_id == doctor_id)).all()
    e = store.enc
    mine = e[e["encounter_id"].isin(eids)]
    dept = e[e["department_id"] == doc.department_id]
    tri = dept.groupby("triage_level")["wait_minutes"].mean()
    adj_mine = (mine["wait_minutes"] - mine["triage_level"].map(tri)).mean()
    month = mine.groupby(mine["arrival_time"].dt.to_period("M")).size()
    return {"doctor": sch.doctor_dict(doc), "patients_seen": int(len(mine)),
            "by_visit_type": mine["visit_type"].value_counts().to_dict(),
            "median_consult": float(mine["service_minutes"].median()), "dept_median_consult": float(dept["service_minutes"].median()),
            "my_patients_wait": float(mine["wait_minutes"].mean()), "dept_wait": float(dept["wait_minutes"].mean()),
            "triage_adjusted_vs_dept": round(float(adj_mine), 2),
            "per_month": [{"month": str(k), "n": int(v)} for k, v in month.items()],
            "note": "Encounter-to-doctor assignment is simulated (round-robin among on-shift doctors); waits are real."}


@router.get("/doctors/{doctor_id}/patients")
def doctor_patients(doctor_id: str, q: str = "", s: Session = S):
    from app.db import EncounterDoctor
    eids = s.exec(select(EncounterDoctor.encounter_id).where(EncounterDoctor.doctor_id == doctor_id)).all()
    e = store.enc[store.enc["encounter_id"].isin(eids)]
    appt_p = s.exec(select(Appointment.patient_id).where(Appointment.doctor_id == doctor_id, Appointment.source.in_(["seeded", "app"]))).all()
    pids = set(e["patient_id"]) | set(appt_p)
    if q:
        pids = {p for p in pids if q.upper() in p}
    last = e.groupby("patient_id")["arrival_time"].max()
    out = []
    for pid in sorted(pids)[:60]:
        r = store.patient_idx.loc[pid]
        out.append({"patient_id": pid, "age": int(r["age"]), "sex": r["sex"], "chronic_condition": r["chronic_condition"],
                    "last_visit": last[pid].isoformat() if pid in last else None})
    return out


@router.get("/appointments/{appt_id}")
def appointment(appt_id: int, s: Session = S):
    a = s.get(Appointment, appt_id)
    if not a:
        raise HTTPException(404, "appointment not found")
    from app.db import AppointmentEvent
    ev = s.exec(select(AppointmentEvent).where(AppointmentEvent.appointment_id == appt_id).order_by(AppointmentEvent.at)).all()
    return {**sch.appt_dict(a, sch.doctors_map(s)), "events": [{"from": x.from_status, "to": x.to_status, "actor": x.actor,
                                                                 "at": x.at.isoformat(), "note": x.note} for x in ev]}


class StatusIn(BaseModel):
    action: str


@router.post("/appointments/{appt_id}/status")
def appt_status(appt_id: int, body: StatusIn, s: Session = S):
    return sch.set_status(s, appt_id, body.action)


class LeaveIn(BaseModel):
    doctor_id: str
    from_date: str
    to_date: str
    reason: str = "Personal"


@router.post("/leave-requests")
def leave_request(body: LeaveIn, s: Session = S):
    return sch.request_leave(s, body.doctor_id, body.from_date, body.to_date, body.reason)


@router.get("/leave-requests")
def leave_list(doctor_id: Optional[str] = None, s: Session = S):
    return sch.list_leave(s, doctor_id)


class Decision(BaseModel):
    decision: str


@router.post("/leave-requests/{lid}/decision")
def leave_decision(lid: int, body: Decision, s: Session = S):
    return sch.decide_leave(s, lid, body.decision)


class ApplyLeave(BaseModel):
    accept: dict = {}


@router.post("/leave-requests/{lid}/apply")
def leave_apply(lid: int, body: ApplyLeave, s: Session = S):
    return sch.apply_leave(s, lid, body.accept)


@router.get("/leave-requests/{lid}/preview")
def leave_preview(lid: int, s: Session = S):
    from app.db import LeaveRequest
    lr = s.get(LeaveRequest, lid)
    if not lr:
        raise HTTPException(404, "not found")
    return {"leave": sch.leave_dict(s, lr), "proposals": sch.leave_proposals(s, lr)}


# ------------------------------------------------------------------ booking (patient)
@router.get("/booking/slots")
def slots(department_id: str, patient_id: Optional[str] = None, doctor_id: Optional[str] = None, day: Optional[str] = None,
          mode: str = "earliest", visit_type: str = "Scheduled", s: Session = S):
    return sch.rank_slots(s, department_id, patient_id, doctor_id, day, mode, visit_type)


class BookIn(BaseModel):
    patient_id: str
    slot_id: int
    visit_type: str = "Scheduled"
    reason: Optional[str] = None
    parent_appointment_id: Optional[int] = None


@router.post("/appointments")
def create_appt(body: BookIn, s: Session = S):
    return sch.book(s, body.patient_id, body.slot_id, body.visit_type, body.reason, parent_id=body.parent_appointment_id)


class CancelIn(BaseModel):
    reason: Optional[str] = None


@router.post("/appointments/{appt_id}/cancel")
def cancel_appt(appt_id: int, body: CancelIn, s: Session = S):
    return sch.cancel(s, appt_id, reason=body.reason)


class RescheduleIn(BaseModel):
    slot_id: int


@router.post("/appointments/{appt_id}/reschedule")
def resched(appt_id: int, body: RescheduleIn, s: Session = S):
    return sch.reschedule(s, appt_id, body.slot_id)


@router.post("/appointments/{appt_id}/check-in")
def checkin(appt_id: int, s: Session = S):
    return sch.check_in(s, appt_id)


@router.get("/appointments/{appt_id}/ticket")
def ticket(appt_id: int, s: Session = S):
    return sch.ticket(s, appt_id)


class FeedbackIn(BaseModel):
    stars: int
    tags: list[str] = []
    comment: Optional[str] = None


@router.post("/appointments/{appt_id}/feedback")
def feedback(appt_id: int, body: FeedbackIn, s: Session = S):
    if not 1 <= body.stars <= 5:
        raise HTTPException(400, "stars must be 1–5")
    s.add(Feedback(appointment_id=appt_id, stars=body.stars, tags=body.tags, comment=body.comment, created_at=sch.get_now(s)))
    s.commit()
    return {"ok": True}


class WaitlistIn(BaseModel):
    patient_id: str
    department_id: str
    earliest: str
    latest: str
    doctor_id: Optional[str] = None


@router.post("/waitlist")
def waitlist(body: WaitlistIn, s: Session = S):
    return sch.join_waitlist(s, body.patient_id, body.department_id, body.earliest, body.latest, body.doctor_id)


@router.get("/waitlist")
def waitlist_list(patient_id: Optional[str] = None, s: Session = S):
    q = select(WaitlistEntry).order_by(WaitlistEntry.created_at)
    if patient_id:
        q = q.where(WaitlistEntry.patient_id == patient_id)
    return s.exec(q).all()


@router.post("/waitlist/{wid}/accept")
def waitlist_accept(wid: int, s: Session = S):
    return sch.accept_offer(s, wid)


@router.get("/patients/{pid}/appointments")
def patient_appts(pid: str, s: Session = S):
    docs = sch.doctors_map(s)
    now = sch.get_now(s)
    appts = s.exec(select(Appointment).where(Appointment.patient_id == pid).order_by(Appointment.slot_start.desc())).all()
    fb = {f.appointment_id: f.stars for f in s.exec(select(Feedback)).all()}
    out = [{**sch.appt_dict(a, docs), "rating": fb.get(a.id)} for a in appts]
    upcoming = sorted([o for o in out if o["status"] in sch.ACTIVE and o["slot_start"] >= now.date().isoformat()], key=lambda o: o["slot_start"])
    past = [o for o in out if o not in upcoming]
    # Follow-up suggestion: real follow-up gaps for this department.
    sugg = None
    last_done = next((a for a in appts if a.status == "completed"), None)
    if last_done and not any(u["department_id"] == last_done.department_id for u in upcoming):
        e = store.enc
        fu = e[e["visit_type"] == "Follow-up"]
        prev = e.set_index("encounter_id")["arrival_time"]
        gaps = (fu["arrival_time"] - fu["prev_encounter_same_dept"].map(prev)).dt.days.dropna()
        lo, hi = int(gaps.quantile(.25)), int(gaps.quantile(.5))
        sugg = {"department_id": last_done.department_id, "department_name": store.dept_name[last_done.department_id],
                "doctor_id": last_done.doctor_id, "doctor_name": docs[last_done.doctor_id].name,
                "window": [(now + timedelta(days=min(lo, 7))).date().isoformat(), (now + timedelta(days=min(max(hi, 8), 13))).date().isoformat()],
                "last_visit": last_done.slot_start.isoformat(),
                "basis": f"In the data, follow-ups typically come {lo}–{hi} days after a visit. Earliest bookable window shown."}
    return {"now": now.isoformat(), "upcoming": upcoming, "past": past[:40], "follow_up": sugg}


@router.get("/notifications")
def notifications(user_key: str, s: Session = S):
    rows = s.exec(select(Notification).where(Notification.user_key == user_key).order_by(Notification.created_at.desc())).all()[:40]
    return rows


@router.post("/notifications/{nid}/read")
def read_notification(nid: int, s: Session = S):
    n = s.get(Notification, nid)
    if n:
        n.read = True
        s.commit()
    return {"ok": True}


@router.get("/public/wait-board")
def wait_board(s: Session = S):
    now = sch.get_now(s)
    from app.db import RosterEntry
    on = s.exec(select(RosterEntry).where(RosterEntry.date == now.date(), RosterEntry.status == "scheduled")).all()
    docs = sch.doctors_map(s)
    shift = "Morning" if 8 <= now.hour < 14 else ("Evening" if 14 <= now.hour < 20 else "Night")
    tri = ["Critical", "High", "Medium", "Low"]
    rows = [{"department_name": d.department_name, "triage_level": t, "arrival_hour": now.hour}
            for d in store.depts.itertuples() for t in tri]
    preds = store.wait.predict(rows).reshape(len(store.depts), 4)
    out = []
    for d, p in zip(store.depts.itertuples(), preds):
        bands = {"Urgent": round(float(p[:2].mean())), "Standard": round(float(p[2:].mean()))}
        out.append({"department_id": d.department_id, "department_name": d.department_name, **bands,
                    "on_duty": [docs[r.doctor_id].name for r in on if r.department_id == d.department_id and r.shift == shift
                                and docs[r.doctor_id].kind == "doctor"]})
    return {"now": now.isoformat(), "shift": shift, "departments": out}


# ------------------------------------------------------------------ scheduling admin
@router.get("/roster/coverage")
def coverage(week: Optional[str] = None, department_id: Optional[str] = None, s: Session = S):
    now = sch.get_now(s)
    ws = date.fromisoformat(week) if week else now.date() - timedelta(days=now.weekday())
    return sch.coverage(s, ws, department_id)


@router.get("/roster/optimize")
def optimize(week: Optional[str] = None, department_id: Optional[str] = None, s: Session = S):
    now = sch.get_now(s)
    ws = date.fromisoformat(week) if week else now.date() - timedelta(days=now.weekday())
    return sch.optimize(s, ws, department_id)


class RosterAdd(BaseModel):
    doctor_id: str
    day: str
    shift: str


@router.post("/roster")
def roster_add(body: RosterAdd, s: Session = S):
    return sch.apply_roster(s, body.doctor_id, body.day, body.shift)


@router.get("/appointments-analytics")
def appt_analytics(s: Session = S):
    return sch.appointment_analytics(s)


@router.post("/admin/reset-demo")
def reset_demo():
    from scripts.bootstrap import main as boot
    boot()
    store.load()
    return {"ok": True}
