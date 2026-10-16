"""Analytics over the real DATATHON data (pandas). Every function returns JSON-ready dicts."""
import math

import numpy as np
import pandas as pd

from app.config import TRIAGE_ORDER
from app.etl.clean import DQ_DESCRIPTIONS
from app.store import store


def _r(x, n=1):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), n)


def filtered(f=None):
    e = store.enc
    f = f or {}
    if f.get("date_from"):
        e = e[e["arrival_time"] >= pd.Timestamp(f["date_from"])]
    if f.get("date_to"):
        e = e[e["arrival_time"] < pd.Timestamp(f["date_to"]) + pd.Timedelta(days=1)]
    for key, col in [("department_id", "department_id"), ("triage_level", "triage_level"), ("visit_type", "visit_type")]:
        if f.get(key):
            e = e[e[col].isin(f[key].split(","))]
    return e


# ------------------------------------------------------------------ Command overview
def kpis(f=None):
    e = filtered(f)
    if e.empty:
        return {"visits": 0}
    weeks = e.groupby("week")["wait_minutes"].median()
    return {
        "visits": int(len(e)), "patients": int(e["patient_id"].nunique()),
        "median_wait": _r(e["wait_minutes"].median()), "p90_wait": _r(e["wait_minutes"].quantile(0.9)),
        "mean_wait": _r(e["wait_minutes"].mean()),
        "lbc_rate": _r(100 * (e["outcome"] == "Left before care").mean(), 2),
        "admit_rate": _r(100 * (e["outcome"] == "Admitted").mean(), 1),
        "median_los": _r(e["length_of_stay_minutes"].median()),
        "visits_per_day": _r(len(e) / max(1, e["arrival_date"].nunique())),
        "wait_trend": [{"week": str(k.date()), "median": _r(v)} for k, v in weeks.items()],
    }


def briefing():
    b = store.analytics["bottlenecks"]
    slow = b[(b["excess_wait"] > 0) & (b["confidence"] == "High")]
    fast = b[(b["excess_wait"] < 0) & (b["confidence"] == "High")].sort_values("excess_wait")
    t = store.tests
    pri = t.groupby("priority")["turnaround_minutes"].median()
    top = slow.iloc[0] if len(slow) else None
    lines = []
    if top is not None:
        lines.append(f"{len(slow)} departments are slower than their triage mix explains. Largest: {top['department_name']}, "
                     f"+{top['excess_wait']:.1f} min (high confidence), about {top['impact_hours']:.0f} extra patient-hours a year.")
    if len(fast):
        lines.append(f"Benchmarks: {', '.join(fast['department_name'].head(3))} run "
                     f"{abs(fast['excess_wait'].head(3)).min():.0f}–{abs(fast['excess_wait'].head(3)).max():.0f} min faster than expected.")
    lines.append(f"Urgent diagnostic tests are not faster than routine ones ({pri['Urgent']:.0f} vs {pri['Routine']:.0f} min median).")
    lines.append("No reliable time-of-day, weekday or age effect on waiting was found; triage level drives about half of the variation.")
    return {"headline": f"{top['department_name']} is the top issue to investigate" if top is not None else "No major bottleneck",
            "lines": lines, "top_department_id": None if top is None else top["department_id"]}


def flow_funnel(f=None):
    e = filtered(f)
    stages = [("Waiting", e["wait_minutes"].mean()), ("In service", e["service_minutes"].mean()),
              ("Awaiting discharge", e["post_service_minutes"].mean())]
    by_dept = e.groupby("department_name")[["wait_minutes", "service_minutes", "post_service_minutes"]].mean().round(1)
    return {"stages": [{"stage": s, "minutes": _r(m)} for s, m in stages],
            "by_department": [{"department": d, "wait": r.wait_minutes, "service": r.service_minutes,
                               "post": r.post_service_minutes} for d, r in by_dept.iterrows()]}


def heatmap(f=None):
    e = filtered(f)
    pv = e.pivot_table(index="department_name", columns="triage_level", values="wait_minutes", aggfunc="mean").reindex(columns=TRIAGE_ORDER)
    hosp = e.groupby("triage_level")["wait_minutes"].mean()
    return {"triage": TRIAGE_ORDER, "rows": [
        {"department": d, "cells": [{"triage": t, "wait": _r(pv.loc[d, t]), "delta": _r(pv.loc[d, t] - hosp.get(t, np.nan))}
                                    for t in TRIAGE_ORDER]} for d in pv.index]}


