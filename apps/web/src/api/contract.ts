// Typed mirror of the frozen v1 contract (contracts/assessment.schema.json).
// Objects are strict because the schema sets additionalProperties: false.
// Regenerate by hand from the schema when Codex publishes a new version.
import { z } from 'zod';

export const SUPPORTED_SCHEMA_VERSION = '1.0.0';

const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected ISO calendar date');

export const SourceSchema = z
  .object({
    source_id: z.string(),
    kind: z.enum(['sentinel_1', 'sentinel_2', 'osm', 'dem', 'synthetic']),
    acquired_at: isoDateTime,
    uri: z.string(),
    license: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    usage: z.enum(['input', 'evaluation_only']).default('input'),
  })
  .strict();

export const QualitySchema = z
  .object({
    status: z.enum(['usable', 'partial', 'unavailable']),
    valid_fraction: z.number().min(0).max(1),
    warnings: z.array(z.string()),
    method_version: z.string(),
  })
  .strict();

export const SummarySchema = z
  .object({
    candidate_flood_area_m2: z.number().min(0).nullable().default(null),
    exposed_asset_count: z.number().int().min(0).nullable().default(null),
    potentially_isolated_count: z.number().int().min(0),
    unknown_network_count: z.number().int().min(0),
  })
  .strict();

// Features are open objects in v1; geometry/properties are read defensively.
export const FeatureSchema = z.record(z.unknown());
export const FeatureCollectionSchema = z
  .object({
    type: z.literal('FeatureCollection').default('FeatureCollection'),
    features: z.array(FeatureSchema),
  })
  .strict();

export const LayersSchema = z
  .object({
    flood: FeatureCollectionSchema,
    debris: FeatureCollectionSchema,
    roads: FeatureCollectionSchema,
    buildings: FeatureCollectionSchema,
    settlements: FeatureCollectionSchema,
  })
  .strict();

export const SettlementStatusSchema = z.enum([
  'connected',
  'potentially_isolated',
  'preexisting_disconnected',
  'unknown_network',
]);

export const SettlementResultSchema = z
  .object({
    settlement_id: z.string(),
    status: SettlementStatusSchema,
    baseline_facility_id: z.string().nullable(),
    baseline_route_edge_ids: z.array(z.string()),
    post_event_facility_id: z.string().nullable(),
    post_event_route_edge_ids: z.array(z.string()),
    candidate_cut_edge_ids: z.array(z.string()),
    any_facility_access: z.boolean().nullable(),
    evidence_ids: z.array(z.string()),
    reason: z.string(),
  })
  .strict();

export const EvidenceSchema = z
  .object({
    evidence_id: z.string(),
    source_ids: z.array(z.string()),
    kind: z.enum(['inferred', 'measured', 'synthetic']),
    description: z.string(),
    method_version: z.string(),
  })
  .strict();

export const AssessmentSchema = z
  .object({
    schema_version: z.literal(SUPPORTED_SCHEMA_VERSION),
    assessment_id: z.string(),
    mode: z.enum(['synthetic', 'live', 'cached_live']),
    event_date: isoDate,
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    generated_at: isoDateTime,
    sources: z.array(SourceSchema),
    quality: QualitySchema,
    summary: SummarySchema,
    layers: LayersSchema,
    settlements: z.array(SettlementResultSchema),
    evidence: z.array(EvidenceSchema),
    limitations: z.array(z.string()),
  })
  .strict();

export type Source = z.infer<typeof SourceSchema>;
export type Quality = z.infer<typeof QualitySchema>;
export type Summary = z.infer<typeof SummarySchema>;
export type SettlementStatus = z.infer<typeof SettlementStatusSchema>;
export type SettlementResult = z.infer<typeof SettlementResultSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Assessment = z.infer<typeof AssessmentSchema>;
export type AssessmentMode = Assessment['mode'];
export type LayerName = keyof Assessment['layers'];

export const AssessmentRequestSchema = z
  .object({
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    event_date: isoDate,
    mode: z.enum(['synthetic', 'live']),
  })
  .strict();
export type AssessmentRequest = z.infer<typeof AssessmentRequestSchema>;

