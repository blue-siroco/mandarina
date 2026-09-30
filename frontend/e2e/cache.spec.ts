import { expect, test } from '@playwright/test';
import { EMPTY_METRICS, SESSION_ID, cacheDto, detailDto, mockApi, sessionDto } from './fixtures';

// AC-74 y AC-75: eficiencia de la caché de prompts. Red interceptada (ver CLAUDE.md).

const DEMO = 'C:\\Codev\\demo';
const LUCIA = 'C:\\Codev\\lucia';

const slice = (cache: Record<string, unknown>) => ({
  sessions: { working: 1, paused: 0, orphaned: 0 },
  subagents_running: 0,
  activity: { tool_calls: 10, prompts: 1, blocks: 0 },
  tokens: { input: 100, output: 1000, cache_read: 1000, cache_creation: 50 },
  estimated_cost_usd: 1,
  unpriced_models: [],
  cache,
});

const breakdown = {
  by_directory: [
    { ...slice(cacheDto({ savings_net_usd: 0.4, hit_rate: 0.8, rewrites: 1 })), directory: DEMO, project: 'demo', main_model: 'claude-opus-5-5', transcripts_unavailable: 0 },
    { ...slice(cacheDto({ savings_net_usd: 0.8, hit_rate: 0.95, rewrites: 1 })), directory: LUCIA, project: 'lucia', main_model: 'claude-sonnet-5', transcripts_unavailable: 0 },
  ],
  by_model: [
    {
      ...slice(cacheDto({ savings_net_usd: 1.2, rewrites: 2 })),
      model: 'claude-opus-5-5',
      rate: { input: 4, output: 20, cache_read: 0.2, cache_write_5m: 5, cache_write_1h: 8 },
      cost_breakdown: { input: 0.5, output: 2, cache_read: 0.3, cache_creation: 0.2 },
    },
  ],
};

const metrics = (cache: Record<string, unknown>) => (url: URL) => ({
  ...EMPTY_METRICS,
  sessions: { total: 2, working: 2, paused: 0, orphaned: 0, closed: 0 },
  tokens: { input: 200, output: 2000, cache_read: 2000, cache_creation: 100 },
  cache,
  breakdown: url.searchParams.get('breakdown') === 'true' ? breakdown : null,
});

const card = (page: import('@playwright/test').Page) => page.locator('[data-kpi="cache"]');

test.describe('AC-74: ficha Caché del board', () => {
  test('da la tasa de acierto, el ahorro neto y las Reescrituras', async ({ page }) => {
    await mockApi(page, { metrics: metrics(cacheDto()) });
    await page.goto('/sesiones');

    await expect(card(page).locator('h3')).toHaveText('Caché');
    await expect(card(page).locator('.kpi__value')).toContainText('90');
    await expect(card(page).locator('.kpi__detail')).toContainText('Ahorro');
    await expect(card(page).locator('.kpi__detail')).toContainText('2 Reescrituras');
  });

  test('un ahorro neto negativo se llama Sobrecoste', async ({ page }) => {
    await mockApi(page, { metrics: metrics(cacheDto({ savings_net_usd: -0.3, rewrites: 0 })) });
    await page.goto('/sesiones');

    await expect(card(page).locator('.kpi__detail')).toContainText('Sobrecoste');
    await expect(card(page).locator('.kpi__detail')).not.toContainText('Reescrituras');
    await expect(card(page).locator('.kpi__detail')).toHaveAttribute('data-tone', 'danger');
  });

  test('sin datos muestra un guion', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sesiones');
    await expect(card(page).locator('.kpi__value')).toHaveText('—');
  });

  test('abre el desglose por Directorio y por modelo, ordenado por ahorro neto', async ({ page }) => {
    const api = await mockApi(page, { metrics: metrics(cacheDto()) });
    await page.goto('/sesiones');
    await card(page).click();

    const modal = page.getByTestId('breakdown-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h2')).toContainText('Caché');
    await expect.poll(() => api.requests.metrics.some((u) => u.searchParams.get('breakdown') === 'true')).toBe(true);
    await expect(page.locator('th[aria-sort="descending"]')).toContainText('Ahorro neto');
    await expect(page.getByTestId('breakdown-row').first()).toContainText('…/Codev/lucia');
    await expect(page.getByTestId('breakdown-total')).toContainText('Total');

    await page.getByTestId('breakdown-views').getByText('Por modelo').click();
    await expect(page.getByTestId('breakdown-row').first()).toContainText('opus-5.5');
    await expect(modal.locator('[data-column="rewrites"]')).toBeVisible();
  });

  test('AC-123: un ahorro neto negativo en el desglose va en rojo y con signo', async ({ page }) => {
    await mockApi(page, { metrics: metrics(cacheDto({ savings_net_usd: -0.3 })) });
    await page.goto('/sesiones');
    await card(page).click();

    const total = page.getByTestId('breakdown-total').locator('td').first();
    await expect(total).toHaveAttribute('data-tone', 'danger');
    await expect(total).toContainText('-0,30');
    await expect(total).toHaveAttribute('title', /Sobrecoste/);
    // Las filas positivas no se marcan.
    await expect(page.getByTestId('breakdown-row').first().locator('td[data-tone="danger"]')).toHaveCount(0);
  });

  test('se activa con el teclado', async ({ page }) => {
    await mockApi(page, { metrics: metrics(cacheDto()) });
    await page.goto('/sesiones');
    await card(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('breakdown-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('breakdown-modal')).toHaveCount(0);
    await expect(card(page)).toBeFocused();
  });
});

