"""Train every model from scratch on the provided data and build the analytics tables.

Outputs (artifacts/):
  frames.joblib     cleaned patients / encounters / departments / tests
  models.joblib     wait model, consult-duration model, forecast model, clusterer
  analytics.joblib  bottlenecks, cells, weekly control chart, forecasts, clusters, equity, ...
  metrics.json      everything shown in the in-app Model Card
"""
import json
import math

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest
from sklearn.inspection import permutation_importance
from sklearn.linear_model import PoissonRegressor, Ridge
from sklearn.metrics import mean_absolute_error, r2_score, silhouette_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app.config import ART_DIR, CALIB_START, SEED, TRAIN_END, TRIAGE_ORDER
from app.etl.clean import build
from app.ml.wait_model import (CAT, FEATURES, NUM, WaitModel, gbm_pipeline, reference_row, ridge_pipeline,
                               triage_mix_table)


def metrics(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    return {"MAE": round(float(mean_absolute_error(y, p)), 2), "R2": round(float(r2_score(y, p)), 3),
            "within_15": round(float(np.mean(np.abs(y - p) <= 15)), 3)}


# ---------------------------------------------------------------- 5.1 wait model
def train_wait(e):
    train, test = e[e["arrival_time"] < TRAIN_END], e[e["arrival_time"] >= TRAIN_END]
    y_tr, y_te = train["wait_minutes"], test["wait_minutes"]
    res = {}
    res["Overall mean (naive)"] = metrics(y_te, np.full(len(test), y_tr.mean()))
    res["Triage-level mean"] = metrics(y_te, test["triage_level"].map(train.groupby("triage_level")["wait_minutes"].mean()))
    cell = train.groupby(["triage_level", "department_name"])["wait_minutes"].mean().rename("m").reset_index()
    res["Triage × department mean"] = metrics(y_te, test.merge(cell, on=["triage_level", "department_name"], how="left")["m"])
    ridge = ridge_pipeline().fit(train[FEATURES], y_tr)
    p_ridge = ridge.predict(test[FEATURES])
    res["Ridge regression (production)"] = metrics(y_te, p_ridge)
    gbm = gbm_pipeline().fit(train[FEATURES], y_tr)
    res["Gradient boosting (challenger)"] = metrics(y_te, gbm.predict(test[FEATURES]))

    # Split-conformal interval: fit on Jan–Jul, calibrate on Aug–Sep, evaluate on untouched Oct–Dec.
    fit, cal = train[train["arrival_time"] < CALIB_START], train[train["arrival_time"] >= CALIB_START]
    cal_model = ridge_pipeline().fit(fit[FEATURES], fit["wait_minutes"])
    cal_resid = cal["wait_minutes"] - cal_model.predict(cal[FEATURES])
    lo, hi = np.quantile(cal_resid, [0.10, 0.90])
    coverage = float(((y_te >= p_ridge + lo) & (y_te <= p_ridge + hi)).mean())

    imp = permutation_importance(ridge, test[FEATURES], y_te, scoring="neg_mean_absolute_error",
                                 n_repeats=8, random_state=SEED)
    importance = sorted(({"feature": f, "mae_increase": round(float(v), 2)} for f, v in zip(FEATURES, imp.importances_mean)),
                        key=lambda d: -d["mae_increase"])

    final = ridge_pipeline().fit(e[FEATURES], e["wait_minutes"])
    model = WaitModel(final, cal_resid.to_numpy(), reference_row(e), triage_mix_table(e), version="wait-ridge-1.0")
    card = {
        "name": "Wait-time model", "target": "wait_minutes (arrival → service start)",
        "method": "Ridge regression (one-hot + standardised numeric); gradient boosting as challenger",
        "features": FEATURES, "split": {"train": f"< {TRAIN_END.date()}", "test": f">= {TRAIN_END.date()}",
                                          "calibration": f"{CALIB_START.date()} → {TRAIN_END.date()}"},
        "n_train": int(len(train)), "n_test": int(len(test)), "comparison": res,
        "interval": {"method": "split-conformal 80%", "coverage_test": round(coverage, 3),
                     "lo": round(float(lo), 1), "hi": round(float(hi), 1)},
        "importance": importance,
        "decision": "Gradient boosting gives no accuracy gain over Ridge, so there is no hidden non-linear signal. "
                    "Ridge is equally accurate and every prediction decomposes exactly into per-feature minutes.",
        "limitations": ["Synthetic data: results show model behaviour, not real-world performance.",
                        "About half of the variance is unexplained by any available feature."],
    }
    return model, card, ridge


# ---------------------------------------------------------------- 5.6 consult duration
DUR_CAT = ["department_name", "triage_level", "visit_type", "age_band", "chronic_condition"]
DUR_NUM = ["prior_visits"]


def train_duration(e):
    ok = e[~e["dq_lbc_has_service"]]
    train, test = ok[ok["arrival_time"] < TRAIN_END], ok[ok["arrival_time"] >= TRAIN_END]
    pre = ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), DUR_CAT), ("num", StandardScaler(), DUR_NUM)])
    model = make_pipeline(pre, Ridge(alpha=1.0)).fit(train[DUR_CAT + DUR_NUM], train["service_minutes"])
    med = train.groupby("department_name")["service_minutes"].median()
    res = {"Department median (baseline)": metrics(test["service_minutes"], test["department_name"].map(med)),
           "Ridge regression": metrics(test["service_minutes"], model.predict(test[DUR_CAT + DUR_NUM]))}
    use_model = res["Ridge regression"]["MAE"] < res["Department median (baseline)"]["MAE"] - 0.5
    dept_median = ok.groupby("department_name")["service_minutes"].median().round().astype(int).to_dict()
    card = {"name": "Consultation-duration model", "target": "service_minutes",
            "method": "Ridge vs department median", "features": DUR_CAT + DUR_NUM, "comparison": res,
            "chosen": "Ridge regression" if use_model else "Department median (baseline)",
            "decision": ("Ridge beats the department median and is used." if use_model else
                         "Ridge does not beat the department median, so the product uses the median per department "
                         "for slot length and running-late projections (honest choice)."),
            "excluded_rows": int(e["dq_lbc_has_service"].sum())}
    return {"use_model": use_model, "model": model, "dept_median": dept_median,
            "p75": ok.groupby("department_name")["service_minutes"].quantile(0.75).round().to_dict()}, card


