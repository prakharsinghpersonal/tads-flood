"""Generate the frontend-owned synthetic UI fixture (geometry + all statuses).

Invented geometry for interface tests only. It asserts nothing about the real
place inside this bounding box. Run: python3 scripts/build-ui-fixture.py
"""
import hashlib, json, math
from pathlib import Path

BBOX = [85.25, 27.85, 85.27, 27.87]
LAT0 = 27.86
M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 111_320.0 * math.cos(math.radians(LAT0))


def area_m2(ring):
    s = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        s += (x1 * M_PER_DEG_LON) * (y2 * M_PER_DEG_LAT) - (x2 * M_PER_DEG_LON) * (y1 * M_PER_DEG_LAT)
    return abs(s) / 2


def length_m(coords):
    return sum(math.hypot((x2 - x1) * M_PER_DEG_LON, (y2 - y1) * M_PER_DEG_LAT)
               for (x1, y1), (x2, y2) in zip(coords, coords[1:]))


def feat(fid, geom, **props):
    props = {"feature_id": fid, "method_version": "synthetic-ui-v1",
             "source_id": "synthetic-graph-ui-001", **props}
    return {"type": "Feature", "id": fid, "geometry": geom, "properties": props}


def poly(ring):
    return {"type": "Polygon", "coordinates": [ring]}


def line(coords):
    return {"type": "LineString", "coordinates": coords}


def box(x, y, d=0.00025):
    return [[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d], [x - d, y - d]]


P = {"A": [85.253, 27.858], "Bw": [85.2585, 27.862], "Be": [85.2615, 27.862],
     "H": [85.266, 27.866], "B": [85.263, 27.853], "J": [85.264, 27.859],
     "K": [85.2685, 27.857], "C": [85.2675, 27.8512], "Cx": [85.2688, 27.8535],
     "D": [85.2555, 27.8685]}

roads = [
    ("road-a", [P["A"], [85.2558, 27.8601], P["Bw"]], False, "not_exposed", []),
    ("bridge-a", [P["Bw"], P["Be"]], True, "candidate_blocked", ["synthetic-exposure-001"]),
    ("road-h1", [P["Be"], [85.2638, 27.8641], P["H"]], False, "not_exposed", []),
    ("road-c", [P["B"], [85.2636, 27.856], P["J"]], True, "candidate_blocked", ["synthetic-exposure-002"]),
    ("road-h2", [P["J"], [85.2652, 27.8625], P["H"]], False, "not_exposed", []),
    ("road-d", [P["B"], [85.2662, 27.8545], P["K"]], False, "not_exposed", []),
    ("road-k", [P["K"], [85.2678, 27.8618], P["H"]], False, "not_exposed", []),
    ("road-cx", [P["C"], P["Cx"]], False, "not_exposed", ["synthetic-graph-002"]),
]
road_features = [feat(eid, line(c), edge_id=eid, candidate_blocked=blk, status=st,
                      length_m=round(length_m(c), 1), evidence_ids=ev)
                 for eid, c, blk, st, ev in roads]

river = [[85.2578, 27.85], [85.2602, 27.85], [85.2618, 27.856], [85.2624, 27.862],
         [85.2612, 27.87], [85.2588, 27.87], [85.2592, 27.862], [85.2584, 27.856], [85.2578, 27.85]]
pocket = [[85.2622, 27.8548], [85.2652, 27.8552], [85.2656, 27.8578], [85.2628, 27.8582], [85.2622, 27.8548]]
flood_features = [
    feat("flood-001", poly(river), status="candidate_flood", flood_score=0.82,
         evidence_ids=["synthetic-flood-001"], source_id="synthetic-s1-after"),
    feat("flood-002", poly(pocket), status="candidate_flood", flood_score=0.57,
         evidence_ids=["synthetic-flood-001"], source_id="synthetic-s1-after"),
]
debris_ring = [[85.2596, 27.8612], [85.2606, 27.8612], [85.2606, 27.8628], [85.2596, 27.8628], [85.2596, 27.8612]]
debris_features = [feat("debris-001", poly(debris_ring), status="candidate_disturbance",
                        evidence_ids=["synthetic-debris-001"], source_id="synthetic-s1-after")]

