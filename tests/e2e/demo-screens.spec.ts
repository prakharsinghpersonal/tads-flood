// Storyboard screenshots for docs/DEMO_STORYBOARD.md. Opt-in: DEMO_SCREENS=1.
// Uses responses recorded from Codex's backend (synthetic training scene) so
// the frames are reproducible; the live-provider frame is the real 503 shape.
import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { loadComputedDemo, openMission, radarButton, routeRecordedApi } from './helpers';

const out = (name: string) => resolve(__dirname, '../../docs/demo/screens', name);
test.skip(!process.env.DEMO_SCREENS, 'Set DEMO_SCREENS=1 to regenerate storyboard screenshots');
test.use({ viewport: { width: 1440, height: 900 } });

test('storyboard frames', async ({ page, context }) => {
  await routeRecordedApi(page, (path, route) =>
    path === '/api/v1/assessments'
      ? route
          .fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'live_provider_unavailable', message: 'Live satellite/OSM providers are not connected.', retryable: false } }) })
          .then(() => true)
      : false,
  );
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);

  // 1. Honest unavailable source: live run without provider keys.
  await page.getByRole('button', { name: 'Run assessment' }).click();
  await expect(page.getByRole('alert')).toContainText('Live providers unavailable');
  await page.screenshot({ path: out('01-live-unavailable.png') });

  // 2. Computed scene: radar after-event, candidate flood and exposure.
  await loadComputedDemo(page);
  await expect(page.getByTestId('map')).toHaveAttribute('data-radar-loaded', 'before_radar,after_radar');
  await page.screenshot({ path: out('02-computed-after-radar.png') });
  await radarButton(page, 'Before').click();
  await page.screenshot({ path: out('03-before-radar.png') });
  await radarButton(page, 'After').click();

  // 3. Candidate cut: settlement, route, cut edges, decision text.
  await page.getByTestId('settlement-training-village-west').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('04-settlement-cut.png') });

  // 4. Verify the cut edge's sources.
  await page.getByTestId('inspector').getByRole('list', { name: 'Candidate cut edges' }).getByRole('button', { name: /training-bridge:0:0/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('05-cut-edge-evidence.png') });

  // 5. Connected settlement for contrast.
  await page.getByTestId('settlement-training-village-east').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('06-connected-settlement.png') });

  // 6. Cited brief and Nepali draft.
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByTestId('report')).toBeVisible();
  await page.screenshot({ path: out('07-brief-en.png') });
  await page.getByRole('button', { name: /Nepali/ }).click();
  await expect(page.getByTestId('draft-badge')).toBeVisible();
  await page.screenshot({ path: out('08-brief-ne-draft.png') });
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('textbox', { name: 'Question' }).fill('How many people were killed?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByTestId('copilot-not-configured')).toBeVisible();
  await page.getByTestId('copilot').scrollIntoViewIfNeeded();
  await page.screenshot({ path: out('09-copilot-not-configured.png') });

  // 7. Offline package + simulation, after an offline reload.
  await page.getByRole('tab', { name: 'Offline & mission' }).click();
  await page.getByRole('button', { name: 'Save current assessment as offline package' }).click();
  await openMission(page);
  await page.getByRole('button', { name: 'Start simulation' }).click();
  await page.getByRole('button', { name: 'Advance 5 steps' }).click();
  await page.getByRole('button', { name: 'Simulate radio loss' }).click();
  await page.getByRole('button', { name: 'Advance 5 steps' }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('map')).toHaveAttribute('data-radar-loaded', 'before_radar,after_radar');
  await openMission(page);
  await page.getByTestId('mission').scrollIntoViewIfNeeded();
  await page.screenshot({ path: out('10-offline-sim-radio-loss.png') });
});
