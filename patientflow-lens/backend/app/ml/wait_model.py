"""Wait-time model: Ridge regression with split-conformal intervals and exact additive explanations."""
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler

from app.config import SEED, TRIAGE_ORDER

CAT = ["triage_level", "department_name", "visit_type", "sex", "insurance_type", "chronic_condition", "arrival_weekday"]
NUM = ["age", "arrival_hour", "arrival_month", "prior_visits", "dept_arrivals_prev_24h"]
FEATURES = CAT + NUM

LABELS = {
    "triage_level": "Triage", "department_name": "Department", "visit_type": "Visit type", "sex": "Sex",
    "insurance_type": "Insurance", "chronic_condition": "Chronic condition", "arrival_weekday": "Weekday",
    "age": "Age", "arrival_hour": "Arrival hour", "arrival_month": "Month", "prior_visits": "Prior visits",
    "dept_arrivals_prev_24h": "Dept arrivals (24h)",
}


def ridge_pipeline():
    pre = ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), CAT),
                             ("num", StandardScaler(), NUM)])
    return make_pipeline(pre, Ridge(alpha=1.0))


def gbm_pipeline():
    pre = ColumnTransformer([("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1), CAT)],
                            remainder="passthrough")
    return make_pipeline(pre, HistGradientBoostingRegressor(
        categorical_features=list(range(len(CAT))), max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
        min_samples_leaf=40, l2_regularization=1.0, loss="absolute_error", random_state=SEED))


class WaitModel:
    def __init__(self, pipeline, residuals, reference, triage_mix, version):
        self.pipeline = pipeline
        self.residuals = np.sort(np.asarray(residuals))   # calibration residuals (actual - predicted)
        self.lo, self.hi = np.quantile(self.residuals, [0.10, 0.90])
        self.reference = reference                        # "typical patient" used as explanation baseline
        self.triage_mix = triage_mix                      # {(department, visit_type): {triage: p}}
        self.version = version

    def _frame(self, rows):
        df = pd.DataFrame(rows)
        for f in FEATURES:
            if f not in df:
                df[f] = self.reference[f]
        return df[FEATURES]

    def predict(self, rows):
        return self.pipeline.predict(self._frame(rows))

    def predict_one(self, row):
        pred = float(self.predict([row])[0])
        return {"expected": max(0.0, pred), "p10": max(0.0, pred + self.lo), "p90": pred + self.hi}

    def explain(self, row):
        """Exact for a linear model: contribution_i = f(x with feature i) - f(reference)."""
        full = {**self.reference, **row}
        base = float(self.predict([self.reference])[0])
        variants = []
        for f in FEATURES:
            v = dict(self.reference)
            v[f] = full[f]
            variants.append(v)
        preds = self.predict(variants)
        contribs = [{"feature": f, "label": LABELS[f], "value": full[f], "minutes": round(float(p - base), 2)}
                    for f, p in zip(FEATURES, preds)]
        contribs.sort(key=lambda c: -abs(c["minutes"]))
        out = self.predict_one(full)
        out.update({"baseline": base, "contributions": contribs, "model_version": self.version})
        return out

    def booking_estimate(self, department_name, visit_type, extra=None):
        """Triage is unknown when booking: mix predictions over P(triage | department, visit_type)."""
        mix = self.triage_mix.get((department_name, visit_type)) or self.triage_mix.get((department_name, "*"))
        rows, weights = [], []
        for t, p in mix.items():
            rows.append({**self.reference, **(extra or {}), "department_name": department_name,
                         "visit_type": visit_type, "triage_level": t})
            weights.append(p)
        preds = self.predict(rows)
        expected = float(np.dot(preds, weights))
        # Mixture distribution of pred_t + residuals -> weighted quantiles.
        samples = np.concatenate([p + self.residuals for p in preds])
        w = np.concatenate([np.full(len(self.residuals), wt / len(self.residuals)) for wt in weights])
        order = np.argsort(samples)
        cdf = np.cumsum(w[order])
        q = lambda a: float(samples[order][np.searchsorted(cdf, a)])
        return {"expected": max(0.0, expected), "p10": max(0.0, q(0.10)), "p90": q(0.90),
                "by_triage": {t: round(float(v), 1) for t, v in zip(mix.keys(), preds)}}


def triage_mix_table(e):
    mix = {}
    for (d, v), g in e.groupby(["department_name", "visit_type"]):
        vc = g["triage_level"].value_counts(normalize=True)
        mix[(d, v)] = {t: float(vc.get(t, 0)) for t in TRIAGE_ORDER}
    for d, g in e.groupby("department_name"):
        vc = g["triage_level"].value_counts(normalize=True)
        mix[(d, "*")] = {t: float(vc.get(t, 0)) for t in TRIAGE_ORDER}
    return mix


def reference_row(e):
    ref = {c: e[c].mode().iloc[0] for c in CAT}
    ref.update({c: float(e[c].median()) for c in NUM})
    return ref
