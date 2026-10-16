"""One command: clean data, train all models, build the simulated scheduling layer, generate alerts.

    python -m scripts.bootstrap
"""
import json
import time

import joblib

from app.config import ART_DIR
from app.etl import simulate
from app.ml import train


def main():
    t0 = time.time()
    print("[1/3] cleaning data + training models …")
    train.main()
    frames = joblib.load(ART_DIR / "frames.joblib")
    models = joblib.load(ART_DIR / "models.joblib")
    print("[2/3] simulating scheduling layer …")
    stats = simulate.run(frames, models)
    print(json.dumps(stats, indent=1))
    print("[3/3] generating alerts …")
    from app.services.alerts import generate_all
    from app.store import store
    store.load()
    n = generate_all()
    print(f"alerts created: {n}")
    print(f"done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
