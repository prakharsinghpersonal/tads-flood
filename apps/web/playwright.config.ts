import { defineConfig, devices } from '@playwright/test';

// Specs live in tests/e2e (repo root). They run against the production build so
// the service worker and offline reload are exercised for real. No API is
// needed: flows use the bundled UI fixture, and API calls are intercepted.
export default defineConfig({
  testDir: '../../tests/e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
