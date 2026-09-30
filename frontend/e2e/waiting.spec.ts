import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { SESSION_ID, eventDto, liveMessage, mockApi, sessionDto } from './fixtures';

// AC-98 (flujo E2E) y, por el camino, AC-94 (badge), AC-95 (cabecera, título, favicon) y AC-96 (sonido).
// Red y WebSocket interceptados (ver CLAUDE.md). El backend decide `activity`; aquí el mock de
// `GET /sessions` cambia a la vez que llega el Evento, como haría la API real.

const OTHER_ID = 'a7b20e00-0000-4000-8000-000000000002';
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const waiting = (since: string, overrides: Record<string, unknown> = {}) => ({
  since,
  reason: 'permission',
  tool: 'Bash',
  summary: 'npm run build',
  subagent: null,
  ...overrides,
});

const working = (id: string, overrides: Record<string, unknown> = {}) => sessionDto(id, overrides);
const waitingSession = (id: string, since: string, overrides: Record<string, unknown> = {}) =>
  sessionDto(id, { activity: 'waiting', waiting: waiting(since), ...overrides });

const board = (items: unknown[]) => ({ items, facets: { projects: ['demo'], directories: ['C:\\Codev\\demo'] } });

const permissionEvent = (id: string) =>
  eventDto(id, { event_type: 'permission.requested', native_event_type: 'Notification', payload: {} });