// POST /api/v1/assessments. The starter returns a completed job; queued/running
// jobs are planned. Both shapes are accepted, nothing is invented for either.
export const JobStatusSchema = z.enum([
  'queued',
  'fetching',
  'processing',
  'analyzing',
  'reporting',
  'completed',
  'failed',
  'cancelled',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  job_id: z.string(),
  status: JobStatusSchema,
  assessment_id: z.string().nullable().optional(),
  mode: z.enum(['synthetic', 'live', 'cached_live']).optional(),
  fraction: z.number().min(0).max(1).nullable().optional(),
  stage_message: z.string().nullable().optional(),
  retries: z.number().int().min(0).nullable().optional(),
  error: z.unknown().optional(),
});
export type Job = z.infer<typeof JobSchema>;

// GET /api/v1/assessments/{id}/report. Not yet in the generated schema; this
// mirrors services/api/src/tads_flood/reports.py at the time of writing.
export const ReportClaimSchema = z.object({
  claim_id: z.string(),
  text: z.string(),
  evidence_ids: z.array(z.string()),
});
export const ReportSchema = z.object({
  assessment_id: z.string(),
  mode: z.enum(['synthetic', 'live', 'cached_live']),
  generator: z.string(),
  ai_ready: z.boolean(),
  language: z.string(),
  facts: z.record(z.union([z.number(), z.string(), z.null()])),
  claims: z.array(ReportClaimSchema),
  limitations: z.array(z.string()),
});
export type Report = z.infer<typeof ReportSchema>;
export type ReportClaim = z.infer<typeof ReportClaimSchema>;

// Copilot answers and /brief previews (GroundedReport in contracts/openapi.json).
// The generator says which path ran: deterministic_template is never AI.
export const GroundedReportSchema = ReportSchema.extend({
  model: z.string().nullable(),
  refused: z.boolean(),
  answer: z.string(),
  translation_reviewed: z.boolean(),
});
export type GroundedReport = z.infer<typeof GroundedReportSchema>;

export const CopilotRequestSchema = z
  .object({ question: z.string().min(1).max(2000), language: z.enum(['en', 'ne']) })
  .strict();

const corner = z.tuple([z.number(), z.number()]);
export const RasterAssetSchema = z
  .object({
    role: z.enum(['before_radar', 'after_radar']),
    uri: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    media_type: z.literal('image/png'),
    // top-left, top-right, bottom-right, bottom-left (MapLibre image source order)
    coordinates: z.tuple([corner, corner, corner, corner]),
    source_id: z.string().nullable(),
    acquired_at: isoDateTime.nullable(),
    rendering: z.string(),
  })
  .strict();
export type RasterAsset = z.infer<typeof RasterAssetSchema>;

export const AssessmentPackageSchema = z
  .object({
    schema_version: z.string(),
    assessment_id: z.string(),
    mode: z.enum(['synthetic', 'live', 'cached_live']),
    assessment: z.unknown(),
    assessment_uri: z.string(),
    assessment_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    assets: z.array(RasterAssetSchema),
    attribution: z.array(z.string()),
    limitations: z.array(z.string()),
  })
  .strict();
export type AssessmentPackage = z.infer<typeof AssessmentPackageSchema>;

// Booleans only; "configured" is not "verified".
export const ReadinessSchema = z.object({
  satellite_configured: z.boolean(),
  historical_osm_configured: z.boolean(),
  ai_configured: z.boolean(),
  live_configured: z.boolean(),
  note: z.string().optional(),
});
export type Readiness = z.infer<typeof ReadinessSchema>;

