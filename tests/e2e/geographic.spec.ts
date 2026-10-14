// Computed geographic demo, radar comparison, binary packages and copilot.
// All /api traffic is INTERCEPTED with responses recorded from Codex's backend.
import { expect, test } from '@playwright/test';
import { GEO_ID, loadComputedDemo, routeRecordedApi } from './helpers';

test('radar before/after draws decoded PNGs at manifest corners with both dates', async ({ page }) => {
  await routeRecordedApi(page);
  await page.goto('/');
  await loadComputedDemo(page);
  const map = page.getByTestId('map');
  await expect(map).toHaveAttribute('data-radar', 'after:before_radar,after_radar');
  await expect(map).toHaveAttribute('data-radar-loaded', 'before_radar,after_radar');
  await expect(page.getByTestId('scene-date-before_radar')).toHaveText('2026-08-20 00:00Z');
  await expect(page.getByTestId('scene-date-after_radar')).toHaveText('2026-09-01 00:00Z');
  // Keyboard-only comparison.
  await page.getByRole('button', { name: 'Before', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(map).toHaveAttribute('data-radar', 'before:before_radar,after_radar');
  await page.getByRole('slider').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText(/Image opacity \d+%/)).not.toHaveText('Image opacity 85%');
  await page.screenshot({ path: 'test-results/screens/radar-before.png' });
});

test('missing package shows imagery unavailable; tampered PNG is refused', async ({ page }) => {
  await routeRecordedApi(page, (path, route) =>
    path.endsWith('/package') ? route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"code":"assessment_not_found","message":"no package","retryable":false}}' }).then(() => true) : false,
  );
  await page.goto('/');
  await loadComputedDemo(page);
  await expect(page.getByTestId('imagery-unavailable')).toBeVisible();
  await expect(page.getByTestId('map')).toHaveAttribute('data-radar', 'none');
  await page.screenshot({ path: 'test-results/screens/imagery-unavailable.png' });

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await routeRecordedApi(page, (path, route) => (path.endsWith('/imagery/before') ? route.fulfill({ status: 200, body: Buffer.from([1, 2, 3]), contentType: 'image/png' }).then(() => true) : false));
  await page.goto('/');
  await loadComputedDemo(page);
  await expect(page.getByTestId('imagery-error')).toContainText('SHA-256');
  await expect(page.getByTestId('map')).toHaveAttribute('data-radar', 'none');
});

test('facility and settlement selection on the computed demo', async ({ page }) => {
  await routeRecordedApi(page);
  await page.goto('/');
  await loadComputedDemo(page);
  await page.getByTestId('facility-training-hospital').click();
  await expect(page.getByTestId('inspector').getByTestId('inspector-status')).toContainText('hospital');
  await page.getByTestId('settlement-training-village-west').click();
  await expect(page.getByTestId('inspector').getByRole('list', { name: 'Candidate cut edges' })).toContainText('training-bridge:0:0');
});

test('exact package survives offline reload: both images, briefs, mission; copilot gated', async ({ page, context }) => {
  await routeRecordedApi(page);
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await loadComputedDemo(page);
  await page.getByRole('tab', { name: 'Offline & mission' }).click();
  await page.getByRole('button', { name: 'Save current assessment as offline package' }).click();
  await expect(page.getByTestId('channel-badge')).toContainText('Cached offline package');
  await expect(page.getByTestId('package-item')).toContainText('Exact backend package (server hashes)');
  await page.getByRole('button', { name: 'Start simulation' }).click();
  await page.getByRole('button', { name: 'Advance 5 steps' }).click();
  const received = await page.getByRole('heading', { name: /Received simulated observations/ }).innerText();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('internet-badge')).toHaveText('Internet: offline');
  await expect(page.getByTestId('channel-badge')).toContainText('Cached offline package');
  await expect(page.getByTestId('mode-badge')).toHaveText('SYNTHETIC');
  // Network loss is not radio loss.
  await expect(page.getByTestId('link-badge')).toHaveText('Drone radio link: connected');
  await expect(page.getByRole('heading', { name: /Received simulated observations/ })).toHaveText(received);
  const map = page.getByTestId('map');
  await expect(map).toHaveAttribute('data-radar-loaded', 'before_radar,after_radar');
  await page.getByRole('tab', { name: 'Assessment' }).click();
  await expect(page.getByTestId('scene-date-before_radar')).toHaveText('2026-08-20 00:00Z');
  await expect(page.getByTestId('scene-date-after_radar')).toHaveText('2026-09-01 00:00Z');
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByTestId('report-generator')).toHaveText('Deterministic template — not AI');
  await page.getByRole('button', { name: /Nepali/ }).click();
  await expect(page.getByTestId('draft-badge')).toBeVisible();
  await expect(page.getByTestId('copilot-unavailable')).toContainText('Questions need the live API');
  await page.screenshot({ path: 'test-results/screens/offline-cached-ne.png' });
});

test('copilot no-key state and keyboard use', async ({ page }) => {
  await routeRecordedApi(page);
  await page.goto('/');
  await loadComputedDemo(page);
  await page.getByRole('tab', { name: 'Report' }).click();
  await page.getByRole('button', { name: 'Which mapped settlements may be isolated?' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Ask', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('copilot-not-configured')).toContainText('No answer was generated');
  expect(GEO_ID).toMatch(/^synthetic-/);
});

for (const width of [320, 768, 1440]) {
  test(`computed demo layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    await routeRecordedApi(page);
    await page.goto('/');
    await loadComputedDemo(page);
    await page.getByTestId('settlement-training-village-west').click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: 'Close evidence inspector' })).toBeInViewport();
    await page.screenshot({ path: `test-results/screens/geo-${width}.png` });
  });
}
