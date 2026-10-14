from io import BytesIO
import hashlib

import numpy as np
import pytest
from PIL import Image
from shapely.geometry import LineString, Point, box, mapping

from tads_flood.cache import ContentCache
from tads_flood.connectivity import analyze_isolation
from tads_flood.errors import PipelineError
from tads_flood.geo import MetricGrid, RadarRaster, detect_change, metric_grid, read_radar_tiff, to_wgs84
from tads_flood.pipeline import assemble_assessment
from tads_flood.synthetic import encode_tiff, synthetic_bundle
from tads_flood.topology import build_road_graph


GRID = MetricGrid(32645, (400000, 3000000, 400040, 3000040), 4, 4)


def radar(db, valid=None):
    return RadarRaster(10 ** (np.asarray(db, dtype="float32") / 10),
                       np.ones((4, 4), dtype=bool) if valid is None else valid,
                       GRID.transform, "EPSG:32645")


def test_metric_grid_respects_resolution_and_budget():
    grid = metric_grid((85.25, 27.85, 85.75, 28.35), max_side=256)
    assert grid.epsg == 32645
    assert grid.width <= 256 and grid.height <= 256
    assert grid.pixel_area_m2 > 0


def test_projection_rejects_polar_case():
    with pytest.raises(PipelineError, match="UTM"):
        metric_grid((1, 85, 1.1, 85.1))


def test_candidate_mask_area_and_permanent_water():
    before = np.full((4, 4), -10.)
    after = before.copy()
    after[:2, :2] = -22
    before[3, 3], after[3, 3] = -22, -24
    value = detect_change(radar(before), radar(after), GRID)
    assert value.flood.sum() == 4
    assert value.area_m2 == pytest.approx(400)
    assert value.polygons.area == pytest.approx(400)
    assert not value.flood[3, 3]


def test_all_nodata_returns_unknown_area():
    valid = np.zeros((4, 4), dtype=bool)
    value = detect_change(radar(np.full((4, 4), -10), valid), radar(np.full((4, 4), -22), valid), GRID)
    assert value.area_m2 is None
    assert value.valid_fraction == 0
    assert value.polygons.is_empty


def test_steep_terrain_is_not_confident_flood():
    dem = np.tile(np.arange(4) * 1000., (4, 1))
    value = detect_change(radar(np.full((4, 4), -10)), radar(np.full((4, 4), -22)), GRID, dem=dem)
    assert value.valid_fraction == 0


def test_shadow_mask_excludes_cells_and_raster_alignment_is_checked():
    vv = np.full((4, 4), .1)
    valid, shadow = np.ones((4, 4)), np.zeros((4, 4))
    shadow[0, 0] = 1
    result = read_radar_tiff(encode_tiff(GRID, [vv, valid, shadow]), GRID)
    assert not result.valid[0, 0]
    assert result.valid.sum() == 15
    with pytest.raises(PipelineError, match="alignment"):
        read_radar_tiff(encode_tiff(GRID, [vv, valid]), MetricGrid(32645, (400001, 3000000, 400041, 3000040), 4, 4))


def test_invalid_tiff_rejected():
    with pytest.raises(PipelineError):
        read_radar_tiff(b"not a TIFF", GRID)


def features(roads, locations):
    result = []
    for identifier, geometry, tags in roads + locations:
        result.append({"type": "Feature", "id": identifier,
                       "geometry": mapping(to_wgs84(geometry, 32645)), "properties": tags})
    return result


def graph_from(items, flood=None):
    return build_road_graph(items, 32645, box(0, 0, 0, 0) if flood is None else flood,
                            box(399000, 2999000, 402000, 3002000),
                            source_id="osm", evidence_id="exposure", snap_distance_m=10)


def test_midway_crossing_is_noded_but_grade_separation_is_not():
    horizontal = LineString([(400000, 3000000), (400200, 3000000)])
    vertical = LineString([(400100, 2999900), (400100, 3000100)])
    locations = [("v", Point(400000, 3000000), {"place": "village"}),
                 ("h", Point(400100, 3000100), {"amenity": "hospital"})]
    ordinary = features([("r1", horizontal, {"highway": "primary"}),
                         ("r2", vertical, {"highway": "primary"})], locations)
    graph, *_ = graph_from(ordinary)
    assert analyze_isolation(graph)[0].status == "connected"
    elevated = features([("r1", horizontal, {"highway": "primary"}),
                        ("r2", vertical, {"highway": "primary", "bridge": "yes", "layer": "1"})], locations)
    graph, *_ = graph_from(elevated)
    assert analyze_isolation(graph)[0].status == "preexisting_disconnected"


def test_bridge_approaches_connect_at_shared_endpoints():
    items = features([
        ("west", LineString([(400000, 3000000), (400100, 3000000)]), {"highway": "primary"}),
        ("bridge", LineString([(400100, 3000000), (400150, 3000000)]), {"highway": "primary", "bridge": "yes"}),
        ("east", LineString([(400150, 3000000), (400250, 3000000)]), {"highway": "primary"}),
    ], [("v", Point(400000, 3000000), {"place": "village"}),
        ("h", Point(400250, 3000000), {"amenity": "hospital"})])
    graph, *_ = graph_from(items, box(400105, 2999990, 400145, 3000010))
    value = analyze_isolation(graph)[0]
    assert value.status == "potentially_isolated"
    assert len(value.baseline_route_edge_ids) == 3
    assert value.candidate_cut_edge_ids == ["bridge:0:0"]


