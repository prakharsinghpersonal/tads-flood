import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '../api/client';
import { loadBundledFixture } from '../components/PreparePanel';
import { createSim, step } from '../mission/sim';
import {
  PackageIntegrityError,
  createPackage,
  db,
  deletePackage,
  lastPackageId,
  listPackages,
  loadMission,
  openPackage,
  resetDbForTests,
  saveMission,
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

const report = {
  assessment_id: 'synthetic-ui-geometry-001', mode: 'synthetic', generator: 'deterministic_template', ai_ready: false,
  language: 'en', facts: { potentially_isolated_count: 1 }, claims: [], limitations: [],
};
const client = createClient({
  fetchImpl: (async (url: string) =>
    String(url).includes('language=en')
      ? new Response(JSON.stringify(report), { status: 200 })
      : new Response(JSON.stringify({ error: { code: 'language_not_ready', message: 'not ready', retryable: false } }), { status: 501 })) as unknown as typeof fetch,
});

describe('offline package store', () => {
  it('O07: round-trips the exact assessment and backend reports with hashes', async () => {
    const loaded = { ...loadBundledFixture(), channel: 'api' as const };
    const m = await createPackage(loaded, client);
    expect(m.assets.map((a) => a.asset_id).sort()).toEqual(['assessment', 'report-en']);
    expect(m.reports).toEqual([
      { language: 'en', status: 'cached', error_code: null, error_message: null },
      { language: 'ne', status: 'unavailable', error_code: 'language_not_ready', error_message: 'not ready' },
    ]);
    expect(await lastPackageId()).toBe(m.package_id);

    await resetDbForTests();
    const pkg = await openPackage(m.package_id);
    expect(pkg.loaded.channel).toBe('offline_package');
    expect(pkg.loaded.assessment).toEqual(loaded.assessment);
    expect(pkg.loaded.received_at).toBe(loaded.received_at);
    expect(pkg.reports.en.kind === 'ok' && pkg.reports.en.received.value.facts).toEqual({ potentially_isolated_count: 1 });
    expect(pkg.reports.ne.kind === 'error' && pkg.reports.ne.error.code).toBe('language_not_ready');
  });

  it('refuses a tampered asset instead of using it', async () => {
    const m = await createPackage(loadBundledFixture(), null);
    const d = await db();
    const row = (await d.get('assets', `${m.package_id}/assessment`))!;
    await d.put('assets', { ...row, text: row.text.replace('"potentially_isolated_count":1', '"potentially_isolated_count":0') });
    await expect(openPackage(m.package_id)).rejects.toThrow(PackageIntegrityError);
    await expect(openPackage(m.package_id)).rejects.toThrow(/SHA-256/);
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
});
