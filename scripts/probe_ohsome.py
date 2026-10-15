"""Explicit live access probe, with bounded scope and historical-input checks.

Not called by CI. Saves raw response only under ignored data/cache. Does not
derive flood damage or assume that raw OSM ways form a valid routing graph.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from urllib.error import HTTPError

from tads_flood.models import AssessmentRequest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bbox", default="85.25,27.85,85.27,27.87")
    parser.add_argument("--event-date", default="2026-08-26")
    parser.add_argument("--snapshot", default="2026-07-26T00:00:00Z")
    args = parser.parse_args()
    request = AssessmentRequest(bbox=tuple(map(float, args.bbox.split(","))),
                                event_date=args.event_date, mode="live")
    # A source-access smoke probe should never issue a full-size AOI extraction.
    if request.bbox[2] - request.bbox[0] > 0.025 or request.bbox[3] - request.bbox[1] > 0.025:
        raise ValueError("Live smoke-probe extent is limited to 0.025 degrees per axis")
    snapshot = datetime.fromisoformat(args.snapshot.replace("Z", "+00:00"))
    if snapshot.tzinfo is None or snapshot.date() >= request.event_date:
        raise ValueError("Snapshot must be timezone-aware and precede the event")
    with urlopen("https://api.ohsome.org/v1/metadata", timeout=20) as response:
        metadata = json.load(response)
    latest = datetime.fromisoformat(metadata["extractRegion"]["temporalExtent"]["toTimestamp"].replace("Z", "+00:00"))
    if snapshot > latest:
        raise ValueError("Requested snapshot exceeds provider's available history")
    params = urlencode({"bboxes": args.bbox, "time": args.snapshot,
                        "filter": "type:way and highway=*"})
    endpoint = "https://api.ohsome.org/v1/elements/geometry?" + params
    with urlopen(endpoint, timeout=45) as response:
        raw = response.read(8_000_001)
    if len(raw) > 8_000_000:
        raise ValueError("Probe response exceeds 8 MB budget")
    data = json.loads(raw)
    if data.get("type") != "FeatureCollection":
        raise ValueError("Unexpected provider format")
    root = Path(__file__).resolve().parents[1]
    out = root / "data/cache/ohsome-probe"
    out.mkdir(parents=True, exist_ok=True)
    (out / "roads.geojson").write_bytes(raw)
    manifest = {"provider": "ohsome", "api_version": metadata["apiVersion"],
                "snapshot": args.snapshot, "event_date": args.event_date,
                "bbox": list(request.bbox), "feature_count": len(data["features"]),
                "sha256": hashlib.sha256(raw).hexdigest(), "usage": "input",
                "acquired_at": datetime.now(timezone.utc).isoformat(),
                "attribution": metadata["attribution"]["text"],
                "limitations": ["Access probe only; graph noding and snapping not performed."]}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({k: v for k, v in manifest.items() if k != "acquired_at"}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except HTTPError as exc:
        print(json.dumps({"status": "failed", "http_status": exc.code,
            "message": "Legacy extraction unavailable; see DATA_POLICY.md for authenticated v2 setup."}))
        raise SystemExit(2)