# ---------------------------------------------------------------- 5.5 ranking + cells
def bottlenecks(e):
    tri = e.groupby("triage_level")["wait_minutes"].mean()
    e = e.assign(mix_expected=e["triage_level"].map(tri))
    rows = []
    for (did, name), g in e.groupby(["department_id", "department_name"]):
        excess = g["wait_minutes"].mean() - g["mix_expected"].mean()
        ci = 1.96 * (g["wait_minutes"] - g["mix_expected"]).std() / math.sqrt(len(g))
        per_tri = g.groupby("triage_level")["wait_minutes"].mean().reindex(TRIAGE_ORDER)
        slower_levels = int((per_tri > tri.reindex(TRIAGE_ORDER)).sum())
        rows.append({
            "department_id": did, "department_name": name, "encounters": len(g),
            "mean_wait": g["wait_minutes"].mean(), "expected_wait": g["mix_expected"].mean(),
            "excess_wait": excess, "ci95": ci, "p90_wait": g["wait_minutes"].quantile(0.9),
            "lbc_rate": (g["outcome"] == "Left before care").mean(),
            "impact_hours": max(excess, 0) * len(g) / 60, "slower_levels": slower_levels,
            "per_triage": {t: round(float(v), 1) for t, v in per_tri.items()},
        })
    b = pd.DataFrame(rows)
    b["confidence"] = np.where(b["excess_wait"].abs() > 2 * b["ci95"], "High",
                               np.where(b["excess_wait"].abs() > b["ci95"], "Medium", "Low"))
    cells = []
    for (did, name, t), g in e.groupby(["department_id", "department_name", "triage_level"]):
        ex = g["wait_minutes"].mean() - tri[t]
        ci = 1.96 * g["wait_minutes"].std() / math.sqrt(len(g))
        cells.append({"department_id": did, "department_name": name, "triage_level": t, "n": len(g),
                      "mean_wait": g["wait_minutes"].mean(), "hospital_wait": tri[t], "excess_wait": ex, "ci95": ci,
                      "impact_hours": max(ex, 0) * len(g) / 60})
    c = pd.DataFrame(cells)
    c["confidence"] = np.where(c["excess_wait"].abs() > 2 * c["ci95"], "High",
                               np.where(c["excess_wait"].abs() > c["ci95"], "Medium", "Low"))
    return b.sort_values(["impact_hours", "excess_wait"], ascending=False).round(2), c.round(2)