def sankey(f=None):
    e = filtered(f)
    nodes, links = [], []
    idx = {}

    def node(name, group):
        if name not in idx:
            idx[name] = len(nodes)
            nodes.append({"name": name, "group": group})
        return idx[name]

    for (v, t), n in e.groupby(["visit_type", "triage_level"]).size().items():
        links.append({"source": node(v, "visit"), "target": node(t, "triage"), "value": int(n)})
    for (t, o), n in e.groupby(["triage_level", "outcome"]).size().items():
        links.append({"source": node(t, "triage"), "target": node(o, "outcome"), "value": int(n)})
    return {"nodes": nodes, "links": links}


# ------------------------------------------------------------------ Investigate first
def investigate_queue():
    b = store.analytics["bottlenecks"]
    c = store.analytics["cells"]
    weekly = store.analytics["weekly"]
    out = []
    for _, r in b.iterrows():
        trend = weekly[weekly["department_id"] == r["department_id"]].tail(13)
        cells = c[c["department_id"] == r["department_id"]].set_index("triage_level").reindex(TRIAGE_ORDER)
        out.append({
            "department_id": r["department_id"], "department_name": r["department_name"], "encounters": int(r["encounters"]),
            "mean_wait": _r(r["mean_wait"]), "expected_wait": _r(r["expected_wait"]), "excess_wait": _r(r["excess_wait"], 2),
            "ci95": _r(r["ci95"], 2), "confidence": r["confidence"], "impact_hours": _r(r["impact_hours"]),
            "p90_wait": _r(r["p90_wait"]), "lbc_rate": _r(100 * r["lbc_rate"], 2), "slower_levels": int(r["slower_levels"]),
            "per_triage": [{"triage": t, "wait": _r(cells.loc[t, "mean_wait"]), "hospital": _r(cells.loc[t, "hospital_wait"]),
                            "excess": _r(cells.loc[t, "excess_wait"]), "confidence": cells.loc[t, "confidence"]} for t in TRIAGE_ORDER],
            "trend": [{"week": str(w.date()), "resid": _r(x)} for w, x in zip(trend["week"], trend["resid"])],
            "suggested_check": suggested_check(r),
        })
    cells_ranked = c[c["excess_wait"] > 0].sort_values("impact_hours", ascending=False).head(10)
    return {"departments": out, "cells": [
        {"department_id": r.department_id, "department_name": r.department_name, "triage_level": r.triage_level,
         "n": int(r.n), "excess_wait": _r(r.excess_wait), "ci95": _r(r.ci95), "confidence": r.confidence,
         "impact_hours": _r(r.impact_hours)} for r in cells_ranked.itertuples()]}


def suggested_check(r):
    if r["excess_wait"] <= 0:
        return "Benchmark: document what this department does well and share it with slower peers."
    if r["slower_levels"] >= 3:
        return ("Slower at almost every triage level, so case mix does not explain it. Check staffing and the "
                "triage-to-service handoff, starting with Low/Medium patients, where most of the excess sits.")
    return "Slower only at some triage levels. Review how those patients are queued and called."


def whatif(department_id, target="hospital", improvement_pct=100, triage_shift=0.0):
    b = store.analytics["bottlenecks"].set_index("department_id")
    r = b.loc[department_id]
    if target == "best":
        ref_excess = b["excess_wait"].min()
    else:
        ref_excess = 0.0
    gap = r["excess_wait"] - ref_excess
    reduced = max(0.0, gap) * improvement_pct / 100
    hours = reduced * r["encounters"] / 60
    # Uncertainty: CI of the department excess carries through linearly.
    ci_h = r["ci95"] * improvement_pct / 100 * r["encounters"] / 60
    # Optional triage-mix shift: share of Low patients moved to Medium (operational re-triage), using model means.
    tri = store.analytics["triage_overall"]
    shift_gain = triage_shift / 100 * (tri["Low"] - tri["Medium"]) * (store.enc["department_id"] == department_id).sum() * \
        (store.enc[store.enc["department_id"] == department_id]["triage_level"] == "Low").mean() / 60
    return {"department": r["department_name"], "current_excess": _r(gap, 2), "minutes_saved_per_visit": _r(reduced, 2),
            "patient_hours_saved": _r(hours + shift_gain), "range": [_r(max(0, hours - ci_h)), _r(hours + ci_h)],
            "visits_per_year": int(r["encounters"]),
            "explanation": f"If {r['department_name']} closed {improvement_pct}% of its {gap:.1f}-min gap to "
                           f"{'the best department' if target == 'best' else 'the hospital average'}, each of its "
                           f"{int(r['encounters'])} visits a year would wait {reduced:.1f} min less."}


