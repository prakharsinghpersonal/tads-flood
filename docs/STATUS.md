# Codex status

Planning: complete initial two-half plan, API boundary, Claude handoff, test
matrix, data policy and timed demo. Foundation implemented on `codex/data-engine`.
Generated contracts and fixture are shared baseline assets on `main`.

## Verified first slice

- FastAPI: health, explicit synthetic fixture, assessment lookup, graph-isolation
  endpoint, and an explicitly deterministic English report.
- Typed request/assessment validation, source/evidence references, synthetic/live
  boundary and pre-event OSM enforcement.
- Shortest-path analysis distinguishes candidate isolation, alternate/farther
  facility access, pre-existing disconnection and unknown graph locations.
- Radar pair validation rejects mismatched orbit/polarization/grid/date; toy
  candidate-water cells preserve nodata and exclude already-dark water.
- `python -m pytest`: **42 passed**, Python 3.12.14. One upstream TestClient
  deprecation warning; no test failures. `python -m pip check`: no broken requirements.
- Generated OpenAPI/JSON Schema from implemented routes/models. Exact installed
  foundation dependencies recorded in `requirements.lock`.

These tests establish foundation behaviour, not geographic mapping accuracy.
The toy water rule is not a validated water/debris segmentation system. Its
inputs are arrays already supplied in dB; provider/raster processing is pending.

Live providers: not yet connected. Real geographic evaluation: not run.
AI bilingual generation: not yet implemented. Flight hardware: not supported.
Claude: handoff prepared; start status must be reported by Claude itself.

GitHub foundation CI passed. Starter API was started locally at 127.0.0.1:8000
and its health endpoint was checked. ohsome v1 metadata confirmed historical
coverage, but actual legacy road extraction returned HTTP 403. The documented
v2 path needs a free API key and GeoParquet handling; extraction remains unverified.

## Next checkpoints

- Publish the first API/graph/scene-quality foundation slice and handoff branches.
- Confirm user's CDSE access without exposing credentials.
- Verify required reference products and first historical OSM response.
- Integrate Claude's first fixture-backed map/inspector slice.
