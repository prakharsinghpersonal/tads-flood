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

These references describe possible integrations. A link in this file does not
mean that credentials, quotas, processed imagery, mission hardware or reference
products have been verified. CDSE requires the user's own access configuration.
Never request secrets in chat or commit them. The LLM provider is configurable;
we have not assumed a free model subscription or supplied API credits.

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
2. Confirm the required EMSR927 reference products and their case-study linkage;
   the current web read returns only the activation site's shell.
3. Does calibrated Sentinel Hub processing meet the "raw satellite data" input
   requirement, provided no official damage layers are used?
4. Clarify eligibility if the human entrant is not a current student.

We do not contact organizers or post messages automatically. Research reuse,
live source access and official reference verification remain explicit release
risks. Do not claim a successful rescue or predict a glacier collapse.

