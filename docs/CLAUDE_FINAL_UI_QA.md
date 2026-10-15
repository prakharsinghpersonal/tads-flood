# Claude final UI QA: recorded real case and demo rehearsal

The human explicitly authorizes side-by-side work. Your ready checkpoint 830eec8
is merged in Codex's checkout. Continue only in tads-flood-claude/claude/mission-ui.
Preserve the current CLAUDE_STATUS edits. Do not merge through uncommitted work,
reset, stop Codex services, read .env, or call live providers/models.

Codex is fixing the last HTML export scope and cached metadata agreement checks,
then completing backend/integration/PDF/deployment/submission artifacts. This task
is deliberately separate. Schema stays 1.0.0; pipeline fingerprint is v1.4.

## Supplied real recording

Read ../tads-flood-handoff/live-ui-recordings/README.md and recording-manifest.json.
There are 19 credential-checked files exported from immutable actual result
live-c9157aa9850da3ddb9bb20f2. GET routes/statuses/content types and exact-byte hashes
are mapped in the manifest. No new provider/model call occurred in this export.

Real case: Syapru Besi, bbox [85.3232,28.149117,85.348268,28.188188],
event 2026-08-26. Actual radar dates: 2026-08-16 and 2026-08-28; matching
relative orbit 85/ASCENDING, VV. Output: 41.8% valid coverage, 3,559m2 candidate
flood, 11 candidate-exposed assets, ZERO potentially isolated, TWO unknown-access
settlements. Do not imply the zero proves that access is safe. Actual English
and Nepali past copilot answers selected approved summary/isolation/unknown facts.
Nepali remains DRAFT. The official Landslide comparison is poor: IoU 0.0057,
F1 0.0114 with 43.6% joint reference coverage; no strong damage-map claim.

## Owned files for this pass

- NEW tests/e2e/recorded-live.spec.ts and an optional local recording helper.
- docs/UI_SPEC.md, docs/DEMO_STORYBOARD.md, docs/CLAUDE_STATUS.md.
- NEW docs/demo/screens/11-recorded-live-overview.png,
  12-recorded-live-evidence.png, 13-recorded-live-brief.png.
- styles.css only if an actual viewport/focus/print defect is reproduced; keep
  any correction small and record it. Otherwise QA without redesigning.

Do not edit api/**, offline/packageStore*, App.tsx/App.test.tsx, backend,
contracts, scripts, deployment/vercel/public/submission or docs/submission.
Codex is editing some of those now. Record other component defects for review.
Do not commit copied raw source/reference archives or these recording files.

## Tasks in priority order

1. Create an opt-in browser test loading recordings from
   TADS_LIVE_UI_RECORDING_DIR (absolute directory), with an explicit local skip
   when absent. Do not weaken REQUIRE_LOCAL_API or existing CI/integration tests.
   Use the hashed manifest for GET interception. If UI entry needs a simulated
   completed job, identify that job wrapper as a constructed test response.
   The underlying snapshot/PNGs/briefs must be the original recorded bytes.

2. Verify LIVE and acquisition dates, real source kinds, decoded PNGs at manifest
   corners, candidate/unconfirmed wording, 41.8% coverage and TWO unknown access
   versus ZERO predicted isolation. Ensure source/evidence selection stays in
   this assessment. No synthetic fallbacks. Test the supplied case at
   320/768/1440px and finish the basic keyboard path without horizontal clipping.

3. Save/open/reload offline with the same snapshot and PNGs. Preserve LIVE as
   original input mode and distinguish current offline channel. Check EN brief
   and expected reviewed-NE report 501; unreviewed NE must retain DRAFT in print.
   Capture map/evidence/brief frames using the exact recorded case, with captions
   in DEMO_STORYBOARD explicitly saying recorded real-mode output.

4. If testing copilot display, replay ONLY the supplied exact past question and
   language, using copilot-en/ne.json. Other questions must not receive that
   answer. Label this as recorded actual-model output / mocked transport, never
   as new model execution. No fresh AI access is required for your pass.

5. Rehearse the UI actions in ../tads-flood-handoff/DEMO_SCRIPT.md without
   editing it. Report a short timing/action checklist and any blocker. Keep
   the real unknown-access case distinct from the synthetic road-cut example.
   Do not record an invented real isolation route or claim real drone flight.

## Verification and handoff

Run npm run typecheck, npm test, npm run build, npm run check:secrets and npm audit.
Run the existing browser suite; separately run the new opt-in recorded test:

    TADS_LIVE_UI_RECORDING_DIR=/Users/prakharsingh/Documents/TADS_Project/tads-flood-handoff/live-ui-recordings npm run test:e2e -- recorded-live.spec.ts

Use your own available browser port. No current service may be stopped to free
one. Document actual local API vs recorded real case vs synthetic/mocked cases,
commands/results/skips, viewport/keyboard/print findings and remaining defects in
CLAUDE_STATUS. Follow the established human commit/push workflow and return the
ready SHA. Do not claim overall submission-ready status: fluent Nepali review,
final video upload, optional deployment and human eligibility/submission remain.
