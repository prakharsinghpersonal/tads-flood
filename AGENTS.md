# Collaboration rules

## Goal

Build TADS Flood for Multimodal AI Hackathon 2026 Track B. The product answers:
where is possible flood damage, which assets are exposed, and which settlements
may lose a road connection? Preserve uncertainty and provenance. See
`docs/BUILD_PLAN.md`, `docs/API_CONTRACT.md`, and `docs/DATA_POLICY.md` first.

## Ownership

- Codex: `services/api/**`, `tests/backend/**`, `scripts/**`, `contracts/**`,
  `pyproject.toml`, backend CI, geospatial evaluation and provider adapters.
- Claude: `apps/web/**`, `tests/e2e/**`, frontend CI, `docs/UI_SPEC.md`,
  `docs/CLAUDE_STATUS.md`, mission simulation and offline browser persistence.
- Shared: original plans, `README.md`, fixtures and release evidence. Propose
  shared changes in `docs/coordination/` with schema version and rationale.
- Start from the frozen v1 contract. Never silently rename fields or endpoints.
  Keep each agent in its own worktree and branch. Never force-push shared refs.

## Research integrity

- Historical TADS repositories are read-only references. Do not run experiments,
  edit their code, import their datasets, or publish their archives for this app.
- Do not use xBD annotation-derived priors as live satellite predictions.
- EMS/UNOSAT published damage layers are evaluation-only. Keep reference assets
  outside application provider inputs and off browser inference paths.
- Operator/drone observations and simulated changes belong to a separate
  mission overlay. They cannot rewrite the official-input assessment output.
- Every result carries `mode`, source IDs, timestamps, method version and limits.
  A heuristic score is not a calibrated probability. Use `unknown` for missing
  coverage; do not label missing data as dry, connected, or safe.
- Offline internet access is different from a lost drone link. No fresh telemetry
  without contact. No command succeeds before acknowledgement. On reconnect,
  deduplicate IDs, preserve event times and require approval for expired requests.
- A prior map alone does not make a real drone autonomous. Our supported delivery
  is a simulation; onboard compute, navigation, perception and flight failsafes
  are future integration requirements, not completed features.

## Engineering

Use dependency-injected providers, deterministic fixtures, typed validation,
bounded AOIs and jobs, explicit failure states, and cache manifests with hashes.
Do not silently substitute fixture data for failed live requests. Credentials
stay server-side and outside git/logs. Do not implement arbitrary URL fetching.
Write meaningful tests from `docs/TEST_MATRIX.md`. Document measured test results,
not aspirational percentages. Public demo evidence must label synthetic replay.

## Checkpoint handoff

Each agent records commit, changed interfaces, completed tests, next task and
blockers in its owned status document. Codex integrates completed branches only
after reviewing both test suites. The human owns registration, student eligibility,
organizer clarification, real flight decisions and final Devpost submission.

