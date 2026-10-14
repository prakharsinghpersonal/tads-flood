import { defineConfig, devices } from '@playwright/test';

// Specs live in tests/e2e (repo root). They run against the production build so
// the service worker and offline reload are exercised for real. No API is
// needed: flows use the bundled UI fixture, and API calls are intercepted.
// PW_PORT lets a run use a free port without touching other local services.
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: '../../tests/e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
