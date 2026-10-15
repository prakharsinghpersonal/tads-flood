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
Synthetic sources use an explicit synthetic URI or a local provenance-detail
endpoint and synthetic kind, never a fabricated remote URL. A computed source's
`uri` resolves to its source register entry; its SHA-256 identifies cached raw
bytes. The details endpoint includes checked processing/grid cache manifests.

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

### Implemented backend checkpoint

- `GET /health`: `{"status":"ok","schema_version":"1.0.0"}`.
- `GET /api/v1/demo`: the validated synthetic assessment fixture.
- `GET /api/v1/demo/geographic`: computed geographic synthetic training scene;
  stores one immutable assessment with populated layers and radar previews.
- `GET /api/v1/readiness`: configuration booleans only; never a credential or a
  claim that external execution/accuracy has been verified.
- `POST /api/v1/assessments`: request contains bbox, event_date and mode
  (`synthetic` or `live`). Synthetic returns a completed fixture-backed job only
  when bbox/date match the fixture. Live returns 503 `live_provider_unavailable`
  while keys are absent. Configured live processing returns HTTP 202 with
  `job_id`, `status: queued`, `assessment_id: null`, `mode: live`.
- `GET /api/v1/assessments/{assessment_id}`: the available assessment; missing ID
  returns 404. Supports the original fixture and persisted computed assessments.
- `POST /api/v1/isolation`: versioned graph request → settlement results. Edges
  have IDs, endpoints, positive length_m, candidate_blocked and evidence_ids.
  Facilities/settlements must reference known graph nodes or use null for unknown
  snapping. Duplicate IDs/dangling endpoints are rejected. Details in OpenAPI.
- `GET /api/v1/assessments/{assessment_id}/report?language=en`: deterministic,
  explicitly labeled English facts-only starter report. `ne` returns an explicit
  not-ready response until reviewed Nepali generation is added. Not the AI gate.

- `GET /api/v1/jobs/{job_id}` and `POST /api/v1/jobs/{job_id}/cancel`.
- Job status enum: queued, fetching, processing, analyzing, reporting, completed,
  failed, cancelled. Persistent jobs include `fraction`, `stage_message` (`message`
  is retained as an alias), `mode`, `error`, `created_at`, `updated_at` and the
  request scope. Terminal cancellation returns 409. Interrupted jobs fail with
  `server_restarted`; retries are explicit. Two workers, eight total accepted
  queued/running jobs, HTTP 429 when full. Worker failure has a sanitized envelope
  in job.error. The single-process prototype is not a distributed job system.
- `POST /api/v1/assessments/{id}/copilot`: question + language → typed claims,
  evidence IDs, refusal flags and generator metadata. JSON request:
  `{"question":"Which settlements may be isolated?","language":"en"}`. Language
  en/ne, question 1–2000 characters. A configured LLM selects approved fact IDs;
  code renders the words, numbers and citations. Invalid/incomplete/outside-menu
  output fails. No-key returns explicit 503; casualty requests are refused.
- `GET /api/v1/assessments/{id}/brief?language=en|ne&format=json|html`:
  deterministic preview with the copilot response shape, `ai_ready: false` and
  `generator: deterministic_template`. Nepali has `translation_reviewed: false`.
  Reviewed `/report?language=ne` remains 501 until fluent review is complete.
- `GET /api/v1/assessments/{id}/package`: assessment, mode/schema, asset list,
  SHA-256 checksums, attributions and limitations. Raster assets have `role`
  before_radar/after_radar, `uri`, `sha256`, `media_type`, and image-source corner
  `coordinates` ordered top-left, top-right, bottom-right, bottom-left in WGS84.
  New previews also carry `source_id`, `acquired_at`, `rendering` so synthetic
  scene dates do not depend on source.kind filters. Old persisted previews can
  have null source/time metadata; show unavailable rather than invent it.
- `GET /api/v1/assessments/{id}/snapshot`: exact assessment JSON bytes matching
  package.assessment_sha256. Hash these bytes, not reserialized JS objects.
- `GET /api/v1/assessments/{id}/imagery/before|after`: RGBA PNG, VV dB rendered
  from −30 to 0; alpha zero means unavailable coverage. Training assets synthetic.
- `GET /api/v1/assessments/{id}/sources/{source_id}`: source record, evidence IDs
  and cache manifests. IDs may contain `/`; encode source IDs when constructing
  URLs. Selected catalogue metadata and processed bytes are retained; exact
  contributing Process API tile identifiers await credentialed verification.

Report/ReportClaim and GroundedReport now have typed OpenAPI models. GroundedReport
adds `model`, `refused`, `answer`, `translation_reviewed`; numerical facts are
the same computed summary in both languages.
AssessmentPackage and RasterAsset are typed too; non-null asset source/time
metadata must resolve exactly to a source record in the packaged assessment.

Feature conventions accepted from Claude's proposal: roads `candidate_blocked`
or `not_exposed`, buildings `exposed` or `not_exposed`, and `unknown` where coverage
is insufficient; flood `candidate_flood`, debris `candidate_disturbance`. Road
feature IDs equal graph edge IDs and include metric `length_m`. These names
describe inferred exposure only. Facility points are in `layers.settlements`
with `kind: facility`, `amenity: hospital|clinic`; settlement points have
`kind: settlement` and the settlement status enum. There is no new v1 layer.

Use a discriminated request/response type when asynchronous jobs are introduced;
retain the starter fixture path for tests. Claude's API adapter should
that supports both completed and accepted responses without inventing results.

## Errors

Standard envelope: `{"error":{"code":"...","message":"...","retryable":false}}`.
Validation uses HTTP 422; missing resource 404; conflict 409; provider unavailable
503; job-queue full 429. Provider failures are encoded safely in job.error;
direct transient endpoint failures use 503. Validation details are available
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