// Only same-origin API paths may be fetched for package bytes (no arbitrary URLs).
// The check runs on what the browser will actually request: the URL parser must
// leave the path unchanged (so %2e%2e and similar cannot be normalised away),
// every decoded segment is checked for dot segments, backslashes and controls,
// and the query is one plain key=value list. Percent-encoded IDs (including an
// encoded "/" inside a source ID, as the contract allows) remain valid.
const BASE = 'http://same-origin.invalid';
export function isSameOriginApiPath(uri: string): boolean {
  if (typeof uri !== 'string' || !uri.startsWith('/api/v1/') || uri.startsWith('//')) return false;
  if (/[\s\\#]/.test(uri) || (uri.match(/\?/g) ?? []).length > 1) return false;
  let url: URL;
  try {
    url = new URL(uri, BASE);
  } catch {
    return false;
  }
  if (url.origin !== BASE || url.pathname + url.search !== uri) return false;
  if (!url.pathname.startsWith('/api/v1/')) return false;
  for (const raw of url.pathname.split('/').slice(1)) {
    if (raw === '') return false;
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return false; // malformed percent escape
    }
    if (/[\u0000-\u001f\u007f\\]/.test(decoded)) return false;
    if (decoded.split('/').some((part) => part === '.' || part === '..')) return false;
  }
  const query = url.search.slice(1);
  if (query && !/^[A-Za-z0-9_.-]+=[A-Za-z0-9_.-]*(&[A-Za-z0-9_.-]+=[A-Za-z0-9_.-]*)*$/.test(query)) return false;
  return true;
}

export const ErrorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }),
  details: z.unknown().optional(),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export type ParseResult =
  | { ok: true; assessment: Assessment; warnings: string[] }
  | { ok: false; kind: 'unsupported_version'; found: unknown }
  | { ok: false; kind: 'invalid'; issues: string[] };

// Validates a payload and the references the schema cannot express. A failure
// here is shown to the user; the app never guesses at an unknown version.
export function parseAssessment(payload: unknown): ParseResult {
  const version = (payload as { schema_version?: unknown } | null)?.schema_version;
  if (version !== SUPPORTED_SCHEMA_VERSION) {
    return { ok: false, kind: 'unsupported_version', found: version };
  }
  const parsed = AssessmentSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'invalid',
      issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const a = parsed.data;
  const issues: string[] = [];
  const warnings: string[] = [];

  const [w, s, e, n] = a.bbox;
  if (!(w >= -180 && e <= 180 && s >= -90 && n <= 90 && w < e && s < n)) {
    issues.push(`bbox: expected [west, south, east, north] with positive area, got ${a.bbox.join(', ')}`);
  }
  const sourceIds = new Set(a.sources.map((src) => src.source_id));
  for (const src of a.sources) {
    if (src.usage === 'evaluation_only') {
      issues.push(`sources: ${src.source_id} is evaluation_only and cannot be an assessment input`);
    }
  }
  const evidenceIds = new Set(a.evidence.map((ev) => ev.evidence_id));
  for (const ev of a.evidence) {
    for (const id of ev.source_ids) {
      if (!sourceIds.has(id)) issues.push(`evidence ${ev.evidence_id}: unknown source ${id}`);
    }
  }
  for (const st of a.settlements) {
    for (const id of st.evidence_ids) {
      if (!evidenceIds.has(id)) issues.push(`settlement ${st.settlement_id}: unknown evidence ${id}`);
    }
  }
  if (a.mode === 'synthetic' && a.sources.some((src) => src.kind !== 'synthetic')) {
    issues.push('Synthetic assessment must use synthetic source kinds.');
  }
  if (a.mode !== 'synthetic' && a.sources.some((src) => src.kind === 'synthetic' || src.uri.startsWith('synthetic://'))) {
    issues.push(`mode ${a.mode} cannot reference synthetic kinds or synthetic:// sources`);
  }
  // Summary counts are backend facts. The browser only checks that they agree
  // with the backend's own settlement list; it never substitutes its own total.
  const isolated = a.settlements.filter((st) => st.status === 'potentially_isolated').length;
  const unknown = a.settlements.filter((st) => st.status === 'unknown_network').length;
  if (isolated !== a.summary.potentially_isolated_count) {
    warnings.push(
      `Summary reports ${a.summary.potentially_isolated_count} potentially isolated, settlement list has ${isolated}.`,
    );
  }
  if (unknown !== a.summary.unknown_network_count) {
    warnings.push(`Summary reports ${a.summary.unknown_network_count} unknown network, settlement list has ${unknown}.`);
  }
  if (issues.length) return { ok: false, kind: 'invalid', issues };
  return { ok: true, assessment: a, warnings };
}
