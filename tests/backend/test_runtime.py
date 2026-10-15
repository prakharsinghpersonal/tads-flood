from datetime import datetime, timezone
import hashlib
import json
from threading import Event
import time

from fastapi.testclient import TestClient
import pytest

from tads_flood.api import create_app, demo
from tads_flood.cache import ContentCache
from tads_flood.errors import PipelineError
from tads_flood.models import Assessment, AssessmentRequest
from tads_flood.settings import Settings
from tads_flood.store import JobStore


def configured(tmp_path):
    return Settings(cdse_client_id="test-client", cdse_client_secret="test-secret",
                    ohsome_api_key="test-key", data_root=tmp_path)


def wait_terminal(client, job_id):
    for _ in range(100):
        result = client.get("/api/v1/jobs/" + job_id).json()
        if result["status"] in ("completed", "failed", "cancelled"):
            return result
        time.sleep(.01)
    pytest.fail("Background test job did not terminate")


def test_geographic_demo_package_and_images_have_verifiable_hashes(tmp_path):
    with TestClient(create_app(settings=Settings(data_root=tmp_path))) as client:
        response = client.get("/api/v1/demo/geographic")
        assert response.status_code == 200
        value = Assessment.model_validate(response.json())
        assert value.mode == "synthetic"
        package = client.get(f"/api/v1/assessments/{value.assessment_id}/package").json()
        assert package["assessment_sha256"] == hashlib.sha256(value.model_dump_json().encode()).hexdigest()
        snapshot = client.get(package["assessment_uri"])
        assert package["assessment_sha256"] == hashlib.sha256(snapshot.content).hexdigest()
        for asset in package["assets"]:
            assert asset["source_id"] in {source.source_id for source in value.sources}
            source = next(source for source in value.sources if source.source_id == asset["source_id"])
            assert datetime.fromisoformat(asset["acquired_at"]) == source.acquired_at
            image = client.get(asset["uri"])
            assert image.headers["content-type"] == "image/png"
            assert hashlib.sha256(image.content).hexdigest() == asset["sha256"]
        assert client.get(value.sources[0].uri).status_code == 200


def test_job_failure_and_secret_redaction(tmp_path):
    def runner(*args, **kwargs):
        raise RuntimeError("private-secret-provider-error")
    with TestClient(create_app(settings=configured(tmp_path), runner=runner)) as client:
        response = client.post("/api/v1/assessments", json={"bbox": [85.25, 27.85, 85.27, 27.87], "event_date": "2026-08-26", "mode": "live"})
        assert response.status_code == 202
        result = wait_terminal(client, response.json()["job_id"])
        assert result["status"] == "failed"
        assert "private-secret" not in json.dumps(result)


def test_live_worker_rejects_synthetic_fallback(tmp_path):
    def runner(*args, **kwargs):
        return demo(), {}
    with TestClient(create_app(settings=configured(tmp_path), runner=runner)) as client:
        response = client.post("/api/v1/assessments", json={"bbox": [85.25, 27.85, 85.27, 27.87], "event_date": "2026-08-26", "mode": "live"})
        result = wait_terminal(client, response.json()["job_id"])
        assert result["status"] == "failed"
        assert result["error"]["code"] == "provider_scope_mismatch"


def test_cancellation_terminal_state_not_overwritten(tmp_path):
    entered, release = Event(), Event()
    def runner(*args, **kwargs):
        entered.set()
        release.wait(2)
        raise PipelineError("provider_unavailable", "Mock provider failure")
    with TestClient(create_app(settings=configured(tmp_path), runner=runner)) as client:
        response = client.post("/api/v1/assessments", json={"bbox": [85.25, 27.85, 85.27, 27.87], "event_date": "2026-08-26", "mode": "live"})
        job_id = response.json()["job_id"]
        assert entered.wait(1)
        assert client.post(f"/api/v1/jobs/{job_id}/cancel").json()["status"] == "cancelled"
        release.set()
        assert client.get(f"/api/v1/jobs/{job_id}").json()["status"] == "cancelled"
        assert client.post(f"/api/v1/jobs/{job_id}/cancel").status_code == 409


def test_restart_marks_unfinished_jobs_failed_and_assessments_stay_immutable(tmp_path):
    path = tmp_path / "state.db"
    store = JobStore(path)
    request = AssessmentRequest(bbox=(85.25, 27.85, 85.27, 27.87), event_date="2026-08-26", mode="live")
    job = store.create(request)
    store.update(job["job_id"], status="fetching")
    reopened = JobStore(path)
    reopened.recover_interrupted()
    assert reopened.get(job["job_id"])["error"]["code"] == "server_restarted"
    original = demo()
    store.put_assessment(original, {})
    changed = demo()
    changed.generated_at = datetime(2026, 10, 14, tzinfo=timezone.utc)
    store.put_assessment(changed, {})
    assert reopened.assessment(original.assessment_id)[0].generated_at == original.generated_at


def test_readiness_never_returns_credentials_and_nepali_preview_is_labeled(tmp_path):
    with TestClient(create_app(settings=Settings(data_root=tmp_path, llm_api_key="private-key"))) as client:
        response = client.get("/api/v1/readiness")
        assert "private-key" not in response.text
        assert response.json()["live_configured"] is False
        response = client.get("/api/v1/assessments/synthetic-training-001/brief?language=ne")
        assert response.status_code == 200
        assert response.json()["translation_reviewed"] is False
        assert response.json()["ai_ready"] is False


def test_queue_budget_rejects_excess_work_without_losing_cancellation(tmp_path):
    release = Event()
    def runner(*args, **kwargs):
        release.wait(3)
        raise PipelineError("provider_unavailable", "Mock provider unavailable")
    with TestClient(create_app(settings=configured(tmp_path), runner=runner)) as client:
        body = {"bbox": [85.25, 27.85, 85.27, 27.87], "event_date": "2026-08-26", "mode": "live"}
        try:
            jobs = [client.post("/api/v1/assessments", json=body) for _ in range(8)]
            assert all(response.status_code == 202 for response in jobs)
            denied = client.post("/api/v1/assessments", json=body)
            assert denied.status_code == 429 and denied.json()["error"]["code"] == "job_queue_full"
            for response in jobs:
                identifier = response.json()["job_id"]
                result = client.post(f"/api/v1/jobs/{identifier}/cancel")
                assert result.json()["status"] == "cancelled"
        finally:
            release.set()
