"""Load the four DATATHON CSVs, add derived fields and data-quality flags.

No rows are dropped: every issue becomes a boolean `dq_*` column.
"""
import pandas as pd

from app.config import RAW_DIR, TRIAGE_ORDER

ENC_TIMES = ["arrival_time", "service_start_time", "service_end_time", "discharge_time"]


def load_raw():
    patients = pd.read_csv(RAW_DIR / "patients.csv")
    encounters = pd.read_csv(RAW_DIR / "encounters.csv", parse_dates=ENC_TIMES)
    departments = pd.read_csv(RAW_DIR / "departments.csv")
    tests = pd.read_csv(RAW_DIR / "diagnostic_tests.csv", parse_dates=["requested_time", "completion_time"])
    return patients, encounters, departments, tests


def clean_patients(p):
    p = p.copy()
    p["chronic_condition"] = p["chronic_condition"].fillna("None")
    p["age_band"] = pd.cut(p["age"], [0, 17, 39, 64, 120], labels=["0-17", "18-39", "40-64", "65+"]).astype(str)
    return p


def clean_encounters(e, patients, departments):
    e = e.merge(patients, on="patient_id", how="left").merge(departments, on="department_id", how="left")
    mins = lambda a, b: (e[b] - e[a]).dt.total_seconds() / 60
    e["post_service_minutes"] = mins("service_end_time", "discharge_time")
    e["length_of_stay_minutes"] = mins("arrival_time", "discharge_time")
    e["arrival_hour"] = e["arrival_time"].dt.hour
    e["arrival_weekday"] = e["arrival_time"].dt.day_name()
    e["arrival_month"] = e["arrival_time"].dt.month
    e["arrival_date"] = e["arrival_time"].dt.normalize()
    e["week"] = e["arrival_time"].dt.to_period("W-SUN").dt.start_time
    e["triage_rank"] = e["triage_level"].map({t: i for i, t in enumerate(TRIAGE_ORDER)})

    e["dq_wait_mismatch"] = (mins("arrival_time", "service_start_time") - e["wait_minutes"]).abs() > 1
    e["dq_service_mismatch"] = (mins("service_start_time", "service_end_time") - e["service_minutes"]).abs() > 1
    e["dq_time_order"] = ~((e["arrival_time"] <= e["service_start_time"])
                           & (e["service_start_time"] <= e["service_end_time"])
                           & (e["service_end_time"] <= e["discharge_time"]))
    e["dq_lbc_has_service"] = (e["outcome"] == "Left before care") & (e["service_minutes"] > 0)
    e["dq_adult_in_pediatrics"] = (e["department_name"] == "Pediatrics") & (e["age"] >= 18)
    e["dq_child_outside_pediatrics"] = (e["department_name"] != "Pediatrics") & (e["age"] < 18)
    e["dq_emergency_to_support_dept"] = (e["visit_type"] == "Emergency") & e["service_type"].isin(["Support", "Admin"])

    # Backward-looking history features (known at arrival; no leakage).
    e = e.sort_values("arrival_time").reset_index(drop=True)
    e["prior_visits"] = e.groupby("patient_id").cumcount()
    load = []
    for _, g in e.groupby("department_id"):
        s = pd.Series(1, index=g["arrival_time"]).rolling("24h").sum() - 1
        load.append(pd.Series(s.to_numpy(), index=g.index))
    e["dept_arrivals_prev_24h"] = pd.concat(load).astype(int)

    # Follow-up chains (real): link a follow-up to the patient's previous visit in the same department.
    e["prev_encounter_same_dept"] = e.groupby(["patient_id", "department_id"])["encounter_id"].shift(1)
    e.loc[e["visit_type"] != "Follow-up", "prev_encounter_same_dept"] = None
    return e


def clean_tests(t, e):
    t = t.merge(e[["encounter_id", "patient_id", "department_id", "department_name", "arrival_time", "discharge_time"]],
                on="encounter_id", how="left")
    t["turnaround_minutes"] = (t["completion_time"] - t["requested_time"]).dt.total_seconds() / 60
    t["request_hour"] = t["requested_time"].dt.hour
    t["request_weekday"] = t["requested_time"].dt.day_name()
    t["request_week"] = t["requested_time"].dt.to_period("W-SUN").dt.start_time
    t["dq_unknown_encounter"] = t["arrival_time"].isna()
    t["dq_completed_before_request"] = t["turnaround_minutes"] < 0
    t["dq_outside_encounter_window"] = ~((t["requested_time"] >= t["arrival_time"]) & (t["requested_time"] <= t["discharge_time"]))
    return t.drop(columns=["arrival_time", "discharge_time"])


def build():
    patients, encounters, departments, tests = load_raw()
    p = clean_patients(patients)
    e = clean_encounters(encounters, p, departments)
    t = clean_tests(tests, e)
    return p, e, departments, t


DQ_DESCRIPTIONS = {
    "dq_wait_mismatch": ("Wait field disagrees with timestamps", "Passed: fields are consistent"),
    "dq_service_mismatch": ("Service field disagrees with timestamps", "Passed: fields are consistent"),
    "dq_time_order": ("Journey timestamps out of order", "Passed"),
    "dq_lbc_has_service": ("Left before care, but a service time is recorded", "Flagged; their service times are not trusted"),
    "dq_adult_in_pediatrics": ("Adults seen in Pediatrics", "Flagged; Pediatrics finding caveated"),
    "dq_child_outside_pediatrics": ("Children seen outside Pediatrics", "Flagged; department labels used as given"),
    "dq_emergency_to_support_dept": ("Emergency visits routed to Pharmacy/Admissions", "Flagged for review"),
    "dq_unknown_encounter": ("Test with unknown encounter", "Passed"),
    "dq_completed_before_request": ("Test completed before it was requested", "Passed"),
    "dq_outside_encounter_window": ("Test requested outside its encounter's arrival→discharge window",
                                    "Turnaround analysed standalone; tests not placed on the visit timeline"),
}