bld = [("training-hospital", P["H"], "not_exposed", "hospital", []),
       ("bldg-001", [85.2532, 27.8586], "not_exposed", None, []),
       ("bldg-002", [85.2606, 27.8545], "exposed", None, ["synthetic-flood-001"]),
       ("bldg-003", [85.2638, 27.8565], "exposed", None, ["synthetic-flood-001"]),
       ("bldg-004", [85.2632, 27.8533], "not_exposed", None, []),
       ("bldg-005", [85.2557, 27.8683], "unknown", None, [])]
building_features = []
for fid, (x, y), st, amenity, ev in bld:
    props = {"status": st, "evidence_ids": ev}
    if amenity:
        props["amenity"] = amenity
        props["name"] = "Training hospital (synthetic)"
    building_features.append(feat(fid, poly(box(x, y, 0.0004 if amenity else 0.0002)), **props))

sett = [("training-settlement-a", "Settlement A (synthetic)", P["A"], "potentially_isolated", ["synthetic-exposure-001"]),
        ("training-settlement-b", "Settlement B (synthetic)", P["B"], "connected", ["synthetic-exposure-002"]),
        ("training-settlement-c", "Settlement C (synthetic)", P["C"], "preexisting_disconnected", ["synthetic-graph-002"]),
        ("training-settlement-d", "Settlement D (synthetic)", P["D"], "unknown_network", ["synthetic-snap-001"])]
settlement_features = [feat(sid, {"type": "Point", "coordinates": xy}, name=name, status=st, evidence_ids=ev)
                       for sid, name, xy, st, ev in sett]

flood_area = round(area_m2(river) + area_m2(pocket))
exposed = [f for f in building_features + road_features if f["properties"]["status"] in ("exposed", "candidate_blocked")]

def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()

def src(sid, kind, at, note):
    return {"source_id": sid, "kind": kind, "acquired_at": at, "uri": f"synthetic://{sid}",
            "license": f"MIT; original synthetic fixture ({note})", "sha256": sha(sid), "usage": "input"}

