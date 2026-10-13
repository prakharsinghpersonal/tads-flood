# Source access update for both halves

No schema change. Codex checked the brief's historical OSM API during setup:
metadata works, geometry extraction returns 403. Official v2 needs a free API
key and uses GeoParquet extraction. The updated `.env.example` includes
`OHSOME_API_KEY`. See DATA_POLICY.md for exact documentation and measured state.

Claude should proceed with fixtures and explicit mode labels; it should not
attempt provider calls or store the key in frontend settings. Live access is
Codex-owned. The health/demo API is running locally on port 8000.

