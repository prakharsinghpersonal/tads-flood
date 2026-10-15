# Claude status

Branch `claude/mission-ui`, worktree `tads-flood-claude`.

## Checkpoint 3 (2026-10-14): reliability T01–T10 and focused UI

Base: fast-forward to `d76b8fd` (`origin/PKS/data-engine`, includes `29ff6d1`
and `cf01ee1`); the tree was clean, nothing was reset or discarded. **Commit
hash: recorded by the human after committing** (Claude does not run git
commit/push here). No Codex-owned file was edited: not `scripts/`, `services/`,
`apps/web/vercel.json`, `apps/web/api`, `public/submission` or `docs/submission`.
`CLAUDE_NEXT.md`'s P1 submission drafts were not written; the newer ownership
note assigns `docs/submission` to Codex. The `--hosted-replay` check named in
the plan does not exist in `check_integration.py` at `d76b8fd`, so it was not run.

### Reliability cases (each test fails on the checkpoint-2 code and passes now)

| Case | Fix | Tests |
|---|---|---|
| T01/T02 | `isSameOriginApiPath` validates the browser-normalised URL and refuses changed paths (`%2e%2e`), decoded dot segments (incl. via encoded `/`), backslashes, controls, malformed escapes and repeated `?`/`#`; encoded IDs stay valid | `api/paths.test.ts` (6 allowed, 20 refused) |
| T03/T04 | One deadline and one cancel cover headers *and* body; the body read is raced against abort and its stream cancelled; timers/listeners always released | `api/client.test.ts`: stalled body, abort-ignoring body, cancel mid-PNG (timer count 0), pre-aborted, interrupted body, normal completion |
| T05 | Copilot deadline 90 s (generic 20 s); cancel usable | `client.test.ts` fake-timer test at 45 s / 90 s |
| T06 | `checkReportScope` (ID, mode, language) for brief, report, copilot in the client | `client.test.ts`, `App.test.tsx` |
| T07 | Package save validates every JSON doc (schema + scope), manifest/snapshot ID, mode and schema, and unique image roles before the single transaction; reviewed-Nepali 501 still recorded as unavailable; user cancel saves nothing | `packageStore.test.ts` (invalid JSON, wrong ID/language/mode, bad report, duplicate roles, mode mismatch, 501, cancel mid-PNG) |
| T08 | Reopen checks byte length, hash, manifest↔snapshot ID/mode/schema, raster role/type/provenance, document scope, cached/unavailable consistency | `packageStore.test.ts` (size, same-length tamper, metadata, re-hashed wrong-scope brief, mode) |
| T09 | Legacy v1 converted and fully verified in memory before any write; malformed rows leave the v1 package byte-for-byte untouched | `packageStore.test.ts` |
| T10 | Copilot aborts on unmount/area switch; HTML export abandoned on area/language change and never downloaded under the new ID; export cancel; package save cancel | `App.test.tsx` (4 cases) |

### Focused UI (no new features or packages)

Settlement access first; readable cut names with exact IDs; "Mapped route
remains" (not a safety rating); no-facility notice; method notes collapsed;
primary on-map Radar control (Before/After with dates, hidden vs unavailable,
legend); inspector leads with status, consequence and source date, with IDs,
method and timestamps under details; report width and retry/cancel; simulation
collapsed and off the map until opened, internet and radio badges separate,
observed and received telemetry times. 300–360 px sidebar, softer borders,
stronger focus ring. All ten storyboard frames regenerated from the final UI.

