import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures';

// AC-53: indicador de la Exportación OTLP en la barra lateral. Red interceptada (ver CLAUDE.md).

const turn = (id: string, overrides: Record<string, unknown> = {}) => ({
  turn_id: id,
  session_id: `sesion-${id}`,
  project: 'demo',
  state: 'exported',
  attempts: 1,
  last_error: null,
  updated_at: '2026-09-25T12:00:30.000Z',
  ...overrides,
});

const active = {
  enabled: true,
  endpoint_host: 'collector.local:4318',
  include_content: false,
  enabled_since: '2026-09-25T11:00:00.000Z',
  counts: { pending: 1, exported: 2, failed: 1 },
  last_exported_at: '2026-09-25T12:00:30.000Z',
  recent: [
    turn('p1'),
    turn('p2', { state: 'pending', attempts: 2, last_error: 'HTTP 503' }),
    turn('p3', { state: 'failed', attempts: 4, last_error: 'connect ECONNREFUSED' }),
  ],
};

test.describe('AC-53: indicador de la Exportación OTLP', () => {
  test('con el exportador desactivado no aparece nada', async ({ page }) => {
    const api = await mockApi(page);
    await page.goto('/sesiones');
    await expect.poll(() => api.requests.exporter.length).toBeGreaterThan(0);
    await expect(page.getByTestId('exporter-indicator')).toHaveCount(0);
  });

  test('activo, avisa del colector y de los Turnos fallidos con texto', async ({ page }) => {
    await mockApi(page, { exporter: () => active });
    await page.goto('/sesiones');

    const indicator = page.getByTestId('exporter-indicator');
    await expect(indicator).toContainText('Exportando a collector.local:4318');
    await expect(indicator).toContainText('1 Turno fallido');
  });

  test('al pulsarlo se abre el modal con los Turnos y el error de los fallidos', async ({ page }) => {
    await mockApi(page, { exporter: () => active });
    await page.goto('/sesiones');
    await page.getByTestId('exporter-indicator').click();

    const modal = page.getByTestId('exporter-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('exporter-counts')).toContainText('Fallidos1');
    const rows = page.getByTestId('exporter-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2)).toContainText('Fallido');
    await expect(rows.nth(2)).toContainText('connect ECONNREFUSED');
  });

  test('se cierra con Esc y el foco vuelve al indicador', async ({ page }) => {
    await mockApi(page, { exporter: () => active });
    await page.goto('/sesiones');
    await page.getByTestId('exporter-indicator').click();
    await expect(page.getByTestId('exporter-modal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('exporter-modal')).toHaveCount(0);
    await expect(page.getByTestId('exporter-indicator')).toBeFocused();
  });

  test('cada Turno lleva a su Sesión', async ({ page }) => {
    await mockApi(page, { exporter: () => active });
    await page.goto('/sesiones');
    await page.getByTestId('exporter-indicator').click();
    await page.getByTestId('exporter-row').first().getByRole('link', { name: 'Ver Sesión' }).click();

    await expect(page).toHaveURL(/\/sesiones\/sesion-p1$/);
    await expect(page.getByTestId('exporter-modal')).toHaveCount(0);
  });

  test('un fallo al consultar el estado no rompe la barra lateral', async ({ page }) => {
    await mockApi(page);
    await page.route(/\/api\/v1\/exporter(\?|$)/, (route) => route.fulfill({ status: 500, json: { message: 'caído' } }));
    await page.goto('/sesiones');

    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    await expect(page.getByTestId('exporter-indicator')).toHaveCount(0);
  });
});
