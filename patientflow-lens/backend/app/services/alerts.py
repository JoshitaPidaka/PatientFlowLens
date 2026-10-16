"""Alert engine: turns model output and rules into explained, actionable alerts."""
from datetime import timedelta

import pandas as pd
from fastapi import HTTPException
from sqlmodel import Session, delete, select

from app.config import DEMO_NOW, TRAIN_END
from app.db import Alert, AlertAction, AlertRule, Notification, engine
from app.store import store


def _add(s, **kw):
    s.add(Alert(**kw))


def generate_all():
    with Session(engine) as s:
        s.exec(delete(AlertAction))
        s.exec(delete(Alert))
        b = store.analytics["bottlenecks"]
        # 1. Persistent bottlenecks (triage-adjusted, high confidence).
        for r in b[(b["excess_wait"] > 0) & (b["confidence"] != "Low")].itertuples():
            _add(s, kind="bottleneck", department_id=r.department_id, severity="high" if r.excess_wait > 6 else "medium",
                 confidence=r.confidence, title=f"{r.department_name}: waits {r.excess_wait:.1f} min longer than its triage mix explains",
                 summary=f"Slower than the hospital at {r.slower_levels} of 4 triage levels; ~{r.impact_hours:.0f} extra patient-hours a year.",
                 signals={"excess_wait": round(r.excess_wait, 2), "ci95": round(r.ci95, 2), "slower_levels": int(r.slower_levels),
                          "impact_hours": round(r.impact_hours, 1), "p90_wait": round(r.p90_wait, 1), "per_triage": r.per_triage,
                          "lbc_rate": round(100 * r.lbc_rate, 2)},
                 evidence={"type": "department", "department_id": r.department_id},
                 suggested_action="Review staffing at the triage → service handoff for Low/Medium patients; compare with "
                                  "the fastest department at the same triage level.",
                 detected_at=DEMO_NOW - timedelta(days=2))
        # 2. Unusual weeks (EWMA control chart + IsolationForest), test period only.
        w = store.analytics["weekly"]
        # Only operational problems: longer-than-predicted weeks with enough visits to judge (drops the partial last week).
        recent = w[(w["week"] >= TRAIN_END) & (w["ewma_flag"] | w["iso_flag"]) & (w["resid"] > 0) & (w["n"] >= 6)]
        for r in recent.itertuples():
            both = r.ewma_flag and r.iso_flag
            conf = "High" if both else ("Medium" if r.ewma_flag else "Low")
            direction = "longer" if r.resid > 0 else "shorter"
            _add(s, kind="unusual_wait", department_id=r.department_id, severity="medium" if r.resid > 8 else "low", confidence=conf,
                 title=f"Unusual week in {r.department_name} ({r.week:%d %b}): waits {abs(r.resid):.0f} min {direction} than predicted",
                 summary=f"{r.n} visits; p90 wait {r.p90:.0f} min; left-before-care {100 * r.lbc:.0f}%. "
                         f"Flagged by {'both detectors' if both else ('EWMA control chart' if r.ewma_flag else 'IsolationForest only')}.",
                 signals={"week": str(r.week.date()), "resid": round(r.resid, 1), "ewma": round(r.ewma, 2), "ucl": round(r.ucl, 2),
                          "p90": round(r.p90, 1), "lbc_pct": round(100 * r.lbc, 1), "n": int(r.n),
                          "ewma_flag": bool(r.ewma_flag), "iso_flag": bool(r.iso_flag)},
                 evidence={"type": "week", "department_id": r.department_id, "week": str(r.week.date())},
                 suggested_action="Check that week's rota and any unusual case mix before acting; low-confidence alerts "
                                  "may be noise.", detected_at=r.week + timedelta(days=7))
        # 3. Urgent tests not prioritised.
        t = store.tests
        med = t.groupby(["test_type", "priority"])["turnaround_minutes"].median().unstack()
        bad = med[med["Urgent"] >= 0.9 * med["Routine"]]
        pri = t.groupby("priority")["turnaround_minutes"].median()
        _add(s, kind="priority_breach", severity="high", confidence="High",
             title=f"Urgent tests are not faster than routine ({pri['Urgent']:.0f} vs {pri['Routine']:.0f} min median)",
             summary=f"{len(bad)} of {len(med)} test types show no urgent-priority advantage.",
             signals={"by_type": {k: {"urgent": round(v["Urgent"], 1), "routine": round(v["Routine"], 1)} for k, v in med.iterrows()},
                      "urgent_median": round(pri["Urgent"], 1), "routine_median": round(pri["Routine"], 1)},
             evidence={"type": "tests"}, suggested_action="Check how labs and imaging queue urgent requests; set turnaround "
                                                          "targets per test type in Diagnostics.", detected_at=DEMO_NOW - timedelta(days=1))
        # 4. Left-before-care spikes (recent weeks, enough volume).
        spikes = w[(w["week"] >= TRAIN_END) & (w["lbc"] >= 0.15) & (w["n"] >= 8)]
        for r in spikes.itertuples():
            _add(s, kind="lbc_spike", department_id=r.department_id, severity="medium", confidence="Low",
                 title=f"Left-before-care spike in {r.department_name} ({r.week:%d %b}): {100 * r.lbc:.0f}%",
                 summary=f"{r.n} visits that week vs a ~3% hospital average. Small numbers: treat as a prompt to check, not proof.",
                 signals={"lbc_pct": round(100 * r.lbc, 1), "n": int(r.n), "week": str(r.week.date())},
                 evidence={"type": "week", "department_id": r.department_id, "week": str(r.week.date())},
                 suggested_action="Look at the visits that left and their waits.", detected_at=r.week + timedelta(days=7))
        # 5. User rules.
        for rule in s.exec(select(AlertRule).where(AlertRule.enabled)).all():
            evaluate_rule(s, rule)
        # Realism: a couple of older alerts already handled.
        s.flush()
        for kind, dept, owner, note in [("bottleneck", "D07", "Lab supervisor", "Reviewing sample-collection staffing for Low/Medium patients."),
                                        ("rule", "D11", "Department coordinator", "Checking the Outpatient call-in order.")]:
            a = s.exec(select(Alert).where(Alert.kind == kind, Alert.department_id == dept)).first()
            if a:
                a.status, a.owner, a.due_at = "investigating", owner, DEMO_NOW + timedelta(days=3)
                s.add(AlertAction(alert_id=a.id, actor="Ops manager", verb="assign", note=f"assigned to {owner}. {note}",
                                  at=DEMO_NOW - timedelta(days=1)))
        for a in s.exec(select(Alert).where(Alert.kind == "unusual_wait").order_by(Alert.detected_at)).all()[:2]:
            a.status, a.owner, a.resolved_at = "resolved", "Ops manager", a.detected_at + timedelta(days=3)
            s.add(AlertAction(alert_id=a.id, actor="Ops manager", verb="resolve", note="Rota gap that week; fixed.", at=a.resolved_at))
        s.commit()
        scheduling_alerts(s)
        return len(s.exec(select(Alert)).all())


