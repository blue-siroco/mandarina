import { expect, test } from '@playwright/test';
import { SESSION_ID, detailDto, eventDto, liveMessage, mockApi, subagentItemDto } from './fixtures';

// AC-36 y AC-37: Subagentes legibles, sin ruido, y su pantalla. Red interceptada (ver CLAUDE.md).

const finished = subagentItemDto('agent-9a8b7c');
const pending = subagentItemDto('p1', {
  subagent_id: null,
  tool_use_id: 'toolu_p1',
  agent_type: 'e2e-builder',
  description: 'generar tests del AC-28',
  status: 'running',
  stopped_at: null,
  duration_ms: 120_000,
  tokens: null,
  estimated_cost_usd: null,
});
const list = (items: unknown[]) => ({ items, facets: { projects: ['demo'], types: ['Explore', 'e2e-builder'] } });

test.describe('AC-36: Eventos de Subagente legibles y sin internos', () => {
  const internal = { type: null, description: null, duration_ms: null, internal: true };
  const events = [
    eventDto('x1', { event_type: 'subagent.stopped', native_event_type: 'SubagentStop', tool_name: null, subagent_id: 'x1', subagent: internal }),
    eventDto('s2', {
      event_type: 'subagent.stopped',
      native_event_type: 'SubagentStop',
      tool_name: null,
      subagent_id: 'a1',
      subagent: { type: 'e2e-builder', description: 'generar tests del AC-28', duration_ms: 180_000, internal: false },
    }),
  ];

  test('resume el Subagente con su Tipo, su tarea y su duración, y oculta los internos salvo que se pidan', async ({ page }) => {
    await mockApi(page, { events: () => events });
    await page.goto('/eventos');

    const rows = page.getByTestId('event-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('e2e-builder · generar tests del AC-28 · 3 min');

    await page.getByTestId('internal-filter').getByRole('checkbox').check();
    await expect(page).toHaveURL(/internos=1/);
    await expect(rows).toHaveCount(2);
  });

  test('?subagente= abre el Subagente desplegado en el detalle de su Sesión', async ({ page }) => {
    await mockApi(page, { detail: (id) => detailDto(id) });
    await page.goto(`/sesiones/${SESSION_ID}?pestana=subagentes&subagente=agent-9a8b7c`);
    await expect(page.getByTestId('subagent-detail')).toBeVisible();
    await expect(page.getByTestId('subagent-result')).toContainText('Hay 3 plugins');
  });
});

test.describe('AC-37: pantalla de Subagentes', () => {
  test('muestra la lista sin la tabla por Tipo, y pide 24 h sin internos por defecto', async ({ page }) => {
    const api = await mockApi(page, { subagents: () => list([pending, finished]) });
    await page.goto('/subagentes');

    await expect(page.getByTestId('subagent-type')).toHaveCount(0);

    const items = page.getByTestId('subagent-item');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('En marcha');
    await expect(items.first()).toContainText('generar tests del AC-28');
    await expect(items.last()).toContainText('Terminado');

    const request = api.requests.subagents.at(-1)!;
    expect(request.searchParams.has('include_internal')).toBe(false);
    const hours = (Date.now() - Date.parse(request.searchParams.get('since')!)) / 3_600_000;
    expect(hours).toBeCloseTo(24, 1);
  });

  test('los filtros se reflejan en la URL y en la petición', async ({ page }) => {
    const api = await mockApi(page, { subagents: () => list([finished]) });
    await page.goto('/subagentes');
    await page.getByTestId('type-filter').locator('select').selectOption('Explore');
    await page.getByTestId('internal-filter').getByRole('checkbox').check();

    await expect(page).toHaveURL(/tipo=Explore/);
    await expect(page).toHaveURL(/internos=1/);
    await expect.poll(() => api.requests.subagents.at(-1)?.searchParams.get('include_internal')).toBe('true');
    expect(api.requests.subagents.at(-1)!.searchParams.get('type')).toBe('Explore');
  });

  test('cada fila lleva al Subagente desplegado en su Sesión', async ({ page }) => {
    await mockApi(page, { subagents: () => list([finished]), detail: (id) => detailDto(id) });
    await page.goto('/subagentes');
    await page.getByTestId('subagent-item').getByRole('link', { name: '7f3c2a10' }).click();

    await expect(page).toHaveURL(new RegExp(`/sesiones/${SESSION_ID}\\?pestana=subagentes&subagente=agent-9a8b7c$`));
    await expect(page.getByTestId('subagent-detail')).toBeVisible();
  });

  test('se actualiza cuando llega un Evento de Subagente', async ({ page }) => {
    let items: unknown[] = [];
    const api = await mockApi(page, { subagents: () => (items.length ? list(items) : { items: [], facets: { projects: [], types: [] } }) });
    await page.goto('/subagentes');
    await expect(page.getByTestId('subagents-empty')).toBeVisible();

    items = [pending];
    const socket = await api.socket();
    socket.send(liveMessage(eventDto('live-1', { event_type: 'tool.pre', tool_name: 'Agent' })));

    await expect(page.getByTestId('subagent-item')).toHaveCount(1);
  });

  test('se llega desde la barra lateral', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sesiones');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Subagentes' }).click();
    await expect(page).toHaveURL(/\/subagentes$/);
    await expect(page.getByRole('heading', { name: 'Subagentes', level: 2 })).toBeVisible();
  });
});
