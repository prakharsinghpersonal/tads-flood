# Codex status

Backend checkpoint on `codex/data-engine`; draft PR:
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

- Python 3.12.14, `python -m pytest`: **91 passed**, one upstream Starlette
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

GitHub CI result and ready code commit are recorded after publishing this slice.
Claude owns its status and measured frontend results in its separate worktree;
Codex read that checkpoint and left frontend/mission files untouched.

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
- Connect Claude's image/package/copilot consumer changes, integrate its ready
  commit, run clean-clone/full release gates and produce submission artifacts.
- Existing TADS research eligibility/permission remains an organizer question.
  This backend imports none of its datasets or experiment code. Flight hardware
  is unsupported; the separate frontend mission is a simulation.

This is a tested backend development deliverable. It is not yet the complete
real-data Track B submission described by the build plan.
