"""Scheduling layer: booking, waitlist, check-in, doctor workflow, running-late, leave, coverage and roster optimizer.

All doctor / roster / slot data is simulated (see etl/simulate.py); waits and consult durations come from real data.
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException
from sqlmodel import Session, select

from app.config import DEMO_NOW, SHIFTS
from app.db import (Appointment, AppointmentEvent, Doctor, LeaveRequest, Notification, RosterEntry, SessionSlot,
                    Setting, WaitlistEntry)
from app.etl.simulate import preferred_language
from app.store import store

ACTIVE = ("booked", "confirmed", "checked_in", "in_consultation")
FINAL = ("completed", "cancelled", "no_show", "left_before_care", "rescheduled")


# ------------------------------------------------------------------ clock
def get_now(s: Session) -> datetime:
    st = s.get(Setting, "demo_now")
    return datetime.fromisoformat(st.value["value"]) if st else DEMO_NOW


def set_now(s: Session, when: datetime):
    st = s.get(Setting, "demo_now") or Setting(key="demo_now", value={})
    st.value = {"value": when.isoformat()}
    s.add(st)
    s.commit()
    return when


def setting(s: Session, key, default=None):
    st = s.get(Setting, key)
    return st.value["value"] if st else default


def notify(s, user_key, kind, title, body, now, **payload):
    s.add(Notification(user_key=user_key, kind=kind, title=title, body=body, payload=payload, created_at=now))


def event(s, appt, to_status, actor, now, note=None):
    s.add(AppointmentEvent(appointment_id=appt.id, from_status=appt.status, to_status=to_status, actor=actor, at=now, note=note))
    appt.status = to_status


def doctor_dict(d: Doctor):
    return {"doctor_id": d.doctor_id, "name": d.name, "department_id": d.department_id, "department_name": d.department_name,
            "languages": d.languages, "years_experience": d.years_experience, "consult_room": d.consult_room,
            "avg_consult_min": d.avg_consult_min, "gender": d.gender, "kind": d.kind, "simulated": True}


def appt_dict(a: Appointment, doctors=None):
    d = (doctors or {}).get(a.doctor_id)
    return {"id": a.id, "patient_id": a.patient_id, "doctor_id": a.doctor_id, "doctor_name": d.name if d else None,
            "department_id": a.department_id, "department_name": store.dept_name.get(a.department_id),
            "slot_id": a.slot_id, "slot_start": a.slot_start.isoformat(), "slot_end": a.slot_end.isoformat(),
            "visit_type": a.visit_type, "reason": a.reason, "status": a.status, "booked_at": a.booked_at.isoformat(),
            "lead_days": a.lead_days, "encounter_id": a.encounter_id, "parent_appointment_id": a.parent_appointment_id,
            "predicted_wait": round(a.predicted_wait or 0), "predicted_p10": round(a.predicted_p10 or 0),
            "predicted_p90": round(a.predicted_p90 or 0),
            "checked_in_at": a.checked_in_at.isoformat() if a.checked_in_at else None,
            "started_at": a.started_at.isoformat() if a.started_at else None,
            "completed_at": a.completed_at.isoformat() if a.completed_at else None, "source": a.source, "simulated": a.simulated}


def doctors_map(s):
    return {d.doctor_id: d for d in s.exec(select(Doctor)).all()}


# ------------------------------------------------------------------ directory
def list_doctors(s, department_id=None, language=None, available_on=None):
    q = select(Doctor).where(Doctor.kind == "doctor")
    if department_id:
        q = q.where(Doctor.department_id == department_id)
    docs = s.exec(q).all()
    if language:
        docs = [d for d in docs if language in d.languages]
    now = get_now(s)
    free = s.exec(select(SessionSlot).where(SessionSlot.status == "free", SessionSlot.kind == "bookable",
                                            SessionSlot.start > now).order_by(SessionSlot.start)).all()
    next_free, free_count = {}, defaultdict(int)
    for sl in free:
        next_free.setdefault(sl.doctor_id, sl.start)
        if (sl.start - now).days < 7:
            free_count[sl.doctor_id] += 1
    on_today = {r.doctor_id: r.shift for r in s.exec(select(RosterEntry).where(RosterEntry.date == now.date(),
                                                                               RosterEntry.status == "scheduled")).all()}
    out = []
    for d in docs:
        if available_on and not any(sl.doctor_id == d.doctor_id and sl.date == date.fromisoformat(available_on) for sl in free):
            continue
        est = store.booking_estimate(d.department_name, "Scheduled")
        out.append({**doctor_dict(d), "next_free": next_free.get(d.doctor_id).isoformat() if d.doctor_id in next_free else None,
                    "free_slots_7d": free_count[d.doctor_id], "on_duty_today": on_today.get(d.doctor_id),
                    "typical_wait": [round(est["p10"]), round(est["p90"])], "expected_wait": round(est["expected"]),
                    "rating": rating(s, d.doctor_id)})
    return sorted(out, key=lambda x: (x["next_free"] or "9999"))


def rating(s, doctor_id):
    from app.db import Feedback
    ids = [a for a in s.exec(select(Appointment.id).where(Appointment.doctor_id == doctor_id, Appointment.source == "app")).all()]
    if not ids:
        return None
    fb = s.exec(select(Feedback).where(Feedback.appointment_id.in_(ids))).all()
    return round(sum(f.stars for f in fb) / len(fb), 1) if fb else None


def doctor_timetable(s, doctor_id, week_start: date):
    week_end = week_start + timedelta(days=7)
    doc = s.get(Doctor, doctor_id)
    if not doc:
        raise HTTPException(404, "doctor not found")
    roster = s.exec(select(RosterEntry).where(RosterEntry.doctor_id == doctor_id, RosterEntry.date >= week_start,
                                              RosterEntry.date < week_end)).all()
    slots = s.exec(select(SessionSlot).where(SessionSlot.doctor_id == doctor_id, SessionSlot.date >= week_start,
                                             SessionSlot.date < week_end).order_by(SessionSlot.start)).all()
    appts = s.exec(select(Appointment).where(Appointment.doctor_id == doctor_id,
                                             Appointment.slot_start >= datetime.combine(week_start, time()),
                                             Appointment.slot_start < datetime.combine(week_end, time()))).all()
    by_slot = {a.slot_id: a for a in appts if a.slot_id and a.status not in ("cancelled", "rescheduled")}
    days = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        sessions = []
        for r in [r for r in roster if r.date == d]:
            sh, eh = SHIFTS[r.shift]
            st = datetime.combine(d, time(sh))
            en = datetime.combine(d + timedelta(days=1 if r.shift == "Night" else 0), time(eh))
            ss = [sl for sl in slots if sl.date == d and sl.shift == r.shift]
            items = []
            for sl in ss:
                a = by_slot.get(sl.id)
                items.append({"slot_id": sl.id, "start": sl.start.isoformat(), "end": sl.end.isoformat(), "kind": sl.kind,
                              "status": sl.status, "appointment": appt_dict(a) if a else None})
            booked = sum(1 for x in items if x["appointment"])
            bookable = sum(1 for x in items if x["kind"] == "bookable")
            sessions.append({"shift": r.shift, "status": r.status, "start": st.isoformat(), "end": en.isoformat(),
                             "slots": items, "booked": booked, "bookable": bookable,
                             "reserve": sum(1 for x in items if x["kind"] == "walkin_reserve"),
                             "load": round(booked / bookable, 2) if bookable else None})
        # Real walk-in / emergency load for this weekday in the doctor's department (historical average).
        days.append({"date": d.isoformat(), "weekday": d.strftime("%a"), "sessions": sessions})
    hist = store.enc[(store.enc["department_id"] == doc.department_id) & store.enc["visit_type"].isin(["Walk-in", "Emergency"])]
    walkins_per_day = round(len(hist) / store.enc["arrival_date"].nunique(), 2)
    return {"doctor": doctor_dict(doc), "week_start": week_start.isoformat(), "days": days,
            "walkins_per_day_dept": walkins_per_day}


# ------------------------------------------------------------------ booking
def rank_slots(s, department_id, patient_id=None, doctor_id=None, day=None, mode="earliest", visit_type="Scheduled", limit=40):
    now = get_now(s)
    q = select(SessionSlot).where(SessionSlot.department_id == department_id, SessionSlot.kind == "bookable",
                                  SessionSlot.status == "free", SessionSlot.start > now + timedelta(minutes=15))
    if doctor_id:
        q = q.where(SessionSlot.doctor_id == doctor_id)
    if day:
        q = q.where(SessionSlot.date == date.fromisoformat(day))
    else:
        q = q.where(SessionSlot.start < now + timedelta(days=10))
    slots = s.exec(q.order_by(SessionSlot.start)).all()
    if not slots:
        return {"slots": [], "recommended": [], "estimate": None}
    docs = doctors_map(s)
    sess_load = defaultdict(lambda: [0, 0])
    for sl in s.exec(select(SessionSlot).where(SessionSlot.department_id == department_id, SessionSlot.kind == "bookable",
                                               SessionSlot.start > now)).all():
        k = (sl.doctor_id, sl.date, sl.shift)
        sess_load[k][1] += 1
        sess_load[k][0] += sl.status == "booked"
    lang = last_doc = None
    if patient_id:
        lang = preferred_language(store.patient_idx.loc[patient_id, "home_area"])
        last = s.exec(select(Appointment).where(Appointment.patient_id == patient_id, Appointment.department_id == department_id,
                                                Appointment.status == "completed").order_by(Appointment.slot_start.desc())).first()
        last_doc = last.doctor_id if last else None
    est = store.booking_estimate(store.dept_name[department_id], visit_type)
    late = {d: running_late(s, d, now.date())["delay_min"] for d in {sl.doctor_id for sl in slots if sl.date == now.date()}}
    horizon = max(1.0, (slots[-1].start - now).total_seconds() / 3600)
    out = []
    for sl in slots:
        d = docs[sl.doctor_id]
        booked, total = sess_load[(sl.doctor_id, sl.date, sl.shift)]
        fill = booked / total if total else 0
        soon = 1 - (sl.start - now).total_seconds() / 3600 / horizon
        lang_ok = bool(lang and lang in d.languages)
        same = bool(last_doc and last_doc == sl.doctor_id)
        delay = late.get(sl.doctor_id, 0) if sl.date == now.date() else 0
        w = {"earliest": (0.7, 0.2, 0.05, 0.05), "least_crowded": (0.2, 0.7, 0.05, 0.05),
             "my_language": (0.3, 0.2, 0.45, 0.05), "same_doctor": (0.3, 0.2, 0.05, 0.45)}[mode]
        score = w[0] * soon + w[1] * (1 - fill) + w[2] * lang_ok + w[3] * same - 0.01 * delay
        reasons = []
        if soon > 0.85:
            reasons.append("one of the earliest")
        if fill < 0.4:
            reasons.append("fewer bookings in this session")
        if lang_ok:
            reasons.append(f"speaks {lang}")
        if same:
            reasons.append("same doctor as last visit")
        if delay > 10:
            reasons.append(f"doctor running ~{delay:.0f} min late")
        out.append({"slot_id": sl.id, "doctor_id": sl.doctor_id, "doctor_name": d.name, "languages": d.languages,
                    "room": d.consult_room, "date": sl.date.isoformat(), "shift": sl.shift, "start": sl.start.isoformat(),
                    "end": sl.end.isoformat(), "session_fill": round(fill, 2), "score": round(score, 3), "reasons": reasons,
                    "language_match": lang_ok, "same_doctor": same,
                    "expected_wait": round(est["expected"] + delay), "wait_range": [round(est["p10"] + delay), round(est["p90"] + delay)]})
    rec = sorted(out, key=lambda x: -x["score"])[:3]
    rec_ids = {r["slot_id"] for r in rec}
    for o in out:
        o["recommended"] = o["slot_id"] in rec_ids
    return {"slots": out[:limit] if not day else out, "recommended": rec, "estimate": {**est, "visit_type": visit_type},
            "patient_language": lang, "mode": mode,
            "note": "Expected wait comes from the wait model (triage unknown at booking, so it is a mixture over the "
                    "department's real triage mix). Data shows no time-of-day effect, so slots differ by crowding, "
                    "doctor and today's running-late status, not by hour."}


def book(s, patient_id, slot_id, visit_type="Scheduled", reason=None, actor="patient", parent_id=None, allow_held_for=None):
    now = get_now(s)
    sl = s.get(SessionSlot, slot_id)
    if not sl:
        raise HTTPException(404, "slot not found")
    if sl.status == "held" and allow_held_for != patient_id:
        raise HTTPException(409, "slot is on hold for another patient")
    if sl.status not in ("free", "held"):
        raise HTTPException(409, "slot is no longer available")
    if sl.start <= now:
        raise HTTPException(400, "cannot book a slot in the past")
    if patient_id not in store.patient_idx.index:
        raise HTTPException(404, "patient not found")
    day_start = datetime.combine(sl.date, time())
    clash = s.exec(select(Appointment).where(Appointment.patient_id == patient_id, Appointment.status.in_(ACTIVE),
                                             Appointment.slot_start >= day_start,
                                             Appointment.slot_start < day_start + timedelta(days=1))).all()
    if any(a.department_id == sl.department_id for a in clash):
        raise HTTPException(409, "you already have a booking in this department on that day")
    if any(a.slot_start < sl.end and a.slot_end > sl.start for a in clash):
        raise HTTPException(409, "you have another appointment at that time")
    doc = s.get(Doctor, sl.doctor_id)
    est = store.booking_estimate(doc.department_name, visit_type)
    a = Appointment(patient_id=patient_id, doctor_id=sl.doctor_id, department_id=sl.department_id, slot_id=sl.id,
                    slot_start=sl.start, slot_end=sl.end, visit_type=visit_type, reason=reason, status="booked",
                    booked_at=now, lead_days=(sl.start - now).days, predicted_wait=est["expected"], predicted_p10=est["p10"],
                    predicted_p90=est["p90"], parent_appointment_id=parent_id, source="app", simulated=False)
    sl.status, sl.held_until = "booked", None
    s.add(a)
    s.flush()
    s.add(AppointmentEvent(appointment_id=a.id, to_status="booked", actor=actor, at=now))
    when = sl.start.strftime("%a %d %b, %H:%M")
    notify(s, f"patient:{patient_id}", "booking", "Appointment confirmed",
           f"{doc.name} · {doc.department_name} · {when} · Room {doc.consult_room}", now, appointment_id=a.id)
    notify(s, f"doctor:{doc.doctor_id}", "booking", "New booking", f"{patient_id} booked {when} ({visit_type})", now, appointment_id=a.id)
    check_overbooking(s, sl, now)
    s.commit()
    s.refresh(a)
    return appt_dict(a, {doc.doctor_id: doc})


def check_overbooking(s, sl, now):
    from app.db import Alert
    sess = s.exec(select(SessionSlot).where(SessionSlot.doctor_id == sl.doctor_id, SessionSlot.date == sl.date,
                                            SessionSlot.shift == sl.shift, SessionSlot.kind == "bookable")).all()
    booked = sum(x.status == "booked" for x in sess)
    if sess and booked == len(sess):
        doc = s.get(Doctor, sl.doctor_id)
        title = f"Session fully booked: {doc.name}, {sl.date:%a %d %b} {sl.shift}"
        if not s.exec(select(Alert).where(Alert.title == title)).first():
            s.add(Alert(kind="overbooked", department_id=sl.department_id, severity="medium", confidence="High", title=title,
                        summary="All bookable slots are taken; only the walk-in reserve is left. New demand will go to the waitlist.",
                        signals={"booked": booked, "bookable": len(sess), "doctor_id": doc.doctor_id},
                        evidence={"type": "session", "doctor_id": doc.doctor_id, "date": sl.date.isoformat(), "shift": sl.shift},
                        suggested_action="Open an extra session or release reserve slots if walk-ins stay low.", detected_at=now))


def cancel(s, appt_id, actor="patient", reason=None, offer_waitlist=True):
    now = get_now(s)
    a = s.get(Appointment, appt_id)
    if not a:
        raise HTTPException(404, "appointment not found")
    if a.status not in ("booked", "confirmed"):
        raise HTTPException(409, f"cannot cancel an appointment that is {a.status}")
    event(s, a, "cancelled", actor, now, reason)
    offered = None
    if a.slot_id:
        sl = s.get(SessionSlot, a.slot_id)
        sl.status = "free"
        if offer_waitlist and sl.start > now:
            offered = offer_slot(s, sl, now)
    notify(s, f"doctor:{a.doctor_id}", "cancellation", "Booking cancelled",
           f"{a.patient_id} cancelled {a.slot_start:%a %d %b %H:%M}", now, appointment_id=a.id)
    s.commit()
    return {"appointment": appt_dict(a), "waitlist_offer": offered}


def offer_slot(s, sl, now):
    """Offer a freed slot to the best-matching waitlisted patient (FIFO within department, same doctor preferred)."""
    cands = s.exec(select(WaitlistEntry).where(WaitlistEntry.department_id == sl.department_id, WaitlistEntry.status == "waiting",
                                               WaitlistEntry.earliest <= sl.date, WaitlistEntry.latest >= sl.date)
                   .order_by(WaitlistEntry.created_at)).all()
    if not cands:
        return None
    cands.sort(key=lambda w: (w.doctor_id not in (None, sl.doctor_id), w.doctor_id != sl.doctor_id, w.created_at))
    w = cands[0]
    mins = setting(s, "waitlist_offer_minutes", 15)
    w.status, w.offered_slot_id, w.offered_until = "offered", sl.id, now + timedelta(minutes=mins)
    sl.status, sl.held_until = "held", w.offered_until
    doc = s.get(Doctor, sl.doctor_id)
    notify(s, f"patient:{w.patient_id}", "slot_offer", "A slot opened up for you",
           f"{doc.name} · {sl.start:%a %d %b %H:%M}. Accept within {mins} minutes.", now, waitlist_id=w.id, slot_id=sl.id)
    return {"waitlist_id": w.id, "patient_id": w.patient_id, "slot_id": sl.id, "until": w.offered_until.isoformat()}


def join_waitlist(s, patient_id, department_id, earliest, latest, doctor_id=None):
    now = get_now(s)
    w = WaitlistEntry(patient_id=patient_id, department_id=department_id, doctor_id=doctor_id, earliest=date.fromisoformat(earliest),
                      latest=date.fromisoformat(latest), created_at=now)
    s.add(w)
    s.commit()
    pos = len(s.exec(select(WaitlistEntry).where(WaitlistEntry.department_id == department_id, WaitlistEntry.status == "waiting")).all())
    return {"id": w.id, "position": pos, "status": w.status}


def accept_offer(s, waitlist_id):
    w = s.get(WaitlistEntry, waitlist_id)
    now = get_now(s)
    if not w or w.status != "offered":
        raise HTTPException(409, "no active offer")
    if w.offered_until < now:
        w.status = "expired"
        s.commit()
        raise HTTPException(409, "offer expired")
    a = book(s, w.patient_id, w.offered_slot_id, actor="waitlist", allow_held_for=w.patient_id)
    w = s.get(WaitlistEntry, waitlist_id)
    w.status = "accepted"
    s.commit()
    return a


def reschedule(s, appt_id, new_slot_id, actor="patient"):
    old = s.get(Appointment, appt_id)
    if not old or old.status not in ("booked", "confirmed"):
        raise HTTPException(409, "appointment cannot be rescheduled")
    pid, vt, reason = old.patient_id, old.visit_type, old.reason
    now = get_now(s)
    event(s, old, "rescheduled", actor, now)
    sl = s.get(SessionSlot, old.slot_id)
    if sl:
        sl.status = "free"
    s.flush()
    new = book(s, pid, new_slot_id, vt, reason, actor=actor, parent_id=None)
    if sl and sl.start > now:
        offer_slot(s, sl, now)
        s.commit()
    return new


def check_in(s, appt_id):
    now = get_now(s)
    a = s.get(Appointment, appt_id)
    if not a or a.status not in ("booked", "confirmed"):
        raise HTTPException(409, "appointment cannot be checked in")
    if a.slot_start.date() != now.date():
        raise HTTPException(400, "check-in opens on the day of the appointment")
    a.checked_in_at = now
    event(s, a, "checked_in", "patient", now)
    s.commit()
    return ticket(s, appt_id)


# ------------------------------------------------------------------ doctor workflow
def doctor_queue(s, doctor_id, day: date):
    start = datetime.combine(day, time())
    appts = s.exec(select(Appointment).where(Appointment.doctor_id == doctor_id, Appointment.slot_start >= start,
                                             Appointment.slot_start < start + timedelta(days=1),
                                             Appointment.status.not_in(("cancelled", "rescheduled")))
                   .order_by(Appointment.slot_start)).all()
    return appts


def running_late(s, doctor_id, day: date, now=None):
    """Project each remaining appointment's start from the current consult + real median consult durations."""
    now = now or get_now(s)
    doc = s.get(Doctor, doctor_id)
    appts = doctor_queue(s, doctor_id, day)
    dur = timedelta(minutes=store.consult_minutes(doc.department_name))
    current = next((a for a in appts if a.status == "in_consultation"), None)
    cursor = (current.started_at + dur) if current else now
    cursor = max(cursor, now)
    etas, delay = {}, 0.0
    for a in appts:
        if a.status in ("booked", "confirmed", "checked_in") and day == now.date():
            start = max(a.slot_start, cursor)
            etas[a.id] = start
            cursor = start + dur
    future = [a for a in appts if a.id in etas]
    if future:
        delay = max(0.0, (etas[future[0].id] - future[0].slot_start).total_seconds() / 60)
    if current and day == now.date():
        delay = max(delay, (current.started_at - current.slot_start).total_seconds() / 60)
    return {"delay_min": round(delay, 1), "etas": {k: v.isoformat() for k, v in etas.items()},
            "current": appt_dict(current) if current else None}


