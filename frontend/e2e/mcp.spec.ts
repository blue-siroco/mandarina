import { expect, test } from '@playwright/test';
import { SESSION_ID, detailDto, eventDto, liveMessage, mcpInvocationDto, mcpServerDto, mockApi } from './fixtures';

// AC-43 y AC-44: observador de Servidores MCP. Red interceptada (ver CLAUDE.md).

const invocations = [
  mcpInvocationDto('m3', { tool: 'browser_take_screenshot', tool_name: 'mcp__playwright__browser_take_screenshot', status: 'no_response', duration_ms: null, response_bytes: null }),
  mcpInvocationDto('m2', { status: 'error', error: 'net::ERR_CONNECTION_REFUSED' }),
  mcpInvocationDto('m1', { tool: 'browser_take_screenshot', tool_name: 'mcp__playwright__browser_take_screenshot', has_image: true, response_bytes: 120_000 }),
];
const list = {
  items: invocations,
  servers: [mcpServerDto('playwright')],
  unused_deferred: [{ session_id: SESSION_ID, tool_name: 'mcp__playwright__browser_resize', server: 'playwright', tool: 'browser_resize', loaded_at: new Date().toISOString() }],
  facets: { projects: ['demo'], servers: ['playwright'] },
};

test.describe('AC-44: pantalla MCP', () => {
  test('muestra cada servidor con fallos, latencia y tamaño, y pide 7 días', async ({ page }) => {
    const api = await mockApi(page, { mcpInvocations: () => list });
    await page.goto('/mcp');

    const server = page.getByTestId('mcp-server');
    await expect(server).toHaveCount(1);
    await expect(server).toContainText('playwright');
    await expect(server).toContainText('project');
    await expect(server).toContainText('850 ms / 2,5 s');
    await expect(server).toContainText('imagen');

    const days = (Date.now() - Date.parse(api.requests.mcpInvocations.at(-1)!.searchParams.get('since')!)) / 86_400_000;
    expect(days).toBeCloseTo(7, 2);
  });

  test('despliega las herramientas, que llevan a sus Eventos', async ({ page }) => {
    await mockApi(page, { mcpInvocations: () => list });
    await page.goto('/mcp');
    await page.getByRole('button', { name: 'Desplegar playwright' }).click();

    const tools = page.getByTestId('mcp-tool');
    await expect(tools).toHaveCount(2);
    await tools.first().getByRole('link').click();
    await expect(page).toHaveURL(/\/eventos\?herramienta=mcp__playwright__browser_navigate$/);
  });

  test('el filtro de servidor se refleja en la URL y en la petición', async ({ page }) => {
    const api = await mockApi(page, { mcpInvocations: () => list });
    await page.goto('/mcp');
    await page.getByTestId('server-filter').locator('select').selectOption('playwright');

    await expect(page).toHaveURL(/servidor=playwright/);
    await expect.poll(() => api.requests.mcpInvocations.at(-1)?.searchParams.get('server')).toBe('playwright');
  });

  test('se actualiza cuando un agente usa una Herramienta MCP', async ({ page }) => {
    let current = { items: [] as unknown[], servers: [] as unknown[], unused_deferred: [] as unknown[], facets: { projects: [] as string[], servers: [] as string[] } };
    const api = await mockApi(page, { mcpInvocations: () => current });
    await page.goto('/mcp');
    await expect(page.getByTestId('mcp-empty')).toBeVisible();

    current = list;
    const socket = await api.socket();
    socket.send(liveMessage(eventDto('live-1', { event_type: 'tool.post', tool_name: 'mcp__playwright__browser_navigate' })));

    await expect(page.getByTestId('mcp-server')).toHaveCount(1);
  });

  test('se llega desde la barra lateral', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sesiones');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'MCP' }).click();
    await expect(page).toHaveURL(/\/mcp$/);
    await expect(page.getByRole('heading', { name: 'MCP', level: 2 })).toBeVisible();
  });
});

test.describe('AC-43: Herramientas MCP en Eventos y en el detalle', () => {
  test('la lista de Eventos nombra servidor · herramienta y tiene la categoría MCP', async ({ page }) => {
    const events = [
      eventDto('e2', { tool_name: 'mcp__playwright__browser_navigate', payload: { tool_input: { url: 'http://localhost:4200' } } }),
      eventDto('e1'),
    ];
    await mockApi(page, { events: () => events });
    await page.goto('/eventos?categoria=mcp');

    const rows = page.getByTestId('event-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('playwright · browser_navigate · http://localhost:4200');
  });

  test('la pestaña MCP del detalle lista las invocaciones y las cargadas sin usar', async ({ page }) => {
    const api = await mockApi(page, { detail: (id) => detailDto(id), mcpInvocations: () => list });
    await page.goto(`/sesiones/${SESSION_ID}?pestana=mcp`);

    const rows = page.getByTestId('mcp-invocation');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('Sin respuesta');
    await expect(rows.nth(1)).toContainText('net::ERR_CONNECTION_REFUSED');
    await expect(rows.last()).toContainText('117,2 KB');
    await expect(page.getByTestId('mcp-unused')).toContainText('playwright · browser_resize');
    expect(api.requests.mcpInvocations.at(-1)!.searchParams.get('session_id')).toBe(SESSION_ID);
  });
});
