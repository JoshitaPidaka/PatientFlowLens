"""Read-only analytics store: cleaned frames, trained models and precomputed tables, loaded once at startup."""
import json

import joblib
import pandas as pd

from app.config import ART_DIR


class Store:
    loaded = False

    def load(self):
        f = joblib.load(ART_DIR / "frames.joblib")
        self.patients: pd.DataFrame = f["patients"]
        self.enc: pd.DataFrame = f["encounters"]
        self.depts: pd.DataFrame = f["departments"]
        self.tests: pd.DataFrame = f["tests"]
        m = joblib.load(ART_DIR / "models.joblib")
        self.wait = m["wait"]
        self.duration = m["duration"]
        self.analytics = joblib.load(ART_DIR / "analytics.joblib")
        self.metrics = json.loads((ART_DIR / "metrics.json").read_text())
        self.dept_name = self.depts.set_index("department_id")["department_name"].to_dict()
        self.dept_id = {v: k for k, v in self.dept_name.items()}
        self.patient_idx = self.patients.set_index("patient_id")
        self.clusters = self.analytics["clusters"]
        self._booking_cache = {}
        self.loaded = True
        return self

    def booking_estimate(self, dept_name, visit_type):
        key = (dept_name, visit_type)
        if key not in self._booking_cache:
            self._booking_cache[key] = self.wait.booking_estimate(dept_name, visit_type)
        return self._booking_cache[key]

    def consult_minutes(self, dept_name):
        return int(self.duration["dept_median"][dept_name])


store = Store()