def doctor_day(s, doctor_id, day: date):
    now = get_now(s)
    doc = s.get(Doctor, doctor_id)
    if not doc:
        raise HTTPException(404, "doctor not found")
    appts = doctor_queue(s, doctor_id, day)
    late = running_late(s, doctor_id, day, now)
    patients = []
    for a in appts:
        d = appt_dict(a, {doc.doctor_id: doc})
        p = store.patient_idx.loc[a.patient_id]
        d.update({"patient": {"age": int(p["age"]), "sex": p["sex"], "chronic_condition": p["chronic_condition"],
                              "age_band": p["age_band"]}, "eta": late["etas"].get(a.id)})
        patients.append(d)
    counts = defaultdict(int)
    for a in appts:
        counts[a.status] += 1
    shift = s.exec(select(RosterEntry).where(RosterEntry.doctor_id == doctor_id, RosterEntry.date == day)).all()
    return {"doctor": doctor_dict(doc), "date": day.isoformat(), "now": now.isoformat(), "appointments": patients,
            "counts": dict(counts), "running_late": late["delay_min"],
            "late_threshold": setting(s, "running_late_threshold_min", 15),
            "shifts": [{"shift": r.shift, "status": r.status} for r in shift]}


def set_status(s, appt_id, action, actor="doctor"):
    now = get_now(s)
    a = s.get(Appointment, appt_id)
    if not a:
        raise HTTPException(404, "appointment not found")
    allowed = {"call_in": ("checked_in", "booked", "confirmed"), "complete": ("in_consultation",),
               "no_show": ("booked", "confirmed", "checked_in"), "check_in": ("booked", "confirmed")}
    if a.status not in allowed.get(action, ()):
        raise HTTPException(409, f"cannot {action} an appointment that is {a.status}")
    if action == "call_in":
        cur = s.exec(select(Appointment).where(Appointment.doctor_id == a.doctor_id, Appointment.status == "in_consultation")).all()
        for c in cur:
            c.completed_at = now
            event(s, c, "completed", actor, now, "auto-completed when next patient was called")
        a.started_at, a.checked_in_at = now, a.checked_in_at or now
        event(s, a, "in_consultation", actor, now)
        notify(s, f"patient:{a.patient_id}", "called", "It's your turn", f"Please go to room {s.get(Doctor, a.doctor_id).consult_room}.", now,
               appointment_id=a.id)
    elif action == "complete":
        a.completed_at = now
        event(s, a, "completed", actor, now)
        notify(s, f"patient:{a.patient_id}", "visit_done", "Visit complete", "How was your visit? Rate it in My Visits.", now,
               appointment_id=a.id)
    elif action == "no_show":
        event(s, a, "no_show", actor, now)
    elif action == "check_in":
        a.checked_in_at = now
        event(s, a, "checked_in", actor, now)
    s.flush()
    late_notices = notify_running_late(s, a.doctor_id, now)
    s.commit()
    return {"appointment": appt_dict(a), "running_late": running_late(s, a.doctor_id, now.date(), now)["delay_min"],
            "patients_notified": late_notices}


