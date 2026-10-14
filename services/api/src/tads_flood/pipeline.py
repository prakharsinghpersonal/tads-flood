"""Compose source-backed raster/asset/graph analysis into the frozen v1 shape."""
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
import hashlib
import json
from urllib.parse import quote

import numpy as np
from PIL import Image

from .cache import ContentCache
from .connectivity import analyze_isolation
from .errors import PipelineError
from .geo import metric_grid, read_radar_tiff, read_aligned_bands, detect_change, geometry_features, METHOD_VERSION
from .models import Assessment, Source, Quality, Summary, Layers, FeatureCollection, Evidence
from .providers import CDSEProvider, OhsomeProvider, CatalogScene
from .topology import build_road_graph

PIPELINE_VERSION = "flood-assessment-v1.3"


@dataclass
class PreparedBundle:
    before: bytes
    after: bytes
    before_scene: CatalogScene
    after_scene: CatalogScene
    osm_raw: bytes
    osm_features: list
    osm_snapshot: datetime
    dem: bytes | None = None
    optical: bytes | None = None
    optical_scene: tuple | None = None
    mode: str = "live"


def radar_preview(raster):
    with np.errstate(divide="ignore", invalid="ignore"):
        db = 10 * np.log10(raster.backscatter)
    scaled = np.clip((np.nan_to_num(db, nan=-30, neginf=-30) + 30) / 30, 0, 1)
    rgba = np.zeros((*db.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = (scaled[:, :, None] * 255).astype(np.uint8)
    rgba[:, :, 3] = raster.valid.astype(np.uint8) * 255
    output = BytesIO()
    Image.fromarray(rgba).save(output, format="PNG")
    return output.getvalue()


def assemble_assessment(request, bundle, cache: ContentCache, *, progress=lambda *args: None,
                        cancelled=lambda: False):
    from .scene_quality import RadarScene, validate_pair
    if request.mode != bundle.mode:
        raise PipelineError("mode_mismatch", "Request and prepared source mode disagree.")
    grid = metric_grid(request.bbox)
    b, a = bundle.before_scene, bundle.after_scene
    validate_pair(RadarScene(b.product_id, b.acquired_at, b.relative_orbit, b.polarization, str(grid.epsg)),
                  RadarScene(a.product_id, a.acquired_at, a.relative_orbit, a.polarization, str(grid.epsg)), request.event_date)
    if bundle.osm_snapshot.tzinfo is None or bundle.osm_snapshot.date() >= request.event_date:
        raise PipelineError("post_event_osm_rejected", "Infrastructure snapshot must precede the event.")
    source_records = []
    def source(source_id, kind, acquired, payload, uri, extra=None):
        digest = cache.put(payload, {"source_id": source_id, "kind": kind, "acquired_at": acquired.isoformat(),
                                    "usage": "input", "bbox": list(request.bbox), "mode": bundle.mode,
                                    "method_version": METHOD_VERSION, "pipeline_version": PIPELINE_VERSION, **(extra or {})})
        source_records.append(Source(source_id=source_id, kind="synthetic" if bundle.mode == "synthetic" else kind,
            acquired_at=acquired, uri=f"synthetic://{source_id}" if bundle.mode == "synthetic" else uri,
            license="MIT synthetic fixture" if bundle.mode == "synthetic" else "ODbL; © OpenStreetMap contributors" if kind == "osm" else "Copernicus open data; required attribution applies",
            sha256=digest, usage="input"))
        return source_id
    def radar_metadata(scene):
        return {"selected_catalogue_scene": {"product_id": scene.product_id,
            "relative_orbit": scene.relative_orbit, "orbit_direction": scene.orbit_direction,
            "polarization": scene.polarization, "polarization_code": scene.polarization_code},
            "grid": {"epsg": grid.epsg, "bounds": list(grid.bounds), "width": grid.width, "height": grid.height},
            "processing": {"backscatter": "GAMMA0_TERRAIN", "dem": "COPERNICUS_30",
                           "speckle": "LEE 5x5", "bands": ["VV", "dataMask", "shadowMask"]}}
    sid_before = source(b.product_id, "sentinel_1", b.acquired_at, bundle.before,
                        "https://sh.dataspace.copernicus.eu/api/v1/process", radar_metadata(b))
    sid_after = source(a.product_id, "sentinel_1", a.acquired_at, bundle.after,
                       "https://sh.dataspace.copernicus.eu/api/v1/process", radar_metadata(a))
    sid_osm = source("osm-" + bundle.osm_snapshot.date().isoformat(), "osm", bundle.osm_snapshot,
                     bundle.osm_raw, "https://api.heigit.org/ohsome-api/v2-rc/extraction/features.parquet")
    progress("processing", .45, "Comparing compatible radar scenes on one metric grid")
    if cancelled():
        raise PipelineError("job_cancelled", "Job was cancelled.")
    before = read_radar_tiff(bundle.before, grid)
    after = read_radar_tiff(bundle.after, grid)
    dem = optical = None
    dem_source = None
    if bundle.dem is not None:
        bands = read_aligned_bands(bundle.dem, grid, 2)
        dem = np.where(bands[1] > 0, bands[0], np.nan)
        dem_source = source("copernicus-dem-processed", "dem", datetime.now(timezone.utc), bundle.dem,
                            "https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM")
    optical_source = None
    if bundle.optical is not None and bundle.optical_scene is not None:
        optical = read_aligned_bands(bundle.optical, grid, 5)
        optical_source = source(bundle.optical_scene[0], "sentinel_2", bundle.optical_scene[1], bundle.optical,
                                "https://browser.dataspace.copernicus.eu/")
    change = detect_change(before, after, grid, dem=dem, optical=optical)
    warnings = change.warnings + [
        "Road graph uses geometric noding; OSM turn restrictions and node-ID semantics are not fully represented.",
        "Road access is assessed within the requested AOI, not the entire regional network.",
        "Only mapped vehicle-access roads and facilities are considered; apparent cuts at the AOI boundary can be artifacts."]
    if dem_source:
        warnings.append("DEM acquired_at is the server retrieval time, not an original elevation survey date.")
    if bundle.mode == "live":
        warnings.append("Scene IDs identify selected catalogue inputs; exact contributing Process API tile IDs still require credentialed verification.")
    progress("analyzing", .65, "Intersecting exposure and comparing pre/post-event facility routes")
    graph, roads, buildings, points, unknown_edges, exposed = build_road_graph(
        bundle.osm_features, grid.epsg, change.polygons.union(change.disturbance_polygons), change.valid_polygons,
        source_id=sid_osm, evidence_id="exposure-001")
    results = analyze_isolation(graph)
    for value in results:
        if change.valid_fraction == 0 or (value.status == "connected" and any(edge in unknown_edges for edge in value.post_event_route_edge_ids)):
            value.status = "unknown_network"
            value.any_facility_access = None
            value.reason = "Required route crosses unavailable satellite coverage; current access is unknown."
        # Keep evidence for the baseline graph as well as candidate cuts.
        value.evidence_ids = sorted(set(value.evidence_ids) | {"network-001"})
    by_settlement = {r.settlement_id: r for r in results}
    for feature in points:
        if feature["id"] in by_settlement:
            result = by_settlement[feature["id"]]
            feature["properties"].update(status=result.status, evidence_ids=result.evidence_ids,
                                         candidate_cut_edge_ids=result.candidate_cut_edge_ids)
    ids = [sid_before, sid_after]
    if dem_source:
        ids.append(dem_source)
    if optical_source:
        ids.append(optical_source)
    evidence = [
        Evidence(evidence_id="change-001", source_ids=ids, kind="synthetic" if bundle.mode == "synthetic" else "inferred",
                 description="Terrain-masked, permanent-water-excluding radar change baseline; disturbance is unvalidated.", method_version=METHOD_VERSION),
        Evidence(evidence_id="exposure-001", source_ids=ids + [sid_osm], kind="synthetic" if bundle.mode == "synthetic" else "inferred",
                 description="Metric intersections of candidate flood/disturbance with historical infrastructure; not confirmed damage.", method_version=METHOD_VERSION),
        Evidence(evidence_id="network-001", source_ids=[sid_osm], kind="synthetic" if bundle.mode == "synthetic" else "inferred",
                 description="Noded historical road paths, bounded snapping and candidate-edge removal; finite AOI and incomplete restrictions limit the inference.", method_version="road-topology-v1"),
    ]
    identity = hashlib.sha256(json.dumps({"bbox": request.bbox, "event": request.event_date.isoformat(),
        "sources": [{"source_id": s.source_id, "sha256": s.sha256} for s in source_records],
        "radar_pair": [{"id": scene.product_id, "acquired_at": scene.acquired_at.isoformat(),
                        "relative_orbit": scene.relative_orbit, "orbit_direction": scene.orbit_direction,
                        "polarization": scene.polarization} for scene in (b, a)],
        "method": METHOD_VERSION, "pipeline_version": PIPELINE_VERSION, "mode": bundle.mode}, sort_keys=True).encode()).hexdigest()[:24]
    assessment_id = f"{bundle.mode}-{identity}"
    for record in source_records:
        record.uri = f"/api/v1/assessments/{assessment_id}/sources/{quote(record.source_id, safe='')}"
    collection = lambda features: FeatureCollection(features=features)
    assessment = Assessment(assessment_id=assessment_id, mode=bundle.mode, event_date=request.event_date,
        bbox=request.bbox, generated_at=datetime.now(timezone.utc), sources=source_records,
        quality=Quality(status="partial" if change.valid_fraction else "unavailable", valid_fraction=change.valid_fraction,
                        warnings=warnings, method_version=METHOD_VERSION),
        summary=Summary(candidate_flood_area_m2=change.area_m2, exposed_asset_count=exposed if change.valid_fraction else None,
                        potentially_isolated_count=sum(r.status == "potentially_isolated" for r in results),
                        unknown_network_count=sum(r.status == "unknown_network" for r in results)),
        layers=Layers(flood=collection(geometry_features(change.polygons, grid, kind="flood", evidence_id="change-001", source_id=sid_after)),
                      debris=collection(geometry_features(change.disturbance_polygons, grid, kind="disturbance", evidence_id="change-001", source_id=sid_after)),
                      roads=collection(roads), buildings=collection(buildings), settlements=collection(points)),
        settlements=results, evidence=evidence, limitations=warnings + (["Synthetic geographic training data; no real finding about this area."] if bundle.mode == "synthetic" else []))
    assets = {}
    for phase, raster in (("before", before), ("after", after)):
        scene = b if phase == "before" else a
        assets[phase] = cache.put(radar_preview(raster), {"assessment_id": assessment_id, "role": phase + "-radar-preview",
            "mode": bundle.mode, "source_id": scene.product_id, "acquired_at": scene.acquired_at.isoformat()})
    return assessment, assets


def run_live(request, settings, cache, *, progress=lambda *args: None, cancelled=lambda: False):
    satellite = CDSEProvider(settings, cancelled=cancelled)
    infrastructure = OhsomeProvider(settings, cancelled=cancelled)
    try:
        progress("fetching", .1, "Finding a compatible before/after radar pair")
        before, after = satellite.pair(request)
        grid = metric_grid(request.bbox)
        raw_before = satellite.radar(grid, before)
        raw_after = satellite.radar(grid, after)
        progress("fetching", .25, "Fetching terrain and historical infrastructure")
        raw_osm, features, snapshot = infrastructure.extract(request)
        dem = satellite.dem(grid)
        try:
            optical, optical_scene = satellite.optical(grid, request)
        except PipelineError as exc:
            if exc.code == "job_cancelled":
                raise
            optical, optical_scene = None, None
        bundle = PreparedBundle(raw_before, raw_after, before, after, raw_osm, features, snapshot,
                                dem, optical, optical_scene)
        return assemble_assessment(request, bundle, cache, progress=progress, cancelled=cancelled)
    finally:
        satellite.close()
        infrastructure.close()
