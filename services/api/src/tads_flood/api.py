"""Frozen assessment shape with additive jobs, imagery, provenance and copilot."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import hashlib
import json
from pathlib import Path
from threading import BoundedSemaphore, Lock
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, HTMLResponse
from pydantic import Field

from .cache import ContentCache
from .connectivity import analyze_isolation
from .copilot import generate_answer, deterministic_bilingual_report
from .errors import PipelineError
from .models import Assessment, AssessmentRequest, IsolationRequest, SettlementResult, Report, GroundedReport, SCHEMA_VERSION, StrictModel
from .pipeline import assemble_assessment, run_live
from .reports import build_report, render_brief
from .settings import Settings
from .store import JobStore
from .synthetic import synthetic_bundle

ROOT = Path(__file__).resolve().parents[4]
FIXTURE = ROOT / "fixtures/synthetic/assessment.json"


class CopilotRequest(StrictModel):
    question: str = Field(min_length=1, max_length=2000)
    language: Literal["en", "ne"] = "en"


def error(code, message, status=503, retryable=False):
    return JSONResponse(status_code=status, content={"error": {
        "code": code, "message": message, "retryable": retryable}})


def demo():
    return Assessment.model_validate(json.loads(FIXTURE.read_text()))


def create_app(*, settings=None, store=None, cache=None, runner=run_live):
    pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="tads-assessment")
    slots = BoundedSemaphore(8)
    current_store, current_cache = store, cache
    storage_lock = Lock()
    geo_demo_id = None

    def configuration():
        return settings or Settings.from_environment()

    def storage():
        nonlocal current_store, current_cache
        with storage_lock:
            if current_store is None:
                current_store = JobStore(configuration().data_root / "state.sqlite3")
                current_store.recover_interrupted()
            if current_cache is None:
                current_cache = ContentCache(configuration().data_root / "objects")
        return current_store, current_cache

    @asynccontextmanager
    async def lifespan(app):
        yield
        pool.shutdown(wait=False, cancel_futures=True)

    app = FastAPI(title="TADS Flood", version=SCHEMA_VERSION, lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        details = [{"location": list(e["loc"]), "message": e["msg"]} for e in exc.errors()]
        return JSONResponse(status_code=422, content={"error": {
            "code": "invalid_request", "message": "Request validation failed", "retryable": False}, "details": details})

    @app.exception_handler(PipelineError)
    async def pipeline_error(request: Request, exc: PipelineError):
        status = 503 if exc.code.endswith("not_configured") or exc.retryable else 422
        return error(exc.code, exc.message, status, exc.retryable)

    def find_assessment(assessment_id):
        if assessment_id == "synthetic-training-001":
            return demo(), {}
        database, _ = storage()
        return database.assessment(assessment_id)

    def worker(job_id, request, runtime_settings):
        database, objects = storage()
        cancelled = lambda: database.get(job_id)["status"] == "cancelled"
        def progress(status, fraction, message):
            database.update(job_id, status=status, fraction=fraction, message=message)
            if cancelled():
                raise PipelineError("job_cancelled", "Job was cancelled.")
        try:
            assessment, assets = runner(request, runtime_settings, objects, progress=progress, cancelled=cancelled)
            assessment = Assessment.model_validate(assessment.model_dump())
            if assessment.mode != request.mode or assessment.bbox != request.bbox or assessment.event_date != request.event_date:
                raise PipelineError("provider_scope_mismatch", "Provider output does not match the requested live scope and mode.")
            if cancelled():
                return
            progress("reporting", .95, "Validating facts, provenance and cached outputs")
            database.put_assessment(assessment, assets)
            database.update(job_id, status="completed", fraction=1.0,
                            message="Assessment completed; review its limitations", assessment_id=assessment.assessment_id)
        except PipelineError as exc:
            database.update(job_id, status="cancelled" if exc.code == "job_cancelled" else "failed",
                            error={"code": exc.code, "message": exc.message, "retryable": exc.retryable})
        except Exception:
            database.update(job_id, status="failed", error={"code": "processing_failed",
                            "message": "Processing failed; inspect local diagnostics and retry explicitly.", "retryable": False})
        finally:
            slots.release()

    @app.get("/health")
    def health():
        return {"status": "ok", "schema_version": SCHEMA_VERSION}

    @app.get("/api/v1/readiness")
    def readiness():
        return configuration().readiness()

    @app.get("/api/v1/demo", response_model=Assessment)
    def get_demo():
        return demo()

    @app.get("/api/v1/demo/geographic", response_model=Assessment)
    def geographic_demo():
        nonlocal geo_demo_id
        database, objects = storage()
        if geo_demo_id and database.assessment(geo_demo_id):
            return database.assessment(geo_demo_id)[0]
        request, bundle = synthetic_bundle()
        value, assets = assemble_assessment(request, bundle, objects)
        database.put_assessment(value, assets)
        geo_demo_id = value.assessment_id
        return database.assessment(geo_demo_id)[0]

    @app.post("/api/v1/assessments")
    def create_assessment(request: AssessmentRequest):
        if request.mode == "synthetic":
            assessment = demo()
            if request.bbox != assessment.bbox or request.event_date != assessment.event_date:
                return error("fixture_scope_mismatch", "Synthetic mode only supports the fixture's declared area/date.", 422)
            return {"job_id": "synthetic-fixture-job", "status": "completed",
                    "assessment_id": assessment.assessment_id, "mode": "synthetic"}
        runtime_settings = configuration()
        if not runtime_settings.live_ready:
            return error("live_provider_unavailable", "Configure server-side CDSE and ohsome v2 access before live assessment.")
        if not slots.acquire(blocking=False):
            return error("job_queue_full", "The bounded processing queue is full.", 429, True)
        database, _ = storage()
        job = database.create(request)
        try:
            pool.submit(worker, job["job_id"], request, runtime_settings)
        except Exception:
            slots.release()
            database.update(job["job_id"], status="failed", error={"code": "job_start_failed", "message": "Worker could not start.", "retryable": True})
            return error("job_start_failed", "Worker could not start.", 503, True)
        return JSONResponse(status_code=202, content={"job_id": job["job_id"], "status": "queued",
                                                     "assessment_id": None, "mode": "live"})

    @app.get("/api/v1/jobs/{job_id}")
    def get_job(job_id: str):
        if job_id == "synthetic-fixture-job":
            return {"job_id": job_id, "status": "completed", "fraction": 1.0, "assessment_id": "synthetic-training-001", "error": None}
        job = storage()[0].get(job_id)
        return job if job else error("job_not_found", "Job not found.", 404)

    @app.post("/api/v1/jobs/{job_id}/cancel")
    def cancel_job(job_id: str):
        database, _ = storage()
        job = database.get(job_id)
        if job is None:
            return error("job_not_found", "Job not found.", 404)
        if job["status"] in ("completed", "failed", "cancelled"):
            return error("job_terminal", "A terminal job cannot be cancelled.", 409)
        return database.update(job_id, status="cancelled", message="Cancellation requested")

    @app.get("/api/v1/assessments/{assessment_id}", response_model=Assessment)
    def get_assessment(assessment_id: str):
        result = find_assessment(assessment_id)
        return result[0] if result else error("assessment_not_found", "Assessment not found.", 404)

    @app.post("/api/v1/isolation", response_model=list[SettlementResult])
    def isolation(request: IsolationRequest):
        return analyze_isolation(request)

    @app.get("/api/v1/assessments/{assessment_id}/report", response_model=Report)
    def report(assessment_id: str, language: str = "en"):
        result = find_assessment(assessment_id)
        if result is None:
            return error("assessment_not_found", "Assessment not found.", 404)
        if language != "en":
            return error("language_not_ready", "Use the explicitly unreviewed Nepali brief preview until translation is reviewed.", 501)
        return build_report(result[0])

    @app.post("/api/v1/assessments/{assessment_id}/copilot", response_model=GroundedReport)
    def copilot(assessment_id: str, request: CopilotRequest):
        result = find_assessment(assessment_id)
        if result is None:
            return error("assessment_not_found", "Assessment not found.", 404)
        return generate_answer(result[0], request.question, request.language, configuration())

    @app.get("/api/v1/assessments/{assessment_id}/brief", response_model=GroundedReport,
             responses={200: {"content": {"text/html": {"schema": {"type": "string"}}}}})
    def brief(assessment_id: str, language: Literal["en", "ne"] = "en", format: Literal["json", "html"] = "json"):
        result = find_assessment(assessment_id)
        if result is None:
            return error("assessment_not_found", "Assessment not found.", 404)
        value = deterministic_bilingual_report(result[0], language)
        return HTMLResponse(render_brief(result[0], value)) if format == "html" else value

    @app.get("/api/v1/assessments/{assessment_id}/imagery/{phase}")
    def imagery(assessment_id: str, phase: Literal["before", "after"]):
        result = find_assessment(assessment_id)
        if result is None:
            return error("assessment_not_found", "Assessment not found.", 404)
        if phase not in result[1]:
            return error("imagery_unavailable", "This assessment does not have a cached radar preview.", 404)
        payload = storage()[1].get(result[1][phase])
        return Response(content=payload, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})

    @app.get("/api/v1/assessments/{assessment_id}/sources/{source_id:path}")
    def source_detail(assessment_id: str, source_id: str):
        result = find_assessment(assessment_id)
        if result is None:
            return error("assessment_not_found", "Assessment not found.", 404)
        source = next((s for s in result[0].sources if s.source_id == source_id), None)
        if source is None:
            return error("source_not_found", "Source not found.", 404)
        return {"source": source.model_dump(mode="json"), "assessment_id": assessment_id,
                "evidence_ids": [e.evidence_id for e in result[0].evidence if source_id in e.source_ids],
                "cache_manifests": storage()[1].metadata(source.sha256, source_id) if result[1] else []}

    @app.get("/api/v1/assessments/{assessment_id}/package")
    def package(assessment_id: str):
        result = find_assessment(assessment_id)
        if result is None:
            return error("assessment_not_found", "Assessment not found.", 404)
        value, assets = result
        from .geo import metric_grid
        from pyproj import Transformer
        grid = metric_grid(value.bbox)
        transform = Transformer.from_crs(grid.epsg, 4326, always_xy=True)
        west, south, east, north = grid.bounds
        coordinates = [list(transform.transform(x, y)) for x, y in ((west, north), (east, north), (east, south), (west, south))]
        return {"schema_version": SCHEMA_VERSION, "assessment_id": assessment_id, "mode": value.mode,
                "assessment": value.model_dump(mode="json"),
                "assessment_uri": f"/api/v1/assessments/{assessment_id}/snapshot",
                "assessment_sha256": hashlib.sha256(value.model_dump_json().encode()).hexdigest(),
                "assets": [{"role": phase + "_radar", "uri": f"/api/v1/assessments/{assessment_id}/imagery/{phase}",
                            "sha256": digest, "media_type": "image/png", "coordinates": coordinates} for phase, digest in assets.items()],
                "attribution": ["Contains modified Copernicus Sentinel data 2026.", "© OpenStreetMap contributors."] if value.mode != "synthetic" else ["Synthetic training data; no real-world flood finding."],
                "limitations": value.limitations}

    @app.get("/api/v1/assessments/{assessment_id}/snapshot")
    def snapshot(assessment_id: str):
        result = find_assessment(assessment_id)
        if result is None:
            return error("assessment_not_found", "Assessment not found.", 404)
        return Response(content=result[0].model_dump_json(), media_type="application/json")

    return app


app = create_app()
