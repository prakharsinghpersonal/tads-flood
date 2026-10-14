import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '../api/client';
import { parseAssessment } from '../api/contract';
import { loadBundledFixture } from '../components/PreparePanel';
import { sha256Bytes } from '../domain/scenes';
import { createSim, step } from '../mission/sim';
import { PNG, SNAPSHOT, SNAPSHOT_BYTES, geographicApi } from '../test/fakeApi';
import {
  LEGACY_MANIFEST_VERSION,
  MANIFEST_VERSION,
  PackageIntegrityError,
  PackageStorageError,
  createPackage,
  db,
  deletePackage,
  lastPackageId,
  listPackages,
  loadMission,
  openPackage,
  resetDbForTests,
  saveMission,
  sha256,
} from './packageStore';

beforeEach(async () => {
  await resetDbForTests();
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('tads-flood');
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Test database still has an open connection'));
  });
});

const parsed = parseAssessment(SNAPSHOT);
if (!parsed.ok) throw new Error('recorded snapshot invalid');
const apiLoaded = { assessment: parsed.assessment, channel: 'api' as const, received_at: '2026-10-14T03:50:00.000Z', warnings: [] };

// jsdom's Blob is only readable through jsdom's own FileReader.
function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

describe('offline package store (browser-package-2)', () => {
  it('stores the exact backend snapshot: its bytes differ from JS serialisation but pass the server hash', async () => {
    expect(new TextEncoder().encode(JSON.stringify(SNAPSHOT))).not.toEqual(SNAPSHOT_BYTES);
    const { fetchImpl, pkg } = await geographicApi();
    const m = await createPackage(apiLoaded, createClient({ fetchImpl }));
    const snap = m.assets.find((x) => x.asset_id === 'assessment')!;
    expect(snap.sha256).toBe(pkg.assessment_sha256);
    expect(snap.hash_origin).toBe('server');
    expect(m.origin).toBe('backend_package');
    expect(m.assets.map((x) => x.asset_id)).toEqual(
      expect.arrayContaining(['assessment', 'before_radar', 'after_radar', 'brief-en', 'brief-ne', 'report-en', 'brief-html-en', 'brief-html-ne']),
    );
    expect(m.docs.find((d) => d.doc_id === 'report-ne')).toMatchObject({ status: 'unavailable', error_code: 'language_not_ready' });

    const row = await (await db()).get('assets', `${m.package_id}/assessment`);
    expect(new Uint8Array(row!.bytes!)).toEqual(SNAPSHOT_BYTES);

    await resetDbForTests();
    const opened = await openPackage(m.package_id);
    expect(opened.loaded.assessment).toEqual(parsed.assessment);
    expect(opened.loaded.assessment.mode).toBe('synthetic');
    expect(opened.loaded.channel).toBe('offline_package');
    expect(opened.scenes.status).toBe('ready');
    if (opened.scenes.status === 'ready') {
      const before = opened.scenes.scenes.find((x) => x.asset.role === 'before_radar')!;
      expect(await blobBytes(before.blob)).toEqual(PNG.before_radar);
      expect(before.asset.acquired_at).toBe('2026-08-20T00:00:00Z');
      expect(before.asset.coordinates).toEqual(pkg.assets[0].coordinates);
    }
    expect(opened.docs.brief.ne.kind === 'ok' && opened.docs.brief.ne.received.value.translation_reviewed).toBe(false);
    expect(opened.docs.report.ne.kind === 'error' && opened.docs.report.ne.error.code).toBe('language_not_ready');
    expect(opened.docs.briefHtml.en).not.toBeNull();
  });

  it('refuses a snapshot whose bytes do not match the server hash, saving nothing', async () => {
    const tampered = new TextEncoder().encode(new TextDecoder().decode(SNAPSHOT_BYTES).replace('"potentially_isolated_count":1', '"potentially_isolated_count":0'));
    expect(tampered).not.toEqual(SNAPSHOT_BYTES);
    const { fetchImpl } = await geographicApi((url) => (url.endsWith('/snapshot') ? { status: 200, bytes: tampered } : undefined));
    await expect(createPackage(apiLoaded, createClient({ fetchImpl }))).rejects.toThrow(/snapshot failed its SHA-256/);
    expect(await listPackages()).toEqual([]);
  });

  it('refuses a tampered PNG download, saving nothing', async () => {
    const { fetchImpl } = await geographicApi((url) => (url.endsWith('/imagery/after') ? { status: 200, bytes: new Uint8Array([1, 2, 3]) } : undefined));
    await expect(createPackage(apiLoaded, createClient({ fetchImpl }))).rejects.toThrow(PackageIntegrityError);
    expect(await listPackages()).toEqual([]);
  });

  it('a partial download (network failure mid-package) commits nothing', async () => {
    const { fetchImpl } = await geographicApi((url) => (url.includes('brief?language=ne&format=html') ? 'network-error' : undefined));
    await expect(createPackage(apiLoaded, createClient({ fetchImpl }))).rejects.toThrow(PackageStorageError);
    expect(await listPackages()).toEqual([]);
    expect(await lastPackageId()).toBeNull();
  });

  it('a storage quota failure commits nothing and says so', async () => {
    const { fetchImpl } = await geographicApi();
    const originalPut = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'assets' && String((args[0] as { key: string }).key).endsWith('/after_radar')) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return originalPut.apply(this, args);
    });
    try {
      await expect(createPackage(apiLoaded, createClient({ fetchImpl }))).rejects.toThrow(/storage is full/);
    } finally {
      spy.mockRestore();
    }
    expect(await listPackages()).toEqual([]);
    expect(await lastPackageId()).toBeNull();
  });

  it('refuses a stored PNG that was altered after saving', async () => {
    const { fetchImpl } = await geographicApi();
    const m = await createPackage(apiLoaded, createClient({ fetchImpl }));
    const d = await db();
    const row = (await d.get('assets', `${m.package_id}/before_radar`))!;
    await d.put('assets', { ...row, bytes: new Uint8Array([9, 9, 9]).buffer });
    await expect(openPackage(m.package_id)).rejects.toThrow(/before_radar failed its SHA-256/);
  });

  it('refuses a stored snapshot that was altered after saving (browser snapshot too)', async () => {
    const m = await createPackage(loadBundledFixture(), null);
    expect(m.origin).toBe('browser_snapshot');
    const d = await db();
    const row = (await d.get('assets', `${m.package_id}/assessment`))!;
    const text = new TextDecoder().decode(row.bytes!).replace('"potentially_isolated_count":1', '"potentially_isolated_count":0');
    await d.put('assets', { ...row, bytes: new TextEncoder().encode(text).buffer });
    await expect(openPackage(m.package_id)).rejects.toThrow(PackageIntegrityError);
  });

  it('migrates a browser-package-1 package losslessly, and refuses a tampered one untouched', async () => {
    const loaded = loadBundledFixture();
    const text = JSON.stringify(loaded.assessment);
    const report = {
      value: { assessment_id: loaded.assessment.assessment_id, mode: 'synthetic', generator: 'deterministic_template', ai_ready: false, language: 'en', facts: {}, claims: [], limitations: [] },
      received_at: '2026-10-13T20:00:00.000Z',
    };
    const reportText = JSON.stringify(report);
    const legacy = async (id: string, assessmentText: string) => {
      const d = await db();
      await d.put('manifests', {
        manifest_version: LEGACY_MANIFEST_VERSION,
        package_id: id,
        created_at: '2026-10-13T20:00:00.000Z',
        origin_channel: 'api',
        assessment_id: loaded.assessment.assessment_id,
        assessment_mode: 'synthetic',
        schema_version: '1.0.0',
        assessment_received_at: '2026-10-13T19:59:00.000Z',
        aoi: loaded.assessment.bbox,
        event_date: loaded.assessment.event_date,
        scene_times: [],
        attributions: 'Synthetic',
        basemap: 'none',
        assets: [
          { asset_id: 'assessment', media_type: 'application/json', sha256: await sha256(text), bytes: text.length },
          { asset_id: 'report-en', media_type: 'application/json', sha256: await sha256(reportText), bytes: reportText.length },
        ],
        reports: [
          { language: 'en', status: 'cached', error_code: null, error_message: null },
          { language: 'ne', status: 'unavailable', error_code: 'language_not_ready', error_message: 'not ready' },
        ],
        limits: [],
      } as never);
      await d.put('assets', { key: `${id}/assessment`, package_id: id, text: assessmentText });
      await d.put('assets', { key: `${id}/report-en`, package_id: id, text: reportText });
    };
    await legacy('pkg-old', text);
    expect((await listPackages())[0].manifest_version).toBe(LEGACY_MANIFEST_VERSION);

    const opened = await openPackage('pkg-old');
    expect(opened.manifest).toMatchObject({ manifest_version: MANIFEST_VERSION, migrated_from: LEGACY_MANIFEST_VERSION });
    expect(opened.loaded.assessment).toEqual(loaded.assessment);
    expect(opened.loaded.received_at).toBe('2026-10-13T19:59:00.000Z');
    expect(opened.docs.report.en.kind === 'ok' && opened.docs.report.en.received.received_at).toBe('2026-10-13T20:00:00.000Z');
    expect(opened.docs.report.ne.kind === 'error' && opened.docs.report.ne.error.code).toBe('language_not_ready');
    expect(opened.scenes.status).toBe('none');
    expect(opened.manifest.assets.find((x) => x.asset_id === 'assessment')!.sha256).toBe(await sha256Bytes(new TextEncoder().encode(text)));

    await legacy('pkg-bad', text.replace('"potentially_isolated_count":1', '"potentially_isolated_count":5'));
    await expect(openPackage('pkg-bad')).rejects.toThrow(/not migrated or opened/);
    expect((await (await db()).get('manifests', 'pkg-bad'))!.manifest_version).toBe(LEGACY_MANIFEST_VERSION);
  });

  it('keeps mission state in a separate store and restores it', async () => {
    const loaded = loadBundledFixture();
    const m = await createPackage(loaded, null);
    const sim = step(step(createSim(loaded.assessment, loaded.assessment.bbox)));
    await saveMission(m.package_id, sim);
    await resetDbForTests();
    expect(await loadMission(m.package_id)).toEqual(sim);
    const pkg = await openPackage(m.package_id);
    expect(pkg.loaded.assessment).toEqual(loaded.assessment);
    await deletePackage(m.package_id);
    expect(await listPackages()).toEqual([]);
    expect(await loadMission(m.package_id)).toBeNull();
    expect(await lastPackageId()).toBeNull();
  });

  it('preserves separate packages when two saves have the same timestamp', async () => {
    const clock = vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-10-14T03:00:00.000Z');
    try {
      const loaded = loadBundledFixture();
      const first = await createPackage(loaded, null);
      const second = await createPackage(loaded, null);
      expect(first.package_id).not.toBe(second.package_id);
      expect(await listPackages()).toHaveLength(2);
      await deletePackage(first.package_id);
      expect((await openPackage(second.package_id)).loaded.assessment).toEqual(loaded.assessment);
    } finally {
      clock.mockRestore();
    }
  });

  it('only fetches same-origin API paths for package bytes', async () => {
    const { fetchImpl } = await geographicApi();
    const client = createClient({ fetchImpl });
    await expect(client.bytes('https://evil.example/x.png')).rejects.toThrow(/Refusing/);
    await expect(client.bytes('/api/v1/../../etc/passwd')).rejects.toThrow(/Refusing/);
    await expect(client.bytes('//evil.example/api/v1/x')).rejects.toThrow(/Refusing/);
  });
});
