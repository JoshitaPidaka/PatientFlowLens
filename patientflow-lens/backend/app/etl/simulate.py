"""Gap-filling data layer: doctors, rosters, slots and appointments (see prompt section 2.1).

Rules: anchored to real columns, deterministic (SEED), labelled simulated, never alters the original rows.
"""
import math
from datetime import datetime, time, timedelta

import numpy as np
import pandas as pd
from sqlalchemy import insert
from sqlmodel import Session, select

from app.config import (BOOKABLE_SHIFTS, DEFAULT_SETTINGS, DEMO_DATE, DEMO_NOW, DOCTOR_SERVICE_TYPES,
                        SCHEDULE_WINDOW, SEED, SHIFTS)
from app.db import (Alert, AlertRule, Appointment, AppointmentEvent, Doctor, EncounterDoctor, LeaveRequest,
                    Notification, RosterEntry, SessionSlot, Setting, WaitlistEntry, engine, init_db)
from app.ml.wait_model import FEATURES

FIRST = [("Aarav", "M"), ("Ananya", "F"), ("Rohan", "M"), ("Kavya", "F"), ("Vikram", "M"), ("Sneha", "F"),
         ("Arjun", "M"), ("Meera", "F"), ("Karthik", "M"), ("Divya", "F"), ("Siddharth", "M"), ("Lakshmi", "F"),
         ("Rahul", "M"), ("Priya", "F"), ("Naveen", "M"), ("Swathi", "F"), ("Harsha", "M"), ("Pooja", "F"),
         ("Manoj", "M"), ("Keerthi", "F"), ("Suresh", "M"), ("Nandini", "F"), ("Ravi", "M"), ("Bhavana", "F")]
LAST = ["Rao", "Reddy", "Sharma", "Iyer", "Naidu", "Gupta", "Varma", "Menon", "Kulkarni", "Chowdary", "Patel",
        "Nair", "Prasad", "Mehta", "Krishnan", "Das", "Joshi", "Sastry", "Bhat", "Agarwal"]
ABBR = {"Emergency": "EMR", "General Medicine": "GEN", "Pediatrics": "PED", "Cardiology": "CAR", "Orthopedics": "ORT",
        "Radiology": "RAD", "Laboratory": "LAB", "Pharmacy": "PHA", "Surgery": "SUR", "Neurology": "NEU",
        "Outpatient": "OPD", "Admissions": "ADM"}
REASONS = {
    "Emergency": ["Urgent review", "Injury follow-up"], "General Medicine": ["General check-up", "Fever & cold", "Medication review"],
    "Pediatrics": ["Child check-up", "Vaccination visit", "Fever (child)"], "Cardiology": ["Heart check-up", "BP review", "ECG review"],
    "Orthopedics": ["Joint pain", "Fracture follow-up", "Back pain"], "Radiology": ["X-ray appointment", "Scan appointment"],
    "Laboratory": ["Blood test", "Routine lab work"], "Surgery": ["Pre-surgery consult", "Post-surgery review"],
    "Neurology": ["Headache review", "Nerve consult"], "Outpatient": ["General consult", "Follow-up consult"],
}
LANG_SETS = [["English", "Telugu"], ["English", "Hindi"], ["English", "Hindi", "Telugu"], ["English", "Telugu"]]


def preferred_language(home_area: str) -> str:
    """Seeded mapping (simulated): AREA_01–08 Telugu, 09–14 Hindi, 15–20 English."""
    n = int(home_area.split("_")[1])
    return "Telugu" if n <= 8 else ("Hindi" if n <= 14 else "English")


def shift_of(ts: pd.Timestamp):
    h = ts.hour
    if 8 <= h < 14:
        return ts.normalize(), "Morning"
    if 14 <= h < 20:
        return ts.normalize(), "Evening"
    if h >= 20:
        return ts.normalize(), "Night"
    return ts.normalize() - pd.Timedelta(days=1), "Night"


