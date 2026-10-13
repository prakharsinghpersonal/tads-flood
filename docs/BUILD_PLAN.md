# TADS Flood: complete two-half build plan

## 1. Product decision

Help an analyst determine which flood-exposed settlements may be disconnected
from a town or hospital, understand the supporting evidence, and identify where
an inspection would be most useful. The differentiator is an explainable chain:

**satellite change → exposed road segment → interrupted baseline route →
potentially isolated settlement → cited situation report.**

TADS contributes an optional inspection-planning simulation. It does not replace
flood detection, road connectivity, or the required AI component. We choose the
brief's **situation-report copilot** AI route so that a train-from-scratch flood
network is not on the critical path. A transparent SAR change-detection baseline
still needs evaluation, optical corroboration where possible, and debris handling.

Aim for a defensible, complete demonstration. No promise of winning; high marks
require measured quality on unseen scenes, not an attractive scripted interface.

## 2. Official scope and deadline

Deadline: **2026-10-14 11:45 America/Los_Angeles** = 2026-10-15 00:15 IST.
Treat the Devpost timestamp as authoritative over ambiguous "14 October EOD".
One team, one track; one submitting team per individual. Team size 1–4.
The team consists of human entrants; Codex and Claude are disclosed coding tools,
not registered teammates. AI-assisted areas go in README and Built With.

Core requirements: Sentinel-1 radar and Sentinel-2 where clear; pre-event OSM
assets; flood/debris assessment; road isolation; selected AI option; required
case study; execution on judge-chosen areas/dates. Deliver public GitHub,
README/setup, maximum-six-page report with limitations, a one-page situation
report, attribution/dataset citations, and a **three-minute** YouTube demo.

Scoring: mapping 30%, AI 25%, isolated settlements 20%, report/Q&A/limitations
15%, dashboard/report usability 10%. Spend implementation time in that order.

Unresolved: existing-research reuse permission; official EMSR927 reference
availability/event correspondence; geographic eligibility ambiguity. Record
answers, do not assume. The activation URL currently opens a site shell without
verifiable products in our web read. This is a validation risk, not proof that
the reference is absent. Do not invent its polygons or cite unverified casualty
claims in the pitch. User handles organizer communication.

## 3. Scope boundaries

### Required delivery

- AOI/date form; live job with progress, cancellation and bounded retry.
- Before/after imagery comparison, valid-data mask, candidate water/debris layers.
- Asset exposure overlay with feature-level provenance.
- Baseline road paths versus conservative post-event paths; explicit uncertainty.
- Evidence inspector opening the exact scene/feature/source and acquisition time.
- English/Nepali copilot grounded exclusively in a structured evidence bundle.
- Same-bundle one-page report and export; conclusions and numbers traceable.
- Cache-only viewing of previously prepared assessments, with stale-data labels.
- Required case-study evaluation and an independent holdout AOI/date demonstration.

### Optional, after all core gates

- TADS-inspired inspection simulation with locally held prior, bounded mission,
  uncertainty-sensitive acquisition, local evidence logs and intermittent gossip.
- Lost-radio replay: dashboard freezes, drone simulation continues locally, logs
  sync on reconnection; duplicated events do not inflate trust.

### Cut

No survivor detector, casualty estimation, emergency prediction, rescue dispatch,
real flight controls, authentication, social features, broad multi-disaster scope,
3D globe, decorative KPI scores, or general-purpose chat. No automatic statement
that an exposed road is destroyed or a village is confirmed isolated. Cut drone
animations before cutting mapping, connectivity, provenance or validation.

## 4. Technical architecture

`apps/web`: React + TypeScript + Vite, MapLibre GL (GeoJSON layers and packaged
local vector/raster assets). First run uses explicitly synthetic fixtures.
The real UI uses sourced projected geography, not invented satellite screenshots.

`services/api`: Python 3.11+, FastAPI/Pydantic; NumPy, rasterio, Shapely/pyproj,
NetworkX when geospatial adapters are installed. Start with a dependency-light
connectivity/scene-quality foundation and grow behind the v1 contract.

Provider stages: catalogue → pair validation → processed imagery → change mask
→ asset intersection → road topology → evidence bundle → copilot/report.
Use an append-only SQLite job/event store and content-addressed cache manifests.
Separate `assessment` data from `simulation` events and `evaluation` references.
Every API response has a version and synthetic/live provenance. No new public
service is required for development: two local processes are sufficient.

