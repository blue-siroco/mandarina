import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';

// AC-09, AC-17. Red interceptada: ni backend real ni Prism (ver CLAUDE.md).

const event = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  schema_version: 1,
  harness: 'claude-code',
  project: 'demo',
  directory: 'C:\\Codev\\demo',
  session_id: '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33',
  subagent_id: null,
  event_type: 'tool.pre',
  native_event_type: 'PreToolUse',
  tool_name: 'Bash',
  occurred_at: '2026-09-25T10:00:00.000Z',
  received_at: '2026-09-25T10:00:00.100Z',
  transcript_path: null,
  payload: {},
  ...overrides,
});

/** Abre la app con la red simulada; devuelve un getter del WebSocket simulado. */
async function openWith(page: Page, history: unknown[]): Promise<{ socket: () => Promise<WebSocketRoute> }> {
  let resolveSocket: (ws: WebSocketRoute) => void = () => undefined;
  const socket = new Promise<WebSocketRoute>((resolve) => (resolveSocket = resolve));
  // Las rutas deben estar registradas antes del `goto`, o la app llega al backend real.
  await page.route('**/api/v1/events?*', (route) => route.fulfill({ json: { items: history } }));
  // Las fichas de uso (AC-13) tienen su propio spec; aquí solo se aíslan.
  await page.route('**/api/v1/metrics?*', (route) => route.fulfill({ status: 503, json: { message: 'fuera de alcance' } }));
  await page.routeWebSocket(/\/ws$/, (ws) => resolveSocket(ws));
  await page.goto('/eventos');
  return { socket: () => socket };
}

test('muestra el historial y añade arriba los Eventos que llegan en vivo', async ({ page }) => {
  const { socket } = await openWith(page, [event('a', { tool_name: 'Read' })]);
  const rows = page.getByTestId('event-row');

  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Read');
  await expect(page.getByRole('status')).toHaveText('En vivo');

  const live = event('b', { event_type: 'prompt.submitted', tool_name: null, received_at: '2026-09-25T10:00:05.000Z' });
  (await socket()).send(JSON.stringify({ type: 'event.ingested', event: live }));

  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Prompt');
});

test('no duplica un Evento que llega a la vez por el historial y en vivo', async ({ page }) => {
  const { socket } = await openWith(page, [event('a')]);
  await expect(page.getByTestId('event-row')).toHaveCount(1);

  (await socket()).send(JSON.stringify({ type: 'event.ingested', event: event('a') }));

  await expect(page.getByTestId('event-row')).toHaveCount(1);
});

test('sin Eventos explica cómo instalar el hook', async ({ page }) => {
  await openWith(page, []);
  await expect(page.getByTestId('empty-state')).toContainText('send_event.mjs');
});

test('en pantalla estrecha sigue mostrando los datos de cada Evento', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWith(page, [event('a')]);
  const row = page.getByTestId('event-row').first();

  await expect(row).toContainText('demo');
  await expect(row).toContainText('Bash');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
