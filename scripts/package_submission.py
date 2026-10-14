"""Build a review-only bundle from explicit release files, never a repo archive."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "TADS_Flood_Technical_Report_Draft.pdf": "output/pdf/TADS_Flood_Technical_Report_Draft.pdf",
    "TADS_Flood_Situation_Brief_EN.pdf": "output/pdf/TADS_Flood_Situation_Brief_EN.pdf",
    "TADS_Flood_Situation_Brief_NE_Draft.pdf": "output/pdf/TADS_Flood_Situation_Brief_NE_Draft.pdf",
    "TECHNICAL_REPORT.md": "docs/submission/TECHNICAL_REPORT.md",
    "DEVPOST_DRAFT.md": "docs/submission/DEVPOST_DRAFT.md",
    "DEMO_SCRIPT.md": "docs/submission/DEMO_SCRIPT.md",
    "DELIVERY_CHECKLIST.md": "docs/submission/DELIVERY_CHECKLIST.md",
    "measured-results.json": "docs/submission/measured-results.json",
    "DATA_POLICY.md": "docs/DATA_POLICY.md",
}


def main():
    payloads = {name: (ROOT / source).read_bytes() for name, source in FILES.items()}
    manifest = {"status": "review_draft", "files": {
        name: {"sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)}
        for name, body in payloads.items()},
        "pending": ["Final recorded-case UI QA", "Fluent Nepali review", "Final video/upload",
                    "Optional deployment verification", "Human eligibility and Devpost submission"],
        "limits": ["Weak measured landslide proxy; no validated mapping claim.",
                   "This allowlist excludes credentials, raw/reference archives and research datasets."]}
    path = ROOT / "output/TADS_Flood_Review_Draft.zip"
    path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(path, "w", compression=ZIP_DEFLATED) as archive:
        for name, body in payloads.items():
            archive.writestr(name, body)
        archive.writestr("BUNDLE_MANIFEST.json", json.dumps(manifest, indent=2) + "\n")
    with ZipFile(path) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(FILES) | {"BUNDLE_MANIFEST.json"}
    print(path)


if __name__ == "__main__":
    main()