Use server-side CDSE authentication; a Sentinel Hub Process adapter is a practical
first path for calibrated/terrain-corrected S1 crops. Pin preprocessing options,
record product IDs and relative orbit from catalogue results, request fixed-grid
aligned before/after rasters, and retain input hashes. A processed API crop is
not an official damage map; confirm that using the provider preprocessing meets
the organizer's "raw satellite data" requirement. Local SAFE/GRD preprocessing
can be an alternate path if required; do not promise it before execution.

Historical OSM comes from ohsome extraction. Validate its returned snapshot
against the event, including each cache manifest. Current OSM is not a fallback.
Pin client behaviour against observed API responses; v1 documentation currently
redirects to v2, so probe service metadata before choosing an endpoint version.
The live access check found v1 metadata available but legacy extraction returned
403. Use the documented v2 API with the user's free `OHSOME_API_KEY`, and convert
its GeoParquet extraction format into our internal geometry models. v2 access
is not yet verified; details and links are in DATA_POLICY.md.

## 5. Data and algorithm decisions

### Satellite estimates

Acquire same-relative-orbit/polarization S1 scenes with explicit event windows;
reject invalid pairings rather than resampling incompatible observations into
false confidence. Reproject onto one metric grid. Track no-data, coverage, radar
shadow/layover, steep slopes, permanent water and border pixels. Use change in
backscatter plus absolute post-event water indicators as a transparent baseline.
Thresholds are config/versioned, calibrated without using held-out reference
outcomes, and reported in a sensitivity table. A radar brightening is only a
candidate disturbance/debris indicator, not proof of debris. Use clear S2 bands
and indices for corroboration; record when cloud cover prevents that step.

### Exposure and isolation

Intersect estimated masks with metric asset geometry. Count each stable OSM ID
once; distinguish affected length from segment count. Build a genuinely noded
road graph using intersections/shared topology, bridge/layer semantics and
direction/restriction handling. Snap settlements and hospitals with a maximum
distance; outside tolerance yields unknown, never a fabricated connection.

Compare each settlement's pre-event shortest path to an accessible hospital/town
with post-event connectivity. Report `connected`, `potentially_isolated`,
`preexisting_disconnected`, or `unknown_network`. Choose nearest accessible
facility by network cost at baseline; separately report remaining access to any
facility. Do not confuse one lost nearest route with losing all access.
Expose alternative routes and the candidate edge IDs responsible for a cut.
Run optimistic/pessimistic edge scenarios; unstable isolation becomes uncertain.

### Copilot: AI with a numerical boundary

Build deterministic facts first. The language model receives only scoped facts,
definitions and evidence IDs, never arbitrary web knowledge or evaluation maps.
Output a typed set of claim IDs, citations, text and language. Numerical facts
are inserted by code from approved fact IDs; reject unsupported claims,
unapproved quantities or missing citations. The fallback is explicitly named
`deterministic_template`, never represented as the required AI component.
LLM engine metadata and credentials remain server-side. Translation receives
the same facts and a glossary; names/numbers/uncertainty must be preserved.
An English/Nepali reviewer checks a sample; cross-model translation is not a
substitute for that review. Refuse casualty estimates and unsupported assertions.

### Mission extension

Preload map, acquisition dates, uncertainty grid, boundaries, launch/return
points and mission policy. Run a small real acquisition calculation per step,
not fixed animation waypoints presented as an algorithm. Store observation IDs,
actor IDs, event times and receipt times separately. Deduplicate local evidence
and exchanged observations. Explain low-trust exploration rather than suppressing
all uncertain tiles. Show communications status per actor; the control station
does not know new findings when disconnected. Commands have pending/acknowledged/
expired/failed states. Expired queued inspection requests need review, not
automatic execution on reconnection. No hidden reference truth enters assessment.

## 6. Half A — Codex: data, analysis and service

Owned paths: `services/api/`, `tests/backend/`, `scripts/`, `contracts/`, Python
dependencies, backend evaluation artifacts and CI. Branch: `codex/data-engine`.

1. Freeze assessment/request schemas, route names and synthetic response fixture.
2. Implement validation, scene quality, graph isolation and deterministic facts;
   add meaningful failure-path tests and export OpenAPI. These are the first slice.
3. Add CDSE/catalogue adapter, ohsome historical extractor, job persistence and
   cache provenance. Provide an assessment job for user AOI/date, not fixed cases.
4. Implement georeferenced raster processing, exposure, graph topology and the
   evidence bundle. Compare results to independent references outside inference.
