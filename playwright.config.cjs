const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', timeout: 45000, workers: 1,
  use: { baseURL: 'http://localhost:5173', channel: process.env.PLAYWRIGHT_CHANNEL,
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
             { name: 'mobile', use: { viewport: { width: 390, height: 844 } } }],
});