def evaluate_rule(s, rule):
    w = store.analytics["weekly"]
    tri = store.analytics["triage_overall"]
    e = store.enc
    exp = e.assign(m=e["triage_level"].map(tri)).groupby(["department_id", "week"])["m"].mean()
    w = w.set_index(["department_id", "week"]).join(exp.rename("expected")).reset_index()
    w["excess"] = w["mean_wait"] - w["expected"]
    w = w[w["week"] >= TRAIN_END]
    hits = 0
    for d, g in w.groupby("department_id"):
        run, best = 0, None
        for r in g.sort_values("week").itertuples():
            run = run + 1 if r.excess > rule.threshold else 0
            if run >= rule.window_weeks:
                best = r
        if best is not None:
            hits += 1
            _add(s, kind="rule", department_id=d, severity="medium", confidence="Medium",
                 title=f"Rule '{rule.name}': {store.dept_name[d]}",
                 summary=f"Excess wait above {rule.threshold:.0f} min for {rule.window_weeks}+ consecutive weeks (latest {best.week:%d %b}).",
                 signals={"rule_id": rule.id, "latest_excess": round(best.excess, 1), "week": str(best.week.date())},
                 evidence={"type": "week", "department_id": d, "week": str(best.week.date())},
                 suggested_action="Investigate alongside the department's bottleneck alert.", detected_at=best.week + timedelta(days=7))
    return hits


