# Codex status — 14 October 2026

Implementation branch: `codex/data-engine`; draft PR:
https://github.com/prakharsinghpersonal/tads-flood/pull/1.
Claude checkpoints `29ff6d1`/`cf01ee1` are integrated. Claude's current UI
reliability/polish edits remain in its own worktree and are not yet integrated.
Schema is 1.0.0; pipeline is flood-assessment-v1.4; radar method remains
sar-change-baseline-v1. No threshold tuning used the official reference.

## Executed sources and AI

- CDSE authentication, real S1 before/after and Copernicus DEM processing passed.
  Process ORBIT userdata product IDs/dates are verified against catalogue input.
- Authenticated historical ohsome v2 extraction passed. The small probe returned
  727 features; all 727 have verified pre-snapshot edit timestamps. No fallback
  to current OSM or denied legacy endpoints occurs.
- Credentials are only in ignored server `.env`; neither UI nor git contains them.
- Installed local Ollama llama3.1:8b completed four development selection/refusal
  checks. A fifth casualty-injection check refused before a model call. Phi3 mini
  incorrectly refused a supported question and was not selected. A cold Llama
  query took 43.56s; frontend request deadlines are a Claude release task.
- English and Nepali actual-model queries on the live Syapru case selected the
  same approved isolation/unknown facts. Code supplies numbers/citations.
  Nepali wording remains an unreviewed DRAFT; this is not linguistic validation.

## Actual recorded runs

| Scope | Date | Pipeline time before AI | Python peak RSS | Valid coverage |
|---|---|---|---|---|
| Syapru Besi | 2026-08-26 | 7.919s | 135.89MiB | 41.8% |
| Timure | 2026-09-01 | 5.981s | 124.64MiB | 42.1% |

Recorded runtime: Python 3.12.14, macOS arm64. These timings are small local
runs, not a performance benchmark. Syapru output: 3,559m2 candidate flood,
11 candidate-exposed assets, zero potentially isolated, two unknown-access
settlements. Timure demonstrates a separate area/date executing without tuning;
there is no independently scored Timure holdout accuracy claim.

## Independent reference comparison

Official EMSR927 AOI01 v1 was retrieved from the official rapid-mapping API.
The observed-event polygon is Landslide, interpreted from optical imagery.
The combined flood/disturbance proxy was compared within the official AOI,
damage-image footprint and jointly valid radar/terrain coverage. Reference
inputs stayed outside the live pipeline.

TP/FP/FN/TN: 9/20/1543/2237, 3,809 valid cells. IoU 0.005725, precision 0.310345,
recall 0.005799, F1 0.011385. Joint coverage 43.6%; 1,263 positive reference cells
lack valid radar/terrain comparison. This is a poor landslide-proxy result,
not a water-only flood segmentation score. Mapping accuracy is not validated.

Local evidence is ignored under artifacts/case-study-syapru, artifacts/holdout-timure,
artifacts/local-ai-validation and data/reference/EMSR927. Sanitized real-mode
UI recordings are in the sibling handoff directory, with hashes and route/status
mappings. They must be labelled recordings rather than new live execution.

## Measured engineering checks

Latest backend check: 110 passed, one upstream Starlette/httpx warning.
Latest combined UI checkpoint: 61 frontend tests and 20 browser tests passed,
with one opt-in storyboard test skipped. Actual API browser integration runs
against fresh credential-free FastAPI and cannot skip. Other browser checks use
recorded/bundled synthetic inputs. Contract reproduction, dependency check,
typecheck/build and bundle secret checks passed. Hosted synthetic replay hashes,
errors and an actual HTTP browser/offline flow passed locally. New Claude edits
must receive their own final checks and independent integration review.

Six-page technical report draft and English/Nepali one-page briefs were rendered,
page-count checked and visually inspected. Nepali remains draft. Portable export
scripts and source Markdown are included; output PDFs are ignored release files.

## Outstanding gates

1. Finish/integrate Claude's path/body-timeout/cancellation/scope/storage tests and
   focused UI pass; rerun combined suites and exact-head CI.
2. Fluent Nepali review with explicit signoff, or preserve DRAFT disclosure.
3. Final three-minute recording and public/unlisted video link.
4. Human registration/student eligibility/team names and research disclosure;
   the human owns organizer clarification and final Devpost submission.
5. Optional Vercel account authorization and deployed-domain checks. Prepared
   Vercel profile is a synthetic read-only replay; full live API is separate.
   Local Docker daemon is unavailable, so the container is not built/verified.

No more paid provider/model key is needed for the local demonstration. A cloud
model/API host is needed only if the public site must run fresh live questions.
A baseline that misses most reference damage cannot be described as a strong
mapping model or promised a winning score. Mission remains simulation only.
