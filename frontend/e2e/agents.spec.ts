import { expect, test } from '@playwright/test';
import { SESSION_ID, detailDto, eventDto, liveMessage, mockApi } from './fixtures';

// AC-47 y AC-48: pantalla Agentes y perfil de cada Tipo de Subagente. Red interceptada (ver CLAUDE.md).

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const summary = (type: string | null, launches: number, overrides: Record<string, unknown> = {}) => ({
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
  tool_errors_per_launch: 0.5,
  blocks_per_launch: 0,
  rated_up: 0,
  rated_down: 0,
  sessions: 1,
  projects: ['demo'],
  last_at: minutesAgo(10),
  ...overrides,
});

const types = {
  items: [summary('Explore', 3), summary('security-gate', 1, { cost_per_launch_usd: 0.2, no_response: 1 })],
  facets: { projects: ['demo'] },
};

const profile = {
  summary: summary('Explore', 3, { background: 1, foreground: 2 }),
  launched_by: [{ launcher: null, launches: 3 }],
  models: [{ model: 'claude-haiku-4-5', launches: 3 }],
  tools: [
    { name: 'Read', calls: 12, errors: 1, blocks: 0 },
    { name: 'mcp__playwright__browser_click', calls: 2, errors: 1, blocks: 0 },
  ],
  skills: [{ skill: 'tdd', invocations: 1 }],
  mcp_servers: [{ server: 'playwright', calls: 2, errors: 1 }],
  test_runs: { total: 1, passed: 1, failed: 0 },
  launches: [
    {
      session_id: SESSION_ID,
      project: 'demo',
      subagent_id: 'agent-9a8b7c',
      tool_use_id: 'toolu_01',
      description: 'Buscar plugins de observabilidad',
      status: 'finished',
      background: true,
      started_at: minutesAgo(60),
      stopped_at: minutesAgo(57),
      duration_ms: 180_000,
      tool_count: 6,
      tool_errors: 1,
      blocks: 0,
      model: 'claude-haiku-4-5',
      tokens: { input: 500, output: 900, cache_read: 0, cache_creation: 0 },
      estimated_cost_usd: 0.01,
      result: 'Hay 3 plugins.',
    },
  ],
};

test.describe('AC-47: pantalla Agentes', () => {
  test('compara los Tipos y pide 7 días por defecto', async ({ page }) => {
    const api = await mockApi(page, { agents: () => types });
    await page.goto('/agentes');

    const rows = page.getByTestId('agent-type');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Explore');
    await expect(rows.first()).toContainText('3 min');

    const days = (Date.now() - Date.parse(api.requests.agents.at(-1)!.searchParams.get('since')!)) / 86_400_000;
    expect(days).toBeCloseTo(7, 2);
  });

  test('reordena al pulsar una cabecera', async ({ page }) => {
    await mockApi(page, { agents: () => types });
    await page.goto('/agentes');
    await page.locator('[data-column="cost"]').click();
    await expect(page.getByTestId('agent-type').first()).toContainText('security-gate');
    await expect(page.locator('th[aria-sort="descending"]')).toContainText('Coste');
  });

  test('AC-59: la columna Bien muestra el % de +1 y ordena por él', async ({ page }) => {
    const rated = {
      items: [summary('Explore', 3, { rated_up: 3, rated_down: 1 }), summary('security-gate', 1), summary('Plan', 2, { rated_up: 0, rated_down: 2 })],
      facets: { projects: ['demo'] },
    };
    await mockApi(page, { agents: () => rated });
    await page.goto('/agentes');

    const cells = page.locator('[data-column-cell="rating"]');
    await expect(cells).toHaveText(['75 %', '0 %', '—']);
    await page.locator('[data-column="rating"]').click();
    await expect(page.locator('th[aria-sort="descending"]')).toContainText('Bien');
    await expect(page.getByTestId('agent-type').first()).toContainText('Explore');
    await expect(page.getByTestId('agent-type').last()).toContainText('security-gate');
  });

  test('AC-59: el perfil dice cuántos Subagentes están bien y mal puntuados', async ({ page }) => {
    await mockApi(page, { agents: () => types, agentProfile: () => ({ ...profile, summary: summary('Explore', 3, { rated_up: 2, rated_down: 1 }) }) });
    await page.goto('/agentes/Explore');
    await expect(page.getByTestId('profile-rating')).toContainText('2 bien · 1 mal');
  });

  test('cada Tipo lleva a su perfil', async ({ page }) => {
    await mockApi(page, { agents: () => types, agentProfile: () => profile });
    await page.goto('/agentes');
    await page.getByRole('link', { name: 'Explore' }).click();
    await expect(page).toHaveURL(/\/agentes\/Explore$/);
    await expect(page.getByRole('heading', { name: 'Explore', level: 2 })).toBeVisible();
  });

  test('se actualiza cuando se lanza un Subagente', async ({ page }) => {
    let current: { items: unknown[]; facets: { projects: string[] } } = { items: [], facets: { projects: [] } };
    const api = await mockApi(page, { agents: () => current });
    await page.goto('/agentes');
    await expect(page.getByTestId('agents-empty')).toBeVisible();

    current = types;
    const socket = await api.socket();
    socket.send(liveMessage(eventDto('live-1', { event_type: 'tool.pre', tool_name: 'Agent' })));
    await expect(page.getByTestId('agent-type')).toHaveCount(2);
  });

  test('se llega desde la barra lateral', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sesiones');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Agentes', exact: true }).click();
    await expect(page).toHaveURL(/\/agentes$/);
    await expect(page.getByRole('heading', { name: 'Agentes', level: 2 })).toBeVisible();
  });
});

