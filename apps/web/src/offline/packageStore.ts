// Offline mission packages in IndexedDB. A package is an immutable manifest plus
// the exact asset bytes it names; each asset is SHA-256 checked when opened and
// a mismatch is refused, never silently used. Mission simulation state lives
// in a separate store so it can never overwrite the cached assessment.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { ApiError, type ApiClient, type Received } from '../api/client';
import { parseAssessment, type Report } from '../api/contract';
import { attributionFor } from '../map/mapStyle';
import type { LoadedAssessment } from '../domain/assessment';
import type { SimState } from '../mission/sim';

export const MANIFEST_VERSION = 'browser-package-1';

export interface AssetEntry {
  asset_id: string;
  media_type: string;
  sha256: string;
  bytes: number;
}

export interface ReportStatus {
  language: 'en' | 'ne';
  status: 'cached' | 'unavailable';
  error_code: string | null;
  error_message: string | null;
}

export interface PackageManifest {
  manifest_version: typeof MANIFEST_VERSION;
  package_id: string;
  created_at: string;
  origin: 'browser_snapshot';
  origin_channel: LoadedAssessment['channel'];
  assessment_id: string;
  assessment_mode: string;
  schema_version: string;
  assessment_received_at: string;
  aoi: [number, number, number, number];
  event_date: string;
  scene_times: Array<{ source_id: string; kind: string; acquired_at: string }>;
  attributions: string;
  basemap: string;
  assets: AssetEntry[];
  reports: ReportStatus[];
  limits: string[];
}

interface DB extends DBSchema {
  manifests: { key: string; value: PackageManifest };
  assets: { key: string; value: { key: string; package_id: string; text: string } };
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
export function resetDbForTests() {
  dbPromise = null;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type CachedReport = { kind: 'ok'; received: Received<Report> } | { kind: 'error'; error: ApiError };

export interface StoredPackage {
  manifest: PackageManifest;
  loaded: LoadedAssessment;
  reports: Record<'en' | 'ne', CachedReport>;
}

export class PackageIntegrityError extends Error {}

export async function createPackage(loaded: LoadedAssessment, client: ApiClient | null): Promise<PackageManifest> {
  const a = loaded.assessment;
  const created_at = new Date().toISOString();
  const package_id = `pkg-${a.assessment_id}-${created_at.replace(/[^0-9]/g, '').slice(0, 14)}`;
  const texts: Record<string, { text: string; media_type: string }> = {
    assessment: { text: JSON.stringify(a), media_type: 'application/json' },
  };
  const reports: ReportStatus[] = [];
  for (const language of ['en', 'ne'] as const) {
    if (loaded.channel !== 'api' || !client) {
      reports.push({ language, status: 'unavailable', error_code: 'no_report_source', error_message: 'Assessment did not come from the API; no backend report exists.' });
      continue;
    }
    try {
      const r = await client.getReport(a.assessment_id, language);
      texts[`report-${language}`] = { text: JSON.stringify(r), media_type: 'application/json' };
      reports.push({ language, status: 'cached', error_code: null, error_message: null });
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError('network', String(err));
      reports.push({ language, status: 'unavailable', error_code: e.code ?? e.kind, error_message: e.message });
    }
  }
  const assets: AssetEntry[] = [];
  for (const [asset_id, { text, media_type }] of Object.entries(texts)) {
    assets.push({ asset_id, media_type, sha256: await sha256(text), bytes: new TextEncoder().encode(text).length });
  }
  const manifest: PackageManifest = {
    manifest_version: MANIFEST_VERSION,
    package_id,
    created_at,
    origin: 'browser_snapshot',
    origin_channel: loaded.channel,
    assessment_id: a.assessment_id,
    assessment_mode: a.mode,
    schema_version: a.schema_version,
    assessment_received_at: loaded.received_at,
    aoi: a.bbox,
    event_date: a.event_date,
    scene_times: a.sources.map((s) => ({ source_id: s.source_id, kind: s.kind, acquired_at: s.acquired_at })),
    attributions: attributionFor(a),
    basemap: 'none: map draws only packaged assessment layers (no remote tiles)',
    assets,
    reports,
    limits: [
      'Browser snapshot of an already-received assessment; the backend package endpoint is planned.',
      'No new satellite data is fetched or implied while offline.',
      ...a.limitations,
    ],
  };
  const d = await db();
  const tx = d.transaction(['manifests', 'assets', 'meta'], 'readwrite');
  await Promise.all([
    ...Object.entries(texts).map(([asset_id, { text }]) =>
      tx.objectStore('assets').put({ key: `${package_id}/${asset_id}`, package_id, text }),
    ),
    tx.objectStore('manifests').put(manifest),
    tx.objectStore('meta').put({ key: 'last_package_id', value: package_id }),
    tx.done,
  ]);
  return manifest;
}

export async function listPackages(): Promise<PackageManifest[]> {
  const all = await (await db()).getAll('manifests');
  return all.sort((x, y) => y.created_at.localeCompare(x.created_at));
}

export async function lastPackageId(): Promise<string | null> {
  return (await (await db()).get('meta', 'last_package_id'))?.value ?? null;
}

export async function openPackage(package_id: string): Promise<StoredPackage> {
  const d = await db();
  const manifest = await d.get('manifests', package_id);
  if (!manifest) throw new PackageIntegrityError(`Package ${package_id} is not in this browser.`);
  if (manifest.manifest_version !== MANIFEST_VERSION) throw new PackageIntegrityError(`Unsupported package manifest ${manifest.manifest_version}.`);
  const texts: Record<string, string> = {};
  for (const asset of manifest.assets) {
    const row = await d.get('assets', `${package_id}/${asset.asset_id}`);
    if (!row) throw new PackageIntegrityError(`Asset ${asset.asset_id} is missing from package ${package_id}.`);
    const digest = await sha256(row.text);
    if (digest !== asset.sha256) {
      throw new PackageIntegrityError(`Asset ${asset.asset_id} failed its SHA-256 check (expected ${asset.sha256.slice(0, 12)}…, got ${digest.slice(0, 12)}…). The package was not opened.`);
    }
    texts[asset.asset_id] = row.text;
  }
  const parsed = parseAssessment(JSON.parse(texts.assessment));
  if (!parsed.ok) throw new PackageIntegrityError('Cached assessment no longer validates against contract v1.');
  const reports = {} as StoredPackage['reports'];
  for (const st of manifest.reports) {
    const text = texts[`report-${st.language}`];
    reports[st.language] = text
      ? { kind: 'ok', received: JSON.parse(text) as Received<Report> }
      : { kind: 'error', error: new ApiError('http', st.error_message ?? 'Report not cached.', null, st.error_code) };
  }
  await d.put('meta', { key: 'last_package_id', value: package_id });
  return {
    manifest,
    reports,
    loaded: {
      assessment: parsed.assessment,
      channel: 'offline_package',
      received_at: manifest.assessment_received_at,
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
