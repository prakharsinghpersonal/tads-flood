// OPT-IN: recorded real-mode output (Syapru Besi, live-c9157aa9850da3ddb9bb20f2).
// Set TADS_LIVE_UI_RECORDING_DIR to the absolute recordings directory. Every GET
// is answered with the original recorded bytes, verified against the recording
// manifest's SHA-256 and length before use. No provider, model or credential is
// involved. The ONLY constructed response is the completed-job wrapper for
// POST /api/v1/assessments (needed to enter the UI through "Run assessment").
// Unrecorded routes get an explicit 404 envelope, never a fallback.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { radarButton } from './helpers';

const DIR = process.env.TADS_LIVE_UI_RECORDING_DIR ?? '';
const enabled = DIR !== '' && isAbsolute(DIR) && existsSync(resolve(DIR, 'recording-manifest.json'));
test.skip(!enabled, 'Opt-in: set TADS_LIVE_UI_RECORDING_DIR to the absolute live-ui-recordings directory');

interface Route { method: string; path: string; file: string; status: number; content_type: string }
interface Manifest { format: string; recorded_mode: string; assessment_id: string; routes: Route[]; files: Record<string, { sha256: string; bytes: number }> }

function loadRecording() {
  const manifest = JSON.parse(readFileSync(resolve(DIR, 'recording-manifest.json'), 'utf8')) as Manifest;
  const bodies = new Map<string, { route: Route; body: Buffer }>();
  for (const r of manifest.routes) {
    const body = readFileSync(resolve(DIR, r.file));
    const expected = manifest.files[r.file];
    const digest = createHash('sha256').update(body).digest('hex');
    if (!expected || digest !== expected.sha256 || body.length !== expected.bytes) {
      throw new Error(`Recording ${r.file} does not match its manifest hash/length; refusing to serve it.`);
    }
    bodies.set(r.path, { route: r, body });
  }
  return { manifest, bodies };
}

const rec = enabled ? loadRecording() : null;
const ID = rec?.manifest.assessment_id ?? '';
const snapshot = rec ? JSON.parse(rec.bodies.get(`/api/v1/assessments/${ID}/snapshot`)!.body.toString('utf8')) : null;
const BBOX: number[] = snapshot?.bbox ?? [];
const frame = (name: string) => resolve(__dirname, '../../docs/demo/screens', name);

async function serveRecording(page: Page, served: string[]) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = decodeURIComponent(url.pathname) === url.pathname ? url.pathname + url.search : url.pathname + url.search;
    if (req.method() === 'POST' && url.pathname === '/api/v1/assessments') {
      // CONSTRUCTED test response: a completed-job wrapper only. The assessment
      // itself is then fetched from the recorded GET route.
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_id: 'recorded-replay-job', status: 'completed', assessment_id: ID, mode: 'live' }) });
    }
    const hit = req.method() === 'GET' ? (rec!.bodies.get(path) ?? rec!.bodies.get(decodeURIComponent(url.pathname) + url.search)) : undefined;
    if (!hit) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'not_recorded', message: `No recording for ${req.method()} ${path}`, retryable: false } }) });
    }
    served.push(hit.route.file);
    return route.fulfill({ status: hit.route.status, contentType: hit.route.content_type, body: hit.body });
  });
}

async function runRecordedCase(page: Page) {
  const fields: Array<[RegExp, number]> = [[/West/, BBOX[0]], [/South/, BBOX[1]], [/East/, BBOX[2]], [/North/, BBOX[3]]];
  for (const [name, v] of fields) await page.getByRole('textbox', { name }).fill(String(v));
  await page.getByLabel('Flood date').fill(snapshot.event_date);
  await page.getByRole('radio', { name: /Live/ }).check();
  await page.getByRole('button', { name: 'Run assessment' }).click();
  await page.getByTestId('map').and(page.locator('[data-ready=true]')).waitFor();
}

