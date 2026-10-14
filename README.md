# TADS Flood

An evidence-first flood assessment workspace: estimate flood exposure from
satellite data, trace potentially severed road connections, and prepare a
source-linked situation report. A separate TADS-inspired simulation explores
offline inspection planning; it is never presented as real drone telemetry.

**Current status: backend development checkpoint.** The backend computes map
layers, exposure and road connectivity from a geographic synthetic scene; it
serves persistent jobs, cached radar previews, checksummed offline manifests,
source details and printable briefs. CDSE, ohsome v2 and grounded LLM adapters
are implemented with mocked provider tests. Credentialed execution, geographic
accuracy, official-reference evaluation and fluent Nepali review remain release
gates. Synthetic results do not establish real-world performance.

## Start here

- [Complete build plan, including both development halves](docs/BUILD_PLAN.md)
- [Claude's self-contained assignment](docs/CLAUDE_HANDOFF.md)
- [Shared API and data contract](docs/API_CONTRACT.md)
- [Acceptance and test matrix](docs/TEST_MATRIX.md)
- [Three-minute demo and judging evidence](docs/DEMO_PLAN.md)
- [Sources, data policy, and unresolved questions](docs/DATA_POLICY.md)
- [Actual development status](docs/STATUS.md)

## Development

Python 3.12 is the tested runtime (package minimum 3.11). The frontend uses Node 22+ and npm; Claude
owns its lockfile and scripts. Python commands below work from the repo root.

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock
python -m pip install -e . --no-deps
python -m pytest
python scripts/export_contracts.py
python -m uvicorn tads_flood.api:app --app-dir services/api/src --reload --port 8000
```

The generated OpenAPI and assessment schema live in `contracts/`. The synthetic
starter response remains in `fixtures/synthetic/assessment.json`. The richer
computed training scene is served at `GET /api/v1/demo/geographic`. To generate
local assessment, raster preview and brief artifacts without credentials:

```sh
python scripts/run_synthetic_pipeline.py
```

Copy `.env.example` to `.env` for server-side configuration. The live worker
requires CDSE Sentinel Hub OAuth credentials and an ohsome v2 API key; the AI
selector additionally requires `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` (an
HTTPS base URL implementing strict JSON-schema chat completions, ending `/v1`
where applicable). Keys never belong in `VITE_*` variables. Readiness at
`/api/v1/readiness` reports configuration only, not validated execution. Runtime
data/cache is ignored by git. Deployment currently assumes one API process.

See [the backend runtime handoff](docs/coordination/2026-10-13-backend-runtime.md)
for image coordinates, hashes, copilot and integration examples. The bilingual
`/brief` endpoint is a deterministic preview; the `/copilot` endpoint calls the
configured model to select approved facts. An absent key is an explicit error.

## Working in parallel

Codex owns `services/api/`, `tests/backend/`, `scripts/`, and generated contracts.
Claude owns `apps/web/`, `tests/e2e/`, `docs/UI_SPEC.md`, and `docs/CLAUDE_STATUS.md`.
Shared contract changes require an explicit recorded agreement. Use separate
worktrees and small commits; do not switch the other agent's branch or merge
unfinished work into `main`. See `AGENTS.md`.

## AI assistance and prior work

Planning and backend implementation: OpenAI Codex. Frontend/mission implementation:
Claude Code; its checkpoint and measured tests are recorded in its owned
`docs/CLAUDE_STATUS.md` on `claude/mission-ui`. The TADS research concept predates this hackathon. This repository
starts a separate application and does not include the original research
datasets, archives, or publication results. Any reused research code must be
identified by source, license, and commit before being added. Permission to
enter a project based on pre-existing research needs organizer clarification.

This is an educational prototype, not an operational rescue or flight-control
system. Code and original synthetic fixtures are MIT; external data retains
its original license and required attribution.
