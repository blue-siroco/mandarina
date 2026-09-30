import { expect, test } from '@playwright/test';
import { SESSION_ID, detailDto, eventDto, liveMessage, mockApi, sessionDto } from './fixtures';

// AC-16 (board) y AC-19 (detalle). Red interceptada (ver CLAUDE.md).

const board = (items: unknown[]) => () => ({
  items,
  facets: { projects: ['demo', 'lucia'], directories: ['C:\\Codev\\demo', 'C:\\Codev\\lucia'] },
});

const sessions = [
  sessionDto(SESSION_ID),
  sessionDto('a7b20e00-0000-4000-8000-000000000002', {
    state: 'idle',
    activity: 'paused',
    current_tool: null,
    model: 'claude-sonnet-5',
    block_count: 0,
  }),
  sessionDto('c1d47700-0000-4000-8000-000000000003', { state: 'closed', activity: null, current_tool: null }),
  sessionDto('d9e00000-0000-4000-8000-000000000004', {
    project: 'lucia',
    directory: 'C:\\Codev\\lucia',
    state: 'orphaned',
    activity: null,
    current_tool: null,
  }),
];

test.describe('AC-16: board de Sesiones', () => {
  test('es la pantalla de inicio: Estados, fichas y Sesiones agrupadas por Proyecto', async ({ page }) => {
    await mockApi(page, { sessions: board(sessions) });
    await page.goto('/');

    await expect(page).toHaveURL(/\/sesiones$/);
    await expect(page.getByTestId('state-summary')).toHaveText('1 activa · 1 inactiva · 1 huérfana · 1 cerrada');
    await expect(page.getByTestId('usage-card')).toHaveCount(6);
    await expect(page.getByTestId('project-group')).toHaveCount(2);

    const first = page.getByTestId('session-card').first();
    await expect(first).toContainText('Activa');
    await expect(first).toContainText('7f3c2a10');
    await expect(first).toContainText('Trabajando…');
    await expect(first).toContainText('Bash · npm test');
    await expect(first).toContainText('42 min Duración activa');
    await expect(first).toContainText('1 h 10 min Duración de reloj');
    await expect(first).toContainText('2 Subagentes (1 en marcha)');
    await expect(first).toContainText('1 Bloqueo');

    // Las Cerradas quedan plegadas en su Proyecto.
    const demo = page.getByTestId('project-group').filter({ hasText: 'demo' });
    await expect(demo.getByTestId('session-card')).toHaveCount(2);
    await demo.getByRole('button', { name: 'Mostrar 1 cerrada' }).click();
    await expect(demo.getByTestId('session-card')).toHaveCount(3);
  });

  test('AC-59: la tarjeta muestra la Puntuación de la Sesión, y nada si no la tiene', async ({ page }) => {
    await mockApi(page, {
      sessions: board([
        sessionDto(SESSION_ID, { evaluation_score: 1 }),
        sessionDto('a7b20e00-0000-4000-8000-000000000002', { evaluation_score: -1 }),
        sessionDto('c1d47700-0000-4000-8000-000000000003'),
      ]),
    });
    await page.goto('/sesiones');

    const cards = page.getByTestId('session-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0).getByTestId('session-score')).toContainText('Sesión bien puntuada');
    await expect(cards.nth(1).getByTestId('session-score')).toContainText('Sesión mal puntuada');
    await expect(cards.nth(2).getByTestId('session-score')).toHaveCount(0);
  });

  test('los filtros se reflejan en la URL y se conservan al recargar', async ({ page }) => {
    const api = await mockApi(page, { sessions: board(sessions) });
    await page.goto('/sesiones');
    await expect(page.getByTestId('session-card')).toHaveCount(3);

    await page.getByTestId('session-card').first().getByRole('button', { name: /Codev/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('directorio')).toBe('C:\\Codev\\demo');
    await expect.poll(() => api.requests.sessions.at(-1)?.searchParams.get('directory')).toBe('C:\\Codev\\demo');

    await page.goto('/sesiones?estado=idle&rango=1h');
    await expect(page.getByTestId('session-card')).toHaveCount(1);
    await expect(page.getByTestId('session-card')).toContainText('Inactiva');
    // Con `rango=1h` el board pide las Sesiones de la última hora.
    const windowOf = (url: URL) => Date.now() - Date.parse(url.searchParams.get('since') ?? '');
    await expect
      .poll(() => api.requests.sessions.some((url) => Math.abs(windowOf(url) - 60 * 60_000) < 5 * 60_000))
      .toBe(true);
  });

  test('se refresca al llegar Eventos por el WebSocket', async ({ page }) => {
    let current = [sessionDto(SESSION_ID, { state: 'idle', activity: 'paused', current_tool: null })];
    const api = await mockApi(page, { sessions: () => board(current)() });
    await page.goto('/sesiones');
    await expect(page.getByTestId('session-card').first()).toContainText('En pausa');

    current = [sessionDto(SESSION_ID)];
    (await api.socket()).send(liveMessage(eventDto('live-1')));

    await expect(page.getByTestId('session-card').first()).toContainText('Trabajando…');
    await expect(page.locator('.connection')).toHaveText('En vivo');
  });

  test('los Proyectos y las tarjetas no cambian de sitio cuando llega actividad', async ({ page }) => {
    const older = new Date(Date.now() - 3 * 3_600_000).toISOString();
    let current = [
      sessionDto('z1000000-0000-4000-8000-000000000001', { project: 'zeta', last_activity_at: older }),
      sessionDto('a1000000-0000-4000-8000-000000000001', { project: 'alfa', last_activity_at: older }),
    ];
    const api = await mockApi(page, { sessions: () => board(current)() });
    await page.goto('/sesiones');
    const projects = page.getByTestId('project-group').locator('h3');
    await expect(projects).toHaveText(['alfa', 'zeta']);

    // "zeta" recibe actividad: antes habría subido arriba.
    current = [{ ...current[0]!, last_activity_at: new Date().toISOString() }, current[1]!];
    (await api.socket()).send(liveMessage(eventDto('live-z', { project: 'zeta' })));
    await expect.poll(() => api.requests.sessions.length).toBeGreaterThan(1);
    await expect(projects).toHaveText(['alfa', 'zeta']);
  });

  test('AC-24: la tarjeta muestra los Subagentes en marcha con su Tarea', async ({ page }) => {
    await mockApi(page, { sessions: board([sessionDto(SESSION_ID)]) });
    await page.goto('/sesiones');
    await expect(page.getByTestId('live-subagent')).toContainText('Explore');
    await expect(page.getByTestId('live-subagent')).toContainText('Buscar plugins de observabilidad');
    await expect(page.getByTestId('live-subagent')).toContainText('Grep observe');
  });

  test('al pulsar una tarjeta se abre su detalle', async ({ page }) => {
    await mockApi(page, { sessions: board(sessions), detail: (id) => (id === SESSION_ID ? detailDto(id) : null) });
    await page.goto('/sesiones');
    await page.getByRole('link', { name: '7f3c2a10' }).click();

    await expect(page).toHaveURL(new RegExp(`/sesiones/${SESSION_ID}$`));
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('7f3c2a10');
  });

  test('en pantalla estrecha no desborda', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, { sessions: board(sessions) });
    await page.goto('/sesiones');
    await expect(page.getByTestId('session-card').first()).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});

test.describe('AC-19: detalle de Sesión', () => {
  const events = [
    eventDto('e3', { event_type: 'tool.post' }),
    eventDto('e2', { event_type: 'tool.pre' }),
    eventDto('e1', { event_type: 'prompt.submitted', tool_name: null, payload: { prompt: 'Añade un test para el login' } }),
  ];

  test('muestra cabecera, contexto, herramientas, tokens, carriles y Eventos', async ({ page }) => {
    await mockApi(page, { detail: (id) => detailDto(id), events: () => events });
    await page.goto(`/sesiones/${SESSION_ID}`);

    await expect(page.getByTestId('session-meta')).toContainText('42 min Duración activa / 1 h 10 min Duración de reloj');
    await expect(page.getByTestId('session-meta')).toContainText('5 Turnos');
    await expect(page.getByTestId('context-card')).toContainText('91,9 mil / 1 M');
    await expect(page.getByTestId('context-card')).toContainText('Estimado a partir del Transcript');
    await expect(page.getByTestId('tool-bar')).toHaveCount(2);
    await expect(page.locator('[data-kpi="cache"]')).toContainText('95 %');
    await expect(page.locator('[data-kpi="cost"]')).toContainText('~3,42');
    await expect(page.getByTestId('lane')).toHaveCount(1);
    await expect(page.getByTestId('event-row')).toHaveCount(3);
  });

  test('las pestañas se reflejan en la URL', async ({ page }) => {
    await mockApi(page, { detail: (id) => detailDto(id), events: () => events });
    await page.goto(`/sesiones/${SESSION_ID}?pestana=prompts`);
    await expect(page.getByTestId('prompt')).toHaveCount(2);
    await expect(page.getByTestId('prompt').first()).toContainText('Añade un test para el login');

    await page.goto(`/sesiones/${SESSION_ID}?pestana=subagentes`);
    await expect(page.getByTestId('subagent-row')).toContainText('Explore');
    await expect(page.getByTestId('subagent-row')).toContainText('Buscar plugins de observabilidad');

    // AC-24: la fila se expande con la Tarea, las herramientas y la respuesta.
    await page.getByTestId('subagent-toggle').click();
    await expect(page.getByTestId('subagent-prompt')).toContainText('resume cómo se registran');
    await expect(page.getByTestId('subagent-tool')).toHaveCount(2);
    await expect(page.getByTestId('subagent-tool').last()).toContainText('Error');
    await expect(page.getByTestId('subagent-result')).toHaveText('Hay 3 plugins; se registran en src/plugins.ts.');

    await page.goto(`/sesiones/${SESSION_ID}?pestana=linea`);
    await expect(page.getByTestId('turn')).toHaveCount(2);
    await expect(page.getByTestId('turn').last()).toContainText('En curso');
  });

  test('sin Transcript el resto del detalle funciona', async ({ page }) => {
    await mockApi(page, {
      detail: (id) => detailDto(id, { transcript_available: false, usage: null, context: null, model: null }),
      events: () => events,
    });
    await page.goto(`/sesiones/${SESSION_ID}`);

    await expect(page.getByTestId('transcript-unavailable')).toBeAttached();
    await expect(page.getByTestId('tokens-unavailable')).toBeAttached();
    await expect(page.getByTestId('event-row')).toHaveCount(3);
  });

  test('una Sesión inexistente ofrece volver al board', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sesiones/no-existe');
    await expect(page.getByTestId('session-not-found')).toContainText('No existe la Sesión');
    await page.getByTestId('session-not-found').getByRole('link', { name: 'Volver al board' }).click();
    await expect(page).toHaveURL(/\/sesiones$/);
  });
});
