import { expect, test, type Page } from '@playwright/test';
import { SESSION_ID, detailDto, eventDto, mockApi, sessionDto } from './fixtures';

// AC-149 (flujo), AC-147 (diálogo de Descarga) y AC-148 (Descarga de Eventos con filtros).
// Red interceptada con `page.route`; ni backend real ni Prism (CLAUDE.md).

const STRUCTURE_FIELDS = ['id', 'event_type', 'tool_name', 'occurred_at'];
const CONTENT_FIELDS = [...STRUCTURE_FIELDS, 'prompt', 'tool_input', 'tool_response'];

const preview = (over: Record<string, unknown> = {}) => ({
  total: 120,
  exported: 120,
  truncated: false,
  omitted: 0,
  fields: STRUCTURE_FIELDS,
  ...over,
});

interface Calls {
  previews: URL[];
}

/**
 * Las rutas de exportación se registran DESPUÉS de `mockApi`: Playwright prioriza la última
 * registrada, y la de `/sessions/:id` de las fixtures también casaría con `/sessions/:id/export`.
 * Solo se intercepta la vista previa; el GET de descarga de un <a download> no pasa por page.route (probado).
 */
async function mockExport(
  page: Page,
  opts: { preview?: (url: URL) => unknown } = {},
): Promise<Calls> {
  const calls: Calls = { previews: [] };
  const previewRoute = /\/api\/v1\/(sessions\/[^/?]+|events)\/export\/preview(\?|$)/;
  await page.route(previewRoute, (route) => {
    const url = new URL(route.request().url());
    calls.previews.push(url);
    return route.fulfill({ json: opts.preview?.(url) ?? preview() });
  });
  return calls;
}

const dialog = (page: Page) => page.getByTestId('download-dialog');
const link = (page: Page) => page.getByTestId('download-link');

/** `mockApi` va primero para que las rutas de exportación (registradas después) tengan prioridad. */
async function openSessionDialog(page: Page, opts: Parameters<typeof mockExport>[1] = {}): Promise<Calls> {
  await mockApi(page, {
    sessions: () => ({ items: [sessionDto(SESSION_ID)], facets: { projects: ['demo'], directories: [] } }),
    detail: () => detailDto(SESSION_ID),
  });
  const calls = await mockExport(page, opts);
  await page.goto(`/sesiones/${SESSION_ID}`);
  await page.getByTestId('download-session').click();
  await expect(dialog(page)).toBeVisible();
  return calls;
}

test('AC-149, AC-147: Descargar Sesión muestra recuento y campos de estructura, y con la casilla desmarcada la vista previa y el enlace llevan content=false', async ({ page }) => {
  const calls = await openSessionDialog(page);

  await expect(page.getByTestId('download-format')).toContainText('.json');
  await expect(page.getByTestId('download-content')).not.toBeChecked();
  await expect(page.getByTestId('download-count')).toHaveText(/120\s+Eventos en el fichero/);
  const items = page.getByTestId('download-fields').locator('li');
  await expect(items).toHaveText(STRUCTURE_FIELDS);
  await expect(page.getByTestId('download-warning')).toBeVisible();

  expect(calls.previews.at(-1)!.pathname).toBe(`/api/v1/sessions/${SESSION_ID}/export/preview`);
  expect(calls.previews.at(-1)!.searchParams.get('content')).toBe('false');
  await expect(link(page)).toHaveAttribute('href', new RegExp(`/api/v1/sessions/${SESSION_ID}/export\\?.*content=false`));

  // Los nombres mandarina-sesion-*.json / mandarina-eventos-*.jsonl los pone el servidor (Content-Disposition) y
  // el navegador no deja interceptar la descarga de un <a download>: aquí solo se comprueba que el enlace lo es.
  await expect(link(page)).toHaveAttribute('download', '');
});

