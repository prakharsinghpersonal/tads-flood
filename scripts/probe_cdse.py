"""Bounded credentialed satellite smoke check; never a mapping-accuracy result."""
import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time

from tads_flood.errors import PipelineError
from tads_flood.geo import metric_grid, read_aligned_bands, read_radar_tiff
from tads_flood.models import AssessmentRequest
from tads_flood.providers import CDSEProvider
from tads_flood.settings import Settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", default="85.25,27.85,85.27,27.87")
    parser.add_argument("--event-date", default="2026-08-26")
    parser.add_argument("--output", default="data/cache/cdse-probe")
    args = parser.parse_args()
    request = AssessmentRequest(bbox=tuple(map(float, args.bbox.split(','))), event_date=args.event_date, mode="live")
    if request.bbox[2] - request.bbox[0] > .025 or request.bbox[3] - request.bbox[1] > .025:
        raise ValueError("Access smoke check limited to .025 degrees per axis")
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    provider = CDSEProvider(Settings.from_environment())
    started = time.perf_counter()
    record = {"recorded_at": datetime.now(timezone.utc).isoformat(), "bbox": request.bbox,
              "event_date": args.event_date, "mode": "live", "purpose": "satellite access smoke check"}
    try:
        provider.token()
        record["authentication_verified"] = True
        print("Authentication verified; selecting compatible radar pair", flush=True)
        before, after = provider.pair(request)
        grid = metric_grid(request.bbox)
        record["grid"] = asdict(grid)
        record["scenes"] = []
        for phase, scene in (("before", before), ("after", after)):
            print("Fetching " + phase + " radar", flush=True)
            raw = provider.radar(grid, scene)
            raster = read_radar_tiff(raw, grid)
            (output / (phase + ".tif")).write_bytes(raw)
            record["scenes"].append({"phase": phase, "product_id": scene.product_id,
                "acquired_at": scene.acquired_at.isoformat(), "relative_orbit": scene.relative_orbit,
                "orbit_direction": scene.orbit_direction, "polarization": scene.polarization,
                "valid_fraction": float(raster.valid.mean()), "sha256": hashlib.sha256(raw).hexdigest()})
            record["scenes"][-1]["process_source_verification"] = provider.radar_process_metadata.get(scene.product_id)
        print("Fetching aligned Copernicus DEM", flush=True)
        raw = provider.dem(grid)
        bands = read_aligned_bands(raw, grid, 2)
        (output / "dem.tif").write_bytes(raw)
        record["dem"] = {"sha256": hashlib.sha256(raw).hexdigest(), "valid_fraction": float((bands[1] > 0).mean())}
        record["status"] = "passed"
    except PipelineError as error:
        record.update(status="failed", error_code=error.code, error_message=error.message)
    finally:
        provider.close()
    record["elapsed_seconds"] = round(time.perf_counter() - started, 3)
    record["limits"] = ["Not the required case-study/reference comparison or a mapping accuracy result.",
                       "Historical infrastructure and independent mapping accuracy are not evaluated by this smoke check."]
    (output / "evidence.json").write_text(json.dumps(record, indent=2) + "\n")
    print({"status": record["status"], "seconds": record["elapsed_seconds"], "error_code": record.get("error_code")})
    return 0 if record["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
