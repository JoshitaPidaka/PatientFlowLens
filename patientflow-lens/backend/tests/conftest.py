"""Build a pristine throwaway database for the tests, so they never depend on (or mutate) the demo state."""
import os
import sys
import tempfile
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
os.environ["PFL_DB_PATH"] = str(Path(tempfile.mkdtemp()) / "test.db")

import joblib  # noqa: E402

from app.config import ART_DIR  # noqa: E402
from app.etl import simulate  # noqa: E402
from app.services.alerts import generate_all  # noqa: E402
from app.store import store  # noqa: E402

simulate.run(joblib.load(ART_DIR / "frames.joblib"), joblib.load(ART_DIR / "models.joblib"))
store.load()
generate_all()
