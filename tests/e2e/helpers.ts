import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';

export async function openBundled(page: Page) {
  await page.getByText('Other test data').click();
  await page.getByRole('button', { name: 'Open bundled UI fixture (no API)' }).click();
}

// Responses recorded from Codex's backend (synthetic geographic demo), served
// byte-for-byte so hashes match the recorded package manifest.
const dir = resolve(__dirname, 'fixtures');
const file = (name: string) => readFileSync(resolve(dir, name));
export const GEO = {
  snapshot: file('snapshot.json'),
  package: file('package.json'),
  before: file('radar-before.png'),
  after: file('radar-after.png'),
  briefEn: file('brief-en.json'),
  briefNe: file('brief-ne.json'),
  briefHtmlEn: file('brief-en.html'),
  briefHtmlNe: file('brief-ne.html'),
  reportEn: file('report-en.json'),
};
export const GEO_ID = JSON.parse(GEO.snapshot.toString('utf8')).assessment_id as string;

type Override = (path: string, route: Route) => Promise<boolean> | boolean;

// Intercept /api with the recorded backend. `override` may handle a path first.
export async function routeRecordedApi(page: Page, override?: Override) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname + url.search;
    if (override && (await override(path, route))) return;
    const json = (body: Buffer | string, status = 200) => route.fulfill({ status, body, contentType: 'application/json' });
    const base = `/api/v1/assessments/${GEO_ID}`;
    if (path === '/api/v1/readiness') return json(JSON.stringify({ satellite_configured: false, historical_osm_configured: false, ai_configured: false, live_configured: false }));
    if (path === '/api/v1/demo/geographic' || path === base || path === `${base}/snapshot`) return json(GEO.snapshot);
    if (path === `${base}/package`) return json(GEO.package);
    if (path === `${base}/imagery/before`) return route.fulfill({ status: 200, body: GEO.before, contentType: 'image/png' });
    if (path === `${base}/imagery/after`) return route.fulfill({ status: 200, body: GEO.after, contentType: 'image/png' });
    if (path === `${base}/brief?language=en&format=json`) return json(GEO.briefEn);
    if (path === `${base}/brief?language=ne&format=json`) return json(GEO.briefNe);
    if (path === `${base}/brief?language=en&format=html`) return route.fulfill({ status: 200, body: GEO.briefHtmlEn, contentType: 'text/html' });
    if (path === `${base}/brief?language=ne&format=html`) return route.fulfill({ status: 200, body: GEO.briefHtmlNe, contentType: 'text/html' });
    if (path === `${base}/report?language=en`) return json(GEO.reportEn);
    const err = (status: number, code: string, message: string) => json(JSON.stringify({ error: { code, message, retryable: false } }), status);
    if (path === `${base}/report?language=ne`) return err(501, 'language_not_ready', 'Reviewed Nepali/AI generation is not implemented.');
    if (path === `${base}/copilot`) return err(503, 'ai_not_configured', 'Configure a server-side model, endpoint and API key.');
    return err(404, 'not_found', `not recorded: ${path}`);
  });
}

export async function loadComputedDemo(page: Page) {
  await page.getByRole('button', { name: 'Load computed demo (synthetic)' }).click();
  await page.getByTestId('map').and(page.locator('[data-ready=true]')).waitFor();
}
