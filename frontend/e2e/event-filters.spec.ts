import { expect, test } from '@playwright/test';
import { SESSION_ID, detailDto, eventDto, liveMessage, mockApi, sessionDto } from './fixtures';

// AC-115 (y, por el camino, AC-110, AC-111, AC-112, AC-113, AC-114). Red y WebSocket interceptados (ver CLAUDE.md).

const LUCIA_ID = 'd9e00000-0000-4000-8000-000000000004';
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const sessions = () => ({
  items: [
    sessionDto(SESSION_ID),
    sessionDto(LUCIA_ID, { project: 'lucia', directory: 'C:\\Codev\\lucia' }),
  ],
  facets: { projects: ['demo', 'lucia'], directories: ['C:\\Codev\\demo', 'C:\\Codev\\lucia'] },
});

test.describe('AC-110, AC-111: filtros de la lista de Eventos', () => {
  test('la URL filtra la petición, el desplegable la repite y los Eventos en vivo respetan el filtro', async ({ page }) => {
    const api = await mockApi(page, {
      sessions,
      events: (url) => (url.searchParams.get('project') === 'lucia' ? [eventDto('l1', { project: 'lucia', session_id: LUCIA_ID })] : [eventDto('d1')]),
    });
    await page.goto(`/eventos?proyecto=demo&sesion=${SESSION_ID}&periodo=24h`);

    await expect(page.getByTestId('event-row')).toHaveCount(1);
    const first = api.requests.events.at(-1)!.searchParams;
    expect(first.get('project')).toBe('demo');
    expect(first.get('session_id')).toBe(SESSION_ID);
    const since = Date.parse(first.get('since')!);
    expect(Date.now() - since).toBeGreaterThan(24 * 3_600_000 - 60_000);
    expect(Date.now() - since).toBeLessThan(24 * 3_600_000 + 60_000);
    await expect(page.getByTestId('project-filter').locator('select')).toHaveValue('demo');

    // Un Evento en vivo de otro Proyecto no entra; uno del Proyecto filtrado, sí.
    const socket = await api.socket();
    socket.send(liveMessage(eventDto('x1', { project: 'lucia', session_id: LUCIA_ID })));
    socket.send(liveMessage(eventDto('x2', { event_type: 'prompt.submitted', tool_name: null, payload: { prompt: 'hola en vivo' } })));
    await expect(page.getByTestId('event-row')).toHaveCount(2);
    await expect(page.getByTestId('event-row').first()).toContainText('hola en vivo');
    await expect(page.getByTestId('event-row').filter({ hasText: 'lucia' })).toHaveCount(0);

    // Cambiar de Proyecto actualiza la URL, suelta la Sesión y repite la petición.
    await page.getByTestId('project-filter').locator('select').selectOption('lucia');
    await expect(page).toHaveURL(/\/eventos\?(?!.*sesion)(?=.*proyecto=lucia)(?=.*periodo=24h)/);
    await expect(page.getByTestId('event-row')).toHaveCount(1);
    await expect(page.getByTestId('event-row')).toContainText('lucia');
    const last = api.requests.events.at(-1)!.searchParams;
    expect(last.get('project')).toBe('lucia');
    expect(last.has('session_id')).toBe(false);

    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(page).toHaveURL(/\/eventos$/);
    expect(api.requests.events.at(-1)!.searchParams.has('project')).toBe(false);
  });
});

test.describe('AC-112: board por Directorio', () => {
  test('cada Proyecto muestra un subencabezado por Directorio con la ruta completa en el tooltip', async ({ page }) => {
    await mockApi(page, {
      sessions: () => ({
        items: [
          sessionDto(SESSION_ID),
          sessionDto('a7b20e00-0000-4000-8000-000000000002', { state: 'idle', activity: 'paused', current_tool: null, directory: 'C:\\Codev\\demo\\web' }),
        ],
        facets: { projects: ['demo'], directories: ['C:\\Codev\\demo', 'C:\\Codev\\demo\\web'] },
      }),
    });
    await page.goto('/sesiones');

    const names = page.getByTestId('directory-name');
    await expect(names).toHaveCount(2);
    await expect(names.nth(0)).toHaveText('…/Codev/demo');
    await expect(names.nth(0)).toHaveAttribute('title', 'C:\\Codev\\demo');
    await expect(names.nth(1)).toHaveText('…/demo/web');
    await expect(page.getByTestId('directory-group').nth(1).getByTestId('session-card')).toHaveCount(1);
  });
});

test.describe('AC-113: salida de la herramienta', () => {
  test('un tool.post de Bash muestra la primera línea de su salida y un fallo su error', async ({ page }) => {
    await mockApi(page, {
      sessions,
      events: () => [
        eventDto('ok', {
          event_type: 'tool.post',
          payload: { tool_input: { command: 'npm test' }, tool_response: { stdout: 'Tests 12 passed\nmás líneas', stderr: '' } },
        }),
        eventDto('ko', {
          event_type: 'tool.post',
          payload: { tool_input: { command: 'npm run x' }, error: 'Exit code 1\nmissing script: x' },
        }),
      ],
    });
    await page.goto('/eventos');

    const outputs = page.getByTestId('event-output');
    await expect(outputs).toHaveCount(2);
    await expect(outputs.nth(0)).toContainText('Tests 12 passed');
    await expect(outputs.nth(1)).toContainText('Exit code 1 · missing script: x');
    await expect(page.getByTestId('event-row').first()).toContainText('Bash · npm test');
  });
});

test.describe('AC-114: la espera de un Subagente enlaza a su fila', () => {
  test('el aviso de la cabecera y la tarjeta llevan a la pestaña Subagentes con su fila', async ({ page }) => {
    const waiting = {
      since: minutesAgo(1),
      reason: 'permission',
      tool: 'Bash',
      summary: 'npm run build',
      subagent: { id: 'agent-9a8b7c', type: 'e2e-builder' },
    };
    await mockApi(page, {
      sessions: () => ({
        items: [sessionDto(SESSION_ID, { activity: 'waiting', waiting })],
        facets: { projects: ['demo'], directories: ['C:\\Codev\\demo'] },
      }),
      detail: () => detailDto(SESSION_ID),
    });
    await page.goto('/sesiones');

    const href = `/sesiones/${SESSION_ID}?pestana=subagentes&subagente=agent-9a8b7c`;
    await expect(page.getByTestId('waiting-alert').getByTestId('waiting-subagent-link')).toHaveAttribute('href', href);
    const link = page.getByTestId('session-card').getByTestId('waiting-subagent-link');
    await expect(link).toHaveAttribute('href', href);

    await link.click();
    await expect(page).toHaveURL(new RegExp('pestana=subagentes&subagente=agent-9a8b7c'));
  });
});
