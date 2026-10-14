# UI specification (Half B, `apps/web`)

Owner: Claude. Consumes contract v1 (`1.0.0`). This describes what is built,
not plans; planned items are marked.

## Layout

Map-first workspace. Desktop (>900 px): side panel (320–400 px) left, map fills
the rest, evidence inspector floats over the right of the map and the map refits
the selected route into the visible area. ≤900 px: map (45 vh) above the panel;
inspector is a bottom sheet (≤70 vh). ≤420 px: single-column forms and key/value
lists. Tested at 320, 768 and 1440 px (no horizontal overflow, close button in view).

Top bar: product name, then badges that are always visible once data is loaded:

- **Mode** from the payload: `SYNTHETIC` (striped amber), `LIVE`, `CACHED LIVE`.
  Synthetic also shows a full-width banner.
- **Channel**: Received from API / Bundled UI fixture (no API) / Cached offline
  package · assessment age.
- **Internet**: browser online/offline. This is never the drone radio link,
  which has its own badge inside the simulation panel.

## Panels (tabs, arrow-key navigable)

1. **Assessment**
   - *Prepare*: W/S/E/N inputs with explicit order hint, date, Live vs Synthetic
     demo. Validation: numeric, ranges, west<east, south<north, ISO date. Run is
     disabled offline. Job stages (queued → completed) when the API reports them;
     Cancel aborts requests and asks the server to cancel a live job.
     States: cancelled, empty ("not evidence that the area is unaffected"),
     network/timeout (Retry), live provider unavailable, auth, quota, 422,
     unsupported schema version, invalid payload. No state falls back to fixtures.
     "Open bundled UI fixture" is a separate, explicitly labelled action.
   - *Summary*: backend `summary` values only; coverage quality and warnings;
     contract-integrity warnings (e.g. summary vs settlement list mismatch).
   - *Before/after*: scene IDs and acquisition times from `sources`, split at the
     event date. No raster is drawn because v1 has no imagery asset (proposal in
     `docs/coordination/2026-10-13-ui-geometry-and-report-shape.md`).
   - *Layers*: candidate flood, candidate disturbance/debris, roads + exposed
     edges, exposed assets, settlement access, uncertainty/no-data.
   - *Settlement access*: grouped by status with separate labels and explainers:
     Potentially isolated (inferred, not verified), Unknown network (not safe),
     Connected, Disconnected before event (not flood impact).
   - *Exposed assets and road edges* list (keyboard path to map features).
   - *Limitations* from the payload.
2. **Report**: fetches `/report?language=en|ne` from the backend. Shows the
   generator tag (deterministic template is labelled "not the AI copilot"), a
   facts table with a "matches map summary" column (comparison only; the browser
   never computes totals), findings with clickable evidence-ID citations, data
   availability, limitations, attribution. Nepali 501 is shown as "not available
   yet"; no browser translation. Print (print CSS shows only the brief) and
   download (.md brief, raw JSON). Bundled-fixture assessments show "no report".
   Copilot Q&A: placeholder stating the endpoint is planned.
3. **Offline & mission**: offline packages, then the simulation.

## Evidence inspector

Opens on selection from list, map click, route chip or citation; focus moves to
its heading; Esc or × closes. Settlement: status + explainer, backend reason,
baseline/post-event facility, any-facility access (true/false/unknown), pre- and
post-event route edge chips, candidate cut chips ("not a verified closure").
Feature: layer, ID, status, candidate-blocked wording, length, flood_score as
"heuristic, not a probability", method version, source link, settlements whose
routes use it. Evidence cards: Measured / Inferred / Synthetic tag, description,
method version, sources with acquisition time. Source: kind, acquired, usage,
URI, license, SHA-256. Timestamps: event date, generated, received by browser
(+ channel). "Flag as reviewed by me" is local and explicitly does not change a
status. There is no "mark safe".

## Map

MapLibre GL with a local-only style (background + packaged GeoJSON; no remote
tiles, glyphs or sprites), so cached viewing never needs the network. Colour is
paired with a second cue: exposed roads dashed, debris dotted outline, unknown
features dashed purple outline/ring, cut edges thick dashed red, baseline route
wide translucent blue, post-event route solid green. Attribution reflects source
kinds (synthetic notice, Copernicus, OSM). A map error shows a banner; a map
crash is caught by an error boundary and the lists/inspector keep working.

## Offline packages

"Save current assessment as offline package" stores in IndexedDB
(`tads-flood` DB: `manifests`, `assets`, `missions`, `meta`): the exact assessment
JSON, backend reports (EN/NE, or the recorded error), and a `browser-package-1`
manifest with asset SHA-256s, AOI, event date, scene times, attributions,
basemap note and limits. Opening re-hashes every asset and refuses a mismatch.
A service worker caches only the built app shell (never `/api`), so after an
offline reload the last package and its mission state reopen automatically.
Offline with no package: explicit "No offline package exists in this browser".

## Simulated inspection (optional)

Badged SIMULATION; requires an open package. Two simulated drones over a 5×5 tile
grid within user-set bounds (validated inside the AOI); exploration preference
low/medium/high. Per step each drone scores tiles by hazard prior (from cached
candidate-flood polygons), Beta-trust uncertainty, novelty, separation from the
other drone's target and distance; deterministic seed 2707. Trust is Beta(1,1),
updated by agreement with the prior, computed from an event-ID-keyed set, so
duplicates cannot inflate it. Drones share by event-ID union when within range.

Radio link connected/lost is separate from internet. While lost: telemetry
table freezes (age shown in steps), onboard events are not shown, inspection
requests are "Local pending — not sent", Return to launch is disabled. On
reconnect: events delivered once with original event time and new receipt time;
queued requests past expiry become "Expired — review needed" (Reissue/Dismiss),
never executed automatically. Acknowledged only after a drone responds over a
live link. Low battery → return to launch; GNSS loss → hold then land; both
labelled simulation policy. Simulated log downloads under a `simulation`
namespace. The assessment object is never modified (tested with a deep-frozen copy).

## Accessibility

Skip link; native buttons/inputs (44 px targets); tablist with arrow keys;
focus moved to the inspector heading on open; Esc closes; evidence is never
hover-only; reduced-motion disables animation and map fly-to easing.
