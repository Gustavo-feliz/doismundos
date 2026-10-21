import { defineConfig, devices } from '@playwright/test';
import { PREVIEW_PORT } from './dev-ports';

// Fumaça no BUILD DE PRODUÇÃO (npm run test:prod): o mesmo pacote que vai
// para o ar, servido pelo `vite preview`. Os ganchos de teste entram com ?debug.
export default defineConfig({
  testDir: './tests/e2e-prod',
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://127.0.0.1:${PREVIEW_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    url: `http://127.0.0.1:${PREVIEW_PORT}`,
    // O preview lê a pasta dist do disco: um servidor já aberto serve o build que o script acabou de gerar.
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'producao-chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 1280, height: 720 } },
    },
  ],
});
