# Claude Code: complete context and Half B assignment

You are implementing Half B of **TADS Flood** alongside Codex. The human requested
a carefully focused UI, offline inspection using an available prior, honest
judging readiness, a complete two-agent plan, tests and a GitHub repository.
You do not need the earlier conversation. This is a new application; existing
TADS research stays unchanged.

## Product and competition

Target: Multimodal AI Hackathon 2026 **Track B: Mapping Flood Damage from Space**.
Deadline: October 14, 2026, 11:45 a.m. America/Los_Angeles (October 15, 00:15 IST).
Only one track per team and one submitting team per person. Coding agents are
disclosed tools, not human entrant members. Public GitHub, setup docs, a maximum
six-page report, one-page situation report, attributions and a **three-minute
YouTube demo** are required. Read the official source links in `DATA_POLICY.md`.

The assessment must use Sentinel-1 and Sentinel-2 when available, pre-event OSM
assets, damage/exposure mapping and road connectivity. The chosen AI option is
an English/Nepali situation-report copilot grounded in computed map facts.
Judges can use unfamiliar areas/dates. EMS/UNOSAT damage maps and post-event OSM
must never be inference inputs. They are evaluation references only.

Mapping 30%, AI 25%, settlement isolation 20%, report/Q&A/limits 15%, usability
10%. The user likes the drone concept; keep it a secondary simulation so core
requirements remain visible. No promises of winning or operational rescue utility.

## Existing TADS, and the limitation to preserve

TADS means Trust-Adaptive Decentralized Search. The research models a drone's
Beta belief in tile-level prior reliability, updates it from observations and
shares information on short-range contact. Its acquisition balances prior value,
uncertainty, novelty and separation. Existing research uses xBD annotations and
simulated verification against known ground truth; it is **not a working live
satellite flood detector or real drone vision system**. Do not import xBD,
historical experiment results or hidden truth into the judged mapping pipeline.
Implement a small TADS-inspired simulator with disclosed provenance; if you reuse
code, record its source/license before doing so. Do not modify research folders.

## The UI concept already agreed with the human

One mission canvas with a selected-feature evidence inspector. Show a cached
prior separately from received observations. Internet availability and a drone
radio link are different states. An offline package may support local simulation,
but the operator sees **last known** position during radio loss. Requests can be
queued locally; none is executed without acknowledgement. A report includes only
received evidence. Every scene/detection has source, timestamp and uncertainty.

The earlier inline preview used a 4x4 synthetic training grid with scripted
observations. It was a UX sketch, not final geography, model output, or TADS logic.
Do not rebuild the full product as that grid. Use real sourced geography for the
assessment and clearly labeled synthetic/replay content for tests/simulation.

## Ownership and environment

Your branch: **claude/mission-ui**. Work in the prepared `tads-flood-claude`
worktree, not in Codex's `tads-flood` directory. Run `git status` and verify your
branch before editing. Read `AGENTS.md`; do not switch Codex's checkout.

You own:

- `apps/web/**`: React/TypeScript/Vite, MapLibre map, API client, components,
  styles, offline storage, simulator, Vitest tests, frontend package lock.
- `tests/e2e/**`: Playwright test cases and accessible user flows.
- `docs/UI_SPEC.md`, `docs/CLAUDE_STATUS.md` and frontend CI files.

Codex owns the FastAPI service, geospatial providers, graph analysis, copilot,
backend tests, Python tooling, generated contracts and evaluation. Do not edit
those files to make your fixture pass. Propose shared fixture/contract changes
through a new file in `docs/coordination/` and explain the producer/consumer
impact. Integration is Codex's responsibility after reviewing your ready commit.

Python 3.11+; Node 22+ and npm for the web app. API development origin defaults
to `http://127.0.0.1:8000`; use `VITE_API_BASE_URL`, which may contain only a public
origin. Never expose CDSE/LLM credentials as VITE variables. Configure Vite proxy
for `/api` and `/health`; use fixture mode while Codex builds the service.

Live source update: ohsome v1 metadata is reachable, but legacy geometry
extraction returned 403. Current v2 needs the user's free `OHSOME_API_KEY` and
returns GeoParquet. CDSE/ohsome/LLM credentials remain server-side. This source
dependency does not block your fixture-based map/interface work. Codex's starter
API is running at `http://127.0.0.1:8000`; live mode still fails explicitly.

## First work to perform

