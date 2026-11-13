module.exports = {
  testDir: './tests',
  timeout: 30000,
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    baseURL: 'http://localhost:3000'
  },
  webServer: {
    command: 'node server/server.js',
    url: 'http://localhost:3000/api/salud',
    reuseExistingServer: !process.env.CI,
    timeout: 60000
  }
};
