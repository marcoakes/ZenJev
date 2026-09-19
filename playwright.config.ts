import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  timeout: 60000, expect: { timeout: 15000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
  use: { baseURL: process.env.APP_BASE_URL || 'http://127.0.0.1:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport:{width:1440,height:1000} } }],
});