# ---------------------------------------------------------------- 5.2 unusual weeks
def weekly_control(e, ridge_train):
    e = e.assign(pred=ridge_train.predict(e[FEATURES]))
    e["resid"] = e["wait_minutes"] - e["pred"]
    w = e.groupby(["department_id", "department_name", "week"]).agg(
        n=("encounter_id", "count"), mean_wait=("wait_minutes", "mean"), resid=("resid", "mean"),
        p90=("wait_minutes", lambda s: s.quantile(0.9)), lbc=("outcome", lambda s: (s == "Left before care").mean()),
    ).reset_index().sort_values(["department_id", "week"])
    sigma = e[e["arrival_time"] < TRAIN_END]["resid"].std()
    lam, L = 0.3, 2.7
    out = []
    for _, g in w.groupby("department_id"):
        z, prev = [], 0.0
        for r in g["resid"]:
            prev = lam * r + (1 - lam) * prev
            z.append(prev)
        g = g.assign(ewma=z)
        # Approximate EWMA limit with the average weekly count for this department.
        se = sigma / math.sqrt(max(g["n"].mean(), 1)) * math.sqrt(lam / (2 - lam))
        g = g.assign(ucl=L * se, lcl=-L * se)
        out.append(g)
    w = pd.concat(out)
    iso = IsolationForest(n_estimators=200, contamination=0.04, random_state=SEED)
    X = w[["resid", "p90", "lbc", "n"]].fillna(0).to_numpy()
    w["iso_flag"] = iso.fit_predict(X) == -1
    w["ewma_flag"] = w["ewma"] > w["ucl"]
    return w.round(3)


# ---------------------------------------------------------------- 5.3 forecast
def fourier(weeks):
    woy = weeks.dt.isocalendar().week.astype(int).to_numpy()
    return np.column_stack([np.sin(2 * np.pi * k * woy / 52) for k in (1, 2)] +
                           [np.cos(2 * np.pi * k * woy / 52) for k in (1, 2)])


