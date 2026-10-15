# TADS Flood

Project owner: Prakhar Kumar Singh ([prakharsinghpersonal](https://github.com/prakharsinghpersonal)).

An evidence-first flood assessment workspace: estimate flood exposure from
satellite data, trace potentially severed road connections, and prepare a
source-linked situation report. A separate TADS-inspired simulation explores
offline inspection planning; it is never presented as real drone telemetry.

**Current status: working prototype with measured mapping limitations.** Actual
authenticated Sentinel-1/DEM and historical ohsome runs completed for Syapru Besi
and a separate Timure area/date. Local llama3.1:8b answered English/Nepali queries
by selecting approved computed facts. The EMSR927 AOI01 landslide comparison is
poor (IoU 0.0057; F1 0.0114 over jointly valid cells). This is an unvalidated
flood/disturbance baseline, not operational disaster mapping. Final recorded-case UI QA,
fluent Nepali review, the final demo and human submission remain open.

## Start here

- [Complete build plan, including both development halves](docs/BUILD_PLAN.md)
- [Claude's self-contained assignment](docs/CLAUDE_HANDOFF.md)
- [Shared API and data contract](docs/API_CONTRACT.md)
- [Acceptance and test matrix](docs/TEST_MATRIX.md)
- [Three-minute demo and judging evidence](docs/DEMO_PLAN.md)
- [Sources, data policy, and unresolved questions](docs/DATA_POLICY.md)
- [Actual development status](docs/STATUS.md)
- [Implemented backend thresholds and limitations](docs/BACKEND_METHOD.md)
- [Claude's current testing and UI assignment](docs/CLAUDE_TEST_UI_PLAN.md)
- [Deployment profiles and Vercel setup](docs/DEPLOYMENT.md)
- [Submission artifacts and human steps](docs/submission/DELIVERY_CHECKLIST.md)

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

The reviewed Claude UI checkpoint is included on `PKS/data-engine`. Install its
exact lockfile and start both local services from the repository root:

```sh
npm ci --prefix apps/web
python scripts/dev.py
```

Open `http://127.0.0.1:5173`. Use `--web-port 5175` if another checkout uses 5173.
The launcher reuses a compatible local API, strips server credential variables
from the frontend process, and stops only its own processes on Ctrl-C. Run the
combined checks with `python scripts/check_workspace.py --browser` after
`cd apps/web && npx playwright install chromium` where a browser is not installed.
The primary demo uses the computed synthetic scene with before/after radar
previews, route/cut inspection, cited English/Nepali brief previews and exact-byte
offline packages. The copilot calls the API and shows an explicit unavailable
state when no model is configured. Nepali previews remain visibly unreviewed.
The legacy API and bundled fixtures remain separate test options.

`check_workspace.py --browser` starts a fresh temporary, credential-free API and
runs the browser suite against it. The actual API flow must pass; it cannot skip
because the API is missing. For that integration flow alone, run
`python scripts/check_integration.py`. GitHub runs it in a separate integration
workflow in addition to backend and frontend checks. The other browser flows
use recorded synthetic responses or bundled fixtures.

The generated OpenAPI and assessment schema live in `contracts/`. The synthetic
starter response remains in `fixtures/synthetic/assessment.json`. The richer
computed training scene is served at `GET /api/v1/demo/geographic`. To generate
local assessment, raster preview and brief artifacts without credentials:

```sh
python scripts/run_synthetic_pipeline.py
```

Copy `.env.example` to `.env` for server-side configuration. The live worker
requires CDSE Sentinel Hub OAuth credentials and an ohsome v2 API key; the AI
selector can use the installed local Ollama model: set `LLM_PROVIDER=ollama`,
`LLM_MODEL=llama3.1:8b`, `LLM_BASE_URL=http://127.0.0.1:11434`, with no API key.
Cloud selection uses `LLM_PROVIDER=openai`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` (an
HTTPS base URL implementing strict JSON-schema chat completions, ending `/v1`
where applicable). Keys never belong in `VITE_*` variables. Readiness at
`/api/v1/readiness` reports configuration only, not validated execution. Runtime
data/cache is ignored by git. Deployment currently assumes one API process.

See [the backend runtime handoff](docs/coordination/2026-10-13-backend-runtime.md)
for image coordinates, hashes, copilot and integration examples. The bilingual
`/brief` endpoint is a deterministic preview; the `/copilot` endpoint calls the
configured model to select approved facts. Missing model configuration is an explicit error.
The frontend lockfile audit currently reports zero vulnerabilities; this does
not establish real-data accuracy or successful model execution.

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
