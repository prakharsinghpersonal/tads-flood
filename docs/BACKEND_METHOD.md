# Implemented backend method and reproducibility limits

This describes the code checkpoint, not a validated disaster-response method.
Assessment schema: 1.0.0; pipeline fingerprint: flood-assessment-v1.3; radar
method: sar-change-baseline-v1. Independent geographic evaluation is pending.

## Inputs and source selection

Request: WGS84 bbox [west,south,east,north], each side at most 0.5 degrees, ISO
calendar event date, explicit mode. Event-day bracketing uses midnight UTC.
Live mode selects before/after Sentinel-1 GRD IW VV-compatible scenes within
24 days before and 18 days after. Pairing requires explicit matching relative
orbit and ascending/descending direction. Missing relative orbit is resolved
only by exact official product metadata, capped at 32 lookups; it is not derived
from absolute orbit or satellite names. Catalogue pagination is capped at 600
features. Incompatible/missing scenes fail explicitly.

CDSE Process requests use Gamma0 terrain backscatter, orthorectification,
Copernicus 30 m DEM and Lee 5×5 speckle filtering. The selected scene's acquisition
window is ±1 second. VV, dataMask and shadowMask are retained. Exact contributing
Process API tile IDs still need verification on a credentialed run; selected
catalogue IDs and output byte hashes are not sufficient to close that gate.

Historical ohsome v2 extraction requests roads, building footprints, hospitals,
clinics and settlements at midnight on the day before the event; it never falls
back to current OSM. GeoParquet WKB/CRS and stable identifiers are checked, with
at most 10,000 rows. A row version at/after the event is rejected. Closed-world
OSM extraction, timestamp semantics and real field compatibility await a keyed
run. Raw EMS/UNOSAT damage layers are forbidden inference inputs.

Optional Sentinel-2 L2A is selected within ten post-event days, scene cloud cover
at most 30%. It corroborates radar; it does not create coverage where radar is
missing. DEM is required by the current live runner. DEM source.acquired_at is
retrieval time, not an elevation survey date.

## Grid, candidate masks and area

The center's northern/southern UTM zone is used, supporting latitudes −80 to 84.
Geographic bounds are densified with 21 edge points during projection. The grid
starts at approximately 20 m cells and coarsens to keep each dimension ≤1024.
Both radar scenes and auxiliary rasters must match CRS, transform and size.
The rectangular UTM processing extent can be slightly larger than the requested
geographic rectangle. Areas/coverage currently describe that processing grid;
exact geographic AOI clipping is a further refinement. Image-source corners are
provided with the manifest rather than stretching imagery to the request bbox.

A pixel is valid only with positive finite VV and masks in both scenes, no SAR
shadow, finite DEM gradient and slope ≤30°. This is not full layover modeling.
Backscatter is converted from linear power to dB with 10 log10(VV).

Default new-water candidate: before >−16 dB, after ≤−16 dB, drop ≥3 dB, valid.
Already-dark water is excluded by the before threshold; no independent permanent
water atlas is used. Candidate disturbance: brightening ≥6 dB, valid. Brightening
is **not** a validated debris classifier and can have other physical causes.
Thresholds are hand-set baselines, not calibrated probabilities or learned flood
segmentation. All results retain a partial/unavailable quality label.

Clear S2 SCL classes 4/5/6 and its data mask allow MNDWI=(B03−B11)/(B03+B11)
corroboration. Clear candidate cells with finite negative MNDWI are reported as
contradictions in warnings; candidates are not silently erased. No clear optical
coverage remains SAR-only. Flood polygons are polygonized mask components,
limited to 20,000 components. Candidate area equals valid candidate cell count
×absolute metric pixel area. All-nodata area is null, never a reassuring zero.

## Exposure and access graph

Source geometries are projected to metric coordinates. Vehicle-oriented roads
exclude paths/steps/footways/construction and private/no-access ways. Intersections
are noded within matching layer/bridge/tunnel grades; shared endpoints join bridge
approaches. Settlement/facility centroids snap to the nearest line within 200 m,
and the line is split there. The selected line's grade is preserved. Road budget:
5,000 parts, 2,000 locations, 30,000 resulting edges.

A road segment is candidate exposed at >1 m mask overlap. A building is candidate
exposed at positive area overlap. Both flood and unvalidated disturbance contribute
to exposure. An asset is counted once by stable source ID. Hospital/clinic polygon
footprints can be both facility locations and exposed buildings. Roads/buildings
with <95% comparison coverage carry unknown status. Facility entrance positions,
physical passability and full OSM turn/node semantics are unresolved.

Shortest metric paths are computed to mapped facilities before and after removing
candidate edges (conditional assumption: those edges are impassable). A farther
reachable facility prevents declaring new mapped isolation. Results distinguish
connected, potentially_isolated, preexisting_disconnected and unknown_network.
All-nodata or a chosen remaining route with missing coverage gives unknown current
access. A finite AOI may miss outside routes/facilities, and geometric noding can
misrepresent topology. A connected mapped path is not a verified safe route.

## Provenance, jobs, grounding and evaluation

Raw inputs/previews use SHA-256 content addressing and checked manifests. An
assessment identity includes source IDs/hashes, request scope, radar metadata,
method and pipeline version; the first stored result for that ID is immutable.
The offline package hashes exact snapshot and image bytes. Credentials are
server-only. Two workers and an eight-job queue bound work; cancellation and
restart do not silently replay jobs. This implementation assumes one API process.

The configured LLM receives an approved fact menu (≤80 IDs) and question as
untrusted data. Strict output selects ≤20 fact IDs or refuses. Duplicate, unknown,
outside-menu, extra-field and incomplete output fails. Code renders every number,
wording template and evidence citation. The actual model call is not yet tested.
English/Nepali previews use the same numeric facts, but Nepali templates require
fluent review. The model selector can still choose irrelevant supported facts;
relevance/refusal quality requires real-model evaluation. HTML briefs select at
most eight claims; full selected claims are available in JSON.

Evaluation lives separately: aligned boolean prediction/reference/valid masks,
confusion counts, IoU, precision, recall and F1 over independent valid cells.
No valid reference or undefined denominator returns null. Synthetic tests do
not supply a real case-study score. Threshold tuning and holdout references must
be separate, and EMS/UNOSAT layers must remain outside provider inputs.