# ------------------------------------------------------------------ Department
def department_view(department_id):
    e = store.enc
    d = e[e["department_id"] == department_id]
    hosp = e.groupby("triage_level")["wait_minutes"].mean()
    best = e.groupby(["department_name", "triage_level"])["wait_minutes"].mean().unstack()
    dept_name = store.dept_name[department_id]
    rows = []
    for t in TRIAGE_ORDER:
        mine = d[d["triage_level"] == t]["wait_minutes"].mean()
        bdept = best[t].idxmin()
        rows.append({"triage": t, "mine": _r(mine), "hospital": _r(hosp[t]), "best": _r(best[t].min()), "best_department": bdept})
    weekly = d.groupby("week")["wait_minutes"].agg(["mean", "count"]).reset_index()
    info = store.depts.set_index("department_id").loc[department_id]
    return {"department_id": department_id, "department_name": dept_name, "service_type": info["service_type"],
            "visits": int(len(d)), "median_wait": _r(d["wait_minutes"].median()), "p90_wait": _r(d["wait_minutes"].quantile(.9)),
            "lbc_rate": _r(100 * (d["outcome"] == "Left before care").mean(), 2),
            "median_service": _r(d["service_minutes"].median()), "by_triage": rows,
            "trend": [{"week": str(r.week.date()), "mean": _r(r["mean"]), "n": int(r["count"])} for _, r in weekly.iterrows()],
            "visit_mix": d["visit_type"].value_counts().to_dict(), "outcome_mix": d["outcome"].value_counts().to_dict()}


# ------------------------------------------------------------------ Journeys
def search_patients(q, limit=20):
    p = store.patients
    if q:
        p = p[p["patient_id"].str.contains(q.upper(), regex=False)]
    visits = store.enc.groupby("patient_id").size()
    p = p.head(limit)
    return [{"patient_id": r.patient_id, "age": int(r.age), "sex": r.sex, "chronic_condition": r.chronic_condition,
             "insurance_type": r.insurance_type, "visits": int(visits.get(r.patient_id, 0))} for r in p.itertuples()]


def patient_detail(pid):
    p = store.patient_idx.loc[pid]
    e = store.enc[store.enc["patient_id"] == pid].sort_values("arrival_time")
    t = store.tests[store.tests["patient_id"] == pid]
    cl = store.clusters
    from app.etl.simulate import preferred_language
    visits = [encounter_summary(r) for _, r in e.iterrows()]
    return {
        "patient_id": pid, "age": int(p["age"]), "age_band": p["age_band"], "sex": p["sex"],
        "chronic_condition": p["chronic_condition"], "home_area": p["home_area"], "insurance_type": p["insurance_type"],
        "preferred_language": preferred_language(p["home_area"]),
        "cluster": cl.loc[pid, "cluster_name"] if pid in cl.index else None,
        "visits": visits, "n_visits": len(visits),
        "departments": e["department_name"].value_counts().to_dict(),
        "usual_wait": _r(e["wait_minutes"].median()),
        "tests": [{"test_id": r.test_id, "test_type": r.test_type, "priority": r.priority,
                   "requested": r.requested_time.isoformat(), "turnaround": _r(r.turnaround_minutes),
                   "timing_unlinked": bool(r.dq_outside_encounter_window)} for r in t.itertuples()],
    }


def encounter_summary(r):
    return {"encounter_id": r["encounter_id"], "arrival_time": r["arrival_time"].isoformat(),
            "department_id": r["department_id"], "department_name": r["department_name"], "visit_type": r["visit_type"],
            "triage_level": r["triage_level"], "outcome": r["outcome"], "wait": _r(r["wait_minutes"]),
            "service": _r(r["service_minutes"]), "post": _r(r["post_service_minutes"])}


def encounter_timeline(eid):
    r = store.enc.set_index("encounter_id").loc[eid]
    same = store.enc[(store.enc["triage_level"] == r["triage_level"]) & (store.enc["department_id"] == r["department_id"])]
    norm = {"wait": same["wait_minutes"].median(), "service": same["service_minutes"].median(),
            "post": same["post_service_minutes"].median()}
    segs = [("Waiting", r["arrival_time"], r["service_start_time"], r["wait_minutes"], norm["wait"]),
            ("In service", r["service_start_time"], r["service_end_time"], r["service_minutes"], norm["service"]),
            ("Awaiting discharge", r["service_end_time"], r["discharge_time"], r["post_service_minutes"], norm["post"])]
    slowest = max(segs, key=lambda s: s[3] - s[4])
    pred = store.wait.explain(r[list(store.wait.reference.keys())].to_dict())
    return {"encounter_id": eid, "patient_id": r["patient_id"], "department_name": r["department_name"],
            "triage_level": r["triage_level"], "visit_type": r["visit_type"], "outcome": r["outcome"],
            "segments": [{"stage": s, "start": a.isoformat(), "end": b.isoformat(), "minutes": _r(m), "norm": _r(n),
                          "vs_norm": _r(m - n)} for s, a, b, m, n in segs],
            "slowest_stage": slowest[0], "model": {"expected": _r(pred["expected"]), "p10": _r(pred["p10"]),
                                                   "p90": _r(pred["p90"]), "actual": _r(r["wait_minutes"])},
            "dq": {k: bool(r[k]) for k in r.index if k.startswith("dq_") and bool(r[k])}}


