import type { Assessment, Evidence, LayerName, SettlementResult, SettlementStatus, Source } from '../api/contract';

export const STATUS_LABEL: Record<SettlementStatus, string> = {
  connected: 'Mapped route remains',
  potentially_isolated: 'Potentially isolated',
  preexisting_disconnected: 'Disconnected before event',
  unknown_network: 'Unknown network',
};

export const STATUS_EXPLAINER: Record<SettlementStatus, string> = {
  connected: 'A mapped route to a facility remains. Passability is not verified; this is not a safety rating.',
  potentially_isolated:
    'Inferred from candidate road exposure. Not a verified closure and not confirmed isolation.',
  preexisting_disconnected: 'No route existed before the event. This is not new flood impact.',
  unknown_network: 'Road network coverage or snapping is missing. Access is unknown, not safe.',
};

export const STATUS_ORDER: SettlementStatus[] = [
  'potentially_isolated',
  'unknown_network',
  'connected',
  'preexisting_disconnected',
];

export type ProvenanceChannel = 'api' | 'bundled_fixture' | 'offline_package';

export const CHANNEL_LABEL: Record<ProvenanceChannel, string> = {
  api: 'Received from API',
  bundled_fixture: 'Bundled UI fixture (no API)',
  offline_package: 'Cached offline package',
};

export const MODE_LABEL: Record<Assessment['mode'], string> = {
  synthetic: 'SYNTHETIC',
  live: 'LIVE',
  cached_live: 'CACHED LIVE',
};

export interface LoadedAssessment {
  assessment: Assessment;
  channel: ProvenanceChannel;
  received_at: string;
  package_id?: string;
  warnings: string[];
}

export type Selection =
  | { kind: 'settlement'; id: string }
  | { kind: 'feature'; layer: LayerName; id: string }
  | { kind: 'evidence'; id: string }
  | { kind: 'source'; id: string };

export interface FeatureRef {
  layer: LayerName;
  id: string;
  feature: GeoFeature;
}

export interface GeoFeature {
  type?: string;
  id?: string | number;
  geometry?: { type: string; coordinates: unknown } | null;
  properties?: Record<string, unknown> | null;
}

export const LAYER_NAMES: LayerName[] = ['flood', 'debris', 'roads', 'buildings', 'settlements'];

export function featureId(f: GeoFeature): string | null {
  const p = f.properties ?? {};
  const id = p.feature_id ?? p.edge_id ?? f.id;
  return id === undefined || id === null ? null : String(id);
}

export function indexFeatures(a: Assessment): Map<string, FeatureRef> {
  const idx = new Map<string, FeatureRef>();
  for (const layer of LAYER_NAMES) {
    for (const raw of a.layers[layer].features) {
      const feature = raw as GeoFeature;
      const id = featureId(feature);
      if (id && !idx.has(id)) idx.set(id, { layer, id, feature });
    }
  }
  return idx;
}

export function evidenceById(a: Assessment): Map<string, Evidence> {
  return new Map(a.evidence.map((e) => [e.evidence_id, e]));
}

export function sourceById(a: Assessment): Map<string, Source> {
  return new Map(a.sources.map((s) => [s.source_id, s]));
}

export function settlementName(a: Assessment, s: SettlementResult): string {
  const f = indexFeatures(a).get(s.settlement_id);
  const name = f?.feature.properties?.name;
  return typeof name === 'string' && name ? name : s.settlement_id;
}

export function prop(f: GeoFeature | undefined, key: string): unknown {
  return f?.properties?.[key];
}

export function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// Imagery sources split around the event date. Role is derived from the
// acquisition timestamp; the v1 contract has no explicit before/after field.
export function imagerySources(a: Assessment) {
  const eventStart = Date.parse(`${a.event_date}T00:00:00Z`);
  const imagery = a.sources.filter((s) => s.kind === 'sentinel_1' || s.kind === 'sentinel_2' ||
    // Declared stand-in scene IDs from the legacy bundled UI fixture. These
    // remain synthetic; the computed API scene will use manifest asset roles.
    (a.mode === 'synthetic' && s.kind === 'synthetic' && s.uri.startsWith('synthetic://') && s.source_id.startsWith('synthetic-s1-')));
  const before = imagery.filter((s) => Date.parse(s.acquired_at) < eventStart);
  const after = imagery.filter((s) => Date.parse(s.acquired_at) >= eventStart);
  return { before, after };
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z').replace(/:00Z$/, 'Z');
}

export function ageLabel(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return 'unknown age';
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return 'under 1 h old';
  if (h < 48) return `${h} h old`;
  return `${Math.floor(h / 24)} d old`;
}

export function formatArea(m2: number | null): string {
  if (m2 === null) return 'not computed';
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2)} km²`;
  if (m2 >= 10_000) return `${(m2 / 10_000).toFixed(1)} ha`;
  return `${Math.round(m2)} m²`;
}

export function shortHash(h: string) {
  return `${h.slice(0, 8)}…${h.slice(-4)}`;
}

// Short human-readable label for a road edge; the exact edge ID stays visible
// alongside it wherever the label is shown.
export function edgeLabel(f: GeoFeature | undefined, id: string): string {
  if (!f) return id;
  const p = f.properties ?? {};
  const bridge = p.bridge === 'yes' || p.bridge === true;
  const highway = typeof p.highway === 'string' ? p.highway.replace(/_/g, ' ') : null;
  const name = typeof p.name === 'string' && p.name ? p.name : null;
  const kind = bridge ? 'Bridge' : highway ? `${highway[0].toUpperCase()}${highway.slice(1)} road` : 'Road segment';
  const len = typeof p.length_m === 'number' ? `${Math.round(p.length_m)} m` : null;
  const exposed = typeof p.exposed_length_m === 'number' && p.exposed_length_m > 0 ? `${Math.round(p.exposed_length_m)} m exposed` : null;
  return [name ? `${kind} ${name}` : kind, [len, exposed].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
}

export function featureLabel(f: GeoFeature | undefined, id: string): string {
  const name = f?.properties?.name;
  return typeof name === 'string' && name ? name : id;
}