### Results (final tree, from `apps/web` unless noted)

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` | 6 files, **116 passed**, 0 failed |
| `npm run build` | pass (app JS 1.36 MB / 377 kB gzip; MapLibre worker 0.51 MB) |
| `npm run check:secrets` | pass, 40 files |
| `npm audit` | **0 vulnerabilities** |
| `npm run test:e2e` | **21 passed**, 1 skipped (opt-in storyboard) |
| `.venv/bin/python scripts/check_integration.py` (repo root) | **1 passed**: fresh credential-free API, `REQUIRE_LOCAL_API=1`, no interception |
| `DEMO_SCREENS=1 npm run test:e2e -- --grep storyboard` | 1 passed, 10 frames |

The integration runner needs `rasterio`. It used a git-ignored `.venv` in this
worktree, created from `requirements.lock` with Python 3.12. Codex's venv and
`.env` were not used or read.

**Real API vs fixtures:**
- **Real local API, no interception:** `api-live.spec.ts`, run through
  `check_integration.py`.
- **Recorded backend bytes, intercepted:** `geographic.spec.ts` (including
  print media), `demo-screens.spec.ts`.
- **Bundled fixture:** `workspace.spec.ts`, `offline.spec.ts`.
- **Unit tests:** a fetch double built from the same recordings (`src/test/fakeApi.ts`).

**Not claimed:**
- The LIVE-mode check uses a *constructed* live assessment; Codex has not yet
  supplied a sanitised real-mode recording.
- The "AI answer" tests use a mocked `llm_fact_selection` / `llama3.1:8b`
  response; no model ran in these tests.
- No fixture test is geographic validation.

### Ready file list (checkpoint 3)

`apps/web/src/{App.tsx,App.test.tsx,styles.css}`,
`apps/web/src/api/{client.ts,contract.ts,client.test.ts,paths.test.ts}`,
`apps/web/src/components/{AssessmentPanel,CopilotPanel,EvidenceInspector,MapRadarControl,ReportPanel,SceneCompare}.tsx`,
`apps/web/src/domain/assessment.ts`, `apps/web/src/map/MapView.tsx`,
`apps/web/src/mission/MissionPanel.tsx`,
`apps/web/src/offline/{OfflinePanel.tsx,packageStore.ts,packageStore.test.ts}`,
`apps/web/src/test/fakeApi.ts`,
`tests/e2e/{helpers,geographic.spec,offline.spec,demo-screens.spec}.ts`,
`docs/{UI_SPEC,DEMO_STORYBOARD,CLAUDE_STATUS}.md`, `docs/demo/screens/*.png`.

### Remaining gates (Codex/human)

- A real-AOI recording to replace the synthetic storyboard frames.
- A sanitised real-mode response for a LIVE UI regression.
- A fluent Nepali review.
- Hosted-replay and deployment checks (Codex-owned).

---

## Earlier checkpoints

- Checkpoint 1: `3b348df` (pushed). Codex reviewed and integrated it.
- Checkpoint 2 (2026-10-14): built on `e9fc50a` (fast-forward of
  `origin/PKS/data-engine`, which contains `3b348df` plus Codex's backend and
  its frontend integration fixes). **Ready commit `29ff6d1`** (pushed to
  `origin/claude/mission-ui` by the human).
- No Codex-owned file was edited. Untracked copies of four handoff docs that
  blocked the fast-forward were moved, not deleted, to
  `../tads-flood-claude-untracked-backup-20261013/`; all were older drafts of the
  committed versions (compared line by line).

## Codex corrections retained

Reviewed and kept unchanged: synthetic assessments must use synthetic source
kinds (consumer validation and UI fixture/builder), legacy `synthetic-s1-*`
scene IDs still list dates, UUID package IDs, and test DB connections closed on
reset. The binary package migration keeps UUID IDs.

## P0: dependency upgrade (audit gate)

`npm audit` before: 8 findings (3 critical, 3 high, 2 moderate). After: **0**.

| Package | Was | Now | Reason |
|---|---|---|---|
| maplibre-gl (prod) | 4.7.1 | 6.11.2 | GHSA-jrc7-96c5-q579 (XSS sanitizer bypass, ≤6.4.0). 6.11.2 chosen over 6.14.0 (2 days old). |
| vite | 5.4.11 | 7.3.7 | dev-server advisories ≤6.4.2; Vite 8 skipped (new Rolldown major) |
| vitest | 2.1.8 | 4.1.11 | GHSA-9crc / GHSA-5xrq / GHSA-82fw (fixed ≥4.1.11) |
| @vitejs/plugin-react | 4.3.4 | 5.2.0 | Vite 7 support (6.x requires Vite 8) |
| @playwright/test | 1.49.1 | 1.63.0 | GHSA-7mvr (browser download TLS) |
| @types/node | 22.10.1 | 22.20.5 | Vite 7 peer range |
| @types/geojson | (transitive) | 7946.0.16 | MapLibre 6 no longer exposes the global type |

Migration work from upstream notes (MapLibre 5.0.0/6.0.0 breaking changes):
ESM-only namespace import; WebGL2 required; the worker now loads from a URL
next to the library, which does not exist in a bundle, so Vite bundles it
(`?worker&url`, ES format) and `setWorkerUrl` receives the emitted file. That
uncovered two real offline bugs, both fixed: the worker was not precached, and
precached module scripts missed on `Vary: Origin` (offline start after a single
visit loaded only HTML). The service worker now precaches the build's
`asset-manifest.json`, matches with `ignoreVary`, and cleans only its own
`tads-flood-shell-` caches. No unresolved advisory remains.

## P0: integration delivered

- **API:** `/demo/geographic` is the main demo; legacy `/demo` and bundled fixture
  are separate, labelled options. Typed zod parsing for `AssessmentPackage`,
  `RasterAsset`, `GroundedReport`, copilot request, readiness. Byte fetches are
  restricted to same-origin `/api/v1/...` paths (no `..`, no `//`, safe query).
- **Radar:** `SceneCompare` + MapLibre image sources at manifest corners; PNG
  SHA-256 and asset→source provenance verified; both dates visible; Before/After/
  Hide and opacity, keyboard operable; unavailable/error states; object URLs revoked.
- **Map:** unknown roads dotted purple; facility points (`kind: facility`) open a
  facility view; exact edge-ID route/cut highlighting kept.
- **Packages (`browser-package-2`):** exact `/snapshot` bytes (server hash), PNGs,
  briefs (JSON+HTML), reports; documented not-ready answers recorded, never stored
  as assets; verify-then-single-transaction write (quota/partial failure saves
  nothing); re-verify on open; lossless v1 migration; tampered v1 refused untouched.
- **Brief/copilot:** `/brief` main view, DRAFT badge for unreviewed Nepali,
  reviewed-report status separate; copilot states for answer, refusal,
  `ai_not_configured`, malformed, wrong-assessment and superseded responses;
  print, HTML/JSON download from backend content; text-only rendering.
- **P1 polish:** method notes collapsed, plain coverage line, "What this means"
  decision block and "Open cited brief" in the settlement inspector,
  `docs/DEMO_STORYBOARD.md` with ten frames in `docs/demo/screens/` (including
  the honest live-provider-unavailable state).

## Tests run (final tree, 2026-10-14, from `apps/web`)

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` (Vitest 4.1.11) | 4 files, **61 passed**, 0 failed |
| `npm run build` (Vite 7.3.7) | pass; app JS 1.35 MB (374 kB gzip) + MapLibre worker 0.51 MB |
| `npm run check:secrets` | pass, 37 files |
| `npm audit` | **0 vulnerabilities** |
| `npm run test:e2e` (Playwright 1.63.0, Chromium, prod build + service worker) | **20 passed**, 1 skipped (opt-in storyboard) |
| `DEMO_SCREENS=1 npm run test:e2e -- --grep storyboard` | 1 passed, 10 frames written |

**Which checks use interception and which use the real API:**

- Real local API (no interception): `tests/e2e/api-live.spec.ts`. It covers the
  computed demo, both radar images decoded, the brief, copilot no-key state,
  saving a package, and an offline reload with both images. It skips itself if
  `:8000` is down, so it is skipped in GitHub CI. A manual browser check against
  the real API was also done.
- Intercepted with byte-exact recordings of the real backend: `tests/e2e/geographic.spec.ts`
  (radar, 404/tampered PNG, facility, offline package reload, copilot keyboard,
  320/768/1440) and `demo-screens.spec.ts`.
- Unit tests use a fetch double built from the same recordings
  (`src/test/fakeApi.ts`); failure cases (503 no-key, refusal, malformed, stale,
  quota, partial download, tampering, migration) are mocked.

## Remaining gates (not claimed)

- No credentialed Sentinel/OSM run and no configured AI model: every shown
  scene is synthetic; the AI copilot path is tested only with mocked responses.
- Nepali text is unreviewed (draft badge shown).
- MapLibre WebGL rendering is verified via decoded-source state and
  screenshots, not pixel assertions.
- Codex owns credentialed verification, real AOI recording and release gates.

## Integration instructions (for Codex)

```
cd apps/web && npm ci && npm run typecheck && npm test && npm run build && npm run check:secrets && npm audit
npx playwright install chromium && npm run test:e2e   # api-live spec runs only if :8000 is up
```