def build_doctors(depts, duration, rng):
    docs, used = [], set()
    for _, d in depts.iterrows():
        name = d["department_name"]
        if d["service_type"] in DOCTOR_SERVICE_TYPES:
            n = int(min(7, max(3, math.ceil(d["staff_count"] / 4))))
            for i in range(n):
                while True:
                    fn, g = FIRST[rng.integers(len(FIRST))]
                    ln = LAST[rng.integers(len(LAST))]
                    if (fn, ln) not in used:
                        used.add((fn, ln))
                        break
                docs.append(dict(doctor_id=f"{d['department_id']}-{i + 1:02d}", name=f"Dr. {fn} {ln}",
                                 department_id=d["department_id"], department_name=name,
                                 languages=LANG_SETS[rng.integers(len(LANG_SETS))],
                                 years_experience=int(rng.integers(3, 26)), consult_room=f"{ABBR[name]}-{i + 1}",
                                 avg_consult_min=int(duration["dept_median"][name]), gender=g, kind="doctor"))
        else:  # Pharmacy / Admissions: service desks, not doctors
            for i in range(2):
                docs.append(dict(doctor_id=f"{d['department_id']}-D{i + 1}", name=f"{name} Desk {i + 1}",
                                 department_id=d["department_id"], department_name=name, languages=["English", "Hindi", "Telugu"],
                                 years_experience=0, consult_room=f"{ABBR[name]}-Counter {i + 1}",
                                 avg_consult_min=int(duration["dept_median"][name]), gender="-", kind="desk"))
    return pd.DataFrame(docs)


def build_roster(doctors, rng):
    start, end = datetime(2025, 1, 1), SCHEDULE_WINDOW[1]
    days = pd.date_range(start, end, freq="D")
    rows = []
    for k, (dept, g) in enumerate(doctors.groupby("department_id")):
        ids = list(g["doctor_id"])
        n = len(ids)
        km, ke = max(1, round(n * 0.4)), max(1, round(n * 0.3))
        if km + ke + 1 > n:
            km = max(1, n - ke - 1)
        for i, day in enumerate(days):
            rot = ids[(i + k) % n:] + ids[:(i + k) % n]
            plan = [("Morning", rot[:km]), ("Evening", rot[km:km + ke]), ("Night", rot[km + ke:km + ke + 1])]
            for shift, who in plan:
                for doc in who:
                    status = "leave" if rng.random() < 0.015 else "scheduled"
                    rows.append(dict(doctor_id=doc, department_id=dept, date=day.date(), shift=shift, status=status))
    return pd.DataFrame(rows)


def assign_encounters(e, doctors, roster):
    on = roster[roster["status"] == "scheduled"].groupby(["department_id", "date", "shift"])["doctor_id"].apply(list).to_dict()
    by_dept = doctors.groupby("department_id")["doctor_id"].apply(list).to_dict()
    counter, out = {}, []
    for r in e[["encounter_id", "department_id", "arrival_time"]].itertuples(index=False):
        day, shift = shift_of(r.arrival_time)
        key = (r.department_id, day.date(), shift)
        pool = on.get(key) or by_dept[r.department_id]
        c = counter.get(key, 0)
        counter[key] = c + 1
        out.append((r.encounter_id, pool[c % len(pool)]))
    return pd.DataFrame(out, columns=["encounter_id", "doctor_id"])


def slot_len(minutes):
    return int(max(15, 5 * round(minutes / 5)))


