"""Check the pushed UI fixture against producer validation and route identities."""
import json
from pathlib import Path

from shapely.geometry import shape

from tads_flood.models import Assessment

ROOT = Path(__file__).resolve().parents[2]


def test_claude_fixture_is_valid_and_route_ids_resolve_to_geometry():
    path = ROOT / "apps/web/src/fixtures/synthetic-ui-assessment.json"
    value = Assessment.model_validate(json.loads(path.read_text()))
    assert value.mode == "synthetic"
    roads = {str(feature["id"]) for feature in value.layers.roads.features}
    assets = {str(feature["id"]) for collection in value.layers.model_dump().values() for feature in collection["features"]}
    for settlement in value.settlements:
        assert set(settlement.baseline_route_edge_ids + settlement.post_event_route_edge_ids + settlement.candidate_cut_edge_ids) <= roads
        for identifier in (settlement.baseline_facility_id, settlement.post_event_facility_id):
            assert identifier is None or identifier in assets
    for collection in value.layers.model_dump().values():
        for feature in collection["features"]:
            geometry = shape(feature["geometry"])
            assert not geometry.is_empty and geometry.is_valid