def notify_running_late(s, doctor_id, now):
    late = running_late(s, doctor_id, now.date(), now)
    thr = setting(s, "running_late_threshold_min", 15)
    if late["delay_min"] < thr:
        return 0
    doc = s.get(Doctor, doctor_id)
    sent = 0
    recent = s.exec(select(Notification).where(Notification.kind == "running_late",
                                               Notification.created_at > now - timedelta(minutes=30))).all()
    already = {n.payload.get("appointment_id") for n in recent}
    for aid, eta in late["etas"].items():
        if aid in already:
            continue
        a = s.get(Appointment, aid)
        notify(s, f"patient:{a.patient_id}", "running_late", f"{doc.name} is running about {late['delay_min']:.0f} min late",
               f"Your new estimated time is {datetime.fromisoformat(eta):%H:%M} (booked {a.slot_start:%H:%M}).", now, appointment_id=aid)
        sent += 1
    if sent:
        notify(s, f"dept:{doc.department_id}", "running_late", f"{doc.name} running {late['delay_min']:.0f} min late",
               f"{sent} patients notified automatically.", now, doctor_id=doctor_id)
    return sent


def ticket(s, appt_id):
    now = get_now(s)
    a = s.get(Appointment, appt_id)
    if not a:
        raise HTTPException(404, "appointment not found")
    doc = s.get(Doctor, a.doctor_id)
    late = running_late(s, a.doctor_id, a.slot_start.date(), now) if a.slot_start.date() == now.date() else {"delay_min": 0, "etas": {}}
    queue = [x for x in doctor_queue(s, a.doctor_id, a.slot_start.date()) if x.status in ("booked", "confirmed", "checked_in")]
    ahead = [x for x in queue if x.slot_start < a.slot_start]
    eta = late["etas"].get(a.id)
    return {"appointment": appt_dict(a, {doc.doctor_id: doc}), "doctor": doctor_dict(doc), "now": now.isoformat(),
            "position": len(ahead) + 1 if a.status in ("booked", "confirmed", "checked_in") else 0,
            "people_ahead": len(ahead), "eta": eta, "running_late": late["delay_min"],
            "minutes_to_eta": round((datetime.fromisoformat(eta) - now).total_seconds() / 60) if eta else None,
            "expected_wait": [round(a.predicted_p10 or 0), round(a.predicted_p90 or 0)],
            "best_arrival": ((datetime.fromisoformat(eta) if eta else a.slot_start) - timedelta(minutes=10)).isoformat(),
            "bring": ["Photo ID", "Previous prescriptions or reports", "List of current medicines", "Insurance card (if any)"]}


