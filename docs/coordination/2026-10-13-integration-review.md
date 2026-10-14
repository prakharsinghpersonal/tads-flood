# Combined checkpoint review

Claude commit reviewed: 3b348df. Backend functional checkpoint: 8d73c79.
Merged locally into codex/data-engine; release is still a draft.

Measured frontend: 38 Vitest cases, typecheck, build, bundle secret scan and
11 Playwright browser cases pass independently. Frontend GitHub CI on 3b348df
also passes. Backend GitHub CI on 8d73c79 passes with 92 tests.

The new producer-consumer fixture validation exposed a mismatch: the UI's
mode=synthetic source records use sentinel_1 kinds. The producer requires
synthetic source kinds, as in the frozen fixture and existing v1 validation.
Codex made a small integration correction under the user's request to complete
integration: fixture/builder kinds, consumer kind guard, declared legacy training
scene display and one consumer regression. Claude's checkout was not edited.
The new producer-consumer test passes; combined local checks now have 93 backend,
40 frontend unit and 11 browser cases passing. No dependency versions changed.

npm audit reports eight advisory findings in the pinned frontend tree: production
MapLibre plus dev tooling dependencies. These require an upstream-informed
upgrade and repeat verification. Tests alone do not establish patched dependencies.
Claude owns frontend versions/lockfile; Codex has not modified their versions or lockfile.

Next task and precise file/test list: docs/CLAUDE_NEXT.md. It is also copied into
Claude's worktree. Schema v1 remains frozen. Backend imagery/package/copilot
endpoints are additive and ready for consumer wiring. Credentials, real-data
execution and official-reference/model evaluation remain separate release gates.

CI later caught test DB connection leakage and a production package-ID collision
when multiple saves shared a second. Codex corrected both in the integration
branch; 047d2fe passes backend and frontend CI with 93/40/11 measured tests.
