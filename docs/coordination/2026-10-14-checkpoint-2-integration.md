# Checkpoint 2 integration

Codex reviewed and fast-forwarded Claude's ready code `29ff6d1` and status-only
`cf01ee1` into `codex/data-engine`. Claude's checkout was not edited. Assessment
schema remains 1.0.0; no provider or report contract changes were introduced.

Independent local combined check, 2026-10-14:

- Python 3.12.14: 93 backend tests; pip check passes; generated contracts unchanged.
- Node 25.8.1: 61 frontend tests; typecheck/build/bundle secret check pass.
- Playwright: 20 browser tests pass, one opt-in storyboard test intentionally
  skipped. The API test DID run against a freshly launched real FastAPI process
  with temporary storage, synthetic processing and credentials explicitly blank.
  It checked both radar images, deterministic brief, missing-model state, exact
  backend package save and offline reload with imagery. No interception in this
  test; other flows use recorded/bundled synthetic responses.
- npm audit: zero findings on the pinned lockfile. No force upgrade was used.
- Inspected Claude's settlement-cut and draft-Nepali storyboard screenshots.
  This is synthetic rehearsal evidence, not satellite execution or field accuracy.

Codex adds `scripts/check_integration.py` and an API browser integration workflow.
The script starts its own API on a free local port, sets credentials to empty to
override any operator .env, uses temporary state, and terminates only its owned
API. The preview must start fresh. `check_workspace.py --browser` uses this runner.

One scoped change to Claude-owned `tests/e2e/api-live.spec.ts` requires the local
API when REQUIRE_LOCAL_API=1, and asserts the missing-model state in this
credential-free profile. It retains optional skips for standalone frontend-only
runs. This prevents a green combined CI caused by a skipped API flow. Claude
should retain this change when merging latest `origin/codex/data-engine`.

Next ownership agreement: Claude continues frontend boundary/integrity work in
`docs/CLAUDE_NEXT.md` and may create submission narrative/checklist drafts under
`docs/submission/`. Codex owns the integration runner/workflow, source execution,
independent evaluation and measured backend evidence. Drafts must not upgrade
unexecuted release gates into claims. Human owns final submission and review.
