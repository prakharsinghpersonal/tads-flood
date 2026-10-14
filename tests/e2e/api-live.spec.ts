// Integration flow against the ACTUAL local backend through the preview proxy.
// check_integration.py sets REQUIRE_LOCAL_API=1: an unavailable API fails CI.
import { expect, test } from '@playwright/test';
import { loadComputedDemo } from './helpers';

test.beforeEach(async ({ request }) => {
  const up = await request.get('/health').then((r) => r.ok()).catch(() => false);
  if (process.env.REQUIRE_LOCAL_API === '1') expect(up, 'Required integration API must be reachable').toBe(true);
  test.skip(!up, 'Local API on :8000 is not running');
});

test('real backend: computed demo, radar, package, brief and copilot state', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.getByTestId('readiness')).toContainText('Configured does not mean tested');
  await loadComputedDemo(page);
  await expect(page.getByTestId('map')).toHaveAttribute('data-radar-loaded', 'before_radar,after_radar');

  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByTestId('report-generator')).toHaveText('Deterministic template — not AI');
  await page.getByRole('textbox', { name: 'Question' }).fill('Which mapped settlements may be isolated?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  // No model is configured on the server in this environment.
  await expect(page.getByTestId('copilot-not-configured').or(page.getByTestId('copilot-answer'))).toBeVisible();
  if (process.env.REQUIRE_LOCAL_API === '1') await expect(page.getByTestId('copilot-not-configured')).toBeVisible();

  await page.getByRole('tab', { name: 'Offline & mission' }).click();
  await page.getByRole('button', { name: 'Save current assessment as offline package' }).click();
  await expect(page.getByTestId('package-item').first()).toContainText('Exact backend package (server hashes)');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('channel-badge')).toContainText('Cached offline package');
  await expect(page.getByTestId('map')).toHaveAttribute('data-radar-loaded', 'before_radar,after_radar');
  await page.screenshot({ path: 'test-results/screens/real-api-offline.png' });
});
