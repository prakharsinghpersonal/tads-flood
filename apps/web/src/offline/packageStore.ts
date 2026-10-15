// Offline mission packages in IndexedDB. A package is an immutable manifest plus
// the exact bytes it names (backend snapshot, radar PNGs, briefs/reports).
// Every asset is SHA-256 checked before the single write transaction and again
// when opened; a mismatch is refused, never silently used. Mission simulation
// state lives in a separate store so it can never overwrite the assessment.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { ApiError, checkReportScope, type ApiClient, type Received } from '../api/client';
import { checkBriefHtmlScope } from '../api/briefHtml';
import {
  GroundedReportSchema,
  ReportSchema,
  parseAssessment,
  type GroundedReport,
  type RasterAsset,
  type Report,
} from '../api/contract';
import { attributionFor } from '../map/mapStyle';
import type { LoadedAssessment } from '../domain/assessment';
import { checkAssetProvenance, sha256Bytes, type SceneBlob, type SceneLoad } from '../domain/scenes';
import type { SimState } from '../mission/sim';

export const MANIFEST_VERSION = 'browser-package-2';
export const LEGACY_MANIFEST_VERSION = 'browser-package-1';

export type DocId = 'report-en' | 'report-ne' | 'brief-en' | 'brief-ne' | 'brief-html-en' | 'brief-html-ne';
const DOC_PATHS: Record<DocId, (id: string) => string> = {
  'report-en': (id) => `/api/v1/assessments/${encodeURIComponent(id)}/report?language=en`,
  'report-ne': (id) => `/api/v1/assessments/${encodeURIComponent(id)}/report?language=ne`,
  'brief-en': (id) => `/api/v1/assessments/${encodeURIComponent(id)}/brief?language=en&format=json`,
  'brief-ne': (id) => `/api/v1/assessments/${encodeURIComponent(id)}/brief?language=ne&format=json`,
  'brief-html-en': (id) => `/api/v1/assessments/${encodeURIComponent(id)}/brief?language=en&format=html`,
  'brief-html-ne': (id) => `/api/v1/assessments/${encodeURIComponent(id)}/brief?language=ne&format=html`,
};

export interface AssetEntry {
  asset_id: string;
  media_type: string;
  sha256: string;
  bytes: number;
  // 'server': hash published by the backend manifest; 'browser': computed here
  // over the exact bytes received (the backend publishes none for that file).
  hash_origin: 'server' | 'browser';
  source_uri: string | null;
  received_at: string;
  raster?: RasterAsset;
}

export interface DocStatus {
  doc_id: DocId;
  status: 'cached' | 'unavailable';
  error_code: string | null;
  error_message: string | null;
}

export interface PackageManifest {
  manifest_version: typeof MANIFEST_VERSION;
  package_id: string;
  created_at: string;
  origin: 'backend_package' | 'browser_snapshot';
  origin_channel: LoadedAssessment['channel'];
  migrated_from: typeof LEGACY_MANIFEST_VERSION | null;
  assessment_id: string;
  assessment_mode: string;
  schema_version: string;
  assessment_received_at: string;
  aoi: [number, number, number, number];
  event_date: string;
  scene_times: Array<{ source_id: string; kind: string; acquired_at: string }>;
  attributions: string[];
  basemap: string;
  assets: AssetEntry[];
  docs: DocStatus[];
  limits: string[];
}

// browser-package-1 rows, read only to migrate them.
interface LegacyManifest {
  manifest_version: typeof LEGACY_MANIFEST_VERSION;
  package_id: string;
  created_at: string;
  origin_channel: LoadedAssessment['channel'];
  assessment_id: string;
  assessment_mode: string;
  schema_version: string;
  assessment_received_at: string;
  aoi: [number, number, number, number];
  event_date: string;
  scene_times: PackageManifest['scene_times'];
  attributions: string;
  basemap: string;
  assets: Array<{ asset_id: string; media_type: string; sha256: string; bytes: number }>;
  reports: Array<{ language: 'en' | 'ne'; status: 'cached' | 'unavailable'; error_code: string | null; error_message: string | null }>;
  limits: string[];
}