# ------------------------------------------------------------------ Forecast
def forecasts(department_id=None):
    hist = store.analytics["forecast_hist"]
    fut = store.analytics["forecast"]
    depts = [department_id] if department_id else sorted(hist["department_id"].unique())
    tri_mix = store.enc.groupby("department_id")["triage_level"].value_counts(normalize=True)
    out = []
    for d in depts:
        h = hist[hist["department_id"] == d].tail(16)
        f = fut[fut["department_id"] == d]
        mix = tri_mix[d].to_dict()
        name = store.dept_name[d]
        exp = sum(p * store.wait.predict_one({"department_name": name, "triage_level": t})["expected"] for t, p in mix.items())
        out.append({"department_id": d, "department_name": name,
                    "history": [{"week": str(r.week.date()), "arrivals": int(r.arrivals)} for r in h.itertuples()],
                    "forecast": [{"week": str(r.week.date()), "forecast": _r(r.forecast, 2), "lo": int(r.lo), "hi": int(r.hi)} for r in f.itertuples()],
                    "expected_wait": _r(exp), "wait_range": [_r(max(0, exp + store.wait.lo)), _r(exp + store.wait.hi)]})
    return {"departments": out, "card": store.metrics["forecast"]}


# ------------------------------------------------------------------ Diagnostics
def diagnostics(targets=None):
    t = store.tests
    pri = t.groupby("priority")["turnaround_minutes"].agg(["median", lambda s: s.quantile(.9), "count"])
    by = t.groupby(["test_type", "priority"])["turnaround_minutes"]
    box = []
    for (tt, p), s in by:
        q = s.quantile([.1, .25, .5, .75, .9])
        box.append({"test_type": tt, "priority": p, "n": int(len(s)), "p10": _r(q[.1]), "q1": _r(q[.25]), "median": _r(q[.5]),
                    "q3": _r(q[.75]), "p90": _r(q[.9])})
    breaches = []
    for tt, g in t.groupby("test_type"):
        u, r = g[g["priority"] == "Urgent"]["turnaround_minutes"].median(), g[g["priority"] == "Routine"]["turnaround_minutes"].median()
        breaches.append({"test_type": tt, "urgent_median": _r(u), "routine_median": _r(r), "gap": _r(r - u),
                         "breach": bool(u >= 0.9 * r)})
    trend = t.groupby(["request_week", "priority"])["turnaround_minutes"].median().unstack().tail(26)
    target_rows = []
    for tg in targets or []:
        s = t[(t["test_type"] == tg["test_type"]) & (t["priority"] == tg["priority"])]["turnaround_minutes"]
        target_rows.append({**tg, "n": int(len(s)), "meeting": _r(100 * (s <= tg["target_minutes"]).mean()),
                            "breaches": int((s > tg["target_minutes"]).sum())})
    demand = t.groupby(["request_weekday", "request_hour"]).size().reset_index(name="n")
    return {"overall": {p: {"median": _r(r["median"]), "p90": _r(r["<lambda_0>"]), "n": int(r["count"])} for p, r in pri.iterrows()},
            "box": box, "priority_compliance": breaches,
            "trend": [{"week": str(k.date()), "Routine": _r(v.get("Routine")), "Urgent": _r(v.get("Urgent"))} for k, v in trend.iterrows()],
            "targets": target_rows,
            "demand": [{"weekday": r.request_weekday, "hour": int(r.request_hour), "n": int(r.n)} for r in demand.itertuples()],
            "by_type": t["test_type"].value_counts().to_dict(),
            "note": "Test timestamps are not linked to their encounter's visit window (data-quality check), "
                    "so turnaround is analysed on its own."}


def support_scorecard():
    q = investigate_queue()["departments"]
    return [d for d in q if store.depts.set_index("department_id").loc[d["department_id"], "service_type"] in ("Diagnostics", "Support", "Admin")]


