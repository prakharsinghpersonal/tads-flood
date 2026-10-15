# Devpost draft — human review required

## Project name
TADS Flood

## Tagline
Trace satellite change to mapped infrastructure, uncertain access and cited briefs.

## Inspiration
Flood response teams need to connect remote sensing to a specific infrastructure
and access question while retaining missing data, dates and provenance. The TADS
research concept inspired a separate inspection simulation; this application
was built independently without importing its research archives or results.

## What it does
An area/date request selects compatible Sentinel-1 imagery and historical OSM,
computes candidate flood/disturbance exposure, compares mapped facility routes,
and produces a cited situation brief. The map provides before/after previews,
source inspection and exact-byte offline packages. A copilot selects computed
facts in English/Nepali. A separate mission simulation explores lost connectivity;
it is not a real drone system.

## How we built it
Python/FastAPI/Pydantic, rasterio/NumPy/Shapely/pyproj, SQLite and content-addressed
cache; CDSE Sentinel Hub, Copernicus DEM and historical ohsome; React/TypeScript,
MapLibre, IndexedDB and a service worker. Actual local Ollama llama3.1:8b selects
approved fact IDs; code renders all quantities and evidence references. Codex
assisted backend/integration; Claude Code assisted frontend/mission. AI tools are
not registered human teammates.

## What we measured
Actual source runs completed for Syapru Besi (26 Aug 2026) and a separate Timure
area/date. Syapru pipeline time was 7.919s before AI on the recorded Mac runtime,
with 41.8% valid coverage. English/Nepali model-selected claims preserve numbers
and citations; fluent Nepali review remains pending. Automated engineering
checks are reported in STATUS.md and must be refreshed after final UI integration.

## Challenges and limitations
The official EMSR927 AOI01 reference is Landslide. Our combined flood/disturbance
proxy has IoU 0.0057 and F1 0.0114 within jointly valid cells, missing most damage.
This is not validated debris detection or water-only flood segmentation.
Coverage is limited in steep terrain. Candidate exposure is not confirmed damage;
mapped connected routes are not certified safe. Timure execution is not a scored
holdout benchmark. The copilot has a small development evaluation, not a broad
language benchmark. Nepali remains DRAFT. Real aircraft and rescue decisions are
unsupported. The optional Vercel profile is synthetic read-only replay.

## Next steps
Improve detection on separate development data, evaluate a truly independent
holdout with correct reference classes, improve coverage/topology, complete
fluent language review and field validation. Preserve the evidence boundaries.

## Built with
Python, FastAPI, React, TypeScript, MapLibre, Sentinel-1, Copernicus DEM,
OpenStreetMap, ohsome API, Ollama, SQLite, IndexedDB.

## Links to enter manually
- Implementation: https://github.com/prakharsinghpersonal/tads-flood/tree/PKS/data-engine
- Public video: PENDING (exactly three minutes planned)
- Optional deployed demo: PENDING; identify synthetic profile
- Six-page report and generated one-page brief: see DELIVERY_CHECKLIST.md
- Human entrants, student eligibility, names and AI/prior-work disclosure: PENDING

Include required source credits from DATA_POLICY.md in the final submission.
Remove none of the measured limitations in polishing the text. Do not submit
this draft until the human verifies eligibility, links and final artifacts.
