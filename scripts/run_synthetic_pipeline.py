"""Reproduce the computed geographic demo without a network or credentials."""
import argparse
from pathlib import Path

from tads_flood.cache import ContentCache
from tads_flood.copilot import deterministic_bilingual_report
from tads_flood.pipeline import assemble_assessment
from tads_flood.reports import render_brief
from tads_flood.synthetic import synthetic_bundle


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="artifacts/synthetic-demo")
    args = parser.parse_args()
    root = Path(args.output)
    root.mkdir(parents=True, exist_ok=True)
    cache = ContentCache(root / "objects")
    request, bundle = synthetic_bundle()
    value, assets = assemble_assessment(request, bundle, cache)
    (root / "assessment.json").write_text(value.model_dump_json(indent=2) + "\n")
    for phase, digest in assets.items():
        (root / (phase + ".png")).write_bytes(cache.get(digest))
    for language in ("en", "ne"):
        report = deterministic_bilingual_report(value, language)
        (root / ("brief-" + language + ".html")).write_text(render_brief(value, report))
    print("Mode: synthetic; no real-world flood claim")
    print(value.summary.model_dump())
    print("Outputs:", root.resolve())


if __name__ == "__main__":
    main()
