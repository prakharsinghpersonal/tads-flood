import copy
import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from tads_flood.api import app
from tads_flood.models import Assessment

ROOT = Path(__file__).resolve().parents[2]
CLIENT = TestClient(app)


def fixture():
    return json.loads((ROOT / "fixtures/synthetic/assessment.json").read_text())


def test_health_and_fixture_are_versioned():
    assert CLIENT.get("/health").json()["schema_version"] == "1.0.0"
    response = CLIENT.get("/api/v1/demo")
    assert response.status_code == 200
    assert response.json()["mode"] == "synthetic"
    Assessment.model_validate(response.json())


def test_fixture_hash_matches_actual_input():
    actual = hashlib.sha256((ROOT / "fixtures/synthetic/graph.json").read_bytes()).hexdigest()
    assert fixture()["sources"][0]["sha256"] == actual


def test_live_request_never_silently_returns_fixture():
    response = CLIENT.post("/api/v1/assessments", json={"bbox": fixture()["bbox"], "event_date": "2026-08-26", "mode": "live"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "live_provider_unavailable"


def test_synthetic_request_requires_declared_scope():
    request = {"bbox": fixture()["bbox"], "event_date": "2026-08-26", "mode": "synthetic"}
    assert CLIENT.post("/api/v1/assessments", json=request).status_code == 200
    request["event_date"] = "2026-08-27"
    assert CLIENT.post("/api/v1/assessments", json=request).status_code == 422


@pytest.mark.parametrize("bbox", [[85, 28, 84, 29], [85, 28, 85, 29], [181, 28, 182, 29], [85, 28, 87, 29]])
def test_invalid_or_unbounded_bbox_rejected(bbox):
    response = CLIENT.post("/api/v1/assessments", json={"bbox": bbox, "event_date": "2026-08-26", "mode": "live"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


@pytest.mark.parametrize("corruption", ["reference", "missing_source", "missing_evidence", "wrong_count", "false_live", "post_event_osm"])
def test_assessment_integrity(corruption):
    data = copy.deepcopy(fixture())
    if corruption == "reference":
        data["sources"][0]["usage"] = "evaluation_only"
    elif corruption == "missing_source":
        data["evidence"][0]["source_ids"] = ["missing"]
    elif corruption == "missing_evidence":
        data["settlements"][0]["evidence_ids"] = ["missing"]
    elif corruption == "wrong_count":
        data["summary"]["potentially_isolated_count"] = 2
    elif corruption == "false_live":
        data["mode"] = "live"
    else:
        data["mode"] = "live"
        data["sources"][0]["kind"] = "osm"
        data["sources"][0]["acquired_at"] = "2026-08-26T12:00:00Z"
    with pytest.raises(ValidationError):
        Assessment.model_validate(data)


def test_report_labels_template_and_matches_counts():
    response = CLIENT.get("/api/v1/assessments/synthetic-training-001/report")
    report = response.json()
    assert report["generator"] == "deterministic_template"
    assert report["ai_ready"] is False
    assert report["facts"]["potentially_isolated_count"] == 1
    assert report["claims"][0]["evidence_ids"] == ["synthetic-exposure-001"]


def test_missing_assessment_and_nepali_fail_explicitly():
    assert CLIENT.get("/api/v1/assessments/missing").status_code == 404
    assert CLIENT.get("/api/v1/assessments/synthetic-training-001/report?language=ne").status_code == 501


def test_isolation_endpoint_runs_graph_analysis():
    data = json.loads((ROOT / "fixtures/synthetic/graph.json").read_text())
    response = CLIENT.post("/api/v1/isolation", json=data)
    assert response.status_code == 200
    assert response.json()[0]["status"] == "potentially_isolated"