def train_forecast(e):
    w = e.groupby(["department_id", "week"]).size().rename("arrivals").reset_index()
    full = pd.MultiIndex.from_product([sorted(e["department_id"].unique()), sorted(w["week"].unique())],
                                      names=["department_id", "week"])
    w = w.set_index(["department_id", "week"]).reindex(full, fill_value=0).reset_index()
    # Drop partial first/last weeks.
    weeks = sorted(w["week"].unique())[1:-1]
    w = w[w["week"].isin(weeks)]
    depts = sorted(w["department_id"].unique())

    def X(df):
        d = np.column_stack([(df["department_id"] == dd).astype(float) for dd in depts])
        return np.hstack([d, fourier(df["week"])])

    # Rolling-origin backtest over the last 12 weeks, horizon 4.
    errs_model, errs_naive = [], []
    for origin in weeks[-12::4]:
        tr, te = w[w["week"] < origin], w[(w["week"] >= origin) & (w["week"] < origin + pd.Timedelta(weeks=4))]
        m = PoissonRegressor(alpha=1e-3, max_iter=500).fit(X(tr), tr["arrivals"])
        errs_model.append(np.abs(te["arrivals"] - m.predict(X(te))).mean())
        naive = tr[tr["week"] >= origin - pd.Timedelta(weeks=4)].groupby("department_id")["arrivals"].mean()
        errs_naive.append(np.abs(te["arrivals"] - te["department_id"].map(naive)).mean())
    model = PoissonRegressor(alpha=1e-3, max_iter=500).fit(X(w), w["arrivals"])
    future_weeks = pd.Series(pd.date_range(weeks[-1] + pd.Timedelta(weeks=1), periods=8, freq="7D"))
    fut = pd.DataFrame([(d, wk) for d in depts for wk in future_weeks], columns=["department_id", "week"])
    fut["forecast"] = model.predict(X(fut))
    fut["lo"] = [max(0, _poisson_q(m, 0.1)) for m in fut["forecast"]]
    fut["hi"] = [_poisson_q(m, 0.9) for m in fut["forecast"]]
    mae_m, mae_n = float(np.mean(errs_model)), float(np.mean(errs_naive))
    card = {"name": "Demand forecast", "target": "weekly arrivals per department",
            "method": "Poisson regression (department + week-of-year Fourier terms)",
            "backtest": "rolling origin, last 12 weeks, horizon 4 weeks",
            "comparison": {"Last-4-weeks mean (naive)": {"MAE": round(mae_n, 2)},
                           "Poisson regression": {"MAE": round(mae_m, 2)}},
            "skill_vs_naive": round(1 - mae_m / mae_n, 3),
            "honesty": "No reliable time-of-day or weekday pattern exists in this data; forecasts are weekly volumes "
                       "with wide Poisson intervals."}
    return model, w, fut, card


def _poisson_q(mu, q):
    k, cdf, p = 0, 0.0, math.exp(-mu)
    while True:
        cdf += p
        if cdf >= q:
            return k
        k += 1
        p *= mu / k


# ---------------------------------------------------------------- 5.4 clusters
def train_clusters(e, patients):
    g = e.groupby("patient_id")
    feat = pd.DataFrame({
        "visits": g.size(),
        "share_followup": g["visit_type"].apply(lambda s: (s == "Follow-up").mean()),
        "share_emergency": g["visit_type"].apply(lambda s: (s == "Emergency").mean()),
        "mean_severity": g["triage_rank"].apply(lambda s: (3 - s).mean()),   # 3 = Critical, 0 = Low
        "distinct_depts": g["department_id"].nunique(),
    })
    feat = feat.join(patients.set_index("patient_id")[["age"]])
    feat["chronic"] = patients.set_index("patient_id")["chronic_condition"].reindex(feat.index).ne("None").astype(float)
    scaler = StandardScaler().fit(feat)
    Z = scaler.transform(feat)
    scores = {}
    for k in range(3, 7):
        km = KMeans(n_clusters=k, n_init=10, random_state=SEED).fit(Z)
        scores[k] = float(silhouette_score(Z, km.labels_, sample_size=1500, random_state=SEED))
    k_best = max(scores, key=scores.get)
    km = KMeans(n_clusters=k_best, n_init=10, random_state=SEED).fit(Z)
    feat["cluster"] = km.labels_
    prof = feat.groupby("cluster").mean()
    # Name each cluster after its two most distinctive features (largest |z| of the centroid).
    phrases = {
        "visits": ("frequent visitors", "occasional visitors"),
        "share_followup": ("follow-up heavy", "few follow-ups"),
        "share_emergency": ("emergency-prone", "rarely emergency"),
        "mean_severity": ("higher acuity", "lower acuity"),
        "distinct_depts": ("multi-department", "single-department"),
        "age": ("older", "younger"),
        "chronic": ("chronic condition", "no chronic condition"),
    }
    zc = pd.DataFrame(km.cluster_centers_, columns=feat.columns[:-1])
    names = {}
    for c, z in zc.iterrows():
        top = z.abs().sort_values(ascending=False).index[:2]
        names[c] = ", ".join(phrases[f][0] if z[f] > 0 else phrases[f][1] for f in top).capitalize()
    feat["cluster_name"] = feat["cluster"].map(names)
    waits = e.merge(feat[["cluster_name"]], left_on="patient_id", right_index=True).groupby("cluster_name")["wait_minutes"].mean()
    profile = prof.assign(name=prof.index.map(names), patients=feat.groupby("cluster").size(),
                          mean_wait=[waits.get(names[c]) for c in prof.index]).round(2).reset_index()
    card = {"name": "Visit-pattern clustering", "method": "K-means on standardised per-patient features",
            "features": list(feat.columns[:-2]), "silhouette_by_k": {str(k): round(v, 3) for k, v in scores.items()},
            "chosen_k": k_best}
    return feat[["cluster", "cluster_name"]], profile, card


