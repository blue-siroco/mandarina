import { expect, test } from '@playwright/test';
import { EMPTY_METRICS, mockApi, sessionDto } from './fixtures';

// AC-39 y AC-40: desglose de las fichas del board. Red interceptada (ver CLAUDE.md).

const DEMO = 'C:\\Codev\\demo';
const LUCIA = 'C:\\Codev\\lucia';

const slice = (working: number, paused: number, output: number, cost: number) => ({
  sessions: { working, paused, orphaned: 0 },
  subagents_running: 0,
  tokens: { input: 100, output, cache_read: 1000, cache_creation: 50 },
  estimated_cost_usd: cost,
  unpriced_models: [],
});

const breakdown = {
  by_directory: [
    { ...slice(1, 0, 4000, 1.2), directory: DEMO, project: 'demo', main_model: 'claude-opus-5-5', transcripts_unavailable: 0 },
    { ...slice(1, 1, 1000, 2.8), directory: LUCIA, project: 'lucia', main_model: 'claude-sonnet-5', transcripts_unavailable: 0 },
  ],
  by_model: [
    {
      ...slice(1, 0, 3000, 3),
      model: 'claude-opus-5-5',
      rate: { input: 4, output: 20, cache_read: 0.2, cache_write_5m: 5, cache_write_1h: 8 },
      cost_breakdown: { input: 0.5, output: 2, cache_read: 0.3, cache_creation: 0.2 },
    },
    { ...slice(1, 1, 2000, 1), model: null, rate: null, cost_breakdown: null },
  ],
};

const totals = (directory: string | null) => ({
  ...EMPTY_METRICS,
  sessions: directory ? { total: 1, working: 1, paused: 0, orphaned: 0, closed: 0 } : { total: 3, working: 2, paused: 1, orphaned: 0, closed: 0 },
  tokens: { input: 200, output: 5000, cache_read: 2000, cache_creation: 100 },
  estimated_cost_usd: directory ? 1.2 : 4,
  by_model: [{ model: 'claude-opus-5-5', tokens: { input: 200, output: 5000, cache_read: 2000, cache_creation: 100 }, estimated_cost_usd: 4 }],
});

/** Responde como el backend: filtra por Directorio y desglosa solo si se pide. */
const metrics = (url: URL) => {
  const directory = url.searchParams.get('directory');
  const wanted = url.searchParams.get('breakdown') === 'true';
  const rows = directory ? { ...breakdown, by_directory: breakdown.by_directory.filter((d) => d.directory === directory) } : breakdown;
  return { ...totals(directory), breakdown: wanted ? rows : null };
};

const board = { items: [sessionDto('s1'), sessionDto('s2', { directory: LUCIA, project: 'lucia' })], facets: { projects: ['demo', 'lucia'], directories: [DEMO, LUCIA] } };

test.describe('AC-39: fichas que abren su desglose', () => {
  test('una ficha abre el modal con el desglose pedido solo al abrirlo', async ({ page }) => {
    const api = await mockApi(page, { metrics, sessions: () => board });
    await page.goto('/sesiones?rango=7d');

    const paused = page.locator('[data-testid="usage-card"][data-kpi="paused"]');
    await expect(paused).toContainText('1');
    expect(api.requests.metrics.every((u) => !u.searchParams.has('breakdown'))).toBe(true);

    await paused.click();
    const modal = page.getByTestId('breakdown-modal');
    await expect(modal.getByRole('heading')).toHaveText('En pausa · Últimos 7 días');
    await expect.poll(() => api.requests.metrics.some((u) => u.searchParams.get('breakdown') === 'true')).toBe(true);

    await expect(page.getByTestId('breakdown-total')).toContainText('1');
    await expect(page.getByTestId('breakdown-row').first()).toContainText('…/Codev/lucia');
  });

  test('se abre con el teclado, se cierra con Esc y el foco vuelve a la ficha', async ({ page }) => {
    await mockApi(page, { metrics });
    await page.goto('/sesiones');

    const cost = page.locator('[data-testid="usage-card"][data-kpi="cost"]');
    await cost.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('breakdown-modal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('breakdown-modal')).toHaveCount(0);
    await expect(cost).toBeFocused();
  });

  test('se cierra pulsando fuera y con el botón de cerrar', async ({ page }) => {
    await mockApi(page, { metrics });
    await page.goto('/sesiones');
    const card = page.locator('[data-testid="usage-card"][data-kpi="working"]');

    await card.click();
    await page.getByTestId('breakdown-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('breakdown-modal')).toHaveCount(0);

    await card.click();
    await page.getByTestId('breakdown-close').locator('lucia--button').click();
    await expect(page.getByTestId('breakdown-modal')).toHaveCount(0);
  });

  test('recuerda la última vista al volver a abrir', async ({ page }) => {
    await mockApi(page, { metrics });
    await page.goto('/sesiones');
    await page.locator('[data-testid="usage-card"][data-kpi="output"]').click();
    await page.getByTestId('breakdown-views').getByText('Por modelo').click();
    await expect(page.getByTestId('breakdown-table')).toHaveAttribute('data-view', 'model');
    await page.keyboard.press('Escape');

    await page.reload();
    await page.locator('[data-testid="usage-card"][data-kpi="working"]').click();
    await expect(page.getByTestId('breakdown-table')).toHaveAttribute('data-view', 'model');
    await expect(page.getByTestId('breakdown-row').last()).toContainText('Modelo desconocido');
  });
});

test.describe('AC-40: del desglose al filtro', () => {
  test('pulsar un Directorio cierra el modal y filtra el board y sus fichas', async ({ page }) => {
    const api = await mockApi(page, { metrics, sessions: () => board });
    await page.goto('/sesiones');
    await page.locator('[data-testid="usage-card"][data-kpi="cost"]').click();
    await page.getByTestId('breakdown-row').filter({ hasText: 'demo' }).getByRole('button').click();

    await expect(page.getByTestId('breakdown-modal')).toHaveCount(0);
    await expect(page).toHaveURL(/directorio=C/);
    await expect.poll(() => api.requests.metrics.at(-1)?.searchParams.get('directory')).toBe(DEMO);
    await expect(page.locator('[data-testid="usage-card"][data-kpi="cost"]')).toContainText('1,20');

    await page.locator('[data-testid="usage-card"][data-kpi="cost"]').click();
    await expect(page.getByTestId('breakdown-filter')).toHaveText('Solo …/Codev/demo');
    await expect(page.getByTestId('breakdown-row')).toHaveCount(1);
  });
});
