# Acceptance and test matrix

Status at planning: these are required cases, not a claim that all pass.
Codex's executable cases cover validation, metric raster/graph logic, provider
contracts with mocks, job lifecycle, provenance/cache integrity, report grounding
and fixture behaviour. Record measured counts in STATUS.md. A unit-test count
does not indicate that every acceptance row or real-data release gate has passed.

| ID | Owner | Scenario/input | Expected result |
|---|---|---|---|
| V01 | Codex | Reversed/zero-area/out-of-range bbox | 422, no provider calls |
| V02 | Codex | Valid bbox and ISO date | Request accepted with unchanged coordinates |
| V03 | Codex | Oversized AOI or raster budget | Explicit bounded-area error |
| P01 | Codex | Before/post Sentinel-1 pair, same relative orbit/polarization | Pair accepted; provenance retained |
| P02 | Codex | Mismatched orbit/polarization/grid | Reject or explicit unavailable; no fake pixel diff |
| P03 | Codex | Before scene at/after event or post scene before event | Temporal validation error |
| P04 | Codex | All no-data radar crop | unavailable, not zero flood |
| P05 | Codex | Partly covered AOI | Partial status; valid mask and warning |
| P06 | Codex | Clouds cover S2 | SAR continues; optical corroboration unavailable |
| P07 | Codex | Permanent water or radar shadow | Excluded/uncertain according to method, not confidently new flood |
| P08 | Codex | Independent clear wet/dry toy cells with nodata | Correct baseline score/mask; nodata preserved |
| P09 | Codex | Same seed/config/input hashes twice | Same computed result except execution timestamp |
| P10 | Codex | Live provider fails/auth absent | Explicit failure; never return synthetic fixture |
| P11 | Codex | 429 and transient 5xx | Bounded retry/backoff; cancel honored |
| D01 | Codex | OSM snapshot at/after event | Reject inference input |
| D02 | Codex | EMS/UNOSAT reference attached as input | Reject; evaluation-only storage path |
| D03 | Codex | Tampered cache payload/manifest hash | Invalidate and explain; no silent use |
| D04 | Codex | Requests use current OSM fallback | Test forbids fallback |
| G01 | Codex | Settlement–bridge–hospital chain; bridge candidate blocked | potentially_isolated, correct cut ID |
| G02 | Codex | Same graph with alternative route | connected; alternative path exposed |
| G03 | Codex | Settlement disconnected before event | preexisting_disconnected, not new flood impact |
| G04 | Codex | No hospital/town node | unknown_network with reason |
| G05 | Codex | Settlement not snapped within tolerance | unknown_network |
| G06 | Codex | Nearest facility cut, farther facility reachable | connected to any facility; nearest-route loss distinguished |
| G07 | Codex | Duplicate edge IDs/dangling endpoints/negative length | Validation rejection |
| G08 | Codex | One-way road and disconnected grade-separated crossing | Correct directed topology; no artificial intersection |
| G09 | Codex | Uncertain damaged edge | Optimistic/pessimistic connectivity reported |
| G10 | Codex | Duplicate asset fragments/overlap | Stable-ID count once; metric affected length |
| A01 | Codex | AI generated unsupported numeral/fact | Rejected or replaced from approved fact IDs |
| A02 | Codex | Claim lacks evidence ID | Rejected; source-linked fallback/refusal |
| A03 | Codex | Ask casualties, rescue success, unrelated question | Refuse unsupported content |
| A04 | Codex | English/Nepali reports from same evidence | Same quantities, names, citations and uncertainty |
| A05 | Codex | LLM unavailable | Template explicitly labeled; AI readiness false |
| A06 | Codex | Prompt injection inside provider/OSM text | Treated as data; no policy/number override |
| U01 | Claude | Load demo/live assessment | Unambiguous provenance badge; real coordinates projected |
| U02 | Claude | Select settlement/road | Exact route/cut segment and evidence inspector open |
| U03 | Claude | Compare before/after and layer toggles | Aligned geography; visible acquisition dates |
| U04 | Claude | Network error/empty job/cancel | Recoverable error; no fictitious results |
| U05 | Claude | Unknown and preexisting-disconnected settlements | Separate labels; not displayed as new damage |
| U06 | Claude | Report selection/export | Same backend quantities and citation IDs |
| O01 | Claude | Internet lost, local drone link active | Cached app/data usable; no fresh satellite claims |
| O02 | Claude | Drone link lost, internet active | Last-known marker/telemetry freeze; remote commands gated |
| O03 | Claude | Step simulator during radio loss | Local events accrue but not visible as received evidence |
| O04 | Claude | Reconnect twice with duplicate IDs | Exactly-once assimilation; no trust inflation |
| O05 | Claude | Queue inspection while disconnected | Local pending label; no false acknowledgement |
| O06 | Claude | Queued command expires before reconnect | Review needed; no delayed automatic execution |
| O07 | Claude | Browser reload offline with cached package | Same package/received events restore from IndexedDB |
| O08 | Claude | Browser offline without package | Explicit missing-package screen |
| O09 | Claude | Simulated observation changes | Base assessment immutable; overlay/report namespace separate |
| O10 | Claude | Uncertainty-prior conflict and duplicate own observation | Acquisition responds as intended; evidence deduplicated |
| O11 | Claude | Low battery/positioning failure scenario | Defined simulation fallback; no real-flight claim |
| X01 | Claude | Tab/Enter/Space, focus in inspector/dialog | Complete essential flow without mouse |
| X02 | Claude | 320/768/1440 widths | No clipping; evidence/controls remain accessible |
| X03 | Claude | Reduced motion | No looping/essential animation dependency |
| S01 | Joint | API keys in bundle/history/logs | None present; server-only configuration |
| S02 | Joint | User-controlled provider URL | No unrestricted remote fetch/SSRF path |
| E01 | Codex | Required reference case study | Independent metrics with valid-area denominator and limits |
| E02 | Joint | Judge-selected unseen AOI/date | End-to-end real inputs, provenance, errors documented |
| E03 | Joint | Clean clone using README | Repeatable setup, tests and demo |
| E04 | Joint | Public artifacts/video/report | Accessible, attributed; video 3 min; report ≤6 pages |

## Release gates

1. Fixture CI: units + schemas + frontend build + browser core flows.
2. Real-data gate: provider access, required case-study execution, independent AOI.
3. Inference-integrity gate: pre-event inputs, reference isolation, no silent mocks.
4. AI gate: actual bilingual model run with claim validation and sample review.
5. Evidence gate: provenance drilldown, numerical agreement, reproducible metrics.
6. Delivery gate: clean clone, exact demo timing, README, reports and attributions.

Synthetic fixture tests cannot establish mapping accuracy, model grounding on
real data, real drone autonomy, or competition eligibility. Retain failing cases.

## Backend checkpoint evidence

The runtime checkpoint has 91 passing backend tests. Representative executable
coverage: V01–V03 request/budget guards; P01–P04/P07–P08 compatibility, shadows,
permanent water and nodata; P10–P11 mock failures/retry budgets; D01–D03 historical
input and cache integrity; G01–G08 graph counterexamples; A01–A05 claim selection,
refusal and deterministic bilingual previews. Additional runtime tests cover
queue saturation, cancellation, restart, snapshots and asset checksums.

These groupings include synthetic/mocked cases only. Optical provider execution,
partial-coverage interpretation across multiple possible routes, duplicate real
OSM fragments, prompt-injection robustness against an actual model, real provider
performance, required-case-study evaluation, holdout AOI execution and final
delivery evidence remain pending or partial. Refer to the named test files rather
than treating this list as a blanket pass for a whole acceptance group.
