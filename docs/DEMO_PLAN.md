# Three-minute evidence-led demo

Only show completed capabilities. Record actual assessments and tag simulation
segments clearly. A synthetic fallback is useful for rehearsal but cannot stand
in for the real-data competition gate.

| Time | Scene | What the judge should learn |
|---|---|---|
| 0:00–0:15 | Problem and one selected AOI/date | We answer where exposure occurs and who may lose road access |
| 0:15–0:45 | Actual S1 before/after; S2 when clear | Source IDs, orbit/date agreement, candidate flood/debris and uncertainty |
| 0:45–1:15 | Select a potentially isolated settlement | Highlight baseline route, affected bridge/road, alternate-route result |
| 1:15–1:40 | Evidence inspector + one-page report | Each quantity and conclusion traces to map computation/source IDs |
| 1:40–2:00 | English/Nepali AI copilot | Actual grounded generation; unsupported casualty question is refused |
| 2:00–2:25 | Optional simulated offline inspection | Cached prior, radio loss, last-known telemetry, reconnect/dedup |
| 2:25–2:50 | Case-study metrics + independent AOI | Measured results, sample/coverage, unseen-area pipeline evidence |
| 2:50–3:00 | Limitations + reproducibility | Educational prototype; inference vs observation; GitHub/setup |

If the drone extension is not verified, use its slot to demonstrate an unseen
AOI/date, missing-data case or alternative route. Do not spend time on an app
tour while omitting data processing. No generated victim imagery or casualty
claims. A drone simulation is not a real-world rescue outcome.

## The strongest example

Choose a real settlement where the result can be checked. Open its pre-event
route, inspect one exposed edge, show a remaining alternate route if present,
and explain how optimistic/pessimistic closure assumptions affect isolation.
Do not choose or tune the thresholds using held-out reference labels. A negative
example where apparent flooding does not imply isolation is useful evidence.

## Report outline, maximum six pages

1. Problem, task coverage, architecture and contribution.
2. Data sources/dates/licenses, pair-selection and preprocessing.
3. Detection baseline, debris handling, exposure and road topology.
4. Grounded AI, English/Nepali validation, provenance and offline separation.
5. Independent case-study/holdout results, sample counts and sensitivity.
6. Failure cases, unresolved coverage, reproducibility and limitations.

Attach a separate generated one-page situation report. Do not invent evaluation
numbers. State CPU/memory/runtime on the machine actually used. Provide the
official attribution strings in DATA_POLICY.md wherever applicable.

