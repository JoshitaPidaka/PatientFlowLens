"""Time-machine replay over the real 2025 encounters."""
import pandas as pd

from app.ml.wait_model import FEATURES
from app.store import store


def _expected(rows: pd.DataFrame):
    p = store.wait.pipeline.predict(rows[FEATURES])
    return p, p + store.wait.lo, p + store.wait.hi


def day(date: str, department_id: str | None = None):
    """All encounters overlapping a day (Gantt lanes), with model expectations for each wait."""
    d0 = pd.Timestamp(date)
    d1 = d0 + pd.Timedelta(days=1)
    e = store.enc
    e = e[(e["arrival_time"] < d1) & (e["discharge_time"] > d0)]
    if department_id:
        e = e[e["department_id"] == department_id]
    if e.empty:
        return {"date": date, "encounters": [], "departments": []}
    exp, lo, hi = _expected(e)
    out = []
    for (_, r), x, l, h in zip(e.iterrows(), exp, lo, hi):
        out.append({"encounter_id": r["encounter_id"], "patient_id": r["patient_id"], "department_id": r["department_id"],
                    "department_name": r["department_name"], "triage_level": r["triage_level"], "visit_type": r["visit_type"],
                    "outcome": r["outcome"], "arrival": r["arrival_time"].isoformat(),
                    "service_start": r["service_start_time"].isoformat(), "service_end": r["service_end_time"].isoformat(),
                    "discharge": r["discharge_time"].isoformat(), "wait": float(r["wait_minutes"]),
                    "expected_wait": round(float(x), 1), "p10": round(float(max(l, 0)), 1), "p90": round(float(h), 1)})
    return {"date": date, "encounters": sorted(out, key=lambda o: o["arrival"]),
            "departments": sorted(e["department_name"].unique().tolist())}


def snapshot(ts: str, department_id: str | None = None):
    t = pd.Timestamp(ts)
    e = store.enc
    e = e[(e["arrival_time"] <= t) & (e["discharge_time"] > t)]
    if department_id:
        e = e[e["department_id"] == department_id]
    cards = []
    if not e.empty:
        exp, lo, hi = _expected(e)
        for (_, r), x, l, h in zip(e.iterrows(), exp, lo, hi):
            if t < r["service_start_time"]:
                state = "waiting"
                elapsed = (t - r["arrival_time"]).total_seconds() / 60
                status = "overdue" if elapsed > h else ("at_risk" if elapsed > x else "on_track")
            elif t < r["service_end_time"]:
                state, elapsed, status = "in_service", (t - r["service_start_time"]).total_seconds() / 60, "in_service"
            else:
                state, elapsed, status = "awaiting_discharge", (t - r["service_end_time"]).total_seconds() / 60, "awaiting"
            cards.append({"encounter_id": r["encounter_id"], "patient_id": r["patient_id"], "department_name": r["department_name"],
                          "triage_level": r["triage_level"], "visit_type": r["visit_type"], "state": state,
                          "elapsed": round(elapsed, 1), "expected_wait": round(float(x), 1), "p10": round(float(max(l, 0)), 1),
                          "p90": round(float(h), 1), "status": status, "arrival": r["arrival_time"].isoformat()})
    counts = {s: sum(c["state"] == s for c in cards) for s in ["waiting", "in_service", "awaiting_discharge"]}
    watch = [c for c in cards if c["status"] in ("at_risk", "overdue")]
    return {"ts": t.isoformat(), "counts": counts, "cards": cards, "watchlist": watch}


def pulse(date: str):
    """Patients waiting / in service per 15 minutes across a day (Hospital Pulse)."""
    d0 = pd.Timestamp(date)
    e = store.enc
    e = e[(e["arrival_time"] < d0 + pd.Timedelta(days=1)) & (e["discharge_time"] > d0)]
    out = []
    for t in pd.date_range(d0, d0 + pd.Timedelta(hours=23, minutes=45), freq="15min"):
        waiting = int(((e["arrival_time"] <= t) & (e["service_start_time"] > t)).sum())
        serving = int(((e["service_start_time"] <= t) & (e["service_end_time"] > t)).sum())
        out.append({"t": t.strftime("%H:%M"), "waiting": waiting, "in_service": serving})
    return out


def busiest_days(n=8):
    c = store.enc.groupby("arrival_date").size().sort_values(ascending=False).head(n)
    return [{"date": str(k.date()), "visits": int(v)} for k, v in c.items()]
