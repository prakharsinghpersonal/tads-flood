// Offline mission packages in IndexedDB. A package is an immutable manifest plus
// the exact bytes it names (backend snapshot, radar PNGs, briefs/reports).
// Every asset is SHA-256 checked before the single write transaction and again
// when opened; a mismatch is refused, never silently used. Mission simulation
// state lives in a separate store so it can never overwrite the assessment.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { ApiError, type ApiClient, type Received } from '../api/client';
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
async function collectFromBackend(loaded: LoadedAssessment, client: ApiClient): Promise<Collected> {
  const id = loaded.assessment.assessment_id;
  const pkg = await client.getPackage(id);
  const now = () => new Date().toISOString();

  const snap = await client.bytes(pkg.assessment_uri);
  const snapHash = await sha256Bytes(snap.bytes);
  if (snapHash !== pkg.assessment_sha256) {
    throw new PackageIntegrityError(`Assessment snapshot failed its SHA-256 check (expected ${pkg.assessment_sha256.slice(0, 12)}…, got ${snapHash.slice(0, 12)}…). Nothing was saved.`);
  }
  const parsed = parseAssessment(JSON.parse(decoder.decode(snap.bytes)));
  if (!parsed.ok) throw new PackageIntegrityError('Backend snapshot does not validate against contract v1. Nothing was saved.');
  if (parsed.assessment.assessment_id !== id) throw new PackageIntegrityError('Backend snapshot names a different assessment. Nothing was saved.');

  const pending: Pending[] = [
    {
      entry: { asset_id: 'assessment', media_type: 'application/json', sha256: snapHash, bytes: snap.bytes.byteLength, hash_origin: 'server', source_uri: pkg.assessment_uri, received_at: now() },
      bytes: snap.bytes,
    },
  ];
  for (const asset of pkg.assets) {
    const problem = checkAssetProvenance(parsed.assessment, asset);
    if (problem) throw new PackageIntegrityError(`${problem} Nothing was saved.`);
    const got = await client.bytes(asset.uri);
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
    try {
      const got = await client.bytes(DOC_PATHS[doc_id](id));
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
    } catch (err) {
      // A documented "not ready" answer (e.g. reviewed Nepali 501) is recorded,
      // never stored as a successful asset. Transport failures abort the save.
      const documented =
        err instanceof ApiError &&
        err.kind === 'http' &&
        err.code !== null &&
        err.status !== null &&
        (err.status === 501 || (err.status >= 400 && err.status < 500));
      if (documented) {
        docs.push({ doc_id, status: 'unavailable', error_code: (err as ApiError).code, error_message: (err as ApiError).message });
      } else {
        throw err instanceof ApiError
          ? new PackageStorageError(`Download of ${doc_id} failed (${err.message}). Nothing was saved.`)
          : err;
      }
    }
  }
  return {
    origin: 'backend_package' as const,
    assessment: parsed.assessment,
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

export async function createPackage(loaded: LoadedAssessment, client: ApiClient | null): Promise<PackageManifest> {
  const created_at = new Date().toISOString();
  const package_id = `pkg-${loaded.assessment.assessment_id}-${crypto.randomUUID()}`;
  let collected: Collected;
  if (loaded.channel === 'api' && client) {
    collected = await collectFromBackend(loaded, client);
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
// so converting to byte rows keeps every hash. Verified before rewriting.
async function migrateLegacy(m: LegacyManifest): Promise<PackageManifest> {
  const d = await db();
  const pending: Pending[] = [];
  for (const asset of m.assets) {
    const row = await d.get('assets', `${m.package_id}/${asset.asset_id}`);
    if (!row || typeof row.text !== 'string') throw new PackageIntegrityError(`Legacy package asset ${asset.asset_id} is missing; it was not migrated or opened.`);
    const bytes = toArrayBuffer(encoder.encode(row.text));
    if ((await sha256Bytes(bytes)) !== asset.sha256) {
      throw new PackageIntegrityError(`Legacy package asset ${asset.asset_id} failed its SHA-256 check; it was not migrated or opened.`);
    }
    // v1 stored reports as Received<Report> wrappers; unwrap to report bytes.
    let out = bytes;
    let receivedAt = m.assessment_received_at;
    let docId = asset.asset_id;
    if (asset.asset_id.startsWith('report-')) {
      const wrapped = JSON.parse(row.text) as Received<unknown>;
      out = toArrayBuffer(encoder.encode(JSON.stringify(wrapped.value)));
      receivedAt = wrapped.received_at;
      docId = asset.asset_id;
    }
    pending.push({
      entry: {
        asset_id: docId,
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
  const migrated: PackageManifest = {
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
  await writePackage(migrated, pending);
  return migrated;
}

function docError(st: DocStatus | undefined, fallback: string) {
  return new ApiError('http', st?.error_message ?? fallback, null, st?.error_code ?? 'not_cached');
}

export async function openPackage(package_id: string): Promise<StoredPackage> {
  const d = await db();
  let manifest = await d.get('manifests', package_id);
  if (!manifest) throw new PackageIntegrityError(`Package ${package_id} is not in this browser.`);
  if (manifest.manifest_version === LEGACY_MANIFEST_VERSION) manifest = await migrateLegacy(manifest);
  if (manifest.manifest_version !== MANIFEST_VERSION) {
    throw new PackageIntegrityError(`Unsupported package manifest ${(manifest as { manifest_version?: string }).manifest_version}. It was left untouched.`);
  }
  const m = manifest;
  const bytes: Record<string, ArrayBuffer> = {};
  for (const asset of m.assets) {
    const row = await d.get('assets', `${package_id}/${asset.asset_id}`);
    if (!row?.bytes) throw new PackageIntegrityError(`Asset ${asset.asset_id} is missing from package ${package_id}.`);
    const digest = await sha256Bytes(row.bytes);
    if (digest !== asset.sha256) {
      throw new PackageIntegrityError(
        `Asset ${asset.asset_id} failed its SHA-256 check (expected ${asset.sha256.slice(0, 12)}…, got ${digest.slice(0, 12)}…). The package was not opened.`,
      );
    }
    bytes[asset.asset_id] = row.bytes;
  }
  const parsed = parseAssessment(JSON.parse(decoder.decode(bytes.assessment)));
  if (!parsed.ok) throw new PackageIntegrityError('Cached assessment no longer validates against contract v1.');

  const entry = (id: string) => m.assets.find((x) => x.asset_id === id);
  const status = (id: DocId) => m.docs.find((x) => x.doc_id === id);
  const readDoc = <T,>(id: DocId, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): CachedDoc<T> => {
    const b = bytes[id];
    if (!b) return { kind: 'error', error: docError(status(id), 'Not cached in this package.') };
    const r = schema.safeParse(JSON.parse(decoder.decode(b)));
    if (!r.success) return { kind: 'error', error: new ApiError('invalid_response', `Cached ${id} does not match its contract.`) };
    return { kind: 'ok', received: { value: r.data as T, received_at: entry(id)!.received_at } };
  };
  const html = (id: DocId) => (bytes[id] ? new Blob([bytes[id]], { type: 'text/html' }) : null);

  const rasters = m.assets.filter((x) => x.raster);
  const scenes: SceneBlob[] = rasters.map((x) => ({ asset: x.raster!, blob: new Blob([bytes[x.asset_id]], { type: x.media_type }) }));

  await d.put('meta', { key: 'last_package_id', value: package_id });
  return {
    manifest: m,
    docs: {
      report: { en: readDoc('report-en', ReportSchema), ne: readDoc('report-ne', ReportSchema) },
      brief: { en: readDoc('brief-en', GroundedReportSchema), ne: readDoc('brief-ne', GroundedReportSchema) },
      briefHtml: { en: html('brief-html-en'), ne: html('brief-html-ne') },
    },
    scenes: scenes.length
      ? { status: 'ready', scenes }
      : { status: 'none', reason: m.origin === 'backend_package' ? 'The backend package listed no radar preview.' : 'This package has no radar previews.' },
    loaded: {
      assessment: parsed.assessment,
      channel: 'offline_package',
      received_at: m.assessment_received_at,
      package_id,
      warnings: parsed.warnings,
    },
  };
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