type AnyManifest = PackageManifest | LegacyManifest;
interface AssetRow {
  key: string;
  package_id: string;
  bytes?: ArrayBuffer;
  text?: string;
}

interface DB extends DBSchema {
  manifests: { key: string; value: AnyManifest };
  assets: { key: string; value: AssetRow };
  missions: { key: string; value: { package_id: string; state: SimState; saved_at: string } };
  meta: { key: string; value: { key: string; value: string } };
}

let dbPromise: Promise<IDBPDatabase<DB>> | null = null;
export function db() {
  dbPromise ??= openDB<DB>('tads-flood', 1, {
    upgrade(d) {
      d.createObjectStore('manifests', { keyPath: 'package_id' });
      d.createObjectStore('assets', { keyPath: 'key' });
      d.createObjectStore('missions', { keyPath: 'package_id' });
      d.createObjectStore('meta', { keyPath: 'key' });
    },
  });
  return dbPromise;
}
export async function resetDbForTests() {
  const previous = dbPromise;
  dbPromise = null;
  if (previous) (await previous).close();
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function sha256(text: string): Promise<string> {
  return sha256Bytes(encoder.encode(text));
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

export class PackageIntegrityError extends Error {}
export class PackageStorageError extends Error {}

export type CachedDoc<T> = { kind: 'ok'; received: Received<T> } | { kind: 'error'; error: ApiError };

export interface StoredPackage {
  manifest: PackageManifest;
  loaded: LoadedAssessment;
  docs: {
    report: Record<'en' | 'ne', CachedDoc<Report>>;
    brief: Record<'en' | 'ne', CachedDoc<GroundedReport>>;
    briefHtml: Record<'en' | 'ne', Blob | null>;
  };
  scenes: SceneLoad;
}

interface Pending {
  entry: AssetEntry;
  bytes: ArrayBuffer;
}

interface Collected {
  origin: PackageManifest['origin'];
  assessment: LoadedAssessment['assessment'];
  attributions: string[];
  limits: string[];
  pending: Pending[];
  docs: DocStatus[];
}

// Download and verify everything in memory first. Only a complete, verified
// set reaches storage, in one transaction.
const docLanguage = (id: DocId): 'en' | 'ne' => (id.endsWith('-ne') ? 'ne' : 'en');

// Parse and scope-check a cached document. Used before the save transaction and
// again on every open, so a wrong-assessment/mode/language or malformed document
// can never be stored or displayed from a package.
function validateDoc(doc_id: DocId, bytes: ArrayBuffer, scope: { assessment_id: string; mode: string }): GroundedReport | Report | null {
  const text = decoder.decode(bytes);
  if (doc_id.startsWith('brief-html')) {
    try {
      checkBriefHtmlScope(bytes, { assessment_id: scope.assessment_id, mode: scope.mode as 'live' | 'synthetic', language: docLanguage(doc_id) });
    } catch (err) {
      throw new PackageIntegrityError(`${doc_id}: ${(err as Error).message}`);
    }
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new PackageIntegrityError(`${doc_id} is not valid JSON.`);
  }
  const schema = doc_id.startsWith('brief-') ? GroundedReportSchema : ReportSchema;
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PackageIntegrityError(`${doc_id} does not match its contract.`);
  try {
    checkReportScope(parsed.data, { assessment_id: scope.assessment_id, mode: scope.mode as never, language: docLanguage(doc_id) }, doc_id);
  } catch (err) {
    throw new PackageIntegrityError((err as Error).message);
  }
  return parsed.data;
}

async function collectFromBackend(loaded: LoadedAssessment, client: ApiClient, signal?: AbortSignal): Promise<Collected> {
  const id = loaded.assessment.assessment_id;
  const pkg = await client.getPackage(id, signal);
  const now = () => new Date().toISOString();

  const snap = await client.bytes(pkg.assessment_uri, signal);
  const snapHash = await sha256Bytes(snap.bytes);
  if (snapHash !== pkg.assessment_sha256) {
    throw new PackageIntegrityError(`Assessment snapshot failed its SHA-256 check (expected ${pkg.assessment_sha256.slice(0, 12)}…, got ${snapHash.slice(0, 12)}…). Nothing was saved.`);
  }
  let snapValue: unknown;
  try {
    snapValue = JSON.parse(decoder.decode(snap.bytes));
  } catch {
    throw new PackageIntegrityError('Backend snapshot is not valid JSON. Nothing was saved.');
  }
  const parsed = parseAssessment(snapValue);
  if (!parsed.ok) throw new PackageIntegrityError('Backend snapshot does not validate against contract v1. Nothing was saved.');
  const a = parsed.assessment;
  if (a.assessment_id !== id || pkg.assessment_id !== id) throw new PackageIntegrityError('Backend snapshot names a different assessment. Nothing was saved.');
  if (pkg.mode !== a.mode || a.mode !== loaded.assessment.mode) {
    throw new PackageIntegrityError(`Package mode ${pkg.mode} disagrees with the snapshot (${a.mode}) or the loaded assessment (${loaded.assessment.mode}). Nothing was saved.`);
  }
  if (pkg.schema_version !== a.schema_version) throw new PackageIntegrityError('Package schema version disagrees with the snapshot. Nothing was saved.');
  const roles = pkg.assets.map((x) => x.role);
  if (new Set(roles).size !== roles.length) throw new PackageIntegrityError(`Package lists duplicate image roles (${roles.join(', ')}). Nothing was saved.`);

  const pending: Pending[] = [
    {
      entry: { asset_id: 'assessment', media_type: 'application/json', sha256: snapHash, bytes: snap.bytes.byteLength, hash_origin: 'server', source_uri: pkg.assessment_uri, received_at: now() },
      bytes: snap.bytes,
    },
  ];
  for (const asset of pkg.assets) {
    const problem = checkAssetProvenance(parsed.assessment, asset);
    if (problem) throw new PackageIntegrityError(`${problem} Nothing was saved.`);
    const got = await client.bytes(asset.uri, signal);
    const digest = await sha256Bytes(got.bytes);
    if (digest !== asset.sha256) {
      throw new PackageIntegrityError(`${asset.role} image failed its SHA-256 check. Nothing was saved.`);
    }
    pending.push({
      entry: { asset_id: asset.role, media_type: asset.media_type, sha256: digest, bytes: got.bytes.byteLength, hash_origin: 'server', source_uri: asset.uri, received_at: now(), raster: asset },
      bytes: got.bytes,
    });
  }
  const docs: DocStatus[] = [];
  for (const doc_id of Object.keys(DOC_PATHS) as DocId[]) {
    let got: { bytes: ArrayBuffer };
    try {
      got = await client.bytes(DOC_PATHS[doc_id](id), signal);
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'cancelled') throw err;
      // A documented "not ready" answer (e.g. reviewed Nepali 501) is recorded,
      // never stored as a successful asset. Transport failures abort the save.
      const documented =
        err instanceof ApiError &&
        err.kind === 'http' &&
        err.code !== null &&
        err.status !== null &&
        (err.status === 501 || (err.status >= 400 && err.status < 500));
      if (!documented) {
        throw err instanceof ApiError ? new PackageStorageError(`Download of ${doc_id} failed (${err.message}). Nothing was saved.`) : err;
      }
      docs.push({ doc_id, status: 'unavailable', error_code: (err as ApiError).code, error_message: (err as ApiError).message });
      continue;
    }
    try {
      validateDoc(doc_id, got.bytes, { assessment_id: id, mode: a.mode });
    } catch (err) {
      throw new PackageIntegrityError(`${(err as Error).message} Nothing was saved.`);
    }
    pending.push({
      entry: {
        asset_id: doc_id,
        media_type: doc_id.startsWith('brief-html') ? 'text/html' : 'application/json',
        sha256: await sha256Bytes(got.bytes),
        bytes: got.bytes.byteLength,
        hash_origin: 'browser',
        source_uri: DOC_PATHS[doc_id](id),
        received_at: now(),
      },
      bytes: got.bytes,
    });
    docs.push({ doc_id, status: 'cached', error_code: null, error_message: null });
  }
  return {
    origin: 'backend_package' as const,
    assessment: a,
    attributions: pkg.attribution,
    limits: pkg.limitations,
    pending,
    docs,
  };
}

function collectBrowserSnapshot(loaded: LoadedAssessment) {
  const a = loaded.assessment;
  const u8 = encoder.encode(JSON.stringify(a));
  return {
    origin: 'browser_snapshot' as const,
    assessment: a,
    attributions: [attributionFor(a)],
    limits: a.limitations,
    pending: [] as Pending[],
    docs: (Object.keys(DOC_PATHS) as DocId[]).map((doc_id) => ({
      doc_id,
      status: 'unavailable' as const,
      error_code: 'no_report_source',
      error_message: 'Assessment did not come from the API; no backend report exists.',
    })),
    snapshot: toArrayBuffer(u8),
  };
}

export async function createPackage(loaded: LoadedAssessment, client: ApiClient | null, signal?: AbortSignal): Promise<PackageManifest> {
  const created_at = new Date().toISOString();
  const package_id = `pkg-${loaded.assessment.assessment_id}-${crypto.randomUUID()}`;
  let collected: Collected;
  if (loaded.channel === 'api' && client) {
    collected = await collectFromBackend(loaded, client, signal);
  } else {
    const snap = collectBrowserSnapshot(loaded);
    snap.pending.push({
      entry: { asset_id: 'assessment', media_type: 'application/json', sha256: await sha256Bytes(snap.snapshot), bytes: snap.snapshot.byteLength, hash_origin: 'browser', source_uri: null, received_at: loaded.received_at },
      bytes: snap.snapshot,
    });
    collected = snap;
  }
  const a = collected.assessment;
  const manifest: PackageManifest = {
    manifest_version: MANIFEST_VERSION,
    package_id,
    created_at,
    origin: collected.origin,
    origin_channel: loaded.channel,
    migrated_from: null,
    assessment_id: a.assessment_id,
    assessment_mode: a.mode,
    schema_version: a.schema_version,
    assessment_received_at: loaded.received_at,
    aoi: a.bbox,
    event_date: a.event_date,
    scene_times: a.sources.map((s) => ({ source_id: s.source_id, kind: s.kind, acquired_at: s.acquired_at })),
    attributions: collected.attributions,
    basemap: 'none: map draws only packaged layers and radar previews (no remote tiles)',
    assets: collected.pending.map((p) => p.entry),
    docs: collected.docs,
    limits: [
      collected.origin === 'backend_package'
        ? 'Exact backend snapshot and previews, verified by SHA-256 when saved and when opened.'
        : 'Browser snapshot of an assessment that did not come from the API; no backend hashes.',
      'No new satellite data is fetched or implied while offline.',
      ...collected.limits,
    ],
  };
  if (signal?.aborted) throw new ApiError('cancelled', 'Package save cancelled. Nothing was saved.');
  await writePackage(manifest, collected.pending);
  return manifest;
}

async function writePackage(manifest: PackageManifest, pending: Pending[]) {
  const d = await db();
  const tx = d.transaction(['manifests', 'assets', 'meta'], 'readwrite');
  // Each write is wrapped so a synchronous throw (e.g. quota) becomes a handled
  // rejection; the transaction is all-or-nothing either way.
  const ops: Array<Promise<unknown>> = [
    ...pending.map(async (p) =>
      tx.objectStore('assets').put({ key: `${manifest.package_id}/${p.entry.asset_id}`, package_id: manifest.package_id, bytes: p.bytes }),
    ),
    (async () => tx.objectStore('manifests').put(manifest))(),
    (async () => tx.objectStore('meta').put({ key: 'last_package_id', value: manifest.package_id }))(),
  ];
  const failure = (await Promise.allSettled(ops)).find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) {
    try {
      tx.abort();
    } catch {
      /* already aborted */
    }
  }
  const done = await tx.done.then(
    () => null,
    (err: unknown) => err,
  );
  const err = failure?.reason ?? done;
  if (err) {
    const name = (err as DOMException)?.name;
    throw new PackageStorageError(
      name === 'QuotaExceededError'
        ? 'Browser storage is full. No package was saved; free space or delete an older package.'
        : `Browser storage write failed (${(err as Error).message}). No package was saved.`,
    );
  }
}

