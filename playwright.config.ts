import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const artifacts=process.env.WRINGER_ARTIFACTS_DIR;
export default defineConfig({
  testDir: './tests/browser', outputDir: artifacts ? resolve(artifacts,'playwright') : 'test-results', fullyParallel: false, workers: 1,
  timeout: 60000, expect: { timeout: 15000 },
  reporter: [['list'], ['json', { outputFile: artifacts ? resolve(artifacts,'browser-results.json') : 'test-results/browser-results.json' }]],
  use: { baseURL: process.env.APP_BASE_URL || 'http://127.0.0.1:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport:{width:1440,height:1000} } }],
});
