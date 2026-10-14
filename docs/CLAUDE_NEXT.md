# Claude checkpoint 2: connect the completed backend

This is the next authorized task from the user: integrate your pushed UI with
Codex's computed backend, then improve the evidence-led demo. Work in
`/Users/prakharsingh/Documents/TADS_Project/tads-flood-claude` on your own branch.
Your pushed checkpoint is `3b348df`. Codex reviewed it; 38 unit tests, typecheck,
build and bundle secret checks pass, and your GitHub frontend CI is green.
Codex is integrating that checkpoint and owns backend/release verification.

First read `docs/coordination/2026-10-13-backend-runtime.md`,
`docs/API_CONTRACT.md`, `docs/BACKEND_METHOD.md`, and AGENTS.md from the latest
`origin/codex/data-engine`. Fetch that branch and merge it into your branch before
coding (it includes your completed checkpoint once Codex pushes the merge).
Do not switch/edit Codex's worktree or backend files. If your tree has local work,
preserve it first and do not reset/clean it. No API schema bump is required.
The backend runs at 127.0.0.1:8000. No source/model credentials are configured.

## P0 — fix these integration blockers first

- Codex corrected the source-kind mismatch in the INTEGRATION BRANCH: the UI
  fixture/builder now use synthetic kinds, consumer validation matches that rule,
  and declared legacy training scene IDs still display dates. A new backend
  producer-consumer fixture test and frontend regression test pass. Your own
  checkout was left untouched. Merge latest origin/codex/data-engine to inherit
  this correction before starting further UI work; review it, do not weaken it.
  The integration branch also fixes package-ID collisions with UUIDs and closes
  test DB connections. Retain those corrections during your binary-package migration.
- `npm audit --json` reports eight findings (three critical, three high, two
  moderate) in the pinned dependency tree, including production MapLibre and dev
  Vite/Vitest/Playwright. Upgrade your owned package.json/lockfile to supported
  patched versions after reading upstream release/migration notes. Do not blindly
  run audit fix --force: npm's suggested Vitest/Vite patch versions still overlap
  some listed advisory ranges. Re-run audit, typecheck, units, build, secret checks
  and browser tests. Record any genuinely unresolved advisory and exposure.
  Codex has not changed frontend dependencies/lockfile; it made only the recorded integration provenance correction.

## P0 — files to develop after those fixes

1. `apps/web/src/api/client.ts`, `apps/web/src/api/contract.ts`, `App.tsx`,
   `components/PreparePanel.tsx`: load `GET /api/v1/demo/geographic` as the computed
   API synthetic demo, keeping the original empty API demo as a legacy test path
   and the bundled UI fixture as a clearly separate option. Read readiness without
   presenting configured=true as tested or accepting keys in browser forms.
   Add typed package/asset and grounded-report parsing from the generated contract.

2. `apps/web/src/map/MapView.tsx`, new `components/SceneCompare.tsx`,
   `domain/assessment.ts`: show actual before/after radar image sources from
   `/assessments/{id}/package`. Use manifest four-corner coordinates, role,
   checksums and transparent nodata. Build one useful before/after control or
   slider with acquisition dates; never substitute colored polygons for imagery.
   Synthetic sources have kind=synthetic, so infer scene display using asset role
   and source metadata rather than filtering them out by sentinel kind.
   Style unknown roads separately. Facility points use kind=facility and should
   open feature/facility evidence, not an absent settlement result. Hospital
   polygons can also exist in buildings. Keep exact edge-ID route/cut highlighting.

3. `apps/web/src/offline/packageStore.ts`, `OfflinePanel.tsx`, `public/sw.js`:
   cache the backend manifest's EXACT assessment snapshot and PNG bytes. Hash
   bytes from `/snapshot`, not JSON.stringify(assessment). Verify all hashes
   before committing an IndexedDB transaction and again before opening. Use
   ArrayBuffer/Blob storage, version/migrate the old browser-package-1 format
   without silently invalidating user data, and revoke image object URLs when
   replacing packages/unmounting. Offline reload must show both images and keep
   source timestamps, original mode and separate mission data. Network loss never
   means drone radio loss. Do not cache API failures as successful assets. Limit
   service-worker cache cleanup to the app's own cache prefix.

4. New `apps/web/src/components/CopilotPanel.tsx`, `ReportPanel.tsx`:
   call POST `/assessments/{id}/copilot` with question/language. Show typed claims,
   exact evidence links, refused/unavailable/error states and generator/model.
   Never answer locally or label a deterministic preview as AI. Switch briefing
   preview to `/brief` where useful; Nepali has translation_reviewed=false and
   must show a visible draft badge. Keep existing reviewed `/report?language=ne`
   not-ready behavior. Provide print/download using backend-derived content.
   Namespace question/results by assessment; avoid displaying an old response
   after switching areas. Treat source/OSM strings as text, never raw HTML.

## Acceptance tests to add

- Computed geographic API demo loads populated map layers and exact route/cut IDs.
- Before/after uses PNG bytes and manifest corners; both acquisition dates remain
  visible; empty/404 asset lists show unavailable; unknown coverage stays unknown.
- Facility selection resolves evidence; unknown roads have distinct presentation.
- Snapshot bytes that differ from JS serialization still pass the server hash;
  tampered PNG/snapshot fails; quota/partial-download failure commits no package.
- Real browser offline reload restores the exact package, both images and mission
  state; changing scene/assessment revokes old URLs; old packages migrate/refuse
  clearly without mixing data.
- Copilot request sends selected assessment/language; 503 no-key, refusal,
  malformed response, stale response, and citation click all behave correctly.
- Deterministic template, actual AI path, synthetic/live/cached channel and draft
  Nepali labels remain distinct. No API key in bundle/storage.
- Keyboard comparison and copilot controls, reduced motion and 320/768/1440 widths.

Use backend mocks for deterministic failure cases, plus an integration browser
flow against the running real backend's synthetic pipeline. Report which checks
use interception and which use the actual local API. Do not claim a credentialed
AI or real satellite run; Codex will own those gates when credentials are supplied.

## P1 — demo polish after P0 passes

Prioritize one decision: inspect a candidate road cut, verify its sources, see
whether an alternate facility route remains, then export a cited brief. Reduce
technical prose in the product UI; keep deep details in the evidence inspector.
Make exposure, missing coverage and timestamps easy to read. Avoid extra drone
widgets or speculative telemetry; retain the separate simulation badge.
Produce a short storyboard in `docs/DEMO_STORYBOARD.md` and screenshots for the
existing three-minute DEMO_PLAN, including an honest unavailable-source state.

Run typecheck, Vitest, build, check:secrets, Playwright. Update your owned
CLAUDE_STATUS.md with actual commit, command results, integration changes and
remaining gates; its current 'not yet committed' text is stale after 3b348df.
Commit/push your next checkpoint and report its SHA. Shared schema changes need
a written proposal before incompatible fields are introduced.