export type ListedManifest = AnyManifest;
export async function listPackages(): Promise<ListedManifest[]> {
  const all = await (await db()).getAll('manifests');
  return all.sort((x, y) => y.created_at.localeCompare(x.created_at));
}

export async function lastPackageId(): Promise<string | null> {
  return (await (await db()).get('meta', 'last_package_id'))?.value ?? null;
}

// browser-package-1 stored UTF-8 text; its SHA-256 is over exactly those bytes,
// so converting to byte rows keeps every hash. Conversion happens in memory and
// the result must pass the full open verification before anything is rewritten;
// a malformed legacy package is left exactly as it was.
async function convertLegacy(m: LegacyManifest): Promise<{ manifest: PackageManifest; pending: Pending[] }> {
  const d = await db();
  const pending: Pending[] = [];
  const untouched = 'The older package was left untouched.';
  for (const asset of m.assets) {
    const row = await d.get('assets', `${m.package_id}/${asset.asset_id}`);
    if (!row || typeof row.text !== 'string') throw new PackageIntegrityError(`Older-format package asset ${asset.asset_id} is missing or malformed. ${untouched}`);
    const bytes = toArrayBuffer(encoder.encode(row.text));
    if ((await sha256Bytes(bytes)) !== asset.sha256) {
      throw new PackageIntegrityError(`Older-format package asset ${asset.asset_id} failed its SHA-256 check. ${untouched}`);
    }
    // v1 stored reports as Received<Report> wrappers; unwrap to report bytes.
    let out = bytes;
    let receivedAt = m.assessment_received_at;
    if (asset.asset_id.startsWith('report-')) {
      let wrapped: Received<unknown>;
      try {
        wrapped = JSON.parse(row.text) as Received<unknown>;
      } catch {
        throw new PackageIntegrityError(`Older-format package report ${asset.asset_id} is not valid JSON. ${untouched}`);
      }
      if (!wrapped || typeof wrapped !== 'object' || typeof wrapped.received_at !== 'string' || !('value' in wrapped)) {
        throw new PackageIntegrityError(`Older-format package report ${asset.asset_id} is malformed. ${untouched}`);
      }
      out = toArrayBuffer(encoder.encode(JSON.stringify(wrapped.value)));
      receivedAt = wrapped.received_at;
    } else if (asset.asset_id !== 'assessment') {
      throw new PackageIntegrityError(`Older-format package has an unexpected asset ${asset.asset_id}. ${untouched}`);
    }
    pending.push({
      entry: {
        asset_id: asset.asset_id,
        media_type: asset.media_type,
        sha256: await sha256Bytes(out),
        bytes: out.byteLength,
        hash_origin: 'browser',
        source_uri: null,
        received_at: receivedAt,
      },
      bytes: out,
    });
  }
  const manifest: PackageManifest = {
    manifest_version: MANIFEST_VERSION,
    package_id: m.package_id,
    created_at: m.created_at,
    origin: 'browser_snapshot',
    origin_channel: m.origin_channel,
    migrated_from: LEGACY_MANIFEST_VERSION,
    assessment_id: m.assessment_id,
    assessment_mode: m.assessment_mode,
    schema_version: m.schema_version,
    assessment_received_at: m.assessment_received_at,
    aoi: m.aoi,
    event_date: m.event_date,
    scene_times: m.scene_times,
    attributions: [m.attributions],
    basemap: m.basemap,
    assets: pending.map((p) => p.entry),
    docs: [
      ...m.reports.map((r) => ({ doc_id: `report-${r.language}` as DocId, status: r.status, error_code: r.error_code, error_message: r.error_message })),
      ...(['brief-en', 'brief-ne', 'brief-html-en', 'brief-html-ne'] as DocId[]).map((doc_id) => ({
        doc_id,
        status: 'unavailable' as const,
        error_code: 'legacy_package',
        error_message: 'Saved before briefs and radar previews were packaged.',
      })),
    ],
    limits: ['Migrated from browser-package-1: no radar previews or briefs were saved.', ...m.limits],
  };
  return { manifest, pending };
}