5. Add schema-constrained bilingual LLM reports, claim checks and evaluation.
6. Publish verified API contracts/fixtures with explicit synthetic/live labels;
   integrate Claude's completed UI branch and run release gates.

Acceptance: backend tests green; independent AOI runs; no reference leakage;
data gaps handled; graph counterexamples correct; reproducible manifests; report
quantities match computed facts; real provider and actual AI results demonstrated.

## 7. Half B — Claude: product, offline mission and demo

Owned paths: `apps/web/`, `tests/e2e/`, frontend lockfile/CI, `docs/UI_SPEC.md`,
`docs/CLAUDE_STATUS.md`. Branch: `claude/mission-ui`. Complete context and start
commands are in `docs/CLAUDE_HANDOFF.md`; no previous conversation is required.

1. Read the plan/contract; create a typed client from the fixture/schema.
2. Build one focused workspace: scene comparison/map, settlement/asset selection,
   evidence inspector, job states, layer controls and the cited report view.
3. Implement IndexedDB mission-package cache; no dependency on online basemap
   tiles for offline viewing. Show acquisition age, package version and limits.
4. Implement the optional TADS-inspired simulation and loss/reconnect state
   machine separately from assessment results. Add deterministic replay tests.
5. Add keyboard-accessible selections, readable mobile layouts and browser E2E
   tests, including offline reload and radio loss. Do not expose secrets in UI.
6. Produce demo assets/storyboard and screenshots, clearly separating real
   assessment and simulation; connect the completed UI to Codex's API.

Acceptance: backend replacement needs no UI rewrites; evidence links work;
unknown/stale/synthetic states visible; offline package survives reload; disconnected
telemetry does not move; duplicate sync doesn't change trust; critical flows and
320/768/1440-pixel layouts pass. Core UI precedes drone embellishment.

## 8. Integration protocol and milestones

Each agent owns a separate worktree. Neither edits the other's owned files.
Freeze schema v1 before starting the two halves. Shared proposals go into
`docs/coordination/` and state producer, consumer, migration and test impact.
Checkpoint reports list commits, test commands/results and blockers. Integrate
only explicit ready commits. Codex owns generated OpenAPI, both agents review it.

| Gate | Codex deliverable | Claude deliverable | Exit condition |
|---|---|---|---|
| G0: foundation | Schemas, fixture, first backend slice | Read handoff, start UI | Same fixture parses in both runtimes |
| G1: access, first 2 hours | Verify CDSE + historical OSM + reference | Map with fixture, inspector | Real source access proven or blocker recorded |
| G2: core | First real imagery-to-isolation bundle | API-driven workspace | One actual AOI/date completes with provenance |
| G3: robustness | Holdout AOI, gap/error cases | Offline cache, browser tests | No fixture substitution; source and stale states clear |
| G4: AI/evaluation | Bilingual claims-checked AI and benchmark | Report view and evidence drilldown | Figures trace to facts, evaluation reproducible |
| G5: optional extension | API integration/review | TADS simulation + reconnect | Simulation badge; no contamination of assessment |
| G6: release | Clean checkout run and artifact checks | Demo recording support | All required evidence exists, both halves verified |

Target freeze: October 14 at 09:45 PDT. Reserve the final two hours for a clean
run, report/video upload and submission checks; submit before 11:45 PDT.
If data access cannot be proven at G1, escalate immediately. A synthetic-only
prototype is a development deliverable, not an eligible full Track B solution.
There is no honest UI shortcut around the raw-data/unseen-area requirement.

## 9. Test, evaluation and release

`docs/TEST_MATRIX.md` defines exact inputs/expected results and owners. Backend
uses pytest; frontend uses Vitest + Playwright. Fixture tests run without tokens.
Provider contract tests use sanitized recorded responses; live checks require
credentials, run explicitly and retain manifests. Never put quota-consuming live
tests on every CI commit. Secret-free PR CI runs unit/contracts/build/E2E.

Measurements: flood IoU/precision/recall on independent reference coverage;
asset overlap with uncertainty; graph scenario ground truth; AI unsupported-claim
rate/citation coverage/numerical agreement; local interaction performance; peak
memory and end-to-end runtime. Report sample sizes, AOIs, masks, thresholds and
failure cases. Hold out whole events/AOIs rather than neighboring pixels.

Finish with a three-minute evidence-led demo, one-page generated situation report,
six-page technical report, source manifest, test results, setup instructions,
AI/reuse disclosure and required attributions. No invented metrics or untested
claims about rescue improvement. See `docs/DEMO_PLAN.md` for the timed sequence.
