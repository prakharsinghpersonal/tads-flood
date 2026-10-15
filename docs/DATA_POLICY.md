# Sources, provenance and unresolved dependencies

## Official challenge sources

- https://multimodal-ai-hackathon-2026-7.devpost.com/
- https://multimodal-ai-hackathon-2026-7.devpost.com/rules
- https://multimodal-ai-hackathon-2026-7.devpost.com/updates
- Problem index: https://drive.google.com/file/d/1sPrF1CWyJMGk8c3JOwu08_sboeaAE5xc/view
- Track B: https://drive.google.com/file/d/18rhTH_WCBxvttSmp8s40JmPfgL-PhDtx/view
- Additional Track B brief: https://drive.google.com/file/d/1u1ayqUuG0W18uP_7GOptQtnV4BNNGqAB/view
- Submission guide: https://drive.google.com/file/d/1HEy6MBO_BN_aID2Nik2woYLWfuawzwHN/view

## Provider references verified during planning

- CDSE Processing API: https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Process.html
- Sentinel-1 processing/options: https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/S1GRD.html
- Historical OSM: https://docs.ohsome.org/ohsome-api/v2/
- Brief's API URL: https://api.ohsome.org/v1
- Evaluation-only activation: https://mapping.emergency.copernicus.eu/activations/EMSR927/
- PX4 autonomous mission background: https://docs.px4.io/main/en/flight_modes_mc/mission
- PX4 failsafes background: https://docs.px4.io/main/en/config/safety

Current ohsome v2 migration/authentication guide:
https://docs.ohsome.org/ohsome-api/v2/migration_guide.html

Checked in this session: v1 `/metadata` succeeds, identifies API 1.10.4 and
history through 2026-07-27T09:00Z. Both GET and POST attempts at the brief's v1
geometry extraction returned HTTP 403. This does not prove v2 extraction works.
The official v2 guide requires a free API key and currently names
`https://api.heigit.org/ohsome-api/v2-rc/`; extraction returns GeoParquet, not the
old v1 GeoJSON shape. Implement the adapter against documented/observed v2
responses. Configure `OHSOME_API_KEY` server-side and verify quotas. Do not keep
retrying denied legacy extraction or replace historical OSM with current OSM.

Actual keyed v2 extraction subsequently succeeded: 727 smoke-probe features,
all carrying verified pre-snapshot edit timestamps. Authenticated CDSE Process
execution and source tile/date checks also passed. See STATUS.md for actual runs.
A documentation link alone remains insufficient evidence of execution or quotas.
CDSE requires the user's own access configuration.
Never request secrets in chat or commit them. The LLM provider is configurable;
no API credits are supplied. Actual local Ollama execution uses an already
installed model on this Mac; no model download or paid subscription was created.

## Mandatory input boundary

Allowed assessment inputs: Sentinel-1, Sentinel-2, Copernicus DEM, pre-event
OpenStreetMap and explicitly permitted training data. Official damage maps,
UNOSAT layers and OSM edits after the event are evaluation-only. Current xBD
research annotations are not an approved substitution for this pipeline.
New drone/human observations belong to a separate simulation/operational overlay
and must not modify the scored official-input assessment without organizer
clarification. Reference layers stay out of the app/provider input graph.

`data/raw`, `data/cache` and `data/reference` are ignored. Download manifests
record license, source/product ID, timestamp, hash, AOI and usage. Derived assets
retain the relevant redistribution/license obligations; public code license
does not override data license. Use only authorized material.

## Required attribution from the Track B brief

"Contains modified Copernicus Sentinel data 2026."

"Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence
and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA;
all rights reserved."

"© OpenStreetMap contributors."

Plus a citation of each training dataset used and, for reference comparison,
"European Union, Copernicus Emergency Management Service data".
Check licenses at original sources before redistribution: the brief itself notes
inconsistent/missing licenses on some proposed training datasets. The selected
copilot route does not require claiming those datasets were used.

## Organizer questions for the human

1. Is reuse of the pre-existing TADS algorithm/code permitted with clear disclosure
   and a new satellite/infrastructure application built during this event?
2. The official EMSR927 AOI01 product has now been retrieved from the official
   rapid-mapping dashboard API and compared separately. Its observed-event class
   is Landslide. Clarify the expected interpretation if the organizer intends a
   different reference class/product; do not present it as water-only ground truth.
3. Does calibrated Sentinel Hub processing meet the "raw satellite data" input
   requirement, provided no official damage layers are used?
4. Clarify eligibility if the human entrant is not a current student.

We do not contact organizers or post messages automatically. Research reuse,
eligibility remain human-owned. Live access and the official reference comparison
are recorded, but the poor mapping result remains a material limitation.
Do not claim a successful rescue or predict a glacier collapse.
