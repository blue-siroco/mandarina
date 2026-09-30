import { expect, test, type Page } from '@playwright/test';
import { SESSION_ID, budgetDto, mockApi, sessionDto } from './fixtures';

// AC-82 (pantalla), AC-83 (aviso de cabecera y sonido) y AC-84 (board). Red interceptada (ver CLAUDE.md).

const board = (items: unknown[]) => () => ({ items, facets: { projects: ['demo', 'lucia'], directories: [] } });

const subject = (overrides: Record<string, unknown> = {}) => ({
  session_id: null,
  project: null,
  spent_usd: 12,
  ratio: 0.24,
  state: 'within',
  allowed: false,
  ...overrides,
});

const globalBudget = (overrides: Record<string, unknown> = {}) => budgetDto(overrides);

const sessionBudget = () =>
  budgetDto({
    id: 'b2',
    scope: 'session',
    limit_usd: 5,
    state: 'exceeded',
    spent_usd: 9.5,
    sessions_tracked: 3,
    subjects: [subject({ session_id: SESSION_ID, project: 'demo', spent_usd: 9.5, ratio: 1.9, state: 'exceeded' })],
  });

const stateMessage = (state: string, previous = 'within') =>
  JSON.stringify({
    type: 'budget.state',
    budget_id: 'b1',
    scope: 'global_day',
    project: null,
    session_id: null,
    action: 'stop',
    state,
    previous_state: previous,
    spent_usd: 52,
    limit_usd: 50,
  });

/** Cuenta los tonos que suenan sin necesitar audio real. */
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

