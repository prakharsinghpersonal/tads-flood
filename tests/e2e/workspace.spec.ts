import { expect, test, type Page } from '@playwright/test';

async function openFixture(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open bundled UI fixture (no API)' }).click();
  await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true');
}

test('U01: real map renders the fixture with strict provenance badges', async ({ page }) => {
  await openFixture(page);
  await expect(page.getByTestId('mode-badge')).toHaveText('SYNTHETIC');
  await expect(page.getByTestId('channel-badge')).toContainText('Bundled UI fixture');
  await expect(page.getByRole('note')).toContainText('not a real flood assessment');
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Synthetic geometry');
  // The map projects the AOI and draws settlement features.
  const rendered = await page.evaluate(() => document.querySelectorAll('canvas.maplibregl-canvas').length);
  expect(rendered).toBe(1);
});

test('U02: selecting a settlement opens inspector and evidence', async ({ page }) => {
  await openFixture(page);
  await page.getByTestId('settlement-training-settlement-a').click();
  const inspector = page.getByTestId('inspector');
  await expect(inspector.getByTestId('inspector-status')).toContainText('Potentially isolated');
  await expect(inspector.getByRole('list', { name: 'Candidate cut edges' })).toContainText('bridge-a');
  await inspector.getByRole('button', { name: 'synthetic-graph-ui-001' }).first().click();
  await expect(page.getByRole('heading', { name: 'Source synthetic-graph-ui-001' })).toBeFocused();
  await expect(page.getByTestId('source-synthetic-graph-ui-001')).toContainText('synthetic://synthetic-graph-ui-001');
});

test('U04: API outage is shown, not replaced by fixture data', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort('failed'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Run assessment' }).click();
  await expect(page.getByRole('alert')).toContainText('API unreachable');
  await expect(page.getByTestId('mode-badge')).toHaveCount(0);
});

test('X01: essential flow by keyboard only', async ({ page }) => {
  await page.goto('/');
  const fixtureButton = page.getByRole('button', { name: 'Open bundled UI fixture (no API)' });
  await fixtureButton.focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('settlement-training-settlement-b').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'Settlement B (synthetic)' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close evidence inspector' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inspector')).toHaveCount(0);
});

for (const width of [320, 768, 1440]) {
  test(`X02: no horizontal clipping at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openFixture(page);
    await page.getByTestId('settlement-training-settlement-a').click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const inspector = page.getByTestId('inspector');
    await expect(inspector).toBeVisible();
    const ib = (await inspector.boundingBox())!;
    expect(ib.x).toBeGreaterThanOrEqual(0);
    expect(ib.x + ib.width).toBeLessThanOrEqual(width + 1);
    await expect(page.getByRole('button', { name: 'Close evidence inspector' })).toBeInViewport();
    await page.screenshot({ path: `test-results/screens/workspace-${width}.png` });
  });
}

test('X03: reduced motion removes animation', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await openFixture(page);
  const durations = await page.evaluate(() =>
    [...document.querySelectorAll('*')].map((e) => getComputedStyle(e).animationName).filter((n) => n && n !== 'none'),
  );
  expect(durations).toEqual([]);
  await ctx.close();
});
