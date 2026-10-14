import { expect, test } from '@playwright/test';
import { openBundled } from './helpers';

test('O08: offline start without a package shows the missing-package screen', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('offline-no-package')).toContainText('No offline package exists in this browser');
  await expect(page.getByTestId('internet-badge')).toHaveText('Internet: offline');
});

test('O01/O07/O02: cached package and mission survive an offline reload', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // ensure the page is controlled by the service worker
  await openBundled(page);
  await page.getByRole('tab', { name: 'Offline & mission' }).click();
  await page.getByRole('button', { name: 'Save current assessment as offline package' }).click();
  await expect(page.getByTestId('channel-badge')).toContainText('Cached offline package');
  await page.getByRole('button', { name: 'Start simulation' }).click();
  await page.getByRole('button', { name: 'Advance 5 steps' }).click();
  await page.getByRole('button', { name: 'Simulate radio loss' }).click();
  const tm = await page.getByTestId('telemetry-drone-1').innerText();
  await page.getByRole('button', { name: 'Advance 5 steps' }).click();
  // O02: telemetry frozen; only its age changes.
  await expect(page.getByTestId('telemetry-drone-1')).toContainText('5 step(s) old');
  expect((await page.getByTestId('telemetry-drone-1').innerText()).split('\t').slice(0, 4)).toEqual(tm.split('\t').slice(0, 4));
  await page.getByLabel('Tile to inspect').selectOption('t4-4');
  await page.getByRole('button', { name: 'Queue inspection locally' }).click();
  await expect(page.getByTestId('commands')).toContainText('Local pending — not sent');
  await expect(page.getByRole('button', { name: 'Return to launch' })).toBeDisabled();
  const receivedBefore = await page.getByRole('heading', { name: /Received simulated observations/ }).innerText();

  await context.setOffline(true);
  await page.reload();
  // O07: same package and received events restore from IndexedDB.
  await expect(page.getByTestId('internet-badge')).toHaveText('Internet: offline');
  await expect(page.getByTestId('channel-badge')).toContainText('Cached offline package');
  await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByText('Mission state restored from this browser.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Received simulated observations/ })).toHaveText(receivedBefore);
  await expect(page.getByTestId('link-badge')).toHaveText('Drone radio link: lost');
  await expect(page.getByTestId('commands')).toContainText('Local pending — not sent');
  // O01: the cached view works and does not claim fresh satellite data.
  await page.getByRole('tab', { name: 'Assessment' }).click();
  await expect(page.getByRole('button', { name: 'Run assessment' })).toHaveCount(0);
  await page.getByTestId('settlement-training-settlement-a').click();
  await expect(page.getByTestId('inspector')).toContainText('Cached offline package');
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByText('No backend brief in this package')).toBeVisible();
});

test('O04/O06 in the browser: reconnect after expiry needs review, events deduplicated', async ({ page }) => {
  await page.goto('/');
  await openBundled(page);
  await page.getByRole('tab', { name: 'Offline & mission' }).click();
  await page.getByRole('button', { name: 'Save current assessment as offline package' }).click();
  await page.getByRole('button', { name: 'Start simulation' }).click();
  await page.getByRole('button', { name: 'Simulate radio loss' }).click();
  await page.getByLabel('Tile to inspect').selectOption('t4-4');
  await page.getByRole('button', { name: 'Queue inspection locally' }).click();
  await page.getByRole('button', { name: 'Advance 5 steps' }).click();
  await expect(page.getByTestId('commands')).toContainText('Expired — review needed');
  await page.getByRole('button', { name: 'Restore radio link' }).click();
  const count1 = await page.getByRole('heading', { name: /Received simulated observations/ }).innerText();
  await page.getByRole('button', { name: 'Simulate radio loss' }).click();
  await page.getByRole('button', { name: 'Restore radio link' }).click();
  await expect(page.getByRole('heading', { name: /Received simulated observations/ })).toHaveText(count1);
  await expect(page.getByTestId('commands')).toContainText('Expired — review needed');
  await page.getByRole('button', { name: 'Reissue' }).click();
  await expect(page.getByTestId('commands')).toContainText('cmd-002');
  await page.getByRole('button', { name: 'Advance 1 step' }).click();
  await expect(page.getByTestId('commands')).toContainText('Acknowledged');
});
