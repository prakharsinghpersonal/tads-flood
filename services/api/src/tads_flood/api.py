"""Working fixture/analysis foundation; missing live capabilities fail explicitly."""
import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .connectivity import analyze_isolation
from .models import Assessment, AssessmentRequest, IsolationRequest, SettlementResult, SCHEMA_VERSION
from .reports import build_report

ROOT = Path(__file__).resolve().parents[4]
FIXTURE = ROOT / "fixtures/synthetic/assessment.json"
app = FastAPI(title="TADS Flood", version=SCHEMA_VERSION)


def error(code, message, status=503, retryable=False):
    return JSONResponse(status_code=status, content={"error": {
        "code": code, "message": message, "retryable": retryable}})


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    details = [{"location": list(e["loc"]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"error": {
        "code": "invalid_request", "message": "Request validation failed", "retryable": False},
        "details": details})


def demo():
    return Assessment.model_validate(json.loads(FIXTURE.read_text()))


@app.get("/health")
def health():
    return {"status": "ok", "schema_version": SCHEMA_VERSION}


@app.get("/api/v1/demo", response_model=Assessment)
def get_demo():
    return demo()


@app.post("/api/v1/assessments")
def create_assessment(request: AssessmentRequest):
    if request.mode == "live":
        return error("live_provider_unavailable", "Live satellite/OSM providers are not connected.")
    assessment = demo()
    if request.bbox != assessment.bbox or request.event_date != assessment.event_date:
        return error("fixture_scope_mismatch", "Synthetic mode only supports the fixture's declared area/date.", 422)
    return {"job_id": "synthetic-fixture-job", "status": "completed",
            "assessment_id": assessment.assessment_id, "mode": "synthetic"}


@app.get("/api/v1/assessments/{assessment_id}", response_model=Assessment)
def get_assessment(assessment_id: str):
    assessment = demo()
    if assessment_id != assessment.assessment_id:
        return error("assessment_not_found", "Assessment not found.", 404)
    return assessment


@app.post("/api/v1/isolation", response_model=list[SettlementResult])
def isolation(request: IsolationRequest):
    return analyze_isolation(request)


@app.get("/api/v1/assessments/{assessment_id}/report")
def report(assessment_id: str, language: str = "en"):
    assessment = demo()
    if assessment_id != assessment.assessment_id:
        return error("assessment_not_found", "Assessment not found.", 404)
    if language != "en":
        return error("language_not_ready", "Reviewed Nepali/AI generation is not implemented.", 501)
    return build_report(assessment)