# ------------------------------------------------------------------ leave
def request_leave(s, doctor_id, from_date, to_date, reason):
    now = get_now(s)
    lr = LeaveRequest(doctor_id=doctor_id, from_date=date.fromisoformat(from_date), to_date=date.fromisoformat(to_date),
                      reason=reason, created_at=now)
    s.add(lr)
    notify(s, "role:ops", "leave", "Leave request", f"{s.get(Doctor, doctor_id).name}: {from_date} → {to_date} ({reason})", now)
    s.commit()
    return leave_dict(s, lr)


def affected(s, lr):
    return s.exec(select(Appointment).where(Appointment.doctor_id == lr.doctor_id, Appointment.status.in_(("booked", "confirmed")),
                                            Appointment.slot_start >= datetime.combine(lr.from_date, time()),
                                            Appointment.slot_start < datetime.combine(lr.to_date + timedelta(days=1), time()))).all()


def leave_dict(s, lr):
    doc = s.get(Doctor, lr.doctor_id)
    return {"id": lr.id, "doctor_id": lr.doctor_id, "doctor_name": doc.name, "department_name": doc.department_name,
            "from_date": lr.from_date.isoformat(), "to_date": lr.to_date.isoformat(), "reason": lr.reason, "status": lr.status,
            "created_at": lr.created_at.isoformat(), "affected_appointments": len(affected(s, lr)) if lr.status == "pending" else None}


