# Claude status

Branch `claude/mission-ui`, worktree `tads-flood-claude`.

- Checkpoint 1: `3b348df` (pushed). Codex reviewed and integrated it.
- Checkpoint 2 (2026-10-14): built on `e9fc50a` (fast-forward of
  `origin/codex/data-engine`, which contains `3b348df` plus Codex's backend and
  its frontend integration fixes). **Commit hash: recorded by the human after
  committing** (Claude does not run commit/push in this repo).
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
