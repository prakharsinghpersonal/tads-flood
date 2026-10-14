# Delivery checklist — draft release

The human owns final Devpost submission. Deadline recorded in BUILD_PLAN:
14 October 2026, 11:45 PDT / 15 October 2026, 00:15 IST. Planned code freeze:
09:45 PDT. Confirm the current event page before submitting.

## Repository and runtime
- [x] Public GitHub repository created; implementation on codex/data-engine.
- [x] Integrated Claude 830eec8 plus Codex HTML/metadata/language review fixes.
- [x] Local real CDSE/historical OSM execution and actual local AI demonstrated.
- [x] Required case comparison completed with poor results disclosed.
- [x] Separate area/date executes; no held-out accuracy claimed.
- [x] Combined local checks: 110 backend, 130 frontend, 21 browser; hosted replay passes.
- [ ] Final recorded-case UI QA, any resulting integration and exact-head CI.
- [ ] Final README/default-branch release choice verified against submission link.

## Artifacts
- [x] Six-page technical draft: output/pdf/TADS_Flood_Technical_Report_Draft.pdf.
- [x] One-page English brief: output/pdf/TADS_Flood_Situation_Brief_EN.pdf.
- [x] One-page Nepali DRAFT: output/pdf/TADS_Flood_Situation_Brief_NE_Draft.pdf.
- [x] PDF page counts and visual layout checked; source drafts/export scripts saved.
- [x] Devpost narrative and exact three-minute action/narration draft prepared.
- [x] Reviewable measured results saved in docs/submission/measured-results.json.
- [ ] Final integrated UI screen recording, duration/caption/audio review.
- [ ] Public/unlisted video upload and link verification (human account).
- [ ] Final artifact publication/links; exclude .env, raw source archives and research data.
- [ ] Fluent Nepali review, or explicit DRAFT limitation retained in every artifact.

## Optional hosting
- [x] Vercel synthetic replay configuration and local hash/browser/offline checks.
- [ ] Human Vercel account authorization, optional publication and domain checks.
- [ ] Separate persistent live API/cloud model only if fresh public execution is desired.
- [ ] Container build verification if using Docker; local daemon unavailable.

## Human details still required
- Human entrant names, Devpost accounts, team membership and student eligibility.
- Prior TADS concept/research disclosure and organizer clarification if needed.
- Fluent Nepali reviewer/signoff, or decision to submit with unreviewed draft disclosed.
- Video host account/upload, optional Vercel account/GitHub authorization.
- Final description/link review and Devpost submission before the deadline.

No additional paid key is required for the local full-stack demo. Sentinel/OSM
credentials have already been verified and remain server-only. Cloud credentials
are optional for public fresh-model execution. Never paste new secrets into chat;
configure the ignored server .env or the API host's secret settings.

Credits: modified Copernicus Sentinel data 2026, the complete Copernicus
WorldDEM-30 credit, OpenStreetMap contributors, and EU/Copernicus Emergency
Management Service evaluation data. Exact strings are in DATA_POLICY.md.
