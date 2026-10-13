# Shared contract v1

Schema version: `1.0.0`. Producer: Codex API. Consumer: Claude web app.
Reference payload: `fixtures/synthetic/assessment.json`. Machine schema:
`contracts/assessment.schema.json`; generated routes: `contracts/openapi.json`.

## Conventions

JSON uses snake_case. WGS84 coordinates use `[longitude, latitude]`, bbox uses
`[west, south, east, north]`. Timestamps are timezone-aware ISO 8601 UTC; event
dates are ISO calendar dates. Distances/areas use meters/meters squared.
Separate `synthetic`, `live`, and `cached_live`; never silently change mode.
GeoJSON FeatureCollections are versioned assets, with stable feature IDs and
properties `evidence_ids`, `method_version`, `status`, `source_id`.

An assessment has: `schema_version`, `assessment_id`, `mode`, `event_date`, `bbox`,
`generated_at`, `sources`, `quality`, `summary`, `layers`, `settlements`, `evidence`,
`limitations`. Check the fixture/schema for exact nested fields. The starter's
fixture has empty feature layers; that is not a ready geographic demonstration.

Sources carry `source_id`, `kind`, `acquired_at`, `uri`, `license`, `sha256` and
`usage` (`input` or `evaluation_only`). No `evaluation_only` source may appear
in `sources` for an inference request. Hashes/IDs are mandatory in real mode.
Synthetic sources have an explicit synthetic URI, never a fabricated remote URL.

Quality carries status `usable`, `partial` or `unavailable`, valid fraction,
`warnings` and `method_version`. Missing coverage is not counted as unaffected.
Summary quantities derive from a named metric/exposure computation, never LLM text.
Heuristic risk is `flood_score`; it is not `flood_probability` until calibrated.

Settlement `status`: `connected`, `potentially_isolated`,
`preexisting_disconnected`, `unknown_network`. Its response includes baseline
nearest facility, pre-event route edge IDs, post-event route edge IDs where
available, candidate cut edges, any-facility connectivity and evidence IDs.
Road exposure produces candidate edges; the status is an inference, not a
verified closure. An unknown graph location cannot become a definitive cut.

## Endpoints

### Implemented first slice

- `GET /health`: `{"status":"ok","schema_version":"1.0.0"}`.
- `GET /api/v1/demo`: the validated synthetic assessment fixture.
- `POST /api/v1/assessments`: request contains bbox, event_date and mode
  (`synthetic` or `live`). Synthetic returns a completed fixture-backed job only
  when bbox/date match the fixture. Live explicitly returns 503
  `live_provider_unavailable` until live processing is implemented.
- `GET /api/v1/assessments/{assessment_id}`: the available assessment; missing ID
  returns 404. Starter only knows the synthetic fixture ID.
- `POST /api/v1/isolation`: versioned graph request → settlement results. Edges
  have IDs, endpoints, nonnegative length_m, candidate_blocked and evidence_ids.
  Facilities/settlements must reference known graph nodes or use null for unknown
  snapping. Duplicate IDs/dangling endpoints are rejected. Details in OpenAPI.
- `GET /api/v1/assessments/{assessment_id}/report?language=en`: deterministic,
  explicitly labeled English facts-only starter report. `ne` returns an explicit
  not-ready response until reviewed Nepali generation is added. Not the AI gate.

### Planned: must not be represented as already live

- `GET /api/v1/jobs/{job_id}` and `POST /api/v1/jobs/{job_id}/cancel`.
- Accepted live job: `job_id`, `status`, `assessment_id` when completed.
- Job status enum: queued, fetching, processing, analyzing, reporting, completed,
  failed, cancelled. Include fraction, stage message, retries, error and timestamps.
- `POST /api/v1/assessments/{id}/copilot`: question + language → typed claims,
  evidence IDs, refusal flags and generator metadata. See BUILD_PLAN AI boundary.
- Offline package endpoint: immutable manifest with assets, checksums, version,
  AOI, scene times and required attributions. Web app caches those exact assets.

Use a discriminated request/response type when asynchronous jobs are introduced;
retain the starter fixture path for tests. Claude should implement an API adapter
that supports both completed and accepted responses without inventing results.

## Errors

Standard envelope: `{"error":{"code":"...","message":"...","retryable":false}}`.
Validation uses HTTP 422; missing resource 404; conflict 409; provider unavailable
503; upstream transient 502/504. FastAPI's 422 validation details are available
alongside the standard envelope. Credentials/auth errors must not leak tokens.
User mistakes are not retried. Transient external retries are bounded.

## Mission ownership and separation

The optional mission state machine is frontend-owned in v1. It references the
assessment ID but maintains separate simulation observations. Events include
`event_id`, `actor_id`, `tile_id`, `kind`, `event_at`, `received_at`,
`mode: simulation`, and `source`. Commands include `command_id`, type, target,
created_at, expires_at and status: queued, sent, acknowledged, expired, failed.
These fields do not authorize flight. Never persist API keys in mission state.

## Contract changes

Write a proposal under `docs/coordination/`. State exact field change, version,
old/new fixture, producer/consumer modifications and test impact. Codex regenerates
schemas; Claude regenerates TypeScript types. Both confirm before an incompatible
change. Runtime consumers must show unsupported schema version rather than guess.