function docError(st: DocStatus | undefined, fallback: string) {
  return new ApiError('http', st?.error_message ?? fallback, null, st?.error_code ?? 'not_cached');
}

const RASTER_ROLES = new Set(['before_radar', 'after_radar']);

// Every check that decides whether a package may be shown. Throws on the first
// inconsistency; a checksum detects changed bytes, it does not make a source
// trustworthy, so scope/metadata are checked too.
async function verifyPackage(m: PackageManifest, bytes: Record<string, ArrayBuffer>): Promise<StoredPackage> {
  const refuse = (why: string) => new PackageIntegrityError(`${why} The package was not opened.`);
  const ids = m.assets.map((x) => x.asset_id);
  if (new Set(ids).size !== ids.length) throw refuse('Package lists duplicate assets.');
  for (const asset of m.assets) {
    const b = bytes[asset.asset_id];
    if (!b) throw refuse(`Asset ${asset.asset_id} is missing from package ${m.package_id}.`);
    if (b.byteLength !== asset.bytes) throw refuse(`Asset ${asset.asset_id} has ${b.byteLength} bytes; the manifest records ${asset.bytes}.`);
    const digest = await sha256Bytes(b);
    if (digest !== asset.sha256) {
      throw refuse(`Asset ${asset.asset_id} failed its SHA-256 check (expected ${asset.sha256.slice(0, 12)}…, got ${digest.slice(0, 12)}…).`);
    }
  }
  if (!bytes.assessment) throw refuse('Package has no assessment snapshot.');
  let snapValue: unknown;
  try {
    snapValue = JSON.parse(decoder.decode(bytes.assessment));
  } catch {
    throw refuse('Cached assessment is not valid JSON.');
  }
  const parsed = parseAssessment(snapValue);
  if (!parsed.ok) throw refuse('Cached assessment no longer validates against contract v1.');
  const a = parsed.assessment;
  if (a.assessment_id !== m.assessment_id || a.mode !== m.assessment_mode || a.schema_version !== m.schema_version) {
    throw refuse('Manifest assessment ID, mode or schema disagrees with the cached snapshot.');
  }
  if (JSON.stringify(m.aoi) !== JSON.stringify(a.bbox) || m.event_date !== a.event_date) {
    throw refuse('Manifest area or date disagrees with the cached snapshot.');
  }
  const times = a.sources.map((s) => ({ source_id: s.source_id, kind: s.kind, acquired_at: s.acquired_at }));
  // Older v1 packages may lack the source register. If supplied, it must match.
  if (m.migrated_from === null || m.scene_times.length > 0) {
    const sorted = (rows: Array<{ source_id: string; kind: string; acquired_at: string }>) => [...rows].sort((x, y) => x.source_id.localeCompare(y.source_id));
    if (JSON.stringify(sorted(m.scene_times)) !== JSON.stringify(sorted(times))) {
      throw refuse('Manifest source times disagree with the cached snapshot.');
    }
  }
  const rasters = m.assets.filter((x) => x.raster);
  for (const x of rasters) {
    const r = x.raster!;
    if (!RASTER_ROLES.has(r.role) || r.role !== x.asset_id || x.media_type !== 'image/png') throw refuse(`Image asset ${x.asset_id} has inconsistent role or type.`);
    const problem = checkAssetProvenance(a, r);
    if (problem) throw refuse(problem);
  }
  const docs: Partial<Record<DocId, GroundedReport | Report | null>> = {};
  if (m.docs.length !== Object.keys(DOC_PATHS).length || new Set(m.docs.map((s) => s.doc_id)).size !== m.docs.length || m.docs.some((s) => !Object.hasOwn(DOC_PATHS, s.doc_id))) {
    throw refuse('Package lists missing, duplicate or unsupported documents.');
  }
  const allowedAssets = new Set(['assessment', ...RASTER_ROLES, ...Object.keys(DOC_PATHS)]);
  for (const asset of m.assets) {
    if (!allowedAssets.has(asset.asset_id) || (RASTER_ROLES.has(asset.asset_id) && !asset.raster)) {
      throw refuse(`Asset ${asset.asset_id} has unsupported or missing role metadata.`);
    }
  }
  for (const st of m.docs) {
    const b = bytes[st.doc_id];
    if (st.status === 'cached' && !b) throw refuse(`${st.doc_id} is marked cached but missing.`);
    if (st.status !== 'cached' && b) throw refuse(`${st.doc_id} is stored but marked unavailable.`);
    if (b) docs[st.doc_id] = validateDoc(st.doc_id, b, { assessment_id: a.assessment_id, mode: a.mode });
  }
  const entry = (id: string) => m.assets.find((x) => x.asset_id === id);
  const status = (id: DocId) => m.docs.find((x) => x.doc_id === id);
  const cached = <T,>(id: DocId): CachedDoc<T> =>
    docs[id] ? { kind: 'ok', received: { value: docs[id] as T, received_at: entry(id)!.received_at } } : { kind: 'error', error: docError(status(id), 'Not cached in this package.') };
  const html = (id: DocId) => (bytes[id] ? new Blob([bytes[id]], { type: 'text/html' }) : null);
  const scenes: SceneBlob[] = rasters.map((x) => ({ asset: x.raster!, blob: new Blob([bytes[x.asset_id]], { type: x.media_type }) }));
  return {
    manifest: m,
    docs: {
      report: { en: cached<Report>('report-en'), ne: cached<Report>('report-ne') },
      brief: { en: cached<GroundedReport>('brief-en'), ne: cached<GroundedReport>('brief-ne') },
      briefHtml: { en: html('brief-html-en'), ne: html('brief-html-ne') },
    },
    scenes: scenes.length
      ? { status: 'ready', scenes }
      : { status: 'none', reason: m.origin === 'backend_package' ? 'The backend package listed no radar preview.' : 'This package has no radar previews.' },
    loaded: {
      assessment: a,
      channel: 'offline_package',
      received_at: m.assessment_received_at,
      package_id: m.package_id,
      warnings: parsed.warnings,
    },
  };
}