test.describe('recorded real-mode case (Syapru Besi)', () => {
  test('LIVE provenance, radar, coverage, zero isolated vs two unknown, evidence scope, offline, print', async ({ page, context }) => {
    test.setTimeout(120_000);
    const served: string[] = [];
    await serveRecording(page, served);
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await runRecordedCase(page);

    // Provenance: LIVE, real source kinds via attribution, no synthetic banner.
    await expect(page.getByTestId('mode-badge')).toHaveText('LIVE');
    await expect(page.getByTestId('channel-badge')).toHaveText('Received from API');
    await expect(page.getByText(/Synthetic data\. Invented geometry/)).toHaveCount(0);
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Contains modified Copernicus Sentinel data');
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');

    // Radar: decoded recorded PNGs at manifest corners, actual acquisition dates.
    const map = page.getByTestId('map');
    await expect(map).toHaveAttribute('data-radar-loaded', 'before_radar,after_radar');
    await expect(page.getByTestId('scene-date-before_radar')).toHaveText('2026-08-16 12:21:41Z');
    await expect(page.getByTestId('scene-date-after_radar')).toHaveText('2026-08-28 12:21:41Z');
    await expect(radarButton(page, 'Before')).toContainText('2026-08-16');
    expect(served).toEqual(expect.arrayContaining(['assessment.json', 'package.json', 'before.png', 'after.png']));

    // Quantities and wording: zero isolated is NOT shown as safe; two unknown.
    const facts = page.getByTestId('summary-facts');
    await expect(facts.locator('[data-fact=potentially_isolated_count]')).toHaveText('0');
    await expect(facts.locator('[data-fact=unknown_network_count]')).toHaveText('2');
    await expect(facts.locator('[data-fact=exposed_asset_count]')).toHaveText('11');
    await expect(page.getByText(/Data coverage: 42% of the area \(partial\)/)).toBeVisible();
    await expect(page.getByText('Anything outside coverage is unknown, not unaffected.', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Unknown network (2)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Potentially isolated/ })).toHaveCount(0);
    await expect(page.getByText('Road network coverage or snapping is missing. Access is unknown, not safe.')).toBeVisible();
    await page.screenshot({ path: frame('11-recorded-live-overview.png') });

    // Evidence for an unknown-access settlement stays within this assessment.
    const first = snapshot.settlements.find((s: { status: string }) => s.status === 'unknown_network');
    await page.getByTestId(`settlement-${first.settlement_id}`).click();
    const inspector = page.getByTestId('inspector');
    await expect(inspector.getByTestId('inspector-status')).toContainText('Unknown network');
    await expect(inspector).toContainText('do not treat it as safe');
    const sourceIds: string[] = snapshot.sources.map((s: { source_id: string }) => s.source_id);
    const srcLinks = inspector.locator('.source-list button.link');
    const linkTexts = await srcLinks.allInnerTexts();
    expect(linkTexts.length).toBeGreaterThan(0);
    for (const t of linkTexts) expect(sourceIds).toContain(t.trim());
    await page.screenshot({ path: frame('12-recorded-live-evidence.png') });
    await srcLinks.first().click();
    await expect(inspector).toContainText(`/api/v1/assessments/${ID}/sources/`);
    await page.keyboard.press('Escape');

    // Brief (EN) and reviewed NE 501; unreviewed NE stays DRAFT in print.
    await page.getByRole('tab', { name: 'Report' }).click();
    await expect(page.getByTestId('report-generator')).toHaveText('Deterministic template — not AI');
    await expect(page.getByTestId('report')).toContainText('41.8');
    await expect(page.getByTestId('reviewed-status')).toHaveText('Reviewed English report: available');
    await page.screenshot({ path: frame('13-recorded-live-brief.png') });
    await page.getByRole('button', { name: /Nepali/ }).click();
    await expect(page.getByTestId('draft-badge')).toBeVisible();
    await expect(page.getByTestId('reviewed-status')).toContainText('not ready — fluent review pending');
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('draft-badge')).toBeVisible();
    await page.emulateMedia({ media: 'screen' });

    // Offline: exact snapshot and PNGs; LIVE stays the original mode.
    await page.getByRole('tab', { name: 'Offline & mission' }).click();
    await page.getByRole('button', { name: 'Save current assessment as offline package' }).click();
    const item = page.getByTestId('package-item').first();
    await expect(item).toContainText('Exact backend package (server hashes)');
    await expect(item).toContainText('assessment c96e0101');
    await expect(item).toContainText('before_radar 8f17afcf');
    await expect(item).toContainText('after_radar 94322bd5');
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('internet-badge')).toHaveText('Internet: offline');
    await expect(page.getByTestId('mode-badge')).toHaveText('LIVE');
    await expect(page.getByTestId('channel-badge')).toContainText('Cached offline package');
    await expect(map).toHaveAttribute('data-radar-loaded', 'before_radar,after_radar');
    await page.getByRole('tab', { name: 'Assessment' }).click();
    await expect(page.getByTestId('scene-date-after_radar')).toHaveText('2026-08-28 12:21:41Z');
    await page.getByRole('tab', { name: 'Report' }).click();
    await page.getByRole('button', { name: /Nepali/ }).click();
    await expect(page.getByTestId('draft-badge')).toBeVisible();
    // The optional simulation stays collapsed; nothing about it is asserted here.
  });

  for (const width of [320, 768, 1440]) {
    test(`recorded case at ${width}px: no clipping, keyboard path completes`, async ({ page }) => {
      await page.setViewportSize({ width, height: 860 });
      await serveRecording(page, []);
      await page.goto('/');
      await runRecordedCase(page);
      const first = snapshot.settlements.find((s: { status: string }) => s.status === 'unknown_network');
      const btn = page.getByTestId(`settlement-${first.settlement_id}`);
      await btn.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('inspector').getByRole('heading', { level: 2 })).toBeFocused();
      await expect(page.getByRole('button', { name: 'Close evidence inspector' })).toBeInViewport();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('inspector')).toHaveCount(0);
      await radarButton(page, 'Before').focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('map')).toHaveAttribute('data-radar', /^before:/);
      await expect(page.getByTestId('mode-badge')).toBeInViewport();
      await page.screenshot({ path: `test-results/screens/recorded-${width}.png` });
    });
  }
});