def scheduling_alerts(s):
    from app.services import scheduling as sch
    now = sch.get_now(s)
    for doc_id in ("D03-01", "D04-02"):
        late = sch.running_late(s, doc_id, now.date(), now)
        if late["delay_min"] >= 10:
            from app.db import Doctor
            d = s.get(Doctor, doc_id)
            _add(s, kind="running_late", department_id=d.department_id, severity="medium", confidence="High",
                 title=f"{d.name} ({d.department_name}) is running {late['delay_min']:.0f} min late",
                 summary=f"{len(late['etas'])} patients still to be seen today; ETAs recalculated from real consult durations.",
                 signals={"delay_min": late["delay_min"], "remaining": len(late["etas"]), "doctor_id": doc_id},
                 evidence={"type": "doctor_day", "doctor_id": doc_id, "date": now.date().isoformat()},
                 suggested_action="Move one of the next patients to a colleague with a free slot, or open a reserve slot.",
                 detected_at=now - timedelta(minutes=5))
    week = now.date() - timedelta(days=now.weekday())
    cov = sch.coverage(s, week)["cells"]
    for c in [c for c in cov if c["status"] == "gap" and c["date"] >= now.date().isoformat()][:5]:
        _add(s, kind="coverage_gap", department_id=c["department_id"], severity="high", confidence="High",
             title=f"No doctor rostered: {c['department_name']} {c['weekday']} {c['shift']}",
             summary=f"On leave: {', '.join(c['on_leave']) or 'n/a'}. {c['booked']} bookings affected.",
             signals=c, evidence={"type": "coverage", "date": c["date"], "shift": c["shift"], "department_id": c["department_id"]},
             suggested_action="Use the roster optimizer to add an off-duty colleague.", detected_at=now - timedelta(hours=2))
    s.commit()


def alert_dict(a: Alert, actions=None):
    return {"id": a.id, "kind": a.kind, "department_id": a.department_id,
            "department_name": store.dept_name.get(a.department_id) if a.department_id else None, "severity": a.severity,
            "confidence": a.confidence, "title": a.title, "summary": a.summary, "signals": a.signals, "evidence": a.evidence,
            "suggested_action": a.suggested_action, "status": a.status, "owner": a.owner,
            "due_at": a.due_at.isoformat() if a.due_at else None, "detected_at": a.detected_at.isoformat(),
            "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
            "actions": [{"actor": x.actor, "verb": x.verb, "note": x.note, "at": x.at.isoformat()} for x in (actions or [])]}


def list_alerts(s, status=None, department_id=None, kind=None):
    q = select(Alert).order_by(Alert.detected_at.desc())
    if status:
        q = q.where(Alert.status == status)
    if department_id:
        q = q.where(Alert.department_id == department_id)
    if kind:
        q = q.where(Alert.kind == kind)
    return [alert_dict(a) for a in s.exec(q).all()]


def get_alert(s, alert_id):
    a = s.get(Alert, alert_id)
    if not a:
        raise HTTPException(404, "alert not found")
    acts = s.exec(select(AlertAction).where(AlertAction.alert_id == alert_id).order_by(AlertAction.at)).all()
    d = alert_dict(a, acts)
    d["evidence_rows"] = evidence_rows(a)
    return d


def evidence_rows(a: Alert, limit=25):
    ev = a.evidence or {}
    e = store.enc
    if ev.get("type") == "department":
        rows = e[e["department_id"] == ev["department_id"]].nlargest(limit, "wait_minutes")
    elif ev.get("type") == "week":
        wk = pd.Timestamp(ev["week"])
        rows = e[(e["department_id"] == ev["department_id"]) & (e["week"] == wk)].sort_values("arrival_time")
    elif ev.get("type") == "tests":
        t = store.tests[store.tests["priority"] == "Urgent"].nlargest(limit, "turnaround_minutes")
        return [{"test_id": r.test_id, "test_type": r.test_type, "priority": r.priority,
                 "turnaround": round(r.turnaround_minutes, 1), "requested": r.requested_time.isoformat()} for r in t.itertuples()]
    else:
        return []
    return [{"encounter_id": r.encounter_id, "arrival": r.arrival_time.isoformat(), "triage": r.triage_level,
             "visit_type": r.visit_type, "wait": float(r.wait_minutes), "outcome": r.outcome} for r in rows.head(limit).itertuples()]


def act(s, alert_id, actor, verb, note=None, owner=None, due_at=None, status=None):
    from app.services.scheduling import get_now
    now = get_now(s)
    a = s.get(Alert, alert_id)
    if not a:
        raise HTTPException(404, "alert not found")
    if verb == "assign":
        a.owner = owner
        a.due_at = due_at
        if a.status == "open":
            a.status = "investigating"
        s.add(Notification(user_key=f"dept:{a.department_id}" if a.department_id else "role:ops", kind="assignment",
                           title="Alert assigned to you", body=a.title, payload={"alert_id": a.id}, created_at=now))
    elif verb == "escalate":
        a.severity = "high"
    elif verb == "resolve":
        a.status, a.resolved_at = "resolved", now
    elif verb == "status" and status:
        a.status = status
        if status == "resolved":
            a.resolved_at = now
    s.add(AlertAction(alert_id=alert_id, actor=actor, verb=verb, note=note or (f"assigned to {owner}" if owner else None), at=now))
    s.commit()
    return get_alert(s, alert_id)
