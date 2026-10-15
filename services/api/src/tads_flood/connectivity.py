"""Shortest-path comparison with conservative candidate-edge removal.

Input is an already-noded road graph, not raw OSM ways. Geospatial noding,
turn restrictions and snapping remain provider-stage responsibilities.
"""
from collections import defaultdict
import heapq

from .models import IsolationRequest, SettlementResult


def _paths(request, start, remove_candidates=False):
    adjacency = defaultdict(list)
    for edge in request.edges:
        if remove_candidates and edge.candidate_blocked:
            continue
        adjacency[edge.from_node].append((edge.to_node, edge.length_m, edge.edge_id))
        if not edge.directed:
            adjacency[edge.to_node].append((edge.from_node, edge.length_m, edge.edge_id))
    distances = {start: 0.0}
    paths = {start: []}
    queue = [(0.0, start)]
    while queue:
        cost, node = heapq.heappop(queue)
        if cost != distances[node]:
            continue
        for target, length, edge_id in sorted(adjacency[node]):
            new_cost = cost + length
            if new_cost < distances.get(target, float("inf")):
                distances[target] = new_cost
                paths[target] = paths[node] + [edge_id]
                heapq.heappush(queue, (new_cost, target))
    return distances, paths


def _nearest(facilities, distances):
    reachable = [f for f in facilities if f.node_id in distances]
    return min(reachable, key=lambda f: (distances[f.node_id], f.location_id)) if reachable else None


def analyze_isolation(request: IsolationRequest) -> list[SettlementResult]:
    results = []
    facilities = [f for f in request.facilities if f.node_id is not None]
    candidates = {e.edge_id: e for e in request.edges if e.candidate_blocked}
    for settlement in request.settlements:
        base = dict(settlement_id=settlement.location_id, baseline_facility_id=None,
                    baseline_route_edge_ids=[], post_event_facility_id=None,
                    post_event_route_edge_ids=[], candidate_cut_edge_ids=[],
                    any_facility_access=None, evidence_ids=[])
        if settlement.node_id is None or not facilities:
            results.append(SettlementResult(**base, status="unknown_network",
                reason="Settlement snapping or mapped facility coverage is unavailable."))
            continue
        before_dist, before_paths = _paths(request, settlement.node_id)
        before_facility = _nearest(facilities, before_dist)
        if before_facility is None:
            results.append(SettlementResult(**{**base, "any_facility_access": False},
                status="preexisting_disconnected", reason="No mapped pre-event route to a facility."))
            continue
        baseline_path = before_paths[before_facility.node_id]
        after_dist, after_paths = _paths(request, settlement.node_id, True)
        after_facility = _nearest(facilities, after_dist)
        cut_ids = [edge_id for edge_id in baseline_path if edge_id in candidates]
        evidence_ids = sorted({eid for edge_id in cut_ids for eid in candidates[edge_id].evidence_ids})
        base.update(baseline_facility_id=before_facility.location_id,
                    baseline_route_edge_ids=baseline_path, candidate_cut_edge_ids=cut_ids,
                    evidence_ids=evidence_ids, any_facility_access=after_facility is not None)
        if after_facility:
            base.update(post_event_facility_id=after_facility.location_id,
                        post_event_route_edge_ids=after_paths[after_facility.node_id])
            status = "connected"
            reason = "A mapped route remains under candidate-edge removal. Passability is not verified."
        else:
            status = "potentially_isolated"
            reason = "All mapped facility routes are lost if candidate-exposed edges are impassable."
        results.append(SettlementResult(**base, status=status, reason=reason))
    return results

