import { expect, test } from '@playwright/test';
import { SESSION_ID, detailDto, eventDto, mockApi, sessionDto } from './fixtures';

// AC-68: los Avisos de inyección se ven en el board, en los Eventos y en la Línea de tiempo.
// Red interceptada (ver CLAUDE.md).

const board = (items: unknown[]) => () => ({
  items,
  facets: { projects: ['demo'], directories: ['C:\\Codev\\demo'] },
});

const warning = (severity: 'low' | 'medium' | 'high', overrides: Record<string, unknown> = {}) => ({
  id: 'e-web:fake-system-tag',
  pattern: 'fake-system-tag',
  severity,
  dismissed: false,
  ...overrides,
});

const events = [
  eventDto('e-plain', { event_type: 'tool.post', tool_name: 'Bash' }),
  eventDto('e-web', {
    event_type: 'tool.post',
    native_event_type: 'PostToolUse',
    tool_name: 'WebFetch',
    payload: { tool_input: { url: 'https://evil.example/a' } },
    warnings: [warning('high'), warning('medium', { id: 'e-web:ignore-previous', pattern: 'ignore-previous' })],
  }),
  eventDto('e-dismissed', {
    event_type: 'tool.post',
    tool_name: 'Read',
    payload: { tool_input: { file_path: 'README.md' } },
    warnings: [warning('high', { id: 'e-dismissed:fake-turn', pattern: 'fake-turn', dismissed: true })],
  }),
];

test.describe('AC-68: avisos de inyección', () => {
  test('la tarjeta del board lleva el badge con texto y enlaza a Seguridad filtrado por la Sesión', async ({ page }) => {
    await mockApi(page, {
      sessions: board([sessionDto(SESSION_ID, { injection_alerts: 2 }), sessionDto('a7b20e00-0000-4000-8000-000000000002')]),
    });
    await page.goto('/sesiones');

    const cards = page.getByTestId('session-card');
    await expect(cards).toHaveCount(2);
    const badge = cards.nth(0).getByTestId('session-alerts');
    await expect(badge).toHaveText('2 avisos de inyección');
    await expect(badge).toHaveAttribute('href', `/seguridad?pestana=avisos&severidad=alta&sesion=${SESSION_ID}`);
    await expect(cards.nth(1).getByTestId('session-alerts')).toHaveCount(0);
  });

  test('en pantalla estrecha el badge no desborda la página', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, { sessions: board([sessionDto(SESSION_ID, { injection_alerts: 12 })]) });
    await page.goto('/sesiones');
    await expect(page.getByTestId('session-alerts')).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test('/eventos marca el Evento con avisos vigentes con la mayor severidad, en texto', async ({ page }) => {
    await mockApi(page, { events: () => events });
    await page.goto('/eventos');

    const rows = page.getByTestId('event-row');
    await expect(rows).toHaveCount(3);
    await expect(page.getByTestId('event-warning')).toHaveCount(1);
    await expect(rows.nth(1).getByTestId('event-warning')).toHaveText('Aviso de inyección · Alta');
  });

  test('el detalle expandido del Evento lista sus avisos y enlaza a Seguridad', async ({ page }) => {
    await mockApi(page, { events: () => events });
    await page.goto('/eventos');
    await page.getByTestId('event-row').nth(1).getByTestId('event-toggle').click();

    const items = page.getByTestId('event-warning-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('fake-system-tag');
    await expect(items.nth(0)).toContainText('Severidad Alta');
    await expect(items.nth(1)).toContainText('Severidad Media');
    await expect(page.getByTestId('event-detail').getByRole('link', { name: 'Ver en Seguridad' })).toHaveAttribute(
      'href',
      `/seguridad?pestana=avisos&sesion=${SESSION_ID}`,
    );
  });

  test('la categoría Avisos deja solo los Eventos con avisos vigentes y queda en la URL', async ({ page }) => {
    await mockApi(page, { events: () => events });
    await page.goto('/eventos?categoria=warnings');

    await expect(page.getByTestId('event-row')).toHaveCount(1);
    await expect(page.getByTestId('event-count')).toContainText('Eventos: 1 / 3');
    await expect(page.getByTestId('event-warning')).toHaveText('Aviso de inyección · Alta');
  });

  test('la Línea de tiempo del detalle de Sesión marca los Eventos con aviso', async ({ page }) => {
    await mockApi(page, { detail: (id) => detailDto(id), events: () => events });
    await page.goto(`/sesiones/${SESSION_ID}`);

    const panel = page.getByTestId('panel-resumen');
    await expect(panel.getByTestId('event-row')).toHaveCount(3);
    await expect(panel.getByTestId('event-warning')).toHaveCount(1);
  });
});
