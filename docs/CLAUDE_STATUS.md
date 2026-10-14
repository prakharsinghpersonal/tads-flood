# Claude status

Branch `claude/mission-ui`, worktree `tads-flood-claude`, base commit `310dd6e`.
Checkpoint 1 (2026-10-13): Half B vertical slice is implemented and tested on
disk. **Not yet committed**: the human commits and pushes this branch; record
the commit hash here when that happens. No Codex-owned file was edited.

## Stack

React 18.3.1 + TypeScript 5.6.3 + Vite 5.4.11, MapLibre GL 4.7.1, zod 3.23.8
(runtime contract validation), idb 8.0.0 (IndexedDB). Tests: Vitest 2.1.8 +
Testing Library + fake-indexeddb; Playwright 1.49.1 (Chromium). Exact versions
pinned in `apps/web/package.json` and `package-lock.json`. Node ≥22 (run on 25.8.1).

## What exists (paths)

- `apps/web/src/api/contract.ts`: zod mirror of `contracts/assessment.schema.json`
  (strict objects), job/report/error shapes, `parseAssessment` with reference and
  integrity checks (version refusal, bbox order, evaluation_only sources, dangling
  evidence/source IDs, synthetic URIs in live mode, summary/list agreement warning).
- `apps/web/src/api/client.ts`: same-origin client (Vite proxies `/api`,`/health`
  to `VITE_API_BASE_URL`, default `http://127.0.0.1:8000`), typed `ApiError`
  kinds, abort/timeout, `runAssessment` (completed or polled job; cancel), request validation.
- `apps/web/src/map/*`: MapLibre view with local-only style, layers, route/cut/selection
  highlight, mission overlay, error banner + error boundary.
- `apps/web/src/components/*`: prepare form/job states, assessment panel, evidence
  inspector, report panel, map boundary.
- `apps/web/src/offline/*`: IndexedDB package store (SHA-256 verified), offline
  panel, online hook; `apps/web/public/sw.js` app-shell service worker (never caches `/api`).
- `apps/web/src/mission/*`: deterministic TADS-inspired simulator (original code,
  not imported from research repos) and its panel.
- `apps/web/src/fixtures/synthetic-ui-assessment.json` + `apps/web/scripts/build-ui-fixture.py`:
  frontend-owned synthetic fixture with geometry and all four settlement statuses.
- `tests/e2e/*.spec.ts`, `apps/web/playwright.config.ts`, `.github/workflows/frontend.yml`,
  `apps/web/scripts/check-bundle-secrets.mjs`, `docs/UI_SPEC.md`.

## Interfaces consumed / proposed

Consumed unchanged: contract v1 assessment; `POST /assessments` completed job;
`GET /assessments/{id}`; `GET /demo`; `GET /report?language=en|ne` (shape read from
`reports.py`, untyped in OpenAPI). Handled but not yet served by Codex: job polling
and cancel (404 today, shown as an error). Proposal (not agreed):
`docs/coordination/2026-10-13-ui-geometry-and-report-shape.md` covers feature property
conventions, shared fixture geometry, `imagery` assets (1.1.0), typed report model.

## Tests run (measured on this tree, 2026-10-13)

Commands from `apps/web`:

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` (Vitest) | 4 files, **38 passed**, 0 failed |
| `npm run build` | pass (single 1.10 MB JS chunk, 307 kB gzip; MapLibre dominates) |
| `npm run check:secrets` | pass, 28 files; verified it exits 1 on a planted `VITE_OHSOME_API_KEY` |
| `npm run test:e2e` (Playwright, Chromium, prod build + service worker) | **11 passed**, 0 failed |

Also checked by hand in the browser against Codex's running API on :8000: live
mode shows `live_provider_unavailable` with no substitution; fixture map,
selection, inspector, package save/open and the simulation all render.

Matrix coverage:

| ID | Where tested | Status |
|---|---|---|
| U01 | App.test, workspace.spec | pass (shared + UI fixture; badges, real projected map) |
| U02 | App.test (exact route/cut IDs), workspace.spec | pass |
| U03 | App.test | partial: scene IDs/dates + layer toggles; **no raster** (not in v1) |
| U04 | App.test (503, network+retry, cancel, empty, bad version), workspace.spec | pass |
| U05 | App.test | pass |
| U06 | App.test (facts vs summary, citation to inspector, NE 501, no browser report) | pass against mocked API; export buttons not E2E-tested |
| O01 | offline.spec | pass |
| O02, O03 | sim.test, offline.spec | pass |
| O04 | sim.test, offline.spec | pass |
| O05, O06 | sim.test, offline.spec | pass |
| O07 | offline.spec (real offline reload), packageStore.test | pass |
| O08 | App.test, offline.spec | pass |
| O09 | sim.test (deep-frozen assessment) | pass |
| O10 | sim.test (dedup, disagreement, exploration weight, separation) | pass |
| O11 | sim.test | pass |
| X01 | App.test, workspace.spec | pass (lists/tabs/inspector; the map canvas itself is not keyboard-operable, the lists are the keyboard path) |
| X02 | workspace.spec 320/768/1440 | pass (no horizontal overflow; screenshots in `apps/web/test-results/screens/`) |
| X03 | workspace.spec | pass (no running CSS animations; fitBounds animation off) |
| S01 | check-bundle-secrets | pass (frontend half only) |

## Limits and caveats

- All UI evidence is synthetic. Nothing here demonstrates mapping accuracy,
  real-data processing, AI generation, or drone capability.
- No before/after raster is drawn; v1 has no imagery asset.
- Offline package is a browser snapshot (`origin: browser_snapshot`); the backend
  package endpoint is planned. There are no offline basemap tiles because the map
  uses none; real-data packages will need whatever raster assets Codex adds.
- Map-click selection was exercised manually, not in an automated test.
- Copilot Q&A UI is a placeholder until Codex ships the endpoint.
- Single large JS chunk (MapLibre); acceptable for offline caching, not optimised.

## Integration instructions (for Codex)

```
cd apps/web && npm ci && npm test && npm run build && npm run check:secrets
npx playwright install chromium && npm run test:e2e
npm run dev   # http://127.0.0.1:5173, proxies to the API on :8000
```

Root `.gitignore` already covers `node_modules/`, `dist/`, `test-results/`.

## Next

1. Human commits/pushes this checkpoint; record the hash here.
2. Wire real assessments once Codex serves geometry; add imagery once the
   proposal is agreed; copilot panel once the endpoint exists.
3. Demo storyboard/screenshot support for the DEMO_PLAN 2:00–2:25 simulation segment.

## Blockers

None for the fixture-backed UI. Real-data screens depend on Codex's providers
(CDSE, ohsome v2 key) and on agreement to the coordination proposal.
