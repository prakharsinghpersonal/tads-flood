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
   - *Demo data*: "Load computed demo (synthetic)" calls `/api/v1/demo/geographic`
     (backend pipeline on synthetic inputs). The empty legacy `/api/v1/demo` and
     the bundled UI fixture sit under "Other test data". Readiness booleans are
     shown as configuration only ("Configured does not mean tested"); the browser
     never accepts keys.
   - *Radar before/after*: PNGs named by `/assessments/{id}/package`, each fetched
     from a same-origin API path, SHA-256 checked against the manifest and placed
     with its four manifest corners as a MapLibre image source under all vector
     layers. Before/After/Hide toggle plus opacity slider; both acquisition dates
     stay visible. Asset `source_id`/`acquired_at` must match the assessment's
     source record. No package / empty asset list → "Imagery unavailable"; hash
     or provenance mismatch → error, nothing drawn. Transparent cells = no-data.
     Object URLs are revoked whenever the scene set changes and on unmount.
   - *Layers*: candidate flood, candidate disturbance/debris, roads + exposed
     edges, exposed assets, settlement access, uncertainty/no-data.
   - *Settlement access*: grouped by status with separate labels and explainers:
     Potentially isolated (inferred, not verified), Unknown network (not safe),
     Connected, Disconnected before event (not flood impact).
   - *Exposed assets and road edges* list (keyboard path to map features).
   - *Limitations* from the payload.
2. **Report**: the backend `/brief?format=json` (GroundedReport) is the main
   view: generator tag (`deterministic_template` → "Deterministic template — not
   AI"; AI paths show generator · model), facts with a "same as map summary"
   column (comparison only), findings with evidence-ID citations, data
   availability, limitations. Nepali briefs with `translation_reviewed: false`
   carry a DRAFT badge; the reviewed `/report?language=ne` status is shown
   separately (501 → "not ready — fluent review pending"). Print, download of the
   backend HTML bytes, and brief JSON. Bundled-fixture assessments show "no
   backend brief". **Copilot**: POST `/copilot` with question (1–2000 chars) and
   language; shows answer, claims with citations, refused tag, generator/model;
   `ai_not_configured` 503 is shown as "not configured, no answer generated";
   malformed or other-assessment answers are discarded; the panel is keyed per
   assessment and ignores superseded responses. Offline or cached views disable
   it with a reason. All backend strings render as text.
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

Unknown-coverage roads (`status: unknown`) use a dotted purple line and are
described as "not known to be passable or blocked". Facility points
(`layers.settlements`, `kind: facility`) are dark navy with a white ring, listed
under *Facilities*, and open a facility view (amenity, settlements whose nearest
facility it is before/after the event, evidence), never a settlement result.

MapLibre GL with a local-only style (background + packaged GeoJSON; no remote
tiles, glyphs or sprites), so cached viewing never needs the network. Colour is
paired with a second cue: exposed roads dashed, debris dotted outline, unknown
features dashed purple outline/ring, cut edges thick dashed red, baseline route
wide translucent blue, post-event route solid green. Attribution reflects source
kinds (synthetic notice, Copernicus, OSM). A map error shows a banner; a map
crash is caught by an error boundary and the lists/inspector keep working.

## Offline packages

`browser-package-2` in IndexedDB (`tads-flood` DB: `manifests`, `assets`,
`missions`, `meta`). For API assessments every asset is the exact byte payload:
`/snapshot` (hash must equal `assessment_sha256`), both radar PNGs (hash must
equal the manifest), English/Nepali briefs (JSON and HTML) and reviewed reports.
Documented not-ready answers (4xx / 501 with an error code) are recorded as
unavailable, never stored as assets; transport failures abort the save.
Everything is verified in memory, then written in one transaction, so a quota
or partial-download failure saves nothing. Opening re-hashes every asset.
Bundled-fixture packages are labelled browser snapshots (local hashes only).
`browser-package-1` packages are listed as "older format", verified and upgraded
in place on open (same hashes, since v1 hashed the same UTF-8 bytes); a tampered
v1 package is refused and left untouched. Package IDs are UUID-based.

The service worker (`tads-flood-shell-v2`) precaches `index.html`, every file in
the build's `asset-manifest.json` (including the bundled MapLibre worker), and
the favicon; it never caches `/api`, matches with `ignoreVary` for the hashed
shell files, and only deletes caches with its own prefix. After an offline
reload the last package reopens with both radar images, briefs, original mode
and its separate mission state. Internet loss never changes the radio-link state.
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
