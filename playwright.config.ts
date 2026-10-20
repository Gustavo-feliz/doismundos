import { defineConfig, devices } from '@playwright/test';

// Smoke test no navegador real. Um worker só: vários contextos WebGL
// headless disputam a GPU e deixam o teste instável.
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:5188',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      // Chromium completo (não o headless shell) para renderizar com GPU.
      use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 1280, height: 720 } },
    },
  ],
});