def list_leave(s, doctor_id=None):
    q = select(LeaveRequest).order_by(LeaveRequest.created_at.desc())
    if doctor_id:
        q = q.where(LeaveRequest.doctor_id == doctor_id)
    return [leave_dict(s, lr) for lr in s.exec(q).all()]


def leave_proposals(s, lr):
    """Best alternative per affected appointment: same doctor within 7 days after leave, else colleague on the same day."""
    taken = set()
    out = []
    for a in sorted(affected(s, lr), key=lambda x: x.slot_start):
        lang = preferred_language(store.patient_idx.loc[a.patient_id, "home_area"])
        cands = s.exec(select(SessionSlot).where(SessionSlot.department_id == a.department_id, SessionSlot.status == "free",
                                                 SessionSlot.kind == "bookable", SessionSlot.doctor_id != lr.doctor_id,
                                                 SessionSlot.date == a.slot_start.date())).all()
        docs = doctors_map(s)
        cands = [c for c in cands if c.id not in taken]
        cands.sort(key=lambda c: (lang not in docs[c.doctor_id].languages, abs((c.start - a.slot_start).total_seconds())))
        alt, why = None, None
        if cands:
            alt, why = cands[0], "colleague, same day" + (f", speaks {lang}" if lang in docs[cands[0].doctor_id].languages else "")
        else:
            later = s.exec(select(SessionSlot).where(SessionSlot.doctor_id == lr.doctor_id, SessionSlot.status == "free",
                                                     SessionSlot.kind == "bookable", SessionSlot.date > lr.to_date)
                           .order_by(SessionSlot.start)).all()
            later = [c for c in later if c.id not in taken]
            if later:
                alt, why = later[0], "same doctor after leave"
        if alt:
            taken.add(alt.id)
        out.append({"appointment": appt_dict(a, docs), "proposal": None if not alt else {
            "slot_id": alt.id, "doctor_id": alt.doctor_id, "doctor_name": docs[alt.doctor_id].name, "start": alt.start.isoformat(),
            "reason": why}})
    return out


