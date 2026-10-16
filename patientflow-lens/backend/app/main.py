"""FastAPI application factory."""
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import ART_DIR
from app.store import store

log = logging.getLogger("patientflow")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not (ART_DIR / "models.joblib").exists():
        from scripts.bootstrap import main as boot
        boot()
    store.load()
    log.info("models and analytics loaded")
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="PatientFlow Lens API", version="1.0", lifespan=lifespan,
                  description="Hospital-flow analytics, ML and scheduling for DATATHON 2026 Track 1. Synthetic data only.")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def timing(request: Request, call_next):
        t = time.perf_counter()
        resp = await call_next(request)
        if request.url.path.startswith("/api"):
            log.info("%s %s %s %.0fms", request.method, request.url.path, resp.status_code, 1000 * (time.perf_counter() - t))
        return resp

    @app.exception_handler(HTTPException)
    async def http_error(_, exc: HTTPException):
        return JSONResponse({"error": {"code": exc.status_code, "message": exc.detail}}, status_code=exc.status_code)

    app.include_router(router)

    # Serve the built frontend (single deployable unit) when present.
    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            f = dist / path
            return FileResponse(f if path and f.is_file() else dist / "index.html")

    return app


app = create_app()
