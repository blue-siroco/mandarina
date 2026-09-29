import { expect, test, type Page } from '@playwright/test';
import { sessionDto } from './fixtures';

// AC-13. Red interceptada: ni backend real ni Prism (ver CLAUDE.md).

const DAY_MS = 24 * 60 * 60 * 1000;

const metrics = (overrides: Record<string, unknown> = {}) => ({
  since: '2026-09-24T22:00:00.000Z',
  generated_at: '2026-09-25T10:00:00.000Z',
  sessions: { total: 6, working: 2, paused: 1, orphaned: 1, closed: 2 },
  subagents_running: 3,
  activity: { events: 420, tool_calls: 150, prompts: 12, blocks: 2 },
  tokens: { input: 1200, output: 45000, cache_read: 4700000, cache_creation: 240000 },
  estimated_cost_usd: 3.4212,
  unpriced_models: [],
  by_model: [
    {
      model: 'claude-opus-5-5',
      tokens: { input: 1200, output: 45000, cache_read: 4700000, cache_creation: 240000 },
      estimated_cost_usd: 3.4212,
    },
  ],
  transcripts: { read: 6, unavailable: 0 },
  ...overrides,
});

/** Abre la app sirviendo `responses` en orden; el último se repite. */
async function openWith(page: Page, responses: Array<{ status: number; body: unknown }>): Promise<string[]> {
  const sinceParams: string[] = [];
  await page.route('**/api/v1/metrics?*', (route) => {
    sinceParams.push(new URL(route.request().url()).searchParams.get('since') ?? '');
    const { status, body } = responses.length > 1 ? responses.shift()! : responses[0]!;
    return route.fulfill({ status, json: body });
  });
  await page.route('**/api/v1/events?*', (route) => route.fulfill({ json: { items: [] } }));
  await page.route(/\/api\/v1\/sessions(\?|$)/, (route) =>
    route.fulfill({ json: { items: [sessionDto('s-1')], facets: { projects: ['demo'], directories: [] } } }),
  );
  await page.routeWebSocket(/\/ws$/, () => undefined);
  await page.goto('/');
  return sinceParams;
}

test('muestra las fichas de uso del periodo en el board, encima de las Sesiones', async ({ page }) => {
  const since = await openWith(page, [{ status: 200, body: metrics() }]);
  const card = (kpi: string) => page.locator(`[data-kpi="${kpi}"]`);

  await expect(page.getByTestId('usage-card')).toHaveCount(7);
  await expect(card('working')).toContainText('2');
  await expect(card('working')).toContainText('3 Subagentes en marcha');
  await expect(card('paused')).toContainText('1 Huérfana');
  await expect(card('cost')).toContainText('~3,42');
  await expect(card('tools')).toContainText('12 prompts · 2 Bloqueos');

  // Por defecto el board muestra las últimas 24 h, y las fichas también.
  await expect(page.locator('#usage-title')).toHaveText('Últimas 24 h');
  const ageMs = Date.now() - Date.parse(since[0]!);
  expect(ageMs).toBeGreaterThanOrEqual(DAY_MS);
  expect(ageMs).toBeLessThan(DAY_MS + 60_000);

  const usageBox = await page.locator('app-usage-summary').boundingBox();
  const sessionsBox = await page.getByTestId('project-group').first().boundingBox();
  expect(usageBox!.y).toBeLessThan(sessionsBox!.y);
});

test('al cambiar el periodo del board las fichas piden y rotulan esa ventana', async ({ page }) => {
  const since = await openWith(page, [{ status: 200, body: metrics() }]);
  const range = page.getByTestId('range-filter');
  await expect(page.getByTestId('usage-card')).toHaveCount(7);

  await range.getByText('7 d', { exact: true }).click();
  await expect(page.locator('#usage-title')).toHaveText('Últimos 7 días');
  await expect.poll(() => Date.now() - Date.parse(since.at(-1)!)).toBeGreaterThanOrEqual(7 * DAY_MS);

  await range.getByText('Todo', { exact: true }).click();
  await expect(page.locator('#usage-title')).toHaveText('Todo el histórico');
  await expect.poll(() => since.at(-1)).toBe(new Date(0).toISOString());
});

test('se refresca sola y, si falla, conserva las últimas cifras', async ({ page }) => {
  await openWith(page, [
    { status: 200, body: metrics() },
    { status: 200, body: metrics({ sessions: { total: 9, working: 7, paused: 0, orphaned: 0, closed: 2 } }) },
    { status: 500, body: { message: 'caído' } },
  ]);
  const working = page.locator('[data-kpi="working"] .kpi__value');

  await expect(working).toHaveText('2');
  await expect(working).toHaveText('7', { timeout: 8000 });
  await expect(page.getByTestId('usage-error')).toContainText('últimas conocidas', { timeout: 8000 });
  await expect(working).toHaveText('7');
});

test('en pantalla estrecha las fichas no desbordan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWith(page, [{ status: 200, body: metrics() }]);
  await expect(page.getByTestId('usage-card')).toHaveCount(7);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
