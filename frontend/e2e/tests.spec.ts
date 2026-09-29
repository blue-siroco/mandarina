import { expect, test } from '@playwright/test';
import { SESSION_ID, eventDto, liveMessage, mockApi, testRunDto } from './fixtures';

// AC-28: pantalla del Estado de los tests. Red interceptada (ver CLAUDE.md).

const red = testRunDto('e3', {
  status: 'failed',
  counts: { total: 10, passed: 8, failed: 1, skipped: 1 },
  failures: [{ name: 'sum > AC-01: suma', file: 'test/sum.test.ts', message: 'AssertionError: expected 3 to be 4', ac: 'AC-01' }],
});
const e2e = testRunDto('e2', {
  id: 'e2:playwright',
  kind: 'e2e',
  runner: 'playwright',
  command: 'npx playwright test',
  counts: { total: 4, passed: 4, failed: 0, skipped: 0 },
  subagent_id: 'agent-9a8b7c',
});
const other = testRunDto('e1', { project: 'mandarina' });
const list = (items: unknown[]) => ({ items, facets: { projects: ['demo', 'mandarina'] } });

test.describe('AC-28: pantalla de tests', () => {
  test('muestra el Estado de los tests por Proyecto y pide 7 días', async ({ page }) => {
    const api = await mockApi(page, { testRuns: () => list([red, e2e, other]) });
    await page.goto('/tests');

    const demo = page.getByTestId('test-project').filter({ hasText: 'demo' });
    const unit = demo.locator('[data-testid="test-suite"][data-kind="unit"]');
    await expect(unit).toHaveAttribute('data-status', 'failed');
    await expect(unit).toContainText('Fallan');
    await expect(unit).toContainText('8 / 10');
    await expect(unit.getByTestId('test-failure')).toContainText('AssertionError: expected 3 to be 4');
    await expect(unit.getByTestId('test-failure')).toContainText('AC-01');
    await expect(demo.locator('[data-kind="e2e"]')).toContainText('Pasan');

    const mandarina = page.getByTestId('test-project').filter({ hasText: 'mandarina' });
    await expect(mandarina.locator('[data-kind="e2e"]')).toContainText('Sin datos');
    await expect(page.getByTestId('test-run-row')).toHaveCount(3);

    const days = (Date.now() - Date.parse(api.requests.testRuns.at(-1)!.searchParams.get('since')!)) / 86_400_000;
    expect(days).toBeGreaterThan(6);
    expect(days).toBeLessThanOrEqual(7);
  });

  test('filtra por Proyecto y lo refleja en la URL', async ({ page }) => {
    await mockApi(page, { testRuns: () => list([red, e2e, other]) });
    await page.goto('/tests');
    await page.getByTestId('project-filter').locator('select').selectOption('mandarina');

    await expect(page).toHaveURL(/proyecto=mandarina/);
    await expect(page.getByTestId('test-project')).toHaveCount(1);
    await expect(page.getByTestId('test-run-row')).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId('test-run-row')).toHaveCount(1);
  });

  test('enlaza con la Sesión que lanzó la Ejecución', async ({ page }) => {
    await mockApi(page, { testRuns: () => list([red]) });
    await page.goto('/tests');
    await page.locator('[data-kind="unit"]').first().getByRole('link', { name: /Sesión/ }).click();
    await expect(page).toHaveURL(new RegExp(`/sesiones/${SESSION_ID}$`));
  });

  test('se actualiza cuando un agente termina un comando Bash', async ({ page }) => {
    let items: unknown[] = [];
    const api = await mockApi(page, { testRuns: () => ({ items, facets: { projects: items.length > 0 ? ['demo'] : [] } }) });
    await page.goto('/tests');
    await expect(page.getByTestId('tests-empty')).toBeVisible();

    items = [red];
    const socket = await api.socket();
    socket.send(liveMessage(eventDto('live-1', { event_type: 'tool.post', native_event_type: 'PostToolUseFailure' })));

    await expect(page.locator('[data-kind="unit"]').first()).toContainText('Fallan');
  });

  test('se llega desde la barra lateral', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sesiones');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Tests' }).click();
    await expect(page).toHaveURL(/\/tests$/);
    await expect(page.getByRole('heading', { name: 'Tests', level: 2 })).toBeVisible();
  });
});