def run(frames, models):
    rng = np.random.default_rng(SEED)
    p, e, depts = frames["patients"], frames["encounters"], frames["departments"]
    wait, duration = models["wait"], models["duration"]
    init_db(drop=True)

    doctors = build_doctors(depts, duration, rng)
    roster = build_roster(doctors, rng)
    enc_doc = assign_encounters(e, doctors, roster)
    doc_by_id = doctors.set_index("doctor_id")
    L = {r.department_id: slot_len(r.avg_consult_min) for r in doctors.itertuples()}

    # ---------------- historical appointments from the 4,008 real Scheduled + Follow-up encounters
    sched = e[e["visit_type"].isin(["Scheduled", "Follow-up"])].merge(enc_doc, on="encounter_id")
    preds = wait.pipeline.predict(sched[FEATURES])
    hist = []
    for r, pr in zip(sched.itertuples(index=False), preds):
        Ld = L[r.department_id]
        slot_start = r.arrival_time.floor(f"{Ld}min")
        lead = int(rng.integers(1, 15) if r.visit_type == "Scheduled" else rng.integers(7, 31))
        hist.append(dict(
            patient_id=r.patient_id, doctor_id=r.doctor_id, department_id=r.department_id,
            slot_start=slot_start.to_pydatetime(), slot_end=(slot_start + pd.Timedelta(minutes=Ld)).to_pydatetime(),
            visit_type=r.visit_type, reason=REASONS.get(r.department_name, ["Consultation"])[0],
            status="left_before_care" if r.outcome == "Left before care" else "completed",
            booked_at=(slot_start - pd.Timedelta(days=lead)).to_pydatetime(), lead_days=lead, encounter_id=r.encounter_id,
            predicted_wait=float(max(pr, 0)), predicted_p10=float(max(pr + wait.lo, 0)), predicted_p90=float(pr + wait.hi),
            checked_in_at=r.arrival_time.to_pydatetime(), started_at=r.service_start_time.to_pydatetime(),
            completed_at=r.service_end_time.to_pydatetime(), source="historical", simulated=True))

    # ---------------- simulated cancellations / no-shows (assumption rates, labelled)
    doc_list = doctors[doctors["kind"] == "doctor"]
    n_cancel = int(DEFAULT_SETTINGS["sim_cancel_rate"] * len(sched))
    n_noshow = int(DEFAULT_SETTINGS["sim_noshow_rate"] * len(sched))
    pids = p["patient_id"].to_numpy()
    for status, n in [("cancelled", n_cancel), ("no_show", n_noshow)]:
        for _ in range(n):
            d = doc_list.iloc[rng.integers(len(doc_list))]
            day = datetime(2025, 1, 1) + timedelta(days=int(rng.integers(0, 364)))
            start = datetime.combine(day.date(), time(int(rng.integers(8, 20)), 0))
            lead = int(rng.integers(1, 21))
            hist.append(dict(patient_id=str(rng.choice(pids)), doctor_id=d.doctor_id, department_id=d.department_id,
                             slot_start=start, slot_end=start + timedelta(minutes=L[d.department_id]),
                             visit_type="Scheduled", reason=REASONS[d.department_name][0], status=status,
                             booked_at=start - timedelta(days=lead), lead_days=lead, source="simulated", simulated=True))

    # ---------------- demo window: sessions -> slots
    w0, w1 = SCHEDULE_WINDOW
    win = roster[(roster["status"] == "scheduled") & (pd.to_datetime(roster["date"]) >= w0) &
                 (pd.to_datetime(roster["date"]) <= w1) & roster["shift"].isin(BOOKABLE_SHIFTS)]
    win = win[win["doctor_id"].isin(doc_list["doctor_id"])]
    slots = []
    for r in win.itertuples(index=False):
        Ld = L[r.department_id]
        sh, eh = SHIFTS[r.shift]
        t, end = datetime.combine(r.date, time(sh)), datetime.combine(r.date, time(eh))
        k = 0
        while t + timedelta(minutes=Ld) <= end:
            kind = "walkin_reserve" if k % 3 == 2 else "bookable"   # every 3rd slot (~30%) kept for walk-ins
            slots.append(dict(doctor_id=r.doctor_id, department_id=r.department_id, date=r.date, shift=r.shift,
                              start=t, end=t + timedelta(minutes=Ld), kind=kind, status="free"))
            t += timedelta(minutes=Ld)
            k += 1
    slots = pd.DataFrame(slots)

    with Session(engine) as s:
        s.execute(insert(Doctor), doctors.to_dict("records"))
        s.execute(insert(RosterEntry), roster.to_dict("records"))
        s.execute(insert(EncounterDoctor), enc_doc.to_dict("records"))
        s.execute(insert(SessionSlot), slots.to_dict("records"))
        s.execute(insert(Appointment), hist)
        s.commit()

        # Follow-up chains (real): link follow-up appointments to the previous same-department appointment.
        appt_by_enc = dict(s.execute(select(Appointment.encounter_id, Appointment.id).where(Appointment.encounter_id.is_not(None))).all())
        for r in e[e["prev_encounter_same_dept"].notna()].itertuples(index=False):
            child, parent = appt_by_enc.get(r.encounter_id), appt_by_enc.get(r.prev_encounter_same_dept)
            if child and parent:
                a = s.get(Appointment, child)
                a.parent_appointment_id = parent
        s.commit()

        seed_demo_window(s, rng, p, e, doctors, wait, duration)
        seed_misc(s, doctors)
        s.commit()
    return {"doctors": int((doctors["kind"] == "doctor").sum()), "desks": int((doctors["kind"] == "desk").sum()),
            "roster": len(roster), "slots": len(slots), "historical_appointments": len(sched),
            "simulated_cancel_noshow": n_cancel + n_noshow}