def decide_leave(s, leave_id, decision):
    now = get_now(s)
    lr = s.get(LeaveRequest, leave_id)
    if not lr or lr.status != "pending":
        raise HTTPException(409, "request is not pending")
    if decision == "reject":
        lr.status, lr.decided_at = "rejected", now
        notify(s, f"doctor:{lr.doctor_id}", "leave", "Leave rejected", f"{lr.from_date} → {lr.to_date}", now)
        s.commit()
        return {"leave": leave_dict(s, lr), "proposals": []}
    proposals = leave_proposals(s, lr)
    return {"leave": leave_dict(s, lr), "proposals": proposals}


def apply_leave(s, leave_id, accept_slot_ids: dict):
    """Approve leave: roster -> leave, move patients to the confirmed proposals, close the doctor's slots."""
    now = get_now(s)
    lr = s.get(LeaveRequest, leave_id)
    if not lr or lr.status != "pending":
        raise HTTPException(409, "request is not pending")
    moved = 0
    for a in affected(s, lr):
        new_slot = accept_slot_ids.get(str(a.id))
        if new_slot:
            reschedule(s, a.id, int(new_slot), actor="coordinator")
            a2 = s.exec(select(Appointment).where(Appointment.slot_id == int(new_slot), Appointment.status == "booked")).first()
            notify(s, f"patient:{a.patient_id}", "reschedule", "Your appointment was moved",
                   f"Your doctor is on leave. New time: {a2.slot_start:%a %d %b %H:%M} with {s.get(Doctor, a2.doctor_id).name}. "
                   "You can choose another slot in My Appointments.", now, appointment_id=a2.id)
            moved += 1
        else:
            cancel(s, a.id, actor="coordinator", reason="doctor on leave", offer_waitlist=False)
            notify(s, f"patient:{a.patient_id}", "reschedule", "Please rebook",
                   "Your doctor is on leave and no alternative was found. Please choose a new slot.", now)
    for r in s.exec(select(RosterEntry).where(RosterEntry.doctor_id == lr.doctor_id, RosterEntry.date >= lr.from_date,
                                              RosterEntry.date <= lr.to_date)).all():
        r.status = "leave"
    for sl in s.exec(select(SessionSlot).where(SessionSlot.doctor_id == lr.doctor_id, SessionSlot.date >= lr.from_date,
                                               SessionSlot.date <= lr.to_date, SessionSlot.status == "free")).all():
        sl.status = "blocked"
    lr.status, lr.decided_at = "approved", now
    notify(s, f"doctor:{lr.doctor_id}", "leave", "Leave approved", f"{lr.from_date} → {lr.to_date}. {moved} patients moved.", now)
    s.commit()
    return {"leave": leave_dict(s, lr), "moved": moved}