/** Cuenta los tonos (osciladores) que suenan, sin audio real; mismo doble que budgets.spec.ts. */
async function fakeAudio(page: Page) {
  await page.addInitScript(() => {
    const counter = { oscillators: 0 };
    (window as unknown as { __tones: typeof counter }).__tones = counter;
    const param = () => ({ value: 0, setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined });
    class FakeContext {
      currentTime = 0;
      destination = {};
      resume = () => Promise.resolve();
      createGain = () => ({ gain: param(), connect: (next: unknown) => next });
      createOscillator = () => {
        counter.oscillators += 1;
        return { frequency: param(), connect: (next: unknown) => next, start: () => undefined, stop: () => undefined };
      };
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
  });
}

const tones = (page: Page) => page.evaluate(() => (window as unknown as { __tones: { oscillators: number } }).__tones.oscillators);
// El aviso de Esperando son dos tonos (TONES.waiting en alert-sound.ts): un sonido = 2 osciladores.
const TONES_PER_SOUND = 2;

const favicon = (page: Page) => page.locator('link[rel~="icon"]').first().getAttribute('href');

test.describe('AC-98: flujo de Sesión Esperando', () => {
  test('aparece: badge en la tarjeta, aviso, título y favicon; en otras pantallas también; desaparece al retomar', async ({ page }) => {
    let items: unknown[] = [working(SESSION_ID)];
    const api = await mockApi(page, { sessions: () => board(items) });
    await page.goto('/sesiones');
    await expect(page.getByTestId('session-card')).toHaveCount(1);
    await expect(page.getByTestId('waiting-alert')).toHaveCount(0);
    expect(await favicon(page)).toBe('assets/images/logo.svg');

    // AC-94/95: el permiso llega por el WebSocket y `GET /sessions` ya devuelve `waiting`.
    items = [waitingSession(SESSION_ID, minutesAgo(1))];
    (await api.socket()).send(liveMessage(permissionEvent('w1')));

    const card = page.getByTestId('session-card');
    await expect(card.getByTestId('waiting-badge')).toHaveText('Esperando');
    await expect(card.getByTestId('waiting-reason')).toHaveText('Pide permiso para Bash: npm run build');
    const alert = page.getByTestId('waiting-alert');
    await expect(alert).toBeVisible();
    await expect(page.getByTestId('waiting-alert-count')).toHaveText('1 Sesión esperando');
    await expect(page.getByTestId('waiting-alert-project')).toHaveText('demo');
    await expect(alert.locator('.waiting-alert__link')).toHaveAttribute('href', `/sesiones/${SESSION_ID}`);
    expect(await favicon(page)).toBe('assets/images/logo-waiting.svg');

    // Desde otras pantallas (navegación de la SPA, sin recargar) el aviso sigue ahí.
    for (const [link, route] of [['Eventos', '/eventos'], ['Presupuestos', '/presupuestos']]) {
      await page.getByRole('link', { name: link!, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page.getByTestId('waiting-alert-count')).toHaveText('1 Sesión esperando');
    }

    // Retoma: tool.post y `GET /sessions` sin espera.
    items = [working(SESSION_ID)];
    (await api.socket()).send(liveMessage(eventDto('w2', { event_type: 'tool.post' })));

    await expect(page.getByTestId('waiting-alert')).toHaveCount(0);
    await expect(page.getByTestId('waiting-alert-count')).toHaveCount(0);
    expect(await favicon(page)).toBe('assets/images/logo.svg');
    await page.getByRole('link', { name: 'Board', exact: true }).click();
    await expect(page.getByTestId('session-card')).toHaveCount(1);
    await expect(page.getByTestId('waiting-badge')).toHaveCount(0);
  });

  test('con dos Sesiones esperando el contador es 2 y el enlace apunta a la más antigua', async ({ page }) => {
    const newer = waitingSession(SESSION_ID, minutesAgo(2));
    const older = waitingSession(OTHER_ID, minutesAgo(9), {
      waiting: waiting(minutesAgo(9), { reason: 'question', tool: null, summary: '¿Continúo?' }),
    });
    // La más antigua no es la primera de la lista: el orden de la API no decide el enlace.
    await mockApi(page, { sessions: () => board([newer, older]) });
    await page.goto('/sesiones');

    await expect(page.getByTestId('waiting-alert-count')).toHaveText('2 Sesiones esperando');
    await expect(page.locator('.waiting-alert__link')).toHaveAttribute('href', `/sesiones/${OTHER_ID}`);
    await expect(page.getByTestId('waiting-alert').getByTestId('waiting-reason')).toHaveText('Pregunta: ¿Continúo?');
  });

  test('un turn.ended sin espera no produce aviso', async ({ page }) => {
    const items = [working(SESSION_ID, { state: 'idle', activity: 'paused', current_tool: null })];
    const api = await mockApi(page, { sessions: () => board(items) });
    await page.goto('/sesiones');
    await expect(page.getByTestId('session-card')).toHaveCount(1);
    await expect.poll(() => api.requests.sessions.length).toBeGreaterThan(0);
    const before = api.requests.sessions.length;

    (await api.socket()).send(liveMessage(eventDto('t1', { event_type: 'turn.ended', native_event_type: 'Stop' })));

    // Se espera al refresco que provoca el Evento para no dar por bueno un "todavía no ha pasado nada".
    await expect.poll(() => api.requests.sessions.length).toBeGreaterThan(before);
    await expect(page.getByTestId('waiting-alert')).toHaveCount(0);
    await expect(page.getByTestId('waiting-badge')).toHaveCount(0);
    expect(await favicon(page)).toBe('assets/images/logo.svg');
  });

  test('AC-95: el título de la pestaña es (N) Mandarina con esperas y el de la ruta sin ellas, en cualquier pantalla', async ({ page }) => {
    let items: unknown[] = [waitingSession(SESSION_ID, minutesAgo(1)), waitingSession(OTHER_ID, minutesAgo(5))];
    const api = await mockApi(page, { sessions: () => board(items) });
    await page.goto('/sesiones');
    await expect(page.getByTestId('waiting-alert-count')).toHaveText('2 Sesiones esperando');
    await expect(page).toHaveTitle('(2) Mandarina');

    // Navegación del lado del cliente: un `goto` abriría otro WebSocket y `api.socket()` solo entrega el primero.
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Eventos', exact: true }).click();
    await expect(page).toHaveURL(/eventos$/);
    await expect(page.getByTestId('waiting-alert-count')).toHaveText('2 Sesiones esperando');
    await expect(page).toHaveTitle('(2) Mandarina');

    items = [];
    (await api.socket()).send(liveMessage(eventDto('ti1', { event_type: 'tool.post' })));
    await expect(page.getByTestId('waiting-alert')).toHaveCount(0);
    await expect(page).toHaveTitle('Eventos · Mandarina');
  });

  test('AC-96: suena una vez tras una interacción al pasar a Esperando, y no en la primera carga', async ({ page }) => {
    await fakeAudio(page);
    let items: unknown[] = [waitingSession(OTHER_ID, minutesAgo(30))];
    const api = await mockApi(page, { sessions: () => board(items) });
    await page.goto('/sesiones');
    await expect(page.getByTestId('waiting-alert-count')).toHaveText('1 Sesión esperando');

    // Una Sesión que ya esperaba al cargar no suena, ni siquiera tras interactuar y refrescar.
    await page.getByTestId('state-summary').click();
    const before = api.requests.sessions.length;
    (await api.socket()).send(liveMessage(eventDto('n0', { event_type: 'tool.post' })));
    await expect.poll(() => api.requests.sessions.length).toBeGreaterThan(before);
    expect(await tones(page)).toBe(0);

    // Una Sesión nueva pasa a Esperando: suena un aviso (un solo sonido por transición).
    items = [waitingSession(OTHER_ID, minutesAgo(30)), waitingSession(SESSION_ID, minutesAgo(0))];
    (await api.socket()).send(liveMessage(permissionEvent('n1')));
    await expect(page.getByTestId('waiting-alert-count')).toHaveText('2 Sesiones esperando');
    await expect.poll(() => tones(page)).toBe(TONES_PER_SOUND);
    await page.waitForTimeout(300);
    expect(await tones(page)).toBe(TONES_PER_SOUND);
  });

  test('AC-96: con Silenciar avisos no suena y la preferencia sobrevive a recargar', async ({ page }) => {
    await fakeAudio(page);
    let items: unknown[] = [waitingSession(OTHER_ID, minutesAgo(30))];
    await mockApi(page, { sessions: () => board(items) });
    await page.goto('/sesiones');
    // `mockApi` solo entrega el primer WebSocket; tras recargar hace falta el de la página nueva.
    let socket: WebSocketRoute | undefined;
    await page.routeWebSocket(/\/ws$/, (ws) => (socket = ws));

    const mute =page.getByTestId('waiting-alert-mute');
    await expect(mute).toHaveAttribute('role', 'switch');
    await expect(mute).not.toBeChecked();
    await mute.check();
    await expect(mute).toBeChecked();

    await page.reload();
    await expect(page.getByTestId('waiting-alert-mute')).toBeChecked();

    // Con la interacción ya hecha (el clic en el interruptor no se conserva tras recargar), otra Sesión pasa a
    // Esperando. Sin silencio sonaría (lo comprueba el test anterior); con él, no.
    await page.getByTestId('state-summary').click();
    items = [waitingSession(OTHER_ID, minutesAgo(30)), waitingSession(SESSION_ID, minutesAgo(0))];
    await expect.poll(() => socket).toBeTruthy();
    socket?.send(liveMessage(permissionEvent('m1')));
    await expect(page.getByTestId('waiting-alert-count')).toHaveText('2 Sesiones esperando');
    await page.waitForTimeout(300);
    expect(await tones(page)).toBe(0);
  });
});