def seed_demo_window(s, rng, p, e, doctors, wait, duration):
    """Fill demo-window slots so timetables are demonstrable; statuses relative to DEMO_NOW."""
    fill = DEFAULT_SETTINGS["demo_fill_ratio"]
    dept_name = doctors.set_index("department_id")["department_name"].to_dict()
    est = {}
    visited = e.groupby("department_id")["patient_id"].apply(lambda x: list(pd.unique(x))).to_dict()
    pids = p["patient_id"].to_numpy()
    kids = p[p["age"] < 18]["patient_id"].to_numpy()
    adults = p[p["age"] >= 18]["patient_id"].to_numpy()
    age = p.set_index("patient_id")["age"].to_dict()
    real_dur = e[~e["dq_lbc_has_service"]].groupby("department_id")["service_minutes"].apply(np.array).to_dict()
    # Per-doctor drift today: a few doctors run late, for the running-late demo.
    late_today = {"D03-01": 22, "D04-02": 14}  # minutes behind schedule today

    slots = s.exec(select(SessionSlot).where(SessionSlot.kind == "bookable").order_by(SessionSlot.doctor_id, SessionSlot.start)).all()
    by_session = {}
    for sl in slots:
        by_session.setdefault((sl.doctor_id, sl.date, sl.shift), []).append(sl)

    events = []
    for (doc, day, shift), sls in by_session.items():
        dday = datetime.combine(day, time())
        days_ahead = (dday - DEMO_DATE).days
        ratio = fill * (1.0 if days_ahead <= 0 else max(0.3, 1 - 0.07 * days_ahead))
        if days_ahead == 0:
            ratio = 0.85
        dept = sls[0].department_id
        Ld = (sls[0].end - sls[0].start).seconds // 60
        cursor, drift = None, late_today.get(doc, 0)
        for sl in sls:
            if rng.random() > ratio:
                continue
            vt = "Follow-up" if rng.random() < 0.29 else "Scheduled"
            # Age-appropriate patients: Pediatrics books children, child-specific reasons never go to adults.
            pool = visited[dept] if vt == "Follow-up" else pids
            if dept == "D03":
                pool = [x for x in pool if age[x] < 18] or list(kids)
            else:
                pool = [x for x in pool if age[x] >= 18] if rng.random() < 0.85 else pool
            pid = str(rng.choice(pool))
            key = (dept_name[dept], vt)
            if key not in est:
                est[key] = wait.booking_estimate(dept_name[dept], vt)
            be = est[key]
            booked_at = min(sl.start - timedelta(days=int(rng.integers(1, 12))), DEMO_NOW - timedelta(hours=int(rng.integers(1, 200))))
            a = Appointment(patient_id=pid, doctor_id=doc, department_id=dept, slot_id=sl.id, slot_start=sl.start,
                            slot_end=sl.end, visit_type=vt, reason=str(rng.choice(REASONS[dept_name[dept]])),
                            status="booked", booked_at=booked_at, lead_days=max(0, (sl.start - booked_at).days),
                            predicted_wait=be["expected"], predicted_p10=be["p10"], predicted_p90=be["p90"],
                            source="seeded", simulated=True)
            if sl.end <= DEMO_NOW:  # past: completed (or no-show), with realistic actual times
                if rng.random() < DEFAULT_SETTINGS["sim_noshow_rate"]:
                    a.status = "no_show"
                else:
                    start = max(sl.start + timedelta(minutes=drift * (1 if days_ahead == 0 else 0)), cursor or sl.start)
                    dur = float(np.clip(rng.choice(real_dur[dept]), 0.6 * Ld, 1.5 * Ld))
                    a.status, a.checked_in_at = "completed", sl.start - timedelta(minutes=int(rng.integers(3, 15)))
                    a.started_at, a.completed_at = start, start + timedelta(minutes=dur)
                    cursor = a.completed_at
            elif days_ahead == 0 and sl.start <= DEMO_NOW + timedelta(minutes=5):
                a.status = "in_consultation" if (cursor is None or cursor <= DEMO_NOW) else "checked_in"
                a.checked_in_at = sl.start - timedelta(minutes=8)
                if a.status == "in_consultation":
                    a.started_at = max(cursor or sl.start, sl.start + timedelta(minutes=drift))
                    cursor = DEMO_NOW + timedelta(minutes=Ld)
            elif days_ahead == 0 and sl.start <= DEMO_NOW + timedelta(minutes=60):
                a.status, a.checked_in_at = "checked_in", DEMO_NOW - timedelta(minutes=int(rng.integers(2, 20)))
            else:
                a.status = "confirmed" if (sl.start - DEMO_NOW).days < 2 else "booked"
            s.add(a)
            sl.status = "booked"
            s.flush()
            events.append(AppointmentEvent(appointment_id=a.id, to_status="booked", actor="seed", at=a.booked_at))
    s.add_all(events)