test.describe('AC-75: caché en el detalle de Sesión', () => {
  const rewrites = [
    { message_id: 'm3', subagent_id: null, occurred_at: new Date().toISOString(), model: 'claude-sonnet-5', cause: 'expired', written_tokens: 1_500_000, cost_usd: 0.0025, gap_ms: 540_000 },
    { message_id: 'h2', subagent_id: 'agent-9a8b7c', occurred_at: new Date().toISOString(), model: 'claude-haiku-4-5', cause: 'model_change', written_tokens: 900, cost_usd: null, gap_ms: 60_000 },
  ];

  test('la ficha Caché da la tasa y el ahorro neto', async ({ page }) => {
    await mockApi(page, { detail: (id) => detailDto(id, { cache: cacheDto({ savings_net_usd: -0.3 }) }) });
    await page.goto(`/sesiones/${SESSION_ID}`);
    const cache = page.locator('[data-testid="token-cards"] [data-kpi="cache"]');
    await expect(cache.locator('.kpi__value')).toContainText('90');
    await expect(cache.locator('.kpi__detail')).toContainText('Sobrecoste');
  });

  test('las Reescrituras salen en la Línea de tiempo con su causa en texto', async ({ page }) => {
    await mockApi(page, { detail: (id) => detailDto(id, { cache: cacheDto(), cache_rewrites: rewrites }) });
    await page.goto(`/sesiones/${SESSION_ID}?pestana=linea`);

    const items = page.getByTestId('cache-rewrite');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('Caducada');
    await expect(items.first()).toContainText('tokens escritos');
    await expect(items.last()).toContainText('Cambio de modelo');
    await expect(items.last()).toContainText('Sin Tarifa');
    await expect(items.last()).toContainText('Subagente');
  });

  test('sin Reescrituras no hay sección', async ({ page }) => {
    await mockApi(page, { detail: (id) => detailDto(id, { cache: cacheDto({ rewrites: 0 }) }) });
    await page.goto(`/sesiones/${SESSION_ID}?pestana=linea`);
    await expect(page.getByTestId('panel-linea')).toBeVisible();
    await expect(page.getByTestId('cache-rewrites')).toHaveCount(0);
  });
});

test.describe('AC-75: caché en los agentes', () => {
  const summary = (type: string, launches: number, overrides: Record<string, unknown> = {}) => ({
    type,
    launches,
    running: 0,
    no_response: 0,
    foreground: launches,
    background: 0,
    duration_p50_ms: 180_000,
    duration_p95_ms: 300_000,
    tokens: { input: 500, output: 900, cache_read: 0, cache_creation: 0 },
    estimated_cost_usd: 0.01 * launches,
    cost_per_launch_usd: 0.01,
    tool_errors_per_launch: 0,
    blocks_per_launch: 0,
    cache_hit_rate: 0.5,
    cache_savings_net_usd: 0.25,
    rated_up: 0,
    rated_down: 0,
    sessions: 1,
    projects: ['demo'],
    last_at: new Date().toISOString(),
    ...overrides,
  });

  test('la columna Caché da la tasa y ordena con lo desconocido como el menor', async ({ page }) => {
    const items = [summary('Explore', 3, { cache_hit_rate: 0.42 }), summary('Plan', 2, { cache_hit_rate: null, cache_savings_net_usd: 0 }), summary('security-gate', 1, { cache_hit_rate: 0.9 })];
    await mockApi(page, { agents: () => ({ items, facets: { projects: ['demo'] } }) });
    await page.goto('/agentes');

    await expect(page.locator('[data-column-cell="cache"]')).toHaveText(['42 %', '—', '90 %']);
    await page.locator('[data-column="cache"]').click();
    await expect(page.locator('th[aria-sort="descending"]')).toContainText('Caché');
    await expect(page.getByTestId('agent-type').first()).toContainText('security-gate');
    await expect(page.getByTestId('agent-type').last()).toContainText('Plan');
  });

  test('el perfil da la tasa y el ahorro del Tipo y de cada Lanzamiento, y explica por qué es baja', async ({ page }) => {
    const launch = {
      session_id: SESSION_ID,
      project: 'demo',
      subagent_id: 'agent-9a8b7c',
      tool_use_id: 'toolu_01',
      description: 'Buscar plugins',
      status: 'finished',
      background: false,
      started_at: new Date().toISOString(),
      stopped_at: new Date().toISOString(),
      duration_ms: 180_000,
      tool_count: 6,
      tool_errors: 0,
      blocks: 0,
      model: 'claude-haiku-4-5',
      tokens: { input: 500, output: 900, cache_read: 0, cache_creation: 0 },
      estimated_cost_usd: 0.01,
      cache_hit_rate: 0.5,
      cache_savings_net_usd: -0.1,
      result: 'Hecho.',
    };
    const profile = {
      summary: summary('Explore', 1),
      launched_by: [{ launcher: null, launches: 1 }],
      models: [],
      tools: [],
      skills: [],
      mcp_servers: [],
      test_runs: { total: 0, passed: 0, failed: 0 },
      launches: [launch],
    };
    await mockApi(page, { agentProfile: () => profile });
    await page.goto('/agentes/Explore');

    await expect(page.getByTestId('profile-cache')).toContainText('50');
    await expect(page.getByTestId('profile-cache')).toContainText('Ahorro');
    await expect(page.getByTestId('launch-cache')).toContainText('Sobrecoste');
    await expect(page.getByTestId('cache-note')).toContainText('arranca con el contexto vacío');
  });
});

test('la ficha Caché no rompe el board en pantalla estrecha', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { metrics: metrics(cacheDto()), sessions: () => ({ items: [sessionDto('s1')], facets: { projects: ['demo'], directories: [DEMO] } }) });
  await page.goto('/sesiones');
  await expect(card(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