test.describe('AC-48: perfil de un Tipo de Subagente', () => {
  test('muestra quién lo lanza, sus fichas, el gráfico, lo que hace y sus Lanzamientos', async ({ page }) => {
    const api = await mockApi(page, { agentProfile: () => profile, detail: (id) => detailDto(id) });
    await page.goto('/agentes/Explore?periodo=24h');

    await expect(page.getByTestId('profile-subtitle')).toContainText('Lanzado por el agente principal (3)');
    await expect(page.getByTestId('profile-kpis')).toContainText('2 / 1');
    await expect(page.locator('app-bars-chart svg')).toBeVisible();
    await expect(page.getByTestId('profile-tools')).toContainText('playwright · browser_click');
    await expect(page.getByTestId('profile-uses')).toContainText('tdd (1)');
    expect(api.requests.agents.at(-1)!.pathname).toBe('/api/v1/agents/Explore');

    const launch = page.getByTestId('agent-launch');
    await expect(launch).toContainText('Terminado');
    await expect(launch).toContainText('Segundo');
    await launch.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/sesiones/${SESSION_ID}\\?pestana=subagentes&subagente=agent-9a8b7c$`));
    await expect(page.getByTestId('subagent-detail')).toBeVisible();
  });

  test('AC-121: las fichas muestran los tokens y las Sesiones del Tipo', async ({ page }) => {
    await mockApi(page, {
      agentProfile: () => ({ ...profile, summary: summary('Explore', 3, { tokens: { input: 12_000, output: 3_000, cache_read: 0, cache_creation: 0 }, sessions: 5 }) }),
    });
    await page.goto('/agentes/Explore');
    await expect(page.getByTestId('profile-tokens')).toContainText('entrada');
    await expect(page.getByTestId('profile-tokens')).toContainText('salida');
    await expect(page.getByTestId('profile-sessions')).toContainText('5');
  });

  test('un Tipo sin Lanzamientos lo dice y ofrece volver', async ({ page }) => {
    await mockApi(page, { agentProfile: () => ({ ...profile, summary: summary('Plan', 0, { last_at: '' }), launches: [] }) });
    await page.goto('/agentes/Plan');
    await expect(page.getByTestId('profile-empty')).toContainText('Ningún Lanzamiento de Plan en este periodo');
  });

  test('el Tipo de un Subagente de /subagentes enlaza a su perfil', async ({ page }) => {
    const item = {
      session_id: SESSION_ID,
      project: 'demo',
      directory: 'C:/Codev/demo',
      subagent_id: 'a1',
      tool_use_id: 't1',
      agent_type: 'Explore',
      description: 'Buscar',
      internal: false,
      status: 'no_response',
      started_at: minutesAgo(60),
      stopped_at: null,
      duration_ms: 60_000,
      tool_count: 1,
      model: null,
      tokens: null,
      estimated_cost_usd: null,
    };
    await mockApi(page, { subagents: () => ({ items: [item], facets: { projects: ['demo'], types: ['Explore'] } }), agentProfile: () => profile });
    await page.goto('/subagentes');
    await expect(page.getByTestId('subagent-item')).toContainText('Sin respuesta');
    await page.getByTestId('subagent-item').getByRole('link', { name: 'Explore' }).click();
    await expect(page).toHaveURL(/\/agentes\/Explore$/);
  });
});
