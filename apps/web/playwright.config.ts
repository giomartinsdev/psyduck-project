import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Web app runs in Docker — no local server to start.
  // Run `docker compose up -d` before running tests.
  webServer: {
    command: 'echo "web is served by Docker on :3000"',
    port: 3000,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