export async function openPackage(package_id: string): Promise<StoredPackage> {
  const d = await db();
  const stored = await d.get('manifests', package_id);
  if (!stored) throw new PackageIntegrityError(`Package ${package_id} is not in this browser.`);
  let result: StoredPackage;
  if (stored.manifest_version === LEGACY_MANIFEST_VERSION) {
    const { manifest, pending } = await convertLegacy(stored);
    try {
      result = await verifyPackage(manifest, Object.fromEntries(pending.map((p) => [p.entry.asset_id, p.bytes])));
    } catch (err) {
      throw new PackageIntegrityError(`${(err as Error).message.replace(' The package was not opened.', '')} The older package was left untouched.`);
    }
    await writePackage(manifest, pending);
  } else if (stored.manifest_version === MANIFEST_VERSION) {
    const bytes: Record<string, ArrayBuffer> = {};
    for (const asset of stored.assets) {
      const row = await d.get('assets', `${package_id}/${asset.asset_id}`);
      if (row?.bytes) bytes[asset.asset_id] = row.bytes;
    }
    result = await verifyPackage(stored, bytes);
  } else {
    throw new PackageIntegrityError(`Unsupported package manifest ${(stored as { manifest_version?: string }).manifest_version}. It was left untouched.`);
  }
  await d.put('meta', { key: 'last_package_id', value: package_id });
  return result;
}

export async function deletePackage(package_id: string) {
  const d = await db();
  const manifest = await d.get('manifests', package_id);
  const tx = d.transaction(['manifests', 'assets', 'missions', 'meta'], 'readwrite');
  for (const a of manifest?.assets ?? []) await tx.objectStore('assets').delete(`${package_id}/${a.asset_id}`);
  await tx.objectStore('manifests').delete(package_id);
  await tx.objectStore('missions').delete(package_id);
  const last = await tx.objectStore('meta').get('last_package_id');
  if (last?.value === package_id) await tx.objectStore('meta').delete('last_package_id');
  await tx.done;
}

export async function saveMission(package_id: string, state: SimState) {
  await (await db()).put('missions', { package_id, state, saved_at: new Date().toISOString() });
}

export async function loadMission(package_id: string): Promise<SimState | null> {
  return (await (await db()).get('missions', package_id))?.state ?? null;
}

export async function clearMission(package_id: string) {
  await (await db()).delete('missions', package_id);
}
