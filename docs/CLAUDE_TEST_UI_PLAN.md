# Claude testing and UI completion plan

## Mission and current state

The human explicitly requests a testing and UI improvement plan while Codex
completes backend, live validation and submission artifacts. Work in
`/Users/prakharsingh/Documents/TADS_Project/tads-flood-claude`, branch
`claude/mission-ui`. Your checkpoints 29ff6d1/cf01ee1 are integrated.
Starting Codex checkpoint: d76b8fd. Resolve the latest origin/PKS/data-engine
only at a clean checkpoint. Your worktree currently has UI edits in progress:
continue them, preserve all changes, and do not merge through uncommitted work.
Do not reset/clean. Codex will integrate your ready checkpoint and run both suites.
Read AGENTS.md, API_CONTRACT.md, UI_SPEC.md, CLAUDE_NEXT.md and CLAUDE_UI_POLISH.md.

Measured baseline: 110 backend tests, 61 frontend tests, 20 browser tests; original
required-API integration and new hosted-replay browser flow pass locally. Codex
has now executed real S1/DEM and authenticated historical OSM: both providers
passed; a small live pipeline run completed. Installed local llama3.1:8b passed
four actual model selection/refusal checks on synthetic input; a fifth casualty
injection is refused in code. Nepali language review remains pending. The same
GroundedReport/schema 1.0.0 contract is used; no UI rewrite for a local model.
Do not assume readiness is always false. Never read .env or provider credentials.

Latest real evidence: Syapru Besi, 2026-08-26, completed on pipeline v1.4 in
7.919 seconds before AI: 41.8% valid coverage, 3,559 m2 candidate flood,
11 candidate-exposed assets, zero potentially isolated settlements and two
unknown-access settlements. The separate Timure area/date also executed.
The official EMSR927 AOI01 reference is Landslide. Our combined flood/disturbance
proxy has IoU 0.0057 and F1 0.0114 over jointly valid coverage: a poor result.
Do not imply successful debris mapping or turn zero predicted isolation into
an assurance of access. Keep the synthetic route-cut example visibly separate.
Codex supplies 19 files in `../tads-flood-handoff/live-ui-recordings/`, including
exact snapshot/package bytes, both PNGs, source details, EN/NE briefs, EN report,
the expected NE report 501, and recorded actual-model answers. Read its
`recording-manifest.json` for GET route/status/file mappings and SHA-256 checks.
Copilot JSON is evidence of a past answer, never a fresh answer to any question.
These are recorded
real-mode responses for UI tests, not new live source/model execution.

The product answers one decision: which mapped settlement may lose facility
access, what road cut causes it, what sources support it, and what is uncertain?
The mission remains a separate simulation. No decorative counters, invented
satellite textures, survivor detection, safe-route declarations or new packages.

## Order of work

### A. Reliability first (blocking)

Owned files: api/contract.ts, api/client.ts, offline/packageStore.ts,
CopilotPanel.tsx, ReportPanel.tsx and their tests.

| Case | Reproduce | Required result |
|---|---|---|
| T01 | /api/v1/%2e%2e/%2e%2e/health | Reject before fetch; browser-normalized path must stay in API namespace |
| T02 | Encoded separators/dot segments, malformed escapes, repeated ? | Reject; legitimate encoded source IDs still work |
| T03 | Headers arrive; body stalls | Deadline expires, readable error, no indefinite spinner |
| T04 | Cancel during PNG/JSON body read | Abort body and clean listeners/timers; no partial package |
| T05 | Copilot cold start can take ~44sec locally | Use a bounded model-request deadline (e.g. 90sec) rather than generic 20sec; cancel stays usable |
| T06 | Wrong-ID/mode/language 200 brief/report | Reject before display, export and offline transaction |
| T07 | Invalid JSON/duplicate roles/manifest mismatch | Abort entire save; expected reviewed Nepali 501 remains recorded unavailable |
| T08 | Altered bytes/metadata on reopen | Verify hashes, sizes, source/time/scope; refuse inconsistent package |
| T09 | Malformed legacy row during migration | Leave old package untouched, show a clear integrity error |
| T10 | Change area/tab/language while asking/exporting | Abort/discard old response; never download it under a new area ID |

Add realistic signal-aware client tests and package regressions; do not merely
mock the implementation's happy path. Retain UUID IDs and closed DB connections.
API scope/mode guards must not be weakened to make fixtures pass.

### B. Focused UI improvements

