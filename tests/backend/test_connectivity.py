import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from tads_flood.connectivity import analyze_isolation
from tads_flood.models import IsolationRequest

ROOT = Path(__file__).resolve().parents[2]


def graph():
    return json.loads((ROOT / "fixtures/synthetic/graph.json").read_text())


def result(data):
    return analyze_isolation(IsolationRequest.model_validate(data))[0]


def test_bridge_cut_is_potential_not_confirmed_isolation():
    value = result(graph())
    assert value.status == "potentially_isolated"
    assert value.candidate_cut_edge_ids == ["bridge-a"]
    assert value.baseline_route_edge_ids == ["road-a", "bridge-a"]
    assert value.evidence_ids == ["synthetic-exposure-001"]


def test_alternate_route_prevents_isolation():
    data = graph()
    data["edges"].append({"edge_id": "detour", "from_node": "a", "to_node": "h", "length_m": 300})
    value = result(data)
    assert value.status == "connected"
    assert value.post_event_route_edge_ids == ["detour"]
    assert value.any_facility_access is True


def test_farther_facility_access_not_confused_with_nearest_route_loss():
    data = graph()
    data["nodes"].append({"node_id": "f"})
    data["edges"].append({"edge_id": "farther-road", "from_node": "a", "to_node": "f", "length_m": 500})
    data["facilities"].append({"location_id": "farther-hospital", "node_id": "f"})
    value = result(data)
    assert value.baseline_facility_id == "training-hospital"
    assert value.post_event_facility_id == "farther-hospital"
    assert value.status == "connected"


def test_preexisting_disconnection_not_called_flood_damage():
    data = graph()
    data["edges"] = []
    assert result(data).status == "preexisting_disconnected"


@pytest.mark.parametrize("change", ["no_facility", "unknown_facility", "unsnapped_settlement"])
def test_missing_coverage_is_unknown(change):
    data = graph()
    if change == "no_facility":
        data["facilities"] = []
    elif change == "unknown_facility":
        data["facilities"][0]["node_id"] = None
    else:
        data["settlements"][0]["node_id"] = None
    value = result(data)
    assert value.status == "unknown_network"
    assert value.any_facility_access is None


def test_one_way_edges_do_not_create_reverse_access():
    data = graph()
    data["edges"][0].update(directed=True, from_node="b", to_node="a")
    assert result(data).status == "preexisting_disconnected"


@pytest.mark.parametrize("mutation", ["duplicate_edge", "duplicate_node", "dangling", "negative", "nan", "unknown_node"])
def test_invalid_graph_rejected(mutation):
    data = graph()
    if mutation == "duplicate_edge":
        data["edges"].append(data["edges"][0].copy())
    elif mutation == "duplicate_node":
        data["nodes"].append(data["nodes"][0].copy())
    elif mutation == "dangling":
        data["edges"][0]["to_node"] = "missing"
    elif mutation in ("negative", "nan"):
        data["edges"][0]["length_m"] = -1 if mutation == "negative" else float("nan")
    else:
        data["settlements"][0]["node_id"] = "missing"
    with pytest.raises(ValidationError):
        IsolationRequest.model_validate(data)


def test_origin_facility_is_connected_without_edges():
    data = graph()
    data["settlements"][0]["node_id"] = "h"
    value = result(data)
    assert value.status == "connected"
    assert value.baseline_route_edge_ids == []

