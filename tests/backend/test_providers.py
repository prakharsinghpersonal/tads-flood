from datetime import date, datetime, timezone
from io import BytesIO
import json

import httpx
import pyarrow as pa
import pyarrow.parquet as parquet
import pytest
from shapely.geometry import Point

from tads_flood.errors import PipelineError
from tads_flood.providers import CDSEProvider, OhsomeProvider, decode_osm_parquet, select_radar_pair, request_bytes
from tads_flood.settings import Settings
from tads_flood.models import AssessmentRequest


def scene(identifier, day, orbit=42, **extra):
    return {"id": identifier, "properties": {"datetime": f"2026-08-{day:02}T00:00:00Z",
        "sat:relative_orbit": orbit, "s1:polarization": "DV", "sat:orbit_state": "ascending", **extra}}


def test_pair_selection_does_not_mix_orbits():
    before, after = select_radar_pair([scene("before", 20), scene("wrong", 27, 41), scene("correct", 28)], date(2026, 8, 26))
    assert (before.product_id, after.product_id) == ("before", "correct")


def test_missing_explicit_orbit_fails_instead_of_guessing():
    values = [scene("b", 20), scene("a", 28)]
    for value in values:
        del value["properties"]["sat:relative_orbit"]
    with pytest.raises(PipelineError, match="orbit"):
        select_radar_pair(values, date(2026, 8, 26))


def test_auth_token_reused_and_catalogue_pagination_bounded():
    calls = []
    def handler(request):
        calls.append(request.url.path)
        if request.url.path.endswith("token"):
            return httpx.Response(200, json={"access_token": "test-token", "expires_in": 300})
        body = json.loads(request.content)
        return httpx.Response(200, json={"features": [scene("b" if "next" not in body else "a", 20 if "next" not in body else 28)],
            "context": {"next": 100} if "next" not in body else {}})
    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = CDSEProvider(Settings(cdse_client_id="test-client", cdse_client_secret="test-secret"), client=client)
    values = provider.catalog((85.25, 27.85, 85.27, 27.87), datetime(2026, 8, 1, tzinfo=timezone.utc), datetime(2026, 9, 1, tzinfo=timezone.utc))
    assert len(values) == 2
    assert sum(path.endswith("token") for path in calls) == 1


def test_auth_denial_is_sanitized_and_not_retried():
    count = 0
    def handler(request):
        nonlocal count
        count += 1
        return httpx.Response(403, text="private-token test-secret")
    client = httpx.Client(transport=httpx.MockTransport(handler))
    with pytest.raises(PipelineError) as failure:
        request_bytes(client, "GET", "https://provider.example/data")
    assert count == 1
    assert "test-secret" not in failure.value.message


def test_response_budget_and_cancellation():
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"123456")))
    with pytest.raises(PipelineError, match="budget"):
        request_bytes(client, "GET", "https://provider.example/data", max_bytes=3)
    with pytest.raises(PipelineError, match="cancelled"):
        request_bytes(client, "GET", "https://provider.example/data", cancelled=lambda: True)


def parquet_bytes(timestamp=None):
    table = pa.table({"id": [123], "osm_type": ["node"], "geometry": [Point(85.26, 27.86).wkb],
                      "tags": [{"place": "village", "name": "Example"}],
                      "timestamp": [timestamp or datetime(2026, 7, 1, tzinfo=timezone.utc)]})
    metadata = {b"geo": json.dumps({"primary_column": "geometry", "columns": {"geometry": {"encoding": "WKB"}}}).encode()}
    table = table.replace_schema_metadata(metadata)
    output = BytesIO()
    parquet.write_table(table, output)
    return output.getvalue()


def test_geoparquet_decodes_stable_ids_and_coordinates():
    values = decode_osm_parquet(parquet_bytes())
    assert values[0]["id"] == "node/123"
    assert values[0]["geometry"]["coordinates"] == (85.26, 27.86)
    assert values[0]["properties"]["tags"]["place"] == "village"


