# Claude: finish UI reliability and presentation

The human requests completion and a focused UI improvement pass while Codex
finishes backend/deployment/submission artifacts. This supplements checkpoint 3.
Keep working only in tads-flood-claude on claude/mission-ui. Fetch and merge
origin/codex/data-engine after preserving local changes. Base is ff611d5 (includes
your 29ff6d1 and cf01ee1). Keep required API-browser CI assertions. No schema bump.

First finish P0 in CLAUDE_NEXT.md: encoded path guard, timeouts through body reads,
report/package scope validation before storage/export and cancellation on unmount.
Those are concrete correctness issues and have priority over visual redesign.

Then improve these UI files, without new features or new packages:
- styles.css, App.tsx: make the workspace readable and deliberate. Tighten the
  400px sidebar, soften borders, use consistent spacing/type, and give the map
  the most space. Keep synthetic/offline/simulation badges visible. Do not add
  a landing page that delays the map.
- AssessmentPanel.tsx, EvidenceInspector.tsx: start with the decision: settlement,
  access status, route and evidence. Use readable labels for cut edges while
  keeping exact IDs accessible. Put technical IDs/methods under details. Show
  missing coverage clearly. A connected route never means safe.
- SceneCompare.tsx: make Before/After the primary map action with dates, active
  state and keyboard focus. Distinguish image availability from layer visibility.
  Add a concise legend; labels must explain grey/nodata/unknown. Do not create
  fake satellite texture or claim the toy image is real.
- ReportPanel.tsx and CopilotPanel.tsx: readable brief width and a clear cited
  report action. Preserve DRAFT Nepali and deterministic/AI labels. Loading,
  retry/cancel, refusal and no-model states should look intentional. Codex is
  adding key-free local Ollama support; the same GroundedReport schema and
  llm_fact_selection generator remain. Do not hard-code ai_configured=false.
- OfflinePanel.tsx/MissionPanel.tsx: keep the simulation secondary and collapsed
  until requested; show received_at, internet state and radio state separately.
  The analyst should reach source-backed assessment/report before mission detail.

Check 320/768/1440px, keyboard navigation, focus visibility, reduced motion and
print preview. Retain all existing tests; add regressions for changed behavior.
Regenerate only screenshots affected by the final UI. Update UI_SPEC and your
owned CLAUDE_STATUS with actual commands/results, remaining failures and ready
SHA. No model/source API keys in UI or client storage.

Ownership update: Codex now owns docs/submission drafts, PDF/export scripts,
Docker/backend deployment and Vercel configuration. Do not edit those in parallel.
Do not modify apps/web/vercel.json or public/submission/ (reserved release assets).
Focus on UI code, tests and storyboard. Shared changes need a coordination note.

Run typecheck, Vitest, build, bundle-secret check, npm audit and Playwright; report
which flows use actual API versus recorded responses. Follow the established
human commit/push workflow. Return the ready commit for Codex integration. Do not
claim real mapping accuracy or real drone capability. Keep scope small enough
for the 09:45 PDT planned freeze in BUILD_PLAN.
