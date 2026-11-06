import { defineConfig } from '@playwright/test';

// E2E 前需先构建前端（npm --prefix web run build），
// 服务器（node ../server/src/index.js）由 webServer 自动拉起并等待健康检查通过
const reporters = [['line']];
if (process.env.E2E_JSON_REPORT) reporters.push(['json', { outputFile: '../e2e-report.json' }]);

export default defineConfig({
  reporter: reporters,
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3128',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'node ../server/src/index.js',
    url: 'http://localhost:3128/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
