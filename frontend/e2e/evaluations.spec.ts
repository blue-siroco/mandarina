import { expect, test } from '@playwright/test';
import { SESSION_ID, detailDto, mockApi } from './fixtures';

// AC-58: pantalla Evaluaciones. Red interceptada (ver CLAUDE.md).

const evaluation = (objectType: string, objectId: string, overrides: Record<string, unknown> = {}) => ({
  object_type: objectType,
  object_id: objectId,
  session_id: 'sesion-1',
  project: 'demo',
  score: 1,
  tags: [] as string[],
  note: null,
  summary: null,
  agent_type: null,
  created_at: '2026-09-25T12:00:00.000Z',
  updated_at: '2026-09-25T12:05:00.000Z',
  ...overrides,
});

const list = {
  items: [
    evaluation('turn', 'p1', { score: -1, tags: ['hallucination', 'bug-fix'], summary: 'arregla el test' }),
    evaluation('subagent', 'agent-a1', { agent_type: 'Explore', summary: 'buscar el test', note: 'Lo encontró' }),
    evaluation('session', 'sesion-1', { score: null, tags: ['bug-fix'], note: 'Buena sesión' }),
  ],
  tags: [
    { tag: 'bug-fix', count: 2 },
    { tag: 'hallucination', count: 1 },
  ],
  facets: { projects: ['demo', 'lucia'] },
};