# ------------------------------------------------------------------ coverage + optimizer
SHIFT_MIN = {"Morning": 360, "Evening": 360, "Night": 720}
SHIFT_SHARE = {"Morning": 0.25, "Evening": 0.25, "Night": 0.5}  # arrivals are flat over 24h in the data


def coverage(s, week_start: date, department_id=None):
    week_end = week_start + timedelta(days=7)
    docs = doctors_map(s)
    roster = s.exec(select(RosterEntry).where(RosterEntry.date >= week_start, RosterEntry.date < week_end)).all()
    appts = s.exec(select(Appointment).where(Appointment.slot_start >= datetime.combine(week_start, time()),
                                             Appointment.slot_start < datetime.combine(week_end, time()),
                                             Appointment.status.not_in(("cancelled", "rescheduled")))).all()
    walk = store.enc[store.enc["visit_type"].isin(["Walk-in", "Emergency"])].groupby("department_id").size() / store.enc["arrival_date"].nunique()
    booked = defaultdict(int)
    for a in appts:
        sh = "Morning" if 8 <= a.slot_start.hour < 14 else ("Evening" if 14 <= a.slot_start.hour < 20 else "Night")
        booked[(a.department_id, a.slot_start.date(), sh)] += 1
    on = defaultdict(list)
    leave = defaultdict(list)
    for r in roster:
        (on if r.status == "scheduled" else leave)[(r.department_id, r.date, r.shift)].append(r.doctor_id)
    depts = sorted({d.department_id for d in docs.values() if d.kind == "doctor"})
    if department_id:
        depts = [department_id]
    cells = []
    for dpt in depts:
        name = store.dept_name[dpt]
        cm = store.consult_minutes(name)
        for i in range(7):
            day = week_start + timedelta(days=i)
            for sh in ("Morning", "Evening", "Night"):
                n = len(on[(dpt, day, sh)])
                cap = n * SHIFT_MIN[sh]
                demand = (booked[(dpt, day, sh)] + walk.get(dpt, 0) * SHIFT_SHARE[sh]) * cm
                util = demand / cap if cap else None
                status = "gap" if n == 0 else ("tight" if util > 0.9 else ("over" if util < 0.25 and n > 1 else "ok"))
                cells.append({"department_id": dpt, "department_name": name, "date": day.isoformat(), "weekday": day.strftime("%a"),
                              "shift": sh, "doctors": [docs[x].name for x in on[(dpt, day, sh)]], "doctor_ids": on[(dpt, day, sh)],
                              "on_leave": [docs[x].name for x in leave[(dpt, day, sh)]], "booked": booked[(dpt, day, sh)],
                              "demand_min": round(demand), "capacity_min": cap, "utilization": None if util is None else round(util, 2),
                              "status": status})
    return {"week_start": week_start.isoformat(), "cells": cells,
            "method": "utilization = (booked appointments + expected walk-ins from real data) × department median consult "
                      "minutes ÷ rostered doctor-minutes"}


