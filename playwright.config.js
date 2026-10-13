/** Configure parent-owned browser verification against the real Express process. */
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ],
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3000',
    env: { PORT: '3000' },
    reuseExistingServer: false,
    timeout: 30000
  }
});