test('AC-149, AC-147: marcar «Incluir contenido» cambia los campos y el enlace a content=true; al reabrir vuelve desmarcada', async ({ page }) => {
  const calls = await openSessionDialog(page, {
    preview: (url) => preview({ fields: url.searchParams.get('content') === 'true' ? CONTENT_FIELDS : STRUCTURE_FIELDS }),
  });
  await expect(page.getByTestId('download-fields').locator('li')).toHaveText(STRUCTURE_FIELDS);
  await expect(page.getByTestId('download-content-note')).toHaveCount(0);

  await page.getByTestId('download-content').check();
  await expect(page.getByTestId('download-content-note')).toBeVisible();
  await expect(page.getByTestId('download-fields').locator('li')).toHaveText(CONTENT_FIELDS);
  expect(calls.previews.at(-1)!.searchParams.get('content')).toBe('true');
  await expect(link(page)).toHaveAttribute('href', /content=true/);

  // Nada se recuerda entre descargas (ADR-0013): cerrar y reabrir arranca desmarcada.
  await page.getByTestId('download-cancel').click();
  await expect(dialog(page)).toHaveCount(0);
  await page.getByTestId('download-session').click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByTestId('download-content')).not.toBeChecked();
  await expect(page.getByTestId('download-fields').locator('li')).toHaveText(STRUCTURE_FIELDS);
  await expect(link(page)).toHaveAttribute('href', /content=false/);

  await page.getByTestId('download-close').getByRole('button').or(page.getByTestId('download-close')).first().click();
  await expect(dialog(page)).toHaveCount(0);
});

test('AC-149, AC-148: Descargar Eventos con Proyecto y herramienta filtrados lleva esos filtros en la vista previa y en el enlace', async ({ page }) => {
  await mockApi(page, {
    sessions: () => ({ items: [sessionDto(SESSION_ID)], facets: { projects: ['demo', 'lucia'], directories: [] } }),
    events: () => [eventDto('e1'), eventDto('e2', { tool_name: 'Read' })],
  });
  const calls = await mockExport(page);
  await page.goto('/eventos');
  await expect(page.getByTestId('event-row')).toHaveCount(2);

  await page.getByTestId('project-filter').locator('select').selectOption('demo');
  await page.getByTestId('tool-filter').filter({ hasText: 'Bash' }).click();
  await expect(page).toHaveURL(/proyecto=demo/);
  await expect(page).toHaveURL(/herramienta=Bash/);

  await page.getByTestId('download-events').click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByTestId('download-format')).toContainText('.jsonl');
  await expect(page.getByTestId('download-count')).toBeVisible();

  const previewParams = calls.previews.at(-1)!;
  expect(previewParams.pathname).toBe('/api/v1/events/export/preview');
  expect(previewParams.searchParams.get('project')).toBe('demo');
  expect(previewParams.searchParams.getAll('tool')).toEqual(['Bash']);
  expect(previewParams.searchParams.get('content')).toBe('false');

  const href = (await link(page).getAttribute('href'))!;
  const hrefUrl = new URL(href, 'http://localhost');
  expect(hrefUrl.pathname).toBe('/api/v1/events/export');
  expect(hrefUrl.searchParams.get('project')).toBe('demo');
  expect(hrefUrl.searchParams.getAll('tool')).toEqual(['Bash']);

  await expect(link(page)).toHaveAttribute('download', '');
});

test('AC-149, AC-147: una vista previa truncada avisa de los Eventos que quedan fuera', async ({ page }) => {
  await openSessionDialog(page, { preview: () => preview({ total: 150_000, exported: 100_000, truncated: true, omitted: 50_000 }) });

  const notice = page.getByTestId('download-truncated');
  await expect(notice).toBeVisible();
  // Los miles se formatean con `formatInteger` (es-ES); se comprueba el texto sin depender del separador.
  await expect(notice).toHaveText(/^\s*Se incluirán los 100[.  ]?000 Eventos más recientes; 50[.  ]?000 quedan fuera\. Acota con los filtros\.\s*$/);
  await expect(link(page)).toBeEnabled();
});

test('AC-149, AC-147: con total 0 el enlace Descargar está desactivado y se explica', async ({ page }) => {
  await openSessionDialog(page, { preview: () => preview({ total: 0, exported: 0, fields: STRUCTURE_FIELDS }) });

  await expect(page.getByTestId('download-empty')).toBeVisible();
  await expect(link(page)).toBeDisabled();
  await expect(link(page)).not.toHaveAttribute('href', /.+/);
  await expect(page.getByTestId('download-truncated')).toHaveCount(0);
});
