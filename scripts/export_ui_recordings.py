"""Export recorded real-case API responses for UI checks, without provider calls."""
import argparse
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import quote

from dotenv import dotenv_values
from fastapi.testclient import TestClient
from tads_flood.api import create_app
from tads_flood.cache import ContentCache
from tads_flood.models import Assessment
from tads_flood.settings import Settings
from tads_flood.store import JobStore

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default="artifacts/case-study-syapru")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    source_dir, output = Path(args.input), Path(args.output)
    assessment = Assessment.model_validate_json((source_dir / "assessment.json").read_bytes())
    if assessment.mode != "live":
        raise ValueError("This exporter is for an existing real-mode recording.")
    current = Settings.from_environment()
    stored = JobStore(current.data_root / "state.sqlite3").assessment(assessment.assessment_id)
    if stored is None or stored[0] != assessment:
        raise ValueError("Recorded assessment must match the immutable API snapshot.")
    secrets = [value.encode() for key, value in dotenv_values(ROOT / ".env").items()
               if value and (key.endswith("KEY") or key.endswith("SECRET") or key == "CDSE_CLIENT_ID")]
    original_cache = ContentCache(current.data_root / "objects")
    payloads, routes = {}, []
    with TemporaryDirectory(prefix="tads-recording-") as temporary:
        settings = Settings(data_root=Path(temporary))  # Explicitly no credentials/model.
        cache = ContentCache(settings.data_root / "objects")
        for digest in {source.sha256 for source in assessment.sources} | set(stored[1].values()):
            for manifest in original_cache.metadata(digest):
                cache.put(original_cache.get(digest), manifest)
        JobStore(settings.data_root / "state.sqlite3").put_assessment(assessment, stored[1])
        base = "/api/v1/assessments/" + quote(assessment.assessment_id, safe="")
        with TestClient(create_app(settings=settings)) as client:
            def collect(path, filename):
                response = client.get(path)
                if response.status_code not in (200, 501):
                    raise ValueError("Recorded GET failed: " + path)
                payloads[filename] = response.content
                routes.append({"method": "GET", "path": path, "file": filename,
                               "status": response.status_code, "content_type": response.headers["content-type"]})
            collect(base, "assessment.json")
            collect(base + "/snapshot", "snapshot.json")
            collect(base + "/package", "package.json")
            for phase in ("before", "after"):
                collect(base + "/imagery/" + phase, phase + ".png")
            for index, source in enumerate(assessment.sources):
                collect(base + "/sources/" + quote(source.source_id, safe=""), f"source-{index}.json")
            for language in ("en", "ne"):
                collect(base + "/report?language=" + language, f"report-{language}.json")
                for format in ("json", "html"):
                    collect(base + f"/brief?language={language}&format={format}", f"brief-{language}.{format}")
    for filename in ("copilot-en.json", "copilot-ne.json", "run-evidence.json"):
        if (source_dir / filename).is_file():
            payloads[filename] = (source_dir / filename).read_bytes()
    manifest = {"format": "tads-ui-recording-1", "recorded_mode": "live",
                "assessment_id": assessment.assessment_id, "routes": routes,
                "files": {name: {"sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)}
                          for name, body in payloads.items()},
                "limits": ["Recorded real-mode results; no new satellite, OSM or model calls.",
                           "Use only as labelled UI recordings, not geographic validation.",
                           "Never serve the recorded copilot answer as a response to a new question."]}
    payloads["recording-manifest.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    if any(secret in body for secret in secrets for body in payloads.values()):
        raise ValueError("A credential was found; no recording was exported.")
    output.mkdir(parents=True, exist_ok=True)
    for name, body in payloads.items():
        (output / name).write_bytes(body)
    print(f"Exported {len(payloads)} credential-checked recorded responses; no provider/model calls.")


if __name__ == "__main__":
    main()