def test_historical_extractor_uses_key_snapshot_and_rejects_post_event_versions():
    captured = []
    def handler(request):
        captured.append(request)
        return httpx.Response(200, content=parquet_bytes(datetime(2026, 8, 27, tzinfo=timezone.utc)))
    provider = OhsomeProvider(Settings(ohsome_api_key="test-key"), client=httpx.Client(transport=httpx.MockTransport(handler)))
    request = AssessmentRequest(bbox=(85.25, 27.85, 85.27, 27.87), event_date="2026-08-26", mode="live")
    with pytest.raises(PipelineError, match="event or later"):
        provider.extract(request)
    assert captured[0].headers["authorization"] == "test-key"
    assert json.loads(captured[0].content)["time"] == "2026-08-25"


def test_credentials_are_not_exposed_in_settings_repr():
    settings = Settings(cdse_client_secret="private-secret", ohsome_api_key="private-key")
    assert "private-secret" not in repr(settings) and "private-key" not in repr(settings)


def test_transient_retries_are_bounded(monkeypatch):
    monkeypatch.setattr("tads_flood.providers.time.sleep", lambda seconds: None)
    calls = []
    client = httpx.Client(transport=httpx.MockTransport(lambda request: (calls.append(request) or httpx.Response(429))))
    with pytest.raises(PipelineError) as failure:
        request_bytes(client, "GET", "https://provider.example/data")
    assert len(calls) == 3 and failure.value.retryable


def test_missing_orbit_resolves_exact_official_product_attributes():
    name = "S1C_IW_GRDH_1SDV_20260820T000000_20260820T000025_009000_013AF5_BFA0"
    feature = scene(name, 20)
    del feature["properties"]["sat:relative_orbit"]
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"value": [{"Name": name + ".SAFE",
            "ContentDate": {"Start": "2026-08-20T00:00:00.400Z"},
            "Attributes": [{"Name": key, "Value": value} for key, value in {
                "relativeOrbitNumber": 42, "orbitDirection": "ASCENDING",
                "polarisationChannels": "VV&VH", "operationalMode": "IW"}.items()]}]})
    provider = CDSEProvider(Settings(), client=httpx.Client(transport=httpx.MockTransport(handler)))
    result = provider.enrich_orbits([feature], datetime(2026, 8, 26, tzinfo=timezone.utc))
    assert result[0]["properties"]["sat:relative_orbit"] == 42
    assert "sat:relative_orbit" not in feature["properties"]
    assert calls[0].url.host == "catalogue.dataspace.copernicus.eu"
    assert calls[0].url.params["$expand"] == "Attributes"
    assert name + ".SAFE" in calls[0].url.params["$filter"]
    assert "authorization" not in calls[0].headers


def test_product_metadata_conflict_is_rejected():
    name = "S1A_IW_GRDH_1SDV_20260820T000000_20260820T000025_009000_013AF5_BFA0"
    feature = scene(name, 20)
    del feature["properties"]["sat:relative_orbit"]
    response = {"value": [{"Name": name + ".SAFE", "ContentDate": {"Start": "2026-08-20T00:00:00Z"},
        "Attributes": [{"Name": k, "Value": v} for k, v in {"relativeOrbitNumber": 42,
            "orbitDirection": "DESCENDING", "polarisationChannels": "VV&VH", "operationalMode": "IW"}.items()]}]}
    provider = CDSEProvider(Settings(), client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=response))))
    with pytest.raises(PipelineError, match="conflicts"):
        provider.enrich_orbits([feature], datetime(2026, 8, 26, tzinfo=timezone.utc))


def test_unrecognized_product_id_cannot_change_metadata_request():
    feature = scene("https://untrusted.example/'", 20)
    del feature["properties"]["sat:relative_orbit"]
    provider = CDSEProvider(Settings(), client=httpx.Client(transport=httpx.MockTransport(lambda r: pytest.fail("No request expected"))))
    assert "sat:relative_orbit" not in provider.enrich_orbits([feature], datetime(2026, 8, 26, tzinfo=timezone.utc))[0]["properties"]
