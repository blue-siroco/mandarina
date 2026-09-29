import { expect, test } from '@playwright/test';
import { SESSION_ID, detailDto, eventDto, liveMessage, mockApi, skillInvocationDto } from './fixtures';

// AC-31 y AC-32: Invocaciones de skill en el detalle de Sesión y en su pantalla. Red interceptada (ver CLAUDE.md).

const agent = skillInvocationDto('i1');
const user = skillInvocationDto('i2', { skill: 'commit', invoker: 'user', args: null, turn: 2, status: 'running', ended_at: null, duration_ms: null });
const subagent = skillInvocationDto('i3', {
  project: 'mandarina',
  skill: 'tdd',
  invoker: 'subagent',
  subagent_id: 'agent-9a8b7c',
  subagent_type: 'e2e-builder',
});
const usage = (project: string, skill: string, total: number, byInvoker: Record<string, number>) => ({
  project,
  skill,
  total,
  by_invoker: { agent: 0, subagent: 0, user: 0, ...byInvoker },
  last_at: new Date(Date.now() - 5 * 60_000).toISOString(),
});
const all = {
  items: [user, subagent, agent],
  stats: [usage('demo', 'tdd', 1, { agent: 1 }), usage('demo', 'commit', 1, { user: 1 }), usage('mandarina', 'tdd', 1, { subagent: 1 })],
  facets: { projects: ['demo', 'mandarina'] },
};

test.describe('AC-31: pestaña Skills del detalle de Sesión', () => {
  test('lista las invocaciones de la Sesión y enlaza con su Turno', async ({ page }) => {
    const api = await mockApi(page, { detail: (id) => detailDto(id), skillInvocations: () => ({ ...all, items: [user, agent] }) });
    await page.goto(`/sesiones/${SESSION_ID}?pestana=skills`);

    const rows = page.getByTestId('skill-invocation');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('commit');
    await expect(rows.first()).toContainText('Persona usuaria');
    await expect(rows.first()).toContainText('En curso');
    await expect(rows.last()).toContainText('Agente');
    await expect(rows.last()).toContainText('Terminada');
    await expect(rows.last()).toContainText('8 min');
    expect(api.requests.skillInvocations.at(-1)!.searchParams.get('session_id')).toBe(SESSION_ID);

    await rows.last().getByRole('link', { name: 'Turno 1' }).click();
    await expect(page).toHaveURL(/pestana=linea/);
    await expect(page).toHaveURL(/turno=1/);
    await expect(page.getByTestId('turn').first()).toHaveAttribute('aria-current', 'true');
  });

  test('sin invocaciones explica de dónde salen', async ({ page }) => {
    await mockApi(page, { detail: (id) => detailDto(id) });
    await page.goto(`/sesiones/${SESSION_ID}?pestana=skills`);
    await expect(page.getByTestId('session-skills-empty')).toContainText('/nombre');
  });
});

test.describe('AC-32: pantalla de Skills', () => {
  test('muestra el uso por Proyecto y skill y pide 7 días por defecto', async ({ page }) => {
    const api = await mockApi(page, { skillInvocations: () => all });
    await page.goto('/skills');

    const rows = page.getByTestId('skill-usage');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText('commit');
    await expect(rows.nth(1)).toContainText('0 · 1 · 0');
    await expect(rows.nth(1)).toContainText('hace 5 min');

    const days = (Date.now() - Date.parse(api.requests.skillInvocations.at(-1)!.searchParams.get('since')!)) / 86_400_000;
    // La ventana se calcula al pedir: unos ms antes que este `Date.now()`.
    expect(days).toBeCloseTo(7, 2);
  });

  test('despliega las invocaciones de una skill con enlace a la Sesión', async ({ page }) => {
    await mockApi(page, { skillInvocations: () => all, detail: (id) => detailDto(id) });
    await page.goto('/skills');

    await page.getByRole('button', { name: 'Desplegar tdd en mandarina' }).click();
    const invocation = page.getByTestId('skill-usage-invocation');
    await expect(invocation).toHaveCount(1);
    await expect(invocation).toContainText('e2e-builder');

    await invocation.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/sesiones/${SESSION_ID}\\?pestana=skills$`));
  });

  test('el periodo y el Proyecto se reflejan en la URL', async ({ page }) => {
    const api = await mockApi(page, { skillInvocations: () => all });
    await page.goto('/skills?periodo=todo&proyecto=mandarina');

    await expect(page.getByTestId('skill-usage')).toHaveCount(1);
    expect(api.requests.skillInvocations.at(-1)!.searchParams.get('since')).toBe(new Date(0).toISOString());

    await page.getByTestId('project-filter').locator('select').selectOption('demo');
    await expect(page).toHaveURL(/proyecto=demo/);
    await expect(page.getByTestId('skill-usage')).toHaveCount(2);
  });

  test('se actualiza cuando un agente carga una skill', async ({ page }) => {
    let list = { items: [] as unknown[], stats: [] as unknown[], facets: { projects: [] as string[] } };
    const api = await mockApi(page, { skillInvocations: () => list });
    await page.goto('/skills');
    await expect(page.getByTestId('skills-empty')).toBeVisible();

    list = all;
    const socket = await api.socket();
    socket.send(liveMessage(eventDto('live-1', { event_type: 'tool.pre', native_event_type: 'PreToolUse', tool_name: 'Skill' })));

    await expect(page.getByTestId('skill-usage')).toHaveCount(3);
  });

  test('se llega desde la barra lateral', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sesiones');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Skills' }).click();
    await expect(page).toHaveURL(/\/skills$/);
    await expect(page.getByRole('heading', { name: 'Skills', level: 2 })).toBeVisible();
  });
});
