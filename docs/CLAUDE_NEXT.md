# Claude checkpoint 3: boundary checks and submission drafts

**Superseded assignment:** follow `CLAUDE_TEST_UI_PLAN.md` for the current testing
and UI pass. Codex now owns `docs/submission/**`, deployment files and exports.
The historical baseline and absent-credential statements below describe the
earlier checkpoint; current real-source/model results are in `STATUS.md`.

## Context and starting point

Your code `29ff6d1` and status update `cf01ee1` have been reviewed and integrated
on `codex/data-engine`. Independent combined checks: 93 backend tests, 61 web
unit tests and 20 browser tests pass; the opt-in storyboard test is skipped.
The actual API browser flow ran against fresh FastAPI with temporary storage,
synthetic geographic inputs and no interception. npm audit reports zero findings.

Work only in `/Users/prakharsingh/Documents/TADS_Project/tads-flood-claude` on
`claude/mission-ui`. Fetch and merge latest `origin/codex/data-engine` before
editing. Preserve any local work; no reset/clean or branch switches in Codex's
checkout. Codex has pushed additive integration verification, shared status
and this assignment. Retain `REQUIRE_LOCAL_API=1` in `tests/e2e/api-live.spec.ts`:
the combined runner now starts a temporary API and must fail if it is unreachable.
Codex owns `scripts/check_integration.py` and the integration workflow.

Read AGENTS.md, docs/API_CONTRACT.md, docs/BACKEND_METHOD.md,
docs/coordination/2026-10-14-checkpoint-2-integration.md and docs/DATA_POLICY.md.
Schema 1.0.0 remains frozen. No credentials are present. Local combined app is
at 127.0.0.1:5175, API at 127.0.0.1:8000. Use another free web port for your own
process and do not stop someone else's server. A configured flag is not proof
of execution. Both agents are coding tools, not registered human teammates.

The core decision stays: satellite candidate change -> exposed road -> lost
mapped facility route -> potentially isolated settlement -> cited brief.
Drone mission remains separate simulation; do not add flight widgets or claim
survivor detection, actual closures, rescue outcomes or a winning score.

## P0: finish the frontend boundary checks

These are review findings for your owned files. Keep fixes small and test the
failure before the correction. They do not require a new API/schema.

1. `apps/web/src/api/contract.ts` and its tests: fix path canonicalisation.
   Codex executed your function and reproduced this:
   `isSameOriginApiPath('/api/v1/%2e%2e/%2e%2e/health')` returns true, while the
   browser normalises it to `/health`. Validate the effective URL path, encoded
   dot segments/separators, malformed percent escapes and repeated query delimiters.
   Allow legitimate percent-encoded assessment/source identifiers. Keep downloads
   restricted to the same-origin API path; reject external and protocol-relative
   URLs before fetching. Test allowed backend paths and encoded traversal cases.

2. `apps/web/src/api/client.ts`, new `api/client.test.ts` if useful: timeout and
   cancellation currently end after response headers, before text/arrayBuffer is
   read. Keep them effective through the body and clean them up on every path.
   Test a response that delivers headers but stalls its body, cancellation during
   a PNG download, interrupted bodies and normal completion. No unhandled rejected
   promises or indefinite save spinner. Use realistic signal-aware doubles.

3. `apps/web/src/offline/packageStore.ts`, its tests, `api/client.ts`:
   validate JSON documents BEFORE the all-or-nothing transaction. Currently
   reports/briefs are hashed and saved before their schema/scope is checked on
   open. Require the expected assessment ID, mode and requested language; malformed
   or wrong-scope 200 responses abort the whole save. The expected reviewed Nepali
   501 remains an unavailable document, not a failed whole package. Validate manifest
   version/mode against the snapshot, unique asset roles/IDs, byte lengths and
   raster source/time metadata on reopen as well as download. Never rewrite the
   cached assessment from mission state. Keep legacy migration lossless and do
   not rewrite malformed legacy rows before all validation has passed. A checksum
   detects changed bytes; it is not proof that the source is trustworthy.

4. `components/CopilotPanel.tsx`, `ReportPanel.tsx`, `App.test.tsx`:
   abort pending model requests when the panel unmounts/assessment changes.
   Reject wrong-assessment, mode or language reports at the client boundary,
   including export paths. Preserve the no-model/refusal/draft labels and current
   stale-response guard. Test switching areas while a body/download is pending.
   Never allow an old report to be printed/downloaded under the new area ID.

Add a focused browser case only where unit tests cannot verify browser behavior.
Retain existing package SHA, quota, migration, scene URL lifecycle, mobile,
radio-loss and actual-API integration checks. Avoid redundant screenshots/tests.

## P1: create the submission narrative after P0

You may create the following SHARED draft files; Codex records this ownership
assignment in the coordination note. Do not edit backend thresholds or contracts.

- `docs/submission/TECHNICAL_REPORT.md`: write a concise report matching the six
  sections in DEMO_PLAN.md, with actual method versions/thresholds from
  BACKEND_METHOD.md and honest limitations. Distinguish radar brightening from
  validated debris segmentation. Separate synthetic/mock engineering evidence
  from pending independent mapping metrics. Mark unavailable reference/holdout
  and real AI results explicitly; do not invent IoU/F1, latency or memory figures.
  Keep the prose compact enough for a future maximum-six-page rendered report.
- `docs/submission/DEMO_SCRIPT.md`: three-minute narration with timestamps and
  action cues, centered on one road/facility decision. Link current storyboard
  frames. Include an honest synthetic rehearsal version and clearly marked slots
  for actual source/model/evaluation evidence once Codex supplies it. If no real
  run is available, say so; never narrate recorded synthetic frames as a disaster.
- `docs/submission/DEVPOST_DRAFT.md`: problem, what it does, how it was built,
  challenges, completed achievements, limitations, next steps, Built With and
  AI-assistance disclosure. Do not call unsupported drone capability completed.
- `docs/submission/DELIVERY_CHECKLIST.md`: exact artifacts, link/status slots and
  human-owned final steps. Include public repo, setup, video <=3min, technical
  report <=6pages, generated one-page brief, attributions, actual-run evidence,
  reference/holdout gates, Nepali review and organizer eligibility clarification.

Keep drafts visibly drafts. Use source attribution already verified in
DATA_POLICY.md; Codex owns any new technical verification. Do not contact
organizers, publish video, deploy or submit Devpost automatically. No new external
service is needed. Markdown drafts are sufficient for this checkpoint; final
rendering/page-count verification follows when the evidence is complete.

## Verification and handoff

Run your typecheck, Vitest, production build, bundle secret check, npm audit and
Playwright. For a required actual-backend flow, use Codex's integration runner
with an installed Python environment; do not change it to silently skip.
Report which tests use the real local API and which use interception.

Update only your owned docs/CLAUDE_STATUS.md with changed files, results, known
failures and ready checkpoint. Commit/push using the established human workflow
if your local instructions reserve Git writes to the human; otherwise follow
those local instructions. No force push. Send the ready SHA to the human for
Codex integration. Do not claim all release gates pass from test counts.

Codex continues source/provider execution, independent reference evaluation,
backend measurements and combined CI. Credentials/model access, reference-case
verification and fluent Nepali review remain unresolved. Planned code freeze is
2026-10-14 09:45 PDT, before the deadline recorded in BUILD_PLAN.md; prioritize P0
and a truthful draft over new features.