1. App/styles: consistent spacing and typography, calmer borders, clearly active
   tabs, strong keyboard focus. Give the map the most space. Preserve synthetic,
   offline, partial coverage and simulation labels at every viewport size.
2. Assessment: lead with settlement access and candidate cut evidence. Use short
   human-readable labels; exact IDs stay available in details. A connected mapped
   route is never labelled safe. Make no-facility/missing-data states explicit.
   Keep zero predicted isolation distinct from two unknown-access settlements;
   visibly surface the low valid coverage in the actual case recording.
3. SceneCompare: Before/After is the primary map control, with both dates and a
   clear legend. Missing imagery differs from a hidden layer. Grey pixels and
   unknown roads must be explainable. Keep nodata transparent and manifest corners.
4. EvidenceInspector: show source/date and the route consequence first; put long
   method/cache fields in expandable details. Citation clicks and exact edge
   highlights must remain accessible without a mouse.
5. Report/Copilot: readable report width, visible cited brief action, intentional
   loading/refusal/retry/cancel states. Label generator/model correctly. Nepali
   stays DRAFT when translation_reviewed=false. Preserve backend-derived numbers.
6. Offline/Mission: keep mission secondary and collapsed by default; separate
   internet and radio states, original acquisition time and last receipt time.
   No moving received telemetry during loss; commands wait for acknowledgement.

### C. Verification matrix

| Check | Expected evidence |
|---|---|
| Synthetic computed demo | Populated layers, both decoded radar images, accurate source/date references |
| Real-mode recorded response | LIVE/source kinds preserved; identify recording in test evidence; no synthetic substitution on failure |
| Route/cut/facility selection | Correct IDs highlighted and corresponding evidence opens |
| EN/NE report | Map/report quantities agree; citation navigation; NE draft visible in print/export |
| Local AI response | Same typed schema as cloud; correct model label, refusal and malformed/stale states |
| Offline reload | Exact snapshot/PNGs/documents survive; initial mode/timestamps retained |
| Mission radio loss/reconnect | Last-known telemetry freeze, queued/expired commands, exactly-once event sync |
| 320/768/1440px | No horizontal clipping; controls/inspector remain reachable |
| Keyboard/reduced motion | Essential task flow completes with Tab/Enter/Space; visible focus; no required animation |
| Storage quota/corruption | No partly committed package; recoverable and honest error |
| Required real API flow | Executes against Codex's temporary API with no interception; cannot skip |

Run from apps/web: npm run typecheck; npm test; npm run build;
npm run check:secrets; npm audit; npm run test:e2e.
Codex's `python scripts/check_integration.py` supplies a fresh credential-free API
for a required browser test. `--hosted-replay` checks the reserved Vercel demo
handler. Do not modify those runners or use them to issue paid/live provider calls.
Use recorded sanitized real-mode responses only after Codex supplies them.
Report which cases use actual API versus fixtures/interception. Do not count a
fixture test as geographic validation or a mocked response as actual AI execution.

## Ownership and delivery

Claude owns UI/components/styles, frontend unit/E2E tests, UI_SPEC, storyboard,
and CLAUDE_STATUS. Codex owns backend/providers/evaluation, deployment files,
apps/web/api, apps/web/deployment, apps/web/vercel.json, public/submission, report
and video/export scripts, and docs/submission. Do not edit those in parallel.

Keep shared interface changes additive and write a coordination note first.
Re-record only screenshots affected by the final UI. Do not push/commit if your
local instructions reserve those actions for the human. Leave a precise ready
file list and measured results in CLAUDE_STATUS, then return the ready SHA through
the established human workflow. Codex will review both suites before integration.

Suggested timebox: reliability 60-90min; focused polish 45-60min; verification and
handoff 30min. Planned freeze is 09:45 PDT on October 14 (see BUILD_PLAN).
Do not spend time on a new landing page, 3D map or speculative flight features.

## Ready handoff checklist

In CLAUDE_STATUS, list T01-T10 as pass/fail/pending with the test file and assertion
that proves each result. Record exact command results and any skipped case.
Include viewport/keyboard/print findings and the affected screenshot names.
Distinguish actual local API, recorded real-mode, and synthetic/mocked cases.
List interface changes (or state none), remaining defects and all changed files.
Follow the human's existing commit/push workflow; return the ready SHA. Do not
call the project submission-ready while Nepali review/video/deployment checks
and human submission remain open. Codex's new testing/UI plan supersedes the
older submission-writing assignment in CLAUDE_NEXT.md.