def seed_misc(s, doctors):
    now = DEMO_NOW
    # Featured demo patient (P01936, 16y, prefers Telugu) has a booking today with the Pediatrics doctor who is running late.
    day0 = datetime.combine(DEMO_DATE.date(), time())
    a = s.exec(select(Appointment).where(Appointment.doctor_id == "D03-01", Appointment.status.in_(("booked", "confirmed")),
                                         Appointment.slot_start >= day0, Appointment.slot_start < day0 + timedelta(days=1))
               .order_by(Appointment.slot_start)).first()
    if a:
        a.patient_id, a.visit_type, a.reason, a.status = "P01936", "Follow-up", "Fever (child)", "confirmed"
        s.add(Notification(user_key="patient:P01936", kind="reminder", title="Reminder: appointment today",
                           body=f"{s.get(Doctor, a.doctor_id).name}, Pediatrics, {a.slot_start:%H:%M}. Check in from your phone when you arrive.",
                           payload={"appointment_id": a.id}, created_at=now - timedelta(hours=2)))
    s.add(LeaveRequest(doctor_id="D03-02", from_date=(DEMO_DATE + timedelta(days=2)).date(),
                       to_date=(DEMO_DATE + timedelta(days=3)).date(), reason="Conference", created_at=now - timedelta(days=1)))
    s.add(LeaveRequest(doctor_id="D04-03", from_date=(DEMO_DATE + timedelta(days=4)).date(),
                       to_date=(DEMO_DATE + timedelta(days=4)).date(), reason="Personal", created_at=now - timedelta(hours=5)))
    for pid in ["P00010", "P00042", "P00077"]:
        s.add(WaitlistEntry(patient_id=pid, department_id="D03", earliest=DEMO_DATE.date(),
                            latest=(DEMO_DATE + timedelta(days=6)).date(), created_at=now - timedelta(hours=10)))
    s.add(AlertRule(name="Excess wait above 10 min for 2 weeks", metric="excess_wait", threshold=10, window_weeks=2))
    for k, v in DEFAULT_SETTINGS.items():
        s.add(Setting(key=k, value={"value": v}))