# ------------------------------------------------------------------ Insights
def equity():
    eq = store.analytics["equity"]
    out = {}
    for dim, g in eq.groupby("dimension"):
        out[dim] = g.drop(columns="dimension").to_dict("records")
    max_gap = float(eq["adjusted_gap"].abs().max())
    return {"groups": out, "max_gap": round(max_gap, 2),
            "verdict": f"After adjusting for triage and department, no group waits more than {max_gap:.1f} min longer or shorter "
                       "than average. No evidence of unequal treatment by age, sex or insurance."}


def lbc():
    e = store.enc
    by_dept = e.groupby("department_name")["outcome"].apply(lambda s: 100 * (s == "Left before care").mean()).round(2)
    by_wait = e.groupby(pd.cut(e["wait_minutes"], [0, 30, 45, 60, 90, 200]), observed=True)["outcome"].apply(
        lambda s: 100 * (s == "Left before care").mean()).round(2)
    return {"by_department": by_dept.to_dict(), "by_wait_band": {str(k): v for k, v in by_wait.items()},
            "note": "Left-before-care does not rise with longer waits in this data, so we monitor it but do not predict it."}


def clusters():
    prof = store.analytics["cluster_profile"]
    return {"clusters": prof.to_dict("records"), "card": store.metrics["clusters"]}


def hourly_pattern():
    e = store.enc
    h = e.groupby("arrival_hour")["wait_minutes"].mean().round(1)
    a = e.groupby("arrival_hour").size()
    return [{"hour": int(k), "mean_wait": float(v), "arrivals": int(a[k])} for k, v in h.items()]


# ------------------------------------------------------------------ Data trust
def data_quality():
    rows = []
    for name, df in [("encounters", store.enc), ("diagnostic_tests", store.tests)]:
        for col in [c for c in df.columns if c.startswith("dq_")]:
            n = int(df[col].sum())
            label, handling = DQ_DESCRIPTIONS[col]
            rows.append({"table": name, "check": col, "label": label, "rows": n, "share": round(100 * n / len(df), 2),
                         "handling": handling, "status": "pass" if n == 0 else "flagged"})
    days = store.enc["arrival_date"].nunique()
    vol = len(store.enc) / days / len(store.depts)
    return {"checks": rows, "notes": [
        f"chronic_condition blank for {(store.patients['chronic_condition'] == 'None').sum()} patients: treated as 'None'.",
        f"daily_capacity ({store.depts['daily_capacity'].min()}–{store.depts['daily_capacity'].max()}/day) vs actual "
        f"~{vol:.1f} visits per department per day: utilization is NOT computed from it.",
        f"{(~store.patients['patient_id'].isin(store.enc['patient_id'])).sum()} patients have no encounters.",
    ], "simulated": SIMULATED_RULES, "rows": {"patients": len(store.patients), "encounters": len(store.enc),
                                               "departments": len(store.depts), "diagnostic_tests": len(store.tests)}}


SIMULATED_RULES = [
    {"item": "Doctors", "rule": "clamp(ceil(staff_count/4), 3, 7) per clinical/emergency/outpatient/diagnostics department; "
     "Pharmacy and Admissions use service desks", "anchor": "departments.staff_count"},
    {"item": "Roster", "rule": "24/7 rota (Morning 08–14, Evening 14–20, Night 20–08) because scheduled visits arrive at every hour; "
     "~1.5% of shifts on leave", "anchor": "encounters.arrival_time"},
    {"item": "Slot length", "rule": "department median service_minutes rounded to 5 min", "anchor": "encounters.service_minutes"},
    {"item": "Walk-in reserve", "rule": "every 3rd slot (~30%) kept free; walk-in + emergency ≈ 50% of real visits", "anchor": "encounters.visit_type"},
    {"item": "Historical appointments", "rule": "4,008 real Scheduled + Follow-up encounters converted; booking lead time and doctor "
     "are simulated, waits / times / outcomes are real", "anchor": "encounters"},
    {"item": "Doctor assignment", "rule": "seeded round-robin among on-shift doctors", "anchor": "roster"},
    {"item": "Cancellations / no-shows", "rule": "assumed rates (cancel 8%, no-show 5%); no model trained on them", "anchor": "assumption"},
    {"item": "Demo-window bookings", "rule": "slots 29 Dec – 18 Jan seeded at ~55% fill (85% on demo day) so timetables are "
     "demonstrable; real volume is ~1 scheduled visit per department per day", "anchor": "assumption"},
    {"item": "Patient language", "rule": "home_area AREA_01–08 Telugu, 09–14 Hindi, 15–20 English", "anchor": "patients.home_area"},
]


def model_card():
    return store.metrics