test.describe('AC-58: pantalla Evaluaciones', () => {
  test('lista las Evaluaciones con su objeto, Puntuación y Etiquetas, y pide todo el histórico', async ({ page }) => {
    const api = await mockApi(page, { evaluations: { list: () => list } });
    await page.goto('/evaluaciones');

    const rows = page.getByTestId('evaluation-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Turno');
    await expect(rows.nth(0)).toContainText('arregla el test');
    await expect(rows.nth(0)).toContainText('Mal');
    await expect(rows.nth(0)).toContainText('hallucination');
    await expect(rows.nth(1)).toContainText('Subagente · Explore');
    await expect(rows.nth(1)).toContainText('Lo encontró');
    await expect(rows.nth(2)).toContainText('Sesión');
    await expect(rows.nth(2)).toContainText('Buena sesión');

    const first = api.evaluationCalls.find((c) => c.method === 'GET' && c.url.pathname === '/api/v1/evaluations')!;
    expect(first.url.searchParams.has('since')).toBe(false);
  });

  test('los filtros se reflejan en la URL y en la petición', async ({ page }) => {
    const api = await mockApi(page, { evaluations: { list: () => list } });
    await page.goto('/evaluaciones');
    await expect(page.getByTestId('evaluation-row')).toHaveCount(3);

    await page.getByTestId('type-filter').locator('select').selectOption('Turno');
    await expect(page).toHaveURL(/tipo=turn/);
    await page.getByTestId('score-filter').locator('select').selectOption('−1 (mal)');
    await expect(page).toHaveURL(/puntuacion=down/);
    await page.getByTestId('project-filter').locator('select').selectOption('lucia');
    await expect(page).toHaveURL(/proyecto=lucia/);

    await expect
      .poll(() => {
        const last = api.evaluationCalls.filter((c) => c.method === 'GET' && c.url.pathname === '/api/v1/evaluations').at(-1)!;
        return [last.url.searchParams.getAll('object_type').join(','), last.url.searchParams.get('score'), last.url.searchParams.get('project')];
      })
      .toStrictEqual(['turn', 'down', 'lucia']);
  });

  test('el periodo pide solo lo actualizado en esa ventana', async ({ page }) => {
    const api = await mockApi(page, { evaluations: { list: () => list } });
    await page.goto('/evaluaciones?periodo=7d');
    await expect(page.getByTestId('evaluation-row')).toHaveCount(3);
    const last = api.evaluationCalls.filter((c) => c.method === 'GET' && c.url.pathname === '/api/v1/evaluations').at(-1)!;
    const days = (Date.now() - Date.parse(last.url.searchParams.get('since')!)) / 86_400_000;
    expect(days).toBeCloseTo(7, 2);
  });

  test('el recuento de Etiquetas se aplica como filtro al pulsarlo', async ({ page }) => {
    await mockApi(page, { evaluations: { list: () => list } });
    await page.goto('/evaluaciones');

    const counts = page.getByTestId('tag-counts');
    await expect(counts).toContainText('bug-fix');
    await counts.getByRole('button', { name: /hallucination/ }).click();
    await expect(page).toHaveURL(/etiqueta=hallucination/);
    await expect(counts.getByRole('button', { name: /hallucination/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('cada fila lleva a su objeto en el detalle de Sesión', async ({ page }) => {
    await mockApi(page, { evaluations: { list: () => list } });
    await page.goto('/evaluaciones');

    await page.getByTestId('evaluation-row').nth(1).getByRole('link').click();
    await expect(page).toHaveURL(/\/sesiones\/sesion-1\?pestana=subagentes&subagente=agent-a1$/);
  });

  test('Exportar dataset descarga el JSONL con los filtros vigentes', async ({ page }) => {
    await mockApi(page, { evaluations: { list: () => list } });
    await page.goto('/evaluaciones?tipo=turn&puntuacion=up');

    const link = page.getByTestId('export-dataset');
    await expect(link).toHaveText('Exportar dataset');
    const href = (await link.getAttribute('href'))!;
    expect(href).toContain('/api/v1/evaluations/export');
    expect(href).toContain('object_type=turn');
    expect(href).toContain('score=up');
  });

  test('sin Evaluaciones muestra un estado vacío que explica dónde se crean', async ({ page }) => {
    await mockApi(page);
    await page.goto('/evaluaciones');
    await expect(page.getByTestId('evaluations-empty')).toContainText('detalle de una Sesión');
  });

  test('un fallo de carga se avisa sin romper la pantalla', async ({ page }) => {
    await mockApi(page);
    await page.route(/\/api\/v1\/evaluations(\?|$)/, (route) => route.fulfill({ status: 500, json: { message: 'caído' } }));
    await page.goto('/evaluaciones');
    await expect(page.getByTestId('evaluations-error')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Evaluaciones' })).toBeVisible();
  });

  test('se llega desde la barra lateral', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sesiones');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Evaluaciones' }).click();
    await expect(page).toHaveURL(/\/evaluaciones$/);
    await expect(page.getByRole('heading', { name: 'Evaluaciones' })).toBeVisible();
  });
});

// AC-57: evaluar desde el detalle de Sesión.
test.describe('AC-57: evaluar desde el detalle de Sesión', () => {
  const put = (api: Awaited<ReturnType<typeof mockApi>>) => api.evaluationCalls.filter((c) => c.method === 'PUT');

  test('puntuar la Sesión la guarda al momento, sin botón, y avisa', async ({ page }) => {
    const api = await mockApi(page, { detail: (id) => detailDto(id) });
    await page.goto(`/sesiones/${SESSION_ID}`);

    const controls = page.getByTestId('session-evaluation');
    await controls.getByRole('button', { name: 'Bien' }).click();

    await expect(controls.getByRole('button', { name: 'Bien' })).toHaveAttribute('aria-pressed', 'true');
    await expect(controls).toContainText('Guardado');
    await expect.poll(() => put(api).length).toBe(1);
    expect(put(api)[0]!.url.pathname).toBe(`/api/v1/evaluations/session/${SESSION_ID}`);
    expect(put(api)[0]!.body).toMatchObject({ score: 1, tags: [], note: null });
  });

  test('una Etiqueta se normaliza y la Nota se guarda al salir del campo', async ({ page }) => {
    const api = await mockApi(page, { detail: (id) => detailDto(id) });
    await page.goto(`/sesiones/${SESSION_ID}`);

    const controls = page.getByTestId('session-evaluation');
    await controls.getByTestId('tag-input').fill('Bug fix');
    await controls.getByTestId('tag-input').press('Enter');
    await expect(controls.getByTestId('evaluation-tag')).toContainText('bug-fix');

    await controls.getByRole('textbox', { name: /Nota/ }).fill('Resolvió el AC-28');
    await controls.getByRole('textbox', { name: /Nota/ }).blur();
    await expect.poll(() => put(api).at(-1)?.body).toMatchObject({ tags: ['bug-fix'], note: 'Resolvió el AC-28' });
  });

  test('cada Turno de la Línea de tiempo se evalúa por el id de su prompt', async ({ page }) => {
    const api = await mockApi(page, { detail: (id) => detailDto(id) });
    await page.goto(`/sesiones/${SESSION_ID}?pestana=linea`);

    await page.getByTestId('turn').nth(1).getByRole('button', { name: 'Mal' }).click();
    await expect.poll(() => put(api).length).toBe(1);
    expect(put(api)[0]!.url.pathname).toBe('/api/v1/evaluations/turn/prompt-2');
    expect(put(api)[0]!.body).toMatchObject({ score: -1 });
  });

  test('un Subagente desplegado se evalúa por su id', async ({ page }) => {
    const api = await mockApi(page, { detail: (id) => detailDto(id) });
    await page.goto(`/sesiones/${SESSION_ID}?pestana=subagentes&subagente=agent-9a8b7c`);

    await page.getByTestId('subagent-evaluation').getByRole('button', { name: 'Bien' }).click();
    await expect.poll(() => put(api).length).toBe(1);
    expect(put(api)[0]!.url.pathname).toBe('/api/v1/evaluations/subagent/agent-9a8b7c');
  });

  test('si falla al guardar lo dice y conserva lo escrito', async ({ page }) => {
    await mockApi(page, { detail: (id) => detailDto(id), evaluations: { putStatus: () => 500 } });
    await page.goto(`/sesiones/${SESSION_ID}`);

    const controls = page.getByTestId('session-evaluation');
    await controls.getByRole('button', { name: 'Mal' }).click();

    await expect(controls).toContainText('No se pudo guardar');
    await expect(controls.getByRole('button', { name: 'Mal' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('carga la Evaluación existente y quitar la Puntuación de una vacía la borra', async ({ page }) => {
    const existing = {
      object_type: 'session',
      object_id: SESSION_ID,
      session_id: SESSION_ID,
      project: 'demo',
      score: 1,
      tags: [],
      note: null,
      summary: null,
      agent_type: null,
      created_at: '2026-09-25T12:00:00.000Z',
      updated_at: '2026-09-25T12:05:00.000Z',
    };
    const api = await mockApi(page, {
      detail: (id) => detailDto(id),
      evaluations: { list: () => ({ items: [existing], tags: [], facets: { projects: ['demo'] } }) },
    });
    await page.goto(`/sesiones/${SESSION_ID}`);

    const controls = page.getByTestId('session-evaluation');
    await expect(controls.getByRole('button', { name: 'Bien' })).toHaveAttribute('aria-pressed', 'true');
    await controls.getByRole('button', { name: 'Bien' }).click();

    await expect.poll(() => api.evaluationCalls.filter((c) => c.method === 'DELETE').length).toBe(1);
    expect(put(api)).toHaveLength(0);
  });
});
