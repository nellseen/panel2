import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/playwright-report.json' }],
  ],
  outputDir: 'test-results/e2e-artifacts',
  use: {
    baseURL: 'http://127.0.0.1:3199',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  },
  webServer: {
    command: 'npx tsx tests/e2e/bootstrap-e2e-server.ts',
    url: 'http://127.0.0.1:3199/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
