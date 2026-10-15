"""Run a bounded actual area/date and save reproducible evidence, without secrets."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import platform
import resource
import sys
import time

from tads_flood.cache import ContentCache
from tads_flood.copilot import deterministic_bilingual_report, generate_answer
from tads_flood.errors import PipelineError
from tads_flood.models import AssessmentRequest
from tads_flood.pipeline import run_live, PIPELINE_VERSION
from tads_flood.reports import render_brief
from tads_flood.settings import Settings
from tads_flood.store import JobStore


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", required=True, help="west,south,east,north")
    parser.add_argument("--event-date", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--with-ai", action="store_true")
    args = parser.parse_args()
    settings = Settings.from_environment()
    request = AssessmentRequest(bbox=tuple(map(float, args.bbox.split(','))), event_date=args.event_date, mode="live")
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    objects = ContentCache(settings.data_root / "objects")
    started = time.perf_counter()
    record = {"recorded_at": datetime.now(timezone.utc).isoformat(), "mode": "live", "pipeline_version": PIPELINE_VERSION,
              "bbox": request.bbox, "event_date": args.event_date, "python": platform.python_version(),
              "platform": platform.platform(), "purpose": "actual pipeline execution; reference evaluation is separate"}
    try:
        assessment, assets = run_live(request, settings, objects,
            progress=lambda stage, fraction, message: print({"stage": stage, "fraction": fraction}, flush=True))
        record["pipeline_seconds"] = round(time.perf_counter() - started, 3)
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        record["peak_process_rss_mib"] = round(peak / (1024 * 1024 if sys.platform == "darwin" else 1024), 2)
        JobStore(settings.data_root / "state.sqlite3").put_assessment(assessment, assets)
        (output / "assessment.json").write_text(assessment.model_dump_json(indent=2) + "\n")
        source_manifests = []
        for source in assessment.sources:
            source_manifests.extend(objects.metadata(source.sha256, source.source_id))
        (output / "source-manifests.json").write_text(json.dumps(source_manifests, indent=2) + "\n")
        for phase, digest in assets.items():
            (output / (phase + ".png")).write_bytes(objects.get(digest))
        for language in ("en", "ne"):
            brief = deterministic_bilingual_report(assessment, language)
            (output / ("brief-" + language + ".json")).write_text(json.dumps(brief, ensure_ascii=False, indent=2) + "\n")
            (output / ("brief-" + language + ".html")).write_text(render_brief(assessment, brief))
            if args.with_ai:
                answer = generate_answer(assessment, "Which mapped settlements may be isolated, and what is uncertain?", language, settings)
                (output / ("copilot-" + language + ".json")).write_text(json.dumps(answer, ensure_ascii=False, indent=2) + "\n")
        record.update(status="passed", assessment_id=assessment.assessment_id,
                      summary=assessment.summary.model_dump(), quality=assessment.quality.model_dump())
    except PipelineError as error:
        record.update(status="failed", error_code=error.code, error_message=error.message)
    record["total_seconds"] = round(time.perf_counter() - started, 3)
    (output / "run-evidence.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    print({"status": record["status"], "assessment_id": record.get("assessment_id"),
           "pipeline_seconds": record.get("pipeline_seconds"), "summary": record.get("summary"),
           "error_code": record.get("error_code")}, flush=True)
    return 0 if record["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
