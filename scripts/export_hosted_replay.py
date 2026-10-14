"""Export actual synthetic API responses for the explicitly read-only hosted demo."""
import argparse
import base64
from datetime import datetime, timezone
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import parse_qsl, urlencode, urlsplit

from fastapi.testclient import TestClient
from tads_flood.api import create_app
from tads_flood.settings import Settings

ROOT = Path(__file__).resolve().parents[1]


def canonical(path):
    parsed = urlsplit(path)
    query = urlencode(sorted(parse_qsl(parsed.query)))
    return parsed.path + ("?" + query if query else "")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=str(ROOT / "apps/web/deployment/replay-data.json"))
    args = parser.parse_args()
    routes = {}
    with TemporaryDirectory(prefix="tads-export-") as temporary:
        with TestClient(create_app(settings=Settings(data_root=Path(temporary)))) as client:
            def collect(path):
                response = client.get(path)
                routes[canonical(path)] = {"status": response.status_code,
                    "content_type": response.headers["content-type"],
                    "body_base64": base64.b64encode(response.content).decode()}
                return response
            assessment = collect("/api/v1/demo/geographic").json()
            assert assessment["mode"] == "synthetic"
            collect("/api/v1/demo")
            collect("/health")
            base = "/api/v1/assessments/" + assessment["assessment_id"]
            collect(base)
            package = collect(base + "/package").json()
            collect(package["assessment_uri"])
            for asset in package["assets"]:
                collect(asset["uri"])
            for source in assessment["sources"]:
                collect(source["uri"])
            for language in ("en", "ne"):
                collect(base + "/report?language=" + language)
                for format in ("json", "html"):
                    collect(base + f"/brief?language={language}&format={format}")
    value = {"format": "tads-hosted-replay-1", "mode": "synthetic",
             "exported_at": datetime.now(timezone.utc).isoformat(),
             "assessment_id": assessment["assessment_id"], "routes": routes,
             "limits": ["Read-only synthetic replay exported from the Python pipeline.",
                        "No live processing, model generation or real drone capability on this hosting profile."]}
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(f"Exported {len(routes)} synthetic replay routes to {path}")


if __name__ == "__main__":
    main()