def test_snapping_splits_long_road_instead_of_using_far_endpoint():
    items = features([("r", LineString([(400000, 3000000), (401000, 3000000)]), {"highway": "primary"})],
                     [("v", Point(400500, 3000002), {"place": "village"}),
                      ("h", Point(401000, 3000000), {"amenity": "hospital"})])
    graph, *_ = graph_from(items)
    value = analyze_isolation(graph)[0]
    assert value.status == "connected"
    assert len(graph.edges) == 2


def test_cache_detects_tampering(tmp_path):
    cache = ContentCache(tmp_path)
    digest = cache.put(b"source", {"usage": "input"})
    assert cache.get(digest) == b"source"
    (tmp_path / digest / "data.bin").write_bytes(b"changed")
    with pytest.raises(PipelineError, match="hash"):
        cache.get(digest)


def test_source_manifest_hash_and_metadata_are_verified(tmp_path):
    cache = ContentCache(tmp_path)
    digest = cache.put(b"source", {"source_id": "scene", "relative_orbit": 42})
    assert cache.metadata(digest, "scene")[0]["relative_orbit"] == 42
    path = next((tmp_path / digest).glob("manifest-*.json"))
    path.write_text('{"source_id":"scene", "relative_orbit":99}')
    with pytest.raises(PipelineError, match="integrity"):
        cache.metadata(digest, "scene")


def test_synthetic_pipeline_computes_layers_access_and_preview_hashes(tmp_path):
    request, bundle = synthetic_bundle()
    cache = ContentCache(tmp_path)
    value, assets = assemble_assessment(request, bundle, cache)
    states = {s.settlement_id: s.status for s in value.settlements}
    assert states == {"training-village-west": "potentially_isolated",
                      "training-village-east": "connected", "training-village-unsnapped": "unknown_network"}
    assert value.mode == "synthetic"
    assert value.summary.candidate_flood_area_m2 > 0
    assert len(value.layers.roads.features) >= 3
    assert value.layers.flood.features
    assert all(s.kind == "synthetic" for s in value.sources)
    for phase, digest in assets.items():
        raw = cache.get(digest)
        assert hashlib.sha256(raw).hexdigest() == digest
        image = Image.open(BytesIO(raw))
        assert image.mode == "RGBA" and image.size[0] > 10


def test_prepared_mode_and_snapshot_cannot_be_misrepresented(tmp_path):
    request, bundle = synthetic_bundle()
    bundle.mode = "live"
    with pytest.raises(PipelineError, match="mode"):
        assemble_assessment(request, bundle, ContentCache(tmp_path))


def test_nodata_pipeline_never_reports_an_unaffected_or_connected_area(tmp_path):
    request, bundle = synthetic_bundle()
    grid = metric_grid(request.bbox)
    no_data = encode_tiff(grid, [np.full((grid.height, grid.width), .1), np.zeros((grid.height, grid.width))])
    bundle.before = bundle.after = no_data
    value, _ = assemble_assessment(request, bundle, ContentCache(tmp_path))
    assert value.quality.status == "unavailable"
    assert value.summary.candidate_flood_area_m2 is None
    assert value.summary.exposed_asset_count is None
    assert all(s.status == "unknown_network" and s.any_facility_access is None for s in value.settlements)


def test_grade_of_selected_snap_line_is_preserved(monkeypatch):
    from shapely.strtree import STRtree as RealTree
    class ChooseBridgeTree:
        def __init__(self, geometries):
            self.tree = RealTree(geometries)
        def query(self, geometry):
            return self.tree.query(geometry)
        def nearest(self, point):
            return 1  # Select the elevated line in an ambiguous geometric tie.
    monkeypatch.setattr("tads_flood.topology.STRtree", ChooseBridgeTree)
    items = features([
        ("ground", LineString([(400100, 2999900), (400100, 3000000), (400100, 3000100)]), {"highway": "primary"}),
        ("bridge", LineString([(400000, 3000000), (400200, 3000000)]), {"highway": "primary", "bridge": "yes", "layer": "1"}),
    ], [("v", Point(400100, 3000000), {"place": "village"}),
        ("h", Point(400200, 3000000), {"amenity": "hospital"})])
    graph, *_ = graph_from(items)
    value = analyze_isolation(graph)[0]
    assert value.status == "connected"
    assert all(edge.startswith("bridge:") for edge in value.baseline_route_edge_ids)


def test_hospital_footprint_is_kept_for_exposure_and_facility_routing():
    items = features([("r", LineString([(400000, 3000000), (400200, 3000000)]), {"highway": "primary"})],
        [("v", Point(400000, 3000000), {"place": "village"}),
         ("hospital", box(400190, 2999990, 400210, 3000010), {"amenity": "hospital", "building": "hospital"})])
    graph, roads, buildings, points, unknown, exposed = graph_from(items, box(400195, 2999990, 400210, 3000010))
    assert len(graph.facilities) == 1 and graph.facilities[0].location_id == "hospital"
    assert buildings[0]["id"] == "hospital" and buildings[0]["properties"]["status"] == "exposed"
    assert buildings[0]["properties"]["exposed_area_m2"] == pytest.approx(300)
    assert len([p for p in points if p["id"] == "hospital"]) == 1
    assert exposed == 2  # One road source asset plus the hospital, counted once.
