"""Compare completed live candidates with independent CEMS data, outside inference."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from rasterio.features import rasterize
from shapely.geometry import shape
from shapely.ops import unary_union

from tads_flood.cache import ContentCache
from tads_flood.evaluation import mask_metrics
from tads_flood.geo import metric_grid, read_radar_tiff, read_aligned_bands, detect_change, to_metric
from tads_flood.models import Assessment


def collection(path):
    value = json.loads(path.read_text())
    crs = value.get("crs", {}).get("properties", {}).get("name", "CRS84")
    if crs not in ("CRS84", "urn:ogc:def:crs:OGC:1.3:CRS84", "urn:ogc:def:crs:EPSG::4326"):
        raise ValueError("Reference must explicitly use WGS84/CRS84")
    return value["features"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assessment", required=True)
    parser.add_argument("--reference-dir", required=True)
    parser.add_argument("--objects", default="data/cache/runtime/objects")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    assessment = Assessment.model_validate_json(Path(args.assessment).read_text())
    if assessment.mode != "live":
        raise ValueError("Official-reference evaluation requires completed live inputs")
    reference_dir = Path(args.reference_dir)
    event = collection(reference_dir / "observedEventA.geojson")
    aoi = collection(reference_dir / "areaOfInterestA.geojson")
    footprints = collection(reference_dir / "imageFootprintA.geojson")
    # The reference declares the source image used to interpret its observed event.
    damage_source_ids = {f["properties"]["dmg_src_id"] for f in event}
    damage_footprints = [shape(f["geometry"]) for f in footprints if f["properties"]["or_src_id"] in damage_source_ids]
    if not damage_footprints:
        raise ValueError("No independent damage-image footprint; refusing a blanket valid denominator")
    domain = unary_union([shape(f["geometry"]) for f in aoi]).intersection(unary_union(damage_footprints))
    observed = unary_union([shape(f["geometry"]) for f in event])
    predicted = unary_union([shape(f["geometry"]) for layer in [assessment.layers.flood, assessment.layers.debris] for f in layer.features])
    grid = metric_grid(assessment.bbox)
    objects = ContentCache(Path(args.objects))
    radar_sources = sorted([s for s in assessment.sources if s.kind == "sentinel_1"], key=lambda s: s.acquired_at)
    if len(radar_sources) != 2:
        raise ValueError("Expected the two declared radar inputs")
    before, after = [read_radar_tiff(objects.get(source.sha256), grid) for source in radar_sources]
    dem_source = next(s for s in assessment.sources if s.kind == "dem")
    bands = read_aligned_bands(objects.get(dem_source.sha256), grid, 2)
    change = detect_change(before, after, grid, dem=np.where(bands[1] > 0, bands[0], np.nan))
    def mask(geometry):
        geometry = to_metric(geometry, grid.epsg)
        if geometry.is_empty:
            return np.zeros((grid.height, grid.width), dtype=bool)
        return rasterize([(geometry, 1)], out_shape=(grid.height, grid.width), transform=grid.transform, dtype="uint8").astype(bool)
    reference_coverage = mask(domain)
    reference = mask(observed)
    prediction = mask(predicted)
    valid = reference_coverage & change.valid
    scores = mask_metrics(prediction, reference, valid)
    report = {"assessment_id": assessment.assessment_id, "mode": "live", "activation": "EMSR927",
              "comparison": "candidate flood + unvalidated disturbance versus photo-interpreted observed event",
              "reference_classes": sorted({f["properties"]["obj_desc"] for f in event}),
              "metrics_within_valid_coverage": scores,
              "reference_coverage_cells": int(reference_coverage.sum()),
              "joint_coverage_fraction": float(valid.sum() / reference_coverage.sum()) if reference_coverage.any() else None,
              "reference_positive_cells_total": int((reference & reference_coverage).sum()),
              "reference_positive_cells_without_valid_radar": int((reference & reference_coverage & ~change.valid).sum()),
              "grid": {"epsg": grid.epsg, "width": grid.width, "height": grid.height, "pixel_area_m2": grid.pixel_area_m2},
              "reference_hashes": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in reference_dir.glob('*.geojson')},
              "attribution": "European Union, Copernicus Emergency Management Service data",
              "usage": "evaluation_only",
              "limits": ["Reference classes differ from a water-only mask; this is not a flood-water segmentation score.",
                         "Metrics exclude unavailable terrain/radar cells; coverage and excluded positives are reported separately.",
                         "20m-scale grid with center rasterization; optical photo-interpretation and radar observe different times/resolutions.",
                         "Default thresholds were frozen before comparison; no threshold tuning used these reference labels."]}
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    (output / "reference-comparison.json").write_text(json.dumps(report, indent=2) + "\n")
    for name, array in [("prediction", prediction), ("reference", reference), ("valid", valid), ("reference-coverage", reference_coverage)]:
        np.save(output / (name + ".npy"), array, allow_pickle=False)
    print({"reference_classes": report["reference_classes"], "metrics": scores, "joint_coverage_fraction": report["joint_coverage_fraction"]})


if __name__ == "__main__":
    main()