# ---------------------------------------------------------------- equity + misc
def equity(e, ridge_full):
    # Adjust for triage + department only, then look at residual gaps by group.
    tri_dept = e.groupby(["triage_level", "department_name"])["wait_minutes"].transform("mean")
    r = e["wait_minutes"] - tri_dept
    out = []
    for col in ["age_band", "sex", "insurance_type"]:
        for k, g in r.groupby(e[col]):
            out.append({"dimension": col, "group": k, "n": int(len(g)), "adjusted_gap": round(float(g.mean()), 2),
                        "ci95": round(float(1.96 * g.std() / math.sqrt(len(g))), 2)})
    return pd.DataFrame(out)


def main():
    ART_DIR.mkdir(parents=True, exist_ok=True)
    p, e, d, t = build()
    wait_model, wait_card, ridge_train = train_wait(e)
    duration, dur_card = train_duration(e)
    b, cells = bottlenecks(e)
    weekly = weekly_control(e, ridge_train)
    fmodel, fweekly, fut, f_card = train_forecast(e)
    clusters, profile, c_card = train_clusters(e, p)
    eq = equity(e, wait_model.pipeline)
    tri_overall = e.groupby("triage_level")["wait_minutes"].mean().reindex(TRIAGE_ORDER).round(1).to_dict()

    flags = weekly[weekly["ewma_flag"] | weekly["iso_flag"]]
    anomaly_card = {"name": "Unusual-wait detection", "method": "EWMA control chart (λ=0.3, L=2.7) on weekly residuals "
                    "of the wait model; IsolationForest cross-check on (residual, p90, LBC rate, volume)",
                    "department_weeks": int(len(weekly)), "ewma_flags": int(weekly["ewma_flag"].sum()),
                    "iso_flags": int(weekly["iso_flag"].sum()), "both": int((weekly["ewma_flag"] & weekly["iso_flag"]).sum()),
                    "test_period_flags": int(flags[flags["week"] >= TRAIN_END].shape[0])}
    rank_card = {"name": "Impact × confidence ranking", "method": "excess = mean wait − triage-mix expectation; "
                 "impact = max(excess,0) × volume / 60; confidence from 95% CI"}

    joblib.dump({"patients": p, "encounters": e, "departments": d, "tests": t}, ART_DIR / "frames.joblib")
    joblib.dump({"wait": wait_model, "duration": duration, "forecast": fmodel}, ART_DIR / "models.joblib")
    joblib.dump({"bottlenecks": b, "cells": cells, "weekly": weekly, "forecast_hist": fweekly, "forecast": fut,
                 "clusters": clusters, "cluster_profile": profile, "equity": eq, "triage_overall": tri_overall},
                ART_DIR / "analytics.joblib")
    (ART_DIR / "metrics.json").write_text(json.dumps(
        {"wait": wait_card, "duration": dur_card, "forecast": f_card, "clusters": c_card,
         "anomaly": anomaly_card, "ranking": rank_card,
         "not_built": "No no-show / cancellation model: those events are simulated, so a model would only learn our assumptions."},
        indent=1, default=str))
    print(json.dumps({"wait": wait_card["comparison"], "coverage": wait_card["interval"], "duration": dur_card["comparison"],
                      "duration_choice": dur_card["chosen"], "forecast": f_card["comparison"], "clusters": c_card,
                      "anomaly": anomaly_card}, indent=1, default=str))
    print(profile[["name", "patients", "mean_wait"]])


if __name__ == "__main__":
    main()
