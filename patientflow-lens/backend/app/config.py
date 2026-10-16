"""Central configuration. Values can be overridden with environment variables prefixed PFL_."""
import os
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "data" / "raw"
ART_DIR = BASE_DIR / "artifacts"
DB_PATH = Path(os.getenv("PFL_DB_PATH", ART_DIR / "patientflow.db"))

SEED = 2026
TRIAGE_ORDER = ["Critical", "High", "Medium", "Low"]

# Time-aware evaluation split (no shuffling, no future information).
TRAIN_END = datetime(2025, 10, 1)      # test = Oct–Dec 2025
CALIB_START = datetime(2025, 8, 1)     # conformal calibration = Aug–Sep, carved from training

# The scheduling layer lives in the first working week after the dataset ends.
DEMO_DATE = datetime(2026, 1, 5)       # Monday
DEMO_NOW = datetime(2026, 1, 5, 10, 30)
SCHEDULE_WINDOW = (datetime(2025, 12, 29), datetime(2026, 1, 18))  # sessions/slots generated here

SHIFTS = {  # name: (start_hour, end_hour); Night wraps past midnight
    "Morning": (8, 14),
    "Evening": (14, 20),
    "Night": (20, 8),
}
BOOKABLE_SHIFTS = ("Morning", "Evening")
DOCTOR_SERVICE_TYPES = ("Clinical", "Emergency", "Outpatient", "Diagnostics")

DEFAULT_SETTINGS = {
    "walkin_reserve_ratio": 0.30,      # walk-in + emergency ≈ 50% of real visits; 30% of slots kept free
    "sim_cancel_rate": 0.08,           # simulated assumption (not in data)
    "sim_noshow_rate": 0.05,           # simulated assumption (not in data)
    "demo_fill_ratio": 0.55,           # demo-window slot fill (real volume is ~1 scheduled visit/dept/day)
    "reminder_offsets_hours": [24, 2],
    "running_late_threshold_min": 15,
    "slot_hold_minutes": 5,
    "waitlist_offer_minutes": 15,
}