assessment = {
    "schema_version": "1.0.0",
    "assessment_id": "synthetic-ui-geometry-001",
    "mode": "synthetic",
    "event_date": "2026-08-26",
    "bbox": BBOX,
    "generated_at": "2026-10-13T12:00:00Z",
    "sources": [
        src("synthetic-graph-ui-001", "synthetic", "2026-08-25T12:00:00Z", "invented road graph and assets"),
        src("synthetic-s1-before", "sentinel_1", "2026-08-14T00:21:00Z", "stand-in for a pre-event radar scene; no Copernicus data"),
        src("synthetic-s1-after", "sentinel_1", "2026-08-26T00:21:00Z", "stand-in for a post-event radar scene; no Copernicus data"),
    ],
    "quality": {"status": "partial", "valid_fraction": 0.93,
                "warnings": ["Synthetic UI fixture. Geometry, scenes and scores are invented for interface tests.",
                             "7% of the AOI is marked no-data to exercise unknown coverage."],
                "method_version": "synthetic-ui-v1"},
    "summary": {"candidate_flood_area_m2": flood_area, "exposed_asset_count": len(exposed),
                "potentially_isolated_count": 1, "unknown_network_count": 1},
    "layers": {"flood": {"type": "FeatureCollection", "features": flood_features},
               "debris": {"type": "FeatureCollection", "features": debris_features},
               "roads": {"type": "FeatureCollection", "features": road_features},
               "buildings": {"type": "FeatureCollection", "features": building_features},
               "settlements": {"type": "FeatureCollection", "features": settlement_features}},
    "settlements": [
        {"settlement_id": "training-settlement-a", "status": "potentially_isolated",
         "baseline_facility_id": "training-hospital", "baseline_route_edge_ids": ["road-a", "bridge-a", "road-h1"],
         "post_event_facility_id": None, "post_event_route_edge_ids": [], "candidate_cut_edge_ids": ["bridge-a"],
         "any_facility_access": False, "evidence_ids": ["synthetic-exposure-001"],
         "reason": "The synthetic graph loses all facility routes if bridge-a is impassable. This is not a real flood finding."},
        {"settlement_id": "training-settlement-b", "status": "connected",
         "baseline_facility_id": "training-hospital", "baseline_route_edge_ids": ["road-c", "road-h2"],
         "post_event_facility_id": "training-hospital", "post_event_route_edge_ids": ["road-d", "road-k"],
         "candidate_cut_edge_ids": ["road-c"], "any_facility_access": True, "evidence_ids": ["synthetic-exposure-002"],
         "reason": "Baseline route crosses candidate-exposed road-c; a longer synthetic alternate route remains."},
        {"settlement_id": "training-settlement-c", "status": "preexisting_disconnected",
         "baseline_facility_id": None, "baseline_route_edge_ids": [], "post_event_facility_id": None,
         "post_event_route_edge_ids": [], "candidate_cut_edge_ids": [], "any_facility_access": False,
         "evidence_ids": ["synthetic-graph-002"],
         "reason": "No pre-event route to any facility in the synthetic graph; not a flood impact."},
        {"settlement_id": "training-settlement-d", "status": "unknown_network",
         "baseline_facility_id": None, "baseline_route_edge_ids": [], "post_event_facility_id": None,
         "post_event_route_edge_ids": [], "candidate_cut_edge_ids": [], "any_facility_access": None,
         "evidence_ids": ["synthetic-snap-001"],
         "reason": "Settlement lies outside the snapping tolerance of every road node; access is unknown."},
    ],
    "evidence": [
        {"evidence_id": "synthetic-exposure-001", "source_ids": ["synthetic-graph-ui-001", "synthetic-s1-after"],
         "kind": "synthetic", "description": "Invented candidate-blocked bridge inside the synthetic flood polygon.",
         "method_version": "synthetic-ui-v1"},
        {"evidence_id": "synthetic-exposure-002", "source_ids": ["synthetic-graph-ui-001", "synthetic-s1-after"],
         "kind": "synthetic", "description": "Invented candidate exposure of road-c in a low-lying pocket.",
         "method_version": "synthetic-ui-v1"},
        {"evidence_id": "synthetic-flood-001", "source_ids": ["synthetic-s1-before", "synthetic-s1-after"],
         "kind": "synthetic", "description": "Invented candidate flood polygons with heuristic flood_score (not a probability).",
         "method_version": "synthetic-ui-v1"},
        {"evidence_id": "synthetic-debris-001", "source_ids": ["synthetic-s1-before", "synthetic-s1-after"],
         "kind": "synthetic", "description": "Invented radar-brightening patch: candidate disturbance, not proof of debris.",
         "method_version": "synthetic-ui-v1"},
        {"evidence_id": "synthetic-graph-002", "source_ids": ["synthetic-graph-ui-001"],
         "kind": "synthetic", "description": "Synthetic graph component with no facility before the event.",
         "method_version": "synthetic-ui-v1"},
        {"evidence_id": "synthetic-snap-001", "source_ids": ["synthetic-graph-ui-001"],
         "kind": "synthetic", "description": "Synthetic settlement beyond the snapping tolerance.",
         "method_version": "synthetic-ui-v1"},
    ],
    "limitations": [
        "Synthetic UI fixture; no assertion about the real area represented by this bounding box.",
        "No satellite detection, official-reference evaluation or actual drone telemetry.",
        "Candidate exposure is not confirmed structural damage or road closure.",
        "flood_score is a heuristic score, not a calibrated probability.",
    ],
}
out = Path(__file__).resolve().parents[1] / "src/fixtures/synthetic-ui-assessment.json"
out.write_text(json.dumps(assessment, indent=2) + "\n")
print(out, "flood_area_m2", flood_area, "exposed", len(exposed))