def optimize(s, week_start: date, department_id=None):
    cov = coverage(s, week_start, department_id)["cells"]
    docs = doctors_map(s)
    working = defaultdict(set)
    for c in cov:
        for d in c["doctor_ids"]:
            working[(d, c["date"])].add(c["shift"])
    sugg = []
    for c in sorted(cov, key=lambda c: (c["status"] != "gap", -(c["utilization"] or 9))):
        if c["status"] not in ("gap", "tight"):
            continue
        pool = [d for d in docs.values() if d.department_id == c["department_id"] and d.kind == "doctor"
                and not working[(d.doctor_id, c["date"])] and d.name not in c["on_leave"]]
        overtime = False
        if not pool:
            # Fallback: extend a colleague who works a different day shift that day (overtime), never after a night.
            # Only adjacent day shifts (Morning <-> Evening); nobody is extended into or out of a Night shift.
            adjacent = {"Morning": "Evening", "Evening": "Morning"}.get(c["shift"])
            pool = [d for d in docs.values() if d.department_id == c["department_id"] and d.kind == "doctor"
                    and working[(d.doctor_id, c["date"])] == {adjacent} and d.name not in c["on_leave"]] if adjacent else []
            overtime = True
        if not pool:
            continue
        d = pool[0]
        new_cap = c["capacity_min"] + SHIFT_MIN[c["shift"]]
        after = round(c["demand_min"] / new_cap, 2)
        reason = ("No doctor is rostered (gap)" if c["status"] == "gap" else f"Expected load is {c['utilization']:.0%} of rostered minutes")
        sugg.append({"department_name": c["department_name"], "date": c["date"], "weekday": c["weekday"], "shift": c["shift"],
                     "action": (f"Extend {d.name} into the {c['shift']} shift (overtime)" if overtime else f"Add {d.name} to the {c['shift']} shift"),
                     "doctor_id": d.doctor_id, "before": c["utilization"], "after": after, "overtime": overtime,
                     "why": reason + (f"; no colleague is off that day, so {d.name} would extend their "
                                      f"{'/'.join(sorted(working[(d.doctor_id, c['date'])]))} shift." if overtime
                                      else f"; {d.name} is off that day and not on leave.")})
        working[(d.doctor_id, c["date"])].add(c["shift"])
        if len(sugg) >= 8:
            break
    return {"suggestions": sugg, "note": "Greedy heuristic: fill gaps first, then the tightest shifts, using doctors who are off "
                                         "that day. Suggestions are never applied automatically."}


def apply_roster(s, doctor_id, day, shift):
    doc = s.get(Doctor, doctor_id)
    d = date.fromisoformat(day)
    s.add(RosterEntry(doctor_id=doctor_id, department_id=doc.department_id, date=d, shift=shift, status="scheduled"))
    if shift in ("Morning", "Evening"):
        sh, eh = SHIFTS[shift]
        t, end, k = datetime.combine(d, time(sh)), datetime.combine(d, time(eh)), 0
        L = max(15, 5 * round(doc.avg_consult_min / 5))
        while t + timedelta(minutes=L) <= end:
            s.add(SessionSlot(doctor_id=doctor_id, department_id=doc.department_id, date=d, shift=shift, start=t,
                              end=t + timedelta(minutes=L), kind="walkin_reserve" if k % 3 == 2 else "bookable"))
            t += timedelta(minutes=L)
            k += 1
    notify(s, f"doctor:{doctor_id}", "roster", "Roster change", f"You were added to the {shift} shift on {day}.", get_now(s))
    s.commit()
    return {"ok": True}


# ------------------------------------------------------------------ appointment analytics
def appointment_analytics(s):
    now = get_now(s)
    rows = s.exec(select(Appointment.source, Appointment.status, Appointment.lead_days, Appointment.slot_start,
                         Appointment.department_id, Appointment.visit_type)).all()
    import pandas as pd
    df = pd.DataFrame(rows, columns=["source", "status", "lead_days", "slot_start", "department_id", "visit_type"])
    hist = df[df["source"].isin(["historical", "simulated"])]
    sim_rates = {"cancel_rate": round(100 * (hist["status"] == "cancelled").mean(), 1),
                 "no_show_rate": round(100 * (hist["status"] == "no_show").mean(), 1)}
    win = df[df["source"].isin(["seeded", "app"])]
    per_day = win.groupby(win["slot_start"].dt.date).size()
    slots = s.exec(select(SessionSlot.date, SessionSlot.status, SessionSlot.kind)).all()
    sdf = pd.DataFrame(slots, columns=["date", "status", "kind"])
    b = sdf[sdf["kind"] == "bookable"]
    fill = b.groupby("date")["status"].apply(lambda x: round(100 * (x == "booked").mean(), 1))
    wl = s.exec(select(WaitlistEntry.status)).all()
    mix = store.enc["visit_type"].value_counts().to_dict()
    lead = hist[hist["source"] == "historical"]["lead_days"]
    return {"now": now.isoformat(),
            "bookings_per_day": [{"date": str(k), "n": int(v)} for k, v in per_day.items()],
            "fill_rate": [{"date": str(k), "fill": float(v)} for k, v in fill.items()],
            "visit_mix_real": mix, "lead_days": {"median": float(lead.median()), "p90": float(lead.quantile(.9))},
            "simulated_rates": sim_rates, "waitlist": {k: wl.count(k) for k in set(wl)},
            "app_bookings": int((df["source"] == "app").sum()),
            "labels": {"visit_mix_real": "real", "lead_days": "simulated", "simulated_rates": "simulated assumption",
                       "fill_rate": "seeded demo window"}}