1. Read `BUILD_PLAN.md`, `API_CONTRACT.md`, `TEST_MATRIX.md`, `DATA_POLICY.md`,
   `DEMO_PLAN.md` and `fixtures/synthetic/assessment.json`.
2. Record your intended stack and current branch in `docs/CLAUDE_STATUS.md`.
3. Scaffold `apps/web` using React + TypeScript + Vite and npm. Choose a stable
   current dependency set; lock it. Add `dev`, `build`, `test`, and E2E scripts.
4. Create a typed client for the frozen v1 contract. Verify the fixture is accepted
   before building a broad component tree. Keep mock/live paths visibly separate.
5. Implement the required map/assessment flow first. Stop after the first complete
   vertical slice to record a commit, test results and integration instructions.
6. Continue autonomously within your ownership; do not wait for Codex's live data
   to implement offline states, evidence panels or browser tests against fixtures.

## Required product screens and actions

**Prepare assessment:** bbox/map area selection, flood date, live versus clearly
labeled synthetic demo. Validate longitude/latitude order and positive area.
Display processing stages and cancellable loading. Empty, no-data, auth/quota,
failed and cancelled are real states, never hidden behind fixture fallback.

**Assessment workspace:** map dominates. Before/after imagery comparison and
layer toggles for candidate flood/debris, exposed assets, settlement access and
uncertainty. A concise settlement list opens its baseline/post-event route,
candidate cut edge IDs and evidence. `potentially_isolated` is not "confirmed
isolated"; distinguish preexisting disconnection and unknown network coverage.

**Evidence inspector:** source IDs, acquisition/event/receipt timestamps, product
and method versions, measured versus inferred versus simulated labels. Users
can see the source behind a feature and review uncertain evidence. Never offer
"mark safe" just because an operator clicks review. Unknowns remain unknown.

**Report/copilot:** structured factual summary with clickable evidence IDs and
English/Nepali selector. Preserve method and AI/template provenance. Report views
must use backend facts; do not recompute independent totals in the browser.
Show refusals for unsupported requests, download/print the one-page brief, and
include data availability/limitations in that report.

**Optional offline inspection:** package manifest stored in IndexedDB plus
offline basemap/assessment assets, not just cached app chrome. A synthetic mission
is visibly badged everywhere. User can set inspection bounds and choose a modest
exploration preference. Limit controls to meaningful decisions; no real arm/launch.
No online-fetch dependency for cached viewing. Do not fabricate fresh satellite
data or telemetry when offline. Mission overlays never mutate base assessment.

## Simulation requirements

Use a deterministic seeded acquisition calculation for tile selection with
separate hazard prior, trust mean/std, novelty and separation. Initial trust is
uninformed, not a fabricated calibrated percentage. Observations have immutable
IDs and actor IDs; assimilate each local event once. Sharing cannot count an
already-known event twice. A simple shared ID union is safer for this prototype
than claiming the research gossip rule provides perfect probabilistic fusion.

At minimum support internet online/offline separately from link connected/lost,
last-known telemetry, local queued requests, expiry, acknowledgement, observation
sync and deduplication. Drone simulation can execute a preloaded bounded plan
while the UI cannot see new events; after reconnect show event time and receive
time. Return commands are unavailable without a link. Low battery/position-loss
behaviour is simulation policy, not proof of tested flight hardware.

## Design guidance

Calm map-first workspace, strong labels, readable contrast, evidence on selection,
clear pending/error/offline states. Avoid a 3D globe, decorative dashboard tiles,
survivor counts, estimated casualties, "rescue success" scores and general chat.
Use motion only to communicate a changing mission state; honor reduced motion.
Keyboard access to selections, legends and dialogs; no hover-only evidence.
Test widths 320, 768 and 1440 pixels. Touch targets should be usable in the field.

## Tests and completion

Implement all Half B cases in `TEST_MATRIX.md`. Especially: offline reload with a
cached package, no-package state, frozen telemetry during radio loss, event-ID
deduplication, queued command expiry/acknowledgement, strict mode badges, map-source
failure, citation selection, number consistency and basic keyboard access.
Report actual commands, counts and failures in `CLAUDE_STATUS.md`.

Commit small coherent slices and push your branch when each passes. Do not push
directly to main, force-push, merge Codex work, or deploy/publish outside this repo.
Return the ready commit hash, paths, commands, screenshots, contract proposals and
any blockers to the human. The Claude CLI was not found in Codex's shell, so this
handoff is prepared for the human to start you in Claude Code; do not assume a
background Claude process was already launched.
