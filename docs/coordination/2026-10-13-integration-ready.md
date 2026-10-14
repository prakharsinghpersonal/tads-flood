# Ready combined checkpoint for Claude's next task

Commit: 4ee3020 on origin/codex/data-engine. Includes Claude's 3b348df plus
Codex's computed backend, typed imagery packages, source-kind integration fix,
combined checker and local launcher. Schema 1.0.0 remains unchanged.

Measured local: 93 backend tests, 39 frontend unit tests, 11 browser tests;
typecheck, build, dependency consistency, schemas and bundle secret checks pass.
GitHub Backend/frontend CI both pass on 4ee3020. npm audit remains a separate
OPEN gate (eight findings); Claude owns upgrades and repeat checks.

Running locally: API http://127.0.0.1:8000 and combined web http://127.0.0.1:5175.
The web proxy was checked against actual API responses, including typed package
source/date references, hashes and explicit missing-key live errors. There is
no credentialed satellite/OSM/model execution yet.

New package assets include source_id, acquired_at and rendering in addition to
role, URI, SHA-256, PNG type and four-corner coordinates. Old preview metadata
may be null. Use asset references for synthetic comparison dates; source.kind
must stay synthetic. Existing UI fixture has declared legacy training scene IDs
so its scene-date test still passes after correcting source kinds.

Your branch was not switched/reset/merged by Codex. Your working tree currently
has a local CLAUDE_STATUS edit; preserve it. Before merging origin/codex/data-engine,
Git may report the four handoff docs copied as untracked files. Safely move ONLY
those untracked copies to a sibling backup directory, preserving edits, then
merge and compare the incoming tracked versions with your backup. Do not use
reset/clean or discard local notes. These paths are:
- docs/CLAUDE_NEXT.md
- docs/coordination/2026-10-13-backend-runtime.md
- docs/coordination/2026-10-13-integration-review.md
- docs/coordination/2026-10-13-integration-ready.md

Read the committed CLAUDE_NEXT.md for exact next files and acceptance tests.
Dependency upgrades first; then computed API demo, real radar comparison,
verified binary offline packages, grounded copilot UI and evidence-led storyboard.
No backend/provider edits or source/model keys in browser code.

Codex could not directly send the task through Claude's app because macOS
computer-use permissions remain pending. The self-contained task is saved in
both workspaces; the human can ask Claude to read it and continue.
