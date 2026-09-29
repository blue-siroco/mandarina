import { defineConfig } from '@playwright/test';

// Con E2E_BASE_URL se prueba contra un frontend ya levantado (p. ej. el del
// docker-compose, desde el contenedor de Playwright); sin ella, Playwright lo arranca.
const externalBaseUrl = process.env['E2E_BASE_URL'];
const baseURL = externalBaseUrl ?? 'http://localhost:4200';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['html', { outputFolder: 'reports/playwright', open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm start',
        url: baseURL,
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
      },
});
