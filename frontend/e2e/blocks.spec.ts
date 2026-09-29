import { expect, test } from '@playwright/test';
import { SESSION_ID, blockDto, eventDto, mockApi } from './fixtures';

// AC-17 (filtros y detalle de Eventos) y AC-22 (Bloqueos). Red interceptada (ver CLAUDE.md).

const blocks = [
  blockDto('b1', 'dangerous-rm'),
  blockDto('b2', 'sensitive-file', { payload: { tool_input: { command: 'cat .env' } } }),
  blockDto('b3', 'dangerous-rm', { session_id: 'otra-sesion-0000' }),
];

test.describe('AC-22: pantalla de Bloqueos', () => {
  test('muestra fichas, barras por día y la tabla, y pide solo Bloqueos de 7 días', async ({ page }) => {
    const api = await mockApi(page, { events: () => blocks });
    await page.goto('/bloqueos');

    await expect(page.getByTestId('block-row')).toHaveCount(3);
    await expect(page.locator('[data-kpi="today"]')).toContainText('3');
    await expect(page.locator('[data-kpi="top-rule"]')).toContainText('dangerous-rm');
    await expect(page.locator('[data-kpi="sessions"]')).toContainText('2');
    await expect(page.getByTestId('block-day')).toHaveCount(7);
    await expect(page.getByTestId('block-day').last()).toHaveAttribute('data-total', '3');

    const request = api.requests.events.at(-1)!;
    expect(request.searchParams.getAll('event_type')).toStrictEqual(['tool.blocked']);
    const days = (Date.now() - Date.parse(request.searchParams.get('since')!)) / 86_400_000;
    expect(days).toBeGreaterThan(6);
    expect(days).toBeLessThanOrEqual(7);
  });

  test('filtra por Regla y lo refleja en la URL', async ({ page }) => {
    await mockApi(page, { events: () => blocks });
    await page.goto('/bloqueos');
    await page.getByTestId('rule-filter').locator('select').selectOption('sensitive-file');

    await expect(page).toHaveURL(/regla=sensitive-file/);
    await expect(page.getByTestId('block-row')).toHaveCount(1);
    await expect(page.getByTestId('block-row')).toContainText('cat .env');

    await page.reload();
    await expect(page.getByTestId('block-row')).toHaveCount(1);
  });

  test('cada Bloqueo lleva a la pestaña de Bloqueos de su Sesión', async ({ page }) => {
    await mockApi(page, { events: () => blocks });
    await page.goto('/bloqueos');
    await page.getByTestId('block-row').first().getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/sesiones/${SESSION_ID}\\?pestana=bloqueos$`));
  });
});

test.describe('AC-17, AC-22: Bloqueos y filtros en la lista de Eventos', () => {
  const events = [blockDto('b1', 'dangerous-rm'), eventDto('e1', { tool_name: 'Read' }), eventDto('e2')];

  test('un Bloqueo se ve con su Regla y motivo sin expandir', async ({ page }) => {
    await mockApi(page, { events: () => events });
    await page.goto('/eventos');
    const row = page.locator('[data-testid="event-row"][data-type="tool.blocked"]');

    await expect(row).toContainText('dangerous-rm');
    await expect(row).toContainText('Borrado recursivo fuera del Directorio');
  });

  test('filtra por herramienta y expande el detalle con el secreto enmascarado', async ({ page }) => {
    await mockApi(page, {
      events: () => [...events, eventDto('s1', { payload: { tool_input: { command: 'curl -H "x-api-key: ***"' } } })],
    });
    await page.goto('/eventos');
    await page.getByTestId('tool-filter').filter({ hasText: 'Read' }).click();

    await expect(page).toHaveURL(/herramienta=Read/);
    await expect(page.getByTestId('event-row')).toHaveCount(1);
    await expect(page.getByTestId('event-count')).toContainText('Eventos: 1 / 4');

    await page.getByRole('button', { name: 'Limpiar filtros' }).first().click();
    const secretRow = page.getByTestId('event-row').filter({ hasText: 'curl' });
    await secretRow.getByTestId('event-toggle').click();
    const detail = page.getByTestId('event-detail');
    await expect(detail.locator('.secret')).toHaveText('‹secreto›');
    await expect(detail).not.toContainText('***');
  });
});
