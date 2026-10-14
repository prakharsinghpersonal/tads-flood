# Codex status

Integrated Claude code checkpoint: `29ff6d1`, plus its status update `cf01ee1`,
on `codex/data-engine`; draft PR:
https://github.com/prakharsinghpersonal/tads-flood/pull/1.
Planning and shared foundation are on main; computed backend work is on this
branch. Assessment schema remains 1.0.0. See the runtime coordination note for
Claude's additive integration endpoints and the response to its proposal.

## Implemented and verified locally

- Metric UTM grid, aligned GeoTIFF reads, terrain/shadow/nodata handling,
  candidate new-water masks excluding already-dark water, optical corroboration,
  and explicitly unvalidated disturbance candidates. No geographic accuracy claim.
- Infrastructure exposure and noded road graphs: metric intersections, bounded
  mid-road snapping, directed edges, bridge/tunnel grade separation, baseline
  vs post-removal facility paths and unknown coverage.
- Official CDSE OAuth/catalogue/Process adapters and historical ohsome v2
  GeoParquet adapter, tested with mocked responses. Explicit relative orbit is
  required; missing orbit can be resolved by bounded exact-name public Copernicus
  product metadata lookup. Public OData attributes were observed successfully.
- Bounded persistent asynchronous jobs, cancellation, restart failures, safe
  errors, content-addressed input/preview cache with checked manifests, immutable
  assessment snapshots, provenance details and offline-package asset hashes.
- LLM structured fact selection plus separate numerical/citation whitelist.
  Unsupported/duplicate/extra/incomplete facts fail. Casualties are refused.
  No actual model call has been performed. Bilingual deterministic previews use
  identical numerical facts; Nepali wording remains unreviewed.
- Computed geographic synthetic scene and before/after PNG assets, printable
  English/Nepali brief previews. All visibly synthetic; no real-world inference.
- Separate masked evaluation metrics and CLI for boolean prediction/reference
  arrays. No evaluation/reference module is imported by the live pipeline.

## Measured checks

- Python 3.12.14, `python -m pytest`: **93 passed**, one upstream Starlette
  TestClient/httpx deprecation warning. These are automated backend tests, not
  the number of completed release gates.
- `python -m pip check`: no broken requirements.
- Generated contracts reproduce locally; original assessment/isolation schemas
  and shared fixture remain unchanged. Report models and additive routes appear
  in OpenAPI. `git diff --check` passes.
- Synthetic CLI runs without credentials and produces map layers, three access
  states, exact preview checksums and brief HTML. Counts/area are toy-data outputs,
  not observed disaster findings or benchmark scores.
- Local HTTP checks on port 8000: health/readiness, computed assessment, snapshot
  hash, both raster hashes, English HTML and explicit unreviewed Nepali metadata.
- Brief English and Nepali HTML rendered and visually inspected in headless
  installed Chrome. No clipping observed at 800 px; print-media body heights
  were 583/603 px before the final grammar change. A4 CSS is provided, but this
  check does not certify every future dataset's export fits one page.

Claude's second checkpoint connects the computed scene, actual PNG comparison,
exact-byte binary offline packages, grounded copilot requests, readiness states
and draft-labelled Nepali previews. Its pinned dependency audit reports **zero**
findings. Codex independently ran the combined workspace check: **61 frontend
unit tests and 20 browser tests passed**, alongside the 93 backend tests above.
One opt-in screenshot-generation test was intentionally skipped. The API browser
flow actually ran against a fresh FastAPI process, with temporary storage and
no credentials: both images loaded, the package saved, and offline reload
restored imagery. Other browser flows use recorded/bundled synthetic fixtures.
Typecheck, production build and bundle secret checks passed.

The new API browser integration workflow requires that flow to execute: an
unreachable API fails instead of skipping. `check_workspace.py --browser` also
launches the fresh credential-free API. Details and cross-owner changes are in
[the integration record](coordination/2026-10-14-checkpoint-2-integration.md).
Claude's pushed ready code passed both existing GitHub workflows before merge;
exact combined-head CI evidence is recorded with the integration commit/PR.

Earlier provenance, UUID package IDs and closed test-database connections are
retained. Claude's own worktree and status file were not modified by Codex.
Frontend boundary-hardening and submission draft work are assigned in
CLAUDE_NEXT.md; they are separate from real-data validation.

## Outstanding release gates

- CDSE client credentials, ohsome v2 key and a model configuration are absent in
  this runtime. Live source extraction/processing and actual bilingual AI calls
  have **not** been executed. Readiness returns false.
- Verify exact contributing Process API tile identity and scene metadata on a
  credentialed run; the current source register identifies selected catalogue
  inputs and checksums processed outputs.
- Execute required official-reference case study and an unfamiliar holdout
  area/date. Reference availability, mapping accuracy and real runtime/memory
  are not demonstrated; no IoU/F1 figures can be reported yet.
- Grounding/reference evaluation on real inputs, fluent Nepali review and final
  numerical/citation sample review are pending.
- Claude's ready checkpoint 29ff6d1 and status cf01ee1 are integrated. Finish
  the newly assigned frontend boundary cases and submission drafts, then produce
  the final report/video from measured real runs where available.
- Existing TADS research eligibility/permission remains an organizer question.
  This backend imports none of its datasets or experiment code. Flight hardware
  is unsupported; the separate frontend mission is a simulation.

This is a tested backend development deliverable. It is not yet the complete
real-data Track B submission described by the build plan.

A later CI run exposed open IndexedDB test connections and second-resolution
package-ID collisions. Both were corrected; same-timestamp saves now preserve
separate packages, and the database cleanup must close connections before deletion.
The corrected code checkpoint 047d2fe passed both CI workflows.
