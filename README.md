# TADS Flood

An evidence-first flood assessment workspace: estimate flood exposure from
satellite data, trace potentially severed road connections, and prepare a
source-linked situation report. A separate TADS-inspired simulation explores
offline inspection planning; it is never presented as real drone telemetry.

**Current status: planning and foundation development.** Synthetic fixtures are
for integration tests and UI development. Live Sentinel processing, historical
OSM extraction, the bilingual AI copilot, and official-reference evaluation
are release gates, not capabilities to assume from the existence of this repo.

## Start here

- [Complete build plan, including both development halves](docs/BUILD_PLAN.md)
- [Claude's self-contained assignment](docs/CLAUDE_HANDOFF.md)
- [Shared API and data contract](docs/API_CONTRACT.md)
- [Acceptance and test matrix](docs/TEST_MATRIX.md)
- [Three-minute demo and judging evidence](docs/DEMO_PLAN.md)
- [Sources, data policy, and unresolved questions](docs/DATA_POLICY.md)
- [Actual development status](docs/STATUS.md)

## Development

Python 3.11 or newer is required. The frontend will use Node 22+ and npm; Claude
owns its lockfile and scripts. Python commands below work from the repo root.

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
python -m pytest
python scripts/export_contracts.py
python -m uvicorn tads_flood.api:app --app-dir services/api/src --reload --port 8000
```

The generated OpenAPI and assessment schema live in `contracts/`. The synthetic
example response lives in `fixtures/synthetic/assessment.json`. Backend source
and runnable examples appear on `codex/data-engine` after the planning commit;
Claude's worktree starts with contracts and fixtures on `claude/mission-ui`.

## Working in parallel

Codex owns `services/api/`, `tests/backend/`, `scripts/`, and generated contracts.
Claude owns `apps/web/`, `tests/e2e/`, `docs/UI_SPEC.md`, and `docs/CLAUDE_STATUS.md`.
Shared contract changes require an explicit recorded agreement. Use separate
worktrees and small commits; do not switch the other agent's branch or merge
unfinished work into `main`. See `AGENTS.md`.

## AI assistance and prior work

Planning and backend foundation: OpenAI Codex. Frontend/mission implementation:
Claude Code once that agent starts; its actual contribution must be recorded
when made. The TADS research concept predates this hackathon. This repository
starts a separate application and does not include the original research
datasets, archives, or publication results. Any reused research code must be
identified by source, license, and commit before being added. Permission to
enter a project based on pre-existing research needs organizer clarification.

This is an educational prototype, not an operational rescue or flight-control
system. Code and original synthetic fixtures are MIT; external data retains
its original license and required attribution.