test.describe('AC-82: pantalla de Presupuestos', () => {
  test('está en el grupo Configurar y muestra el estado vacío con el botón de crear', async ({ page }) => {
    await mockApi(page);
    await page.goto('/presupuestos');

    await expect(page.getByRole('link', { name: 'Presupuestos' })).toBeVisible();
    await expect(page.getByTestId('budgets-empty')).toBeVisible();
    await expect(page.getByTestId('budgets-explanation')).toContainText('estimación');
  });

  test('crea un Presupuesto validando el límite y envía el cuerpo del contrato', async ({ page }) => {
    const api = await mockApi(page);
    await page.goto('/presupuestos');

    await page.getByTestId('budget-new').click();
    await page.getByTestId('field-limit').fill('-3');
    await page.getByTestId('budget-save').click();
    await expect(page.getByTestId('error-limit')).toBeVisible();
    expect(api.budgetCalls.filter((c) => c.method === 'POST')).toHaveLength(0);

    await page.getByTestId('field-limit').fill('50');
    await page.getByTestId('field-threshold').fill('80');
    await page.getByTestId('budget-save').click();

    await expect(page.getByTestId('budget-row')).toHaveCount(1);
    await expect(page.getByTestId('budget-limit')).toHaveText(/50/);
    const post = api.budgetCalls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({ scope: 'global_day', project: null, limit_usd: 50, warn_ratio: 0.8, action: 'stop', enabled: true });
  });

  test('desactiva y borra con confirmación', async ({ page }) => {
    const api = await mockApi(page, { budgets: [globalBudget()] });
    await page.goto('/presupuestos');

    await page.getByTestId('budget-toggle').uncheck();
    await expect.poll(() => api.budgetCalls.find((c) => c.method === 'PUT')?.body).toMatchObject({ enabled: false });

    await page.getByTestId('budget-delete').click();
    await expect(page.getByTestId('budget-row')).toHaveCount(1);
    await page.getByTestId('budget-delete-confirm').click();
    await expect(page.getByTestId('budgets-empty')).toBeVisible();
    expect(api.budgetCalls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  test('permite seguir a una Sesión Superada y quita la excepción', async ({ page }) => {
    const api = await mockApi(page, { budgets: [sessionBudget()] });
    await page.goto('/presupuestos');

    await page.getByTestId('budget-expand').click();
    await expect(page.getByTestId('budget-subject')).toHaveCount(1);
    await page.getByTestId('allow-session').click();

    await expect(page.getByTestId('budget-allowance')).toHaveCount(1);
    expect(api.budgetCalls.find((c) => c.method === 'POST')?.body).toMatchObject({ session_id: SESSION_ID });

    await page.getByTestId('allowance-remove').click();
    await expect(page.getByTestId('budget-allowance')).toHaveCount(0);
    expect(api.budgetCalls.some((c) => c.method === 'DELETE')).toBe(true);
  });
});

test.describe('AC-83: aviso de cabecera', () => {
  test('sin Presupuestos Cerca ni Superados no hay aviso', async ({ page }) => {
    await mockApi(page, { budgets: [globalBudget()] });
    await page.goto('/sesiones');

    await expect(page.getByTestId('budget-alert')).toHaveCount(0);
  });

  test('aparece al llegar un budget.state y suena una vez; con el silencio no suena', async ({ page }) => {
    await fakeAudio(page);
    const budgets = [globalBudget()];
    const api = await mockApi(page, { budgets });
    await page.goto('/sesiones');
    const socket = await api.socket();

    // Los navegadores solo dejan sonar tras una interacción.
    await page.getByTestId('state-summary').click();
    await page.route(/\/api\/v1\/budgets(\?|$)/, (route) =>
      route.fulfill({
        json: {
          items: [globalBudget({ state: 'exceeded', spent_usd: 52, subjects: [subject({ spent_usd: 52, ratio: 1.04, state: 'exceeded' })] })],
          generated_at: new Date().toISOString(),
        },
      }),
    );
    socket.send(stateMessage('exceeded'));

    const alert = page.getByTestId('budget-alert');
    await expect(alert).toBeVisible();
    await expect(page.getByTestId('budget-alert-state')).toHaveText(/superado/i);
    await expect(page.getByTestId('budget-alert-message')).toContainText('Presupuesto global del día superado');
    await expect.poll(() => tones(page)).toBe(2);

    await page.getByTestId('budget-alert-mute').check();
    socket.send(stateMessage('near', 'exceeded'));
    socket.send(stateMessage('exceeded', 'near'));
    await page.waitForTimeout(300);
    expect(await tones(page)).toBe(2);
    await page.reload();
    await expect(page.getByTestId('budget-alert-mute')).toBeChecked();
  });
});

test.describe('AC-124: acciones del aviso de cabecera', () => {
  test('Permitir esta Sesión crea la excepción, lo confirma', async ({ page }) => {
    const api = await mockApi(page, { budgets: [sessionBudget()] });
    await page.goto('/sesiones');
    await expect(page.getByTestId('budget-alert-state')).toHaveText(/superado/i);

    await page.getByTestId('budget-alert-allow').click();
    expect(api.budgetCalls.find((c) => c.method === 'POST')?.body).toMatchObject({ session_id: SESSION_ID });
    await expect(page.getByTestId('budget-alert-notice')).toContainText('Excepción creada');
  });

  test('Ampliar límite propone un valor, lo aplica y confirma', async ({ page }) => {
    const api = await mockApi(page, { budgets: [sessionBudget()] });
    await page.goto('/sesiones');

    await page.getByTestId('budget-alert-raise').click();
    await expect(page.getByTestId('budget-alert-raise-input')).toHaveValue('12');
    await page.getByTestId('budget-alert-raise-input').fill('20');
    await page.getByTestId('budget-alert-raise-apply').click();

    await expect.poll(() => api.budgetCalls.find((c) => c.method === 'PUT')?.body).toMatchObject({ limit_usd: 20 });
    await expect(page.getByTestId('budget-alert-notice')).toContainText('Límite ampliado');
  });
});

test.describe('AC-84: Presupuestos en el board', () => {
  test('la ficha de coste muestra el progreso del Presupuesto global del día', async ({ page }) => {
    await mockApi(page, { sessions: board([sessionDto(SESSION_ID)]), budgets: [globalBudget()] });
    await page.goto('/sesiones');

    await expect(page.getByTestId('day-budget')).toBeVisible();
    await expect(page.getByTestId('day-budget-label')).toContainText('de');
    await expect(page.getByTestId('day-budget-percent')).toContainText('24');
  });

  test('la tarjeta de una Sesión detenida por presupuesto lleva su badge', async ({ page }) => {
    await mockApi(page, {
      sessions: board([sessionDto(SESSION_ID, { budget_stopped: true }), sessionDto('a7b20e00-0000-4000-8000-000000000002')]),
    });
    await page.goto('/sesiones');

    await expect(page.getByTestId('session-budget-stopped')).toHaveCount(1);
    await expect(page.getByTestId('session-budget-stopped')).toHaveText(/Detenida por presupuesto/);
  });
});
