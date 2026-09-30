import { expect, test } from '@playwright/test';
import { mockApi, sessionDto } from './fixtures';

// AC-139 (flujo), AC-136 a AC-138. Red y WebSocket interceptados (ver CLAUDE.md).

const MIN = 60_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

const window = (remaining: number, resetsInMs: number, status = 'comfortable') => ({
  used_percent: 100 - remaining,
  remaining_percent: remaining,
  resets_at: at(resetsInMs),
  status,
});

const usage = (overrides: Record<string, unknown> = {}) => ({
  five_hour: window(62, 72 * MIN),
  seven_day: window(40, 3 * 24 * 60 * MIN + 5 * 60 * MIN),
  updated_at: at(-5 * MIN),
  ...overrides,
});

const board = () => ({ items: [sessionDto('s-1')], facets: { projects: ['demo'], directories: [] } });
const card = (page: import('@playwright/test').Page) => page.getByTestId('subscription-meter');
const meter = (page: import('@playwright/test').Page, key: 'five-hour' | 'seven-day') =>
  page.locator(`[data-testid="subscription-meter"][data-window="${key}"]`);

test('AC-137, AC-138: con suscripción muestra los dos medidores con lo consumido y el reinicio', async ({ page }) => {
  await mockApi(page, { sessions: board, subscriptionUsage: { usage: usage() } });
  await page.goto('/sesiones');

  await expect(card(page).first()).toBeVisible();
  const five = meter(page, 'five-hour');
  await expect(five.getByRole('heading')).toContainText('Sesión (5 h)');
  await expect(five.getByTestId('meter-used')).toHaveText('38 %');
  await expect(five.getByTestId('meter-state')).toHaveText('Holgado');
  await expect(five.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '38');
  await expect(five.getByTestId('meter-reset')).toHaveText(/^se reinicia a las \d{2}:\d{2} · en 1 h (11|12) min$/);

  const seven = meter(page, 'seven-day');
  await expect(seven.getByRole('heading')).toContainText('Semanal (7 d)');
  await expect(seven.getByTestId('meter-used')).toHaveText('60 %');
  await expect(seven.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
  await expect(seven.getByTestId('meter-reset')).toHaveText(/ · en 3 d 4 h| · en 3 d 5 h/);

  await expect(page.getByTestId('subscription-updated')).toHaveCount(0);
  await expect(page.getByTestId('subscription-help').first()).toHaveAttribute('title', /compartido entre todas las Sesiones.*suscripción/);
});

test('AC-137: el estado se dice con texto, y una ventana ausente no se pinta', async ({ page }) => {
  await mockApi(page, {
    sessions: board,
    subscriptionUsage: { usage: usage({ five_hour: window(15, 30 * MIN, 'near'), seven_day: null }) },
  });
  await page.goto('/sesiones');

  await expect(meter(page, 'five-hour').getByTestId('meter-state')).toHaveText('Cerca');
  await expect(meter(page, 'seven-day')).toHaveCount(0);
});

test('AC-138: una ventana con reinicio pasado dice que está pendiente de nueva lectura', async ({ page }) => {
  await mockApi(page, {
    sessions: board,
    subscriptionUsage: { usage: usage({ five_hour: window(0, -MIN, 'reset_pending') }) },
  });
  await page.goto('/sesiones');

  const five = meter(page, 'five-hour');
  await expect(five.getByTestId('meter-pending')).toHaveText('Ventana reiniciada, pendiente de nueva lectura');
  await expect(five.getByTestId('meter-used')).toHaveCount(0);
  await expect(five.getByRole('progressbar')).toHaveCount(0);
  await expect(meter(page, 'seven-day').getByTestId('meter-used')).toHaveText('60 %');
});

test('AC-137, AC-140: sin suscripción (usage null) no hay ficha, sí una línea que lo explica, y el resto de fichas siguen', async ({ page }) => {
  await mockApi(page, { sessions: board, subscriptionUsage: { usage: null } });
  await page.goto('/sesiones');

  await expect(page.getByTestId('usage-card')).toHaveCount(6);
  await expect(card(page)).toHaveCount(0);
  const empty = page.getByTestId('subscription-empty');
  await expect(empty).toContainText('Uso de la suscripción: sin datos');
  await empty.getByText('Uso de la suscripción: sin datos').click();
  await expect(empty.getByTestId('subscription-empty-help')).toContainText('statusline.mjs');
});

test('AC-136: un mensaje subscription.usage del WebSocket actualiza el %, y un null retira la ficha', async ({ page }) => {
  const api = await mockApi(page, { sessions: board, subscriptionUsage: { usage: usage() } });
  await page.goto('/sesiones');
  const socket = await api.socket();
  await expect(meter(page, 'five-hour').getByTestId('meter-used')).toHaveText('38 %');

  socket.send(JSON.stringify({ type: 'subscription.usage', usage: usage({ five_hour: window(9, 20 * MIN, 'near') }) }));
  await expect(meter(page, 'five-hour').getByTestId('meter-used')).toHaveText('91 %');
  await expect(meter(page, 'five-hour').getByTestId('meter-state')).toHaveText('Cerca');

  socket.send(JSON.stringify({ type: 'subscription.usage', usage: null }));
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByTestId('subscription-empty')).toBeVisible();
});

test('AC-137: en pantalla estrecha la ficha no desborda', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { sessions: board, subscriptionUsage: { usage: usage() } });
  await page.goto('/sesiones');
  await expect(card(page).first()).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('AC-141: en pantalla ancha, cinco fichas en la primera fila; Coste, Sesión (2 col.) y Semanal (2 col.) en la segunda', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await mockApi(page, { sessions: board, subscriptionUsage: { usage: usage() } });
  await page.goto('/sesiones');
  await expect(card(page).first()).toBeVisible();

  const box = async (loc: import('@playwright/test').Locator) => (await loc.boundingBox())!;
  const kpis = page.getByTestId('usage-card');
  const first = await Promise.all([0, 1, 2, 3, 4].map((i) => box(kpis.nth(i))));
  const cost = await box(page.locator('[data-testid="usage-card"][data-kpi="cost"]'));
  const five = await box(meter(page, 'five-hour'));
  const seven = await box(meter(page, 'seven-day'));

  expect(new Set(first.map((b) => Math.round(b.y))).size).toBe(1);
  expect(cost.y).toBeGreaterThan(first[0].y);
  expect(Math.round(five.y)).toBe(Math.round(cost.y));
  expect(Math.round(seven.y)).toBe(Math.round(cost.y));
  expect(cost.x).toBeLessThan(five.x);
  expect(five.x).toBeLessThan(seven.x);
  expect(Math.abs(five.width - seven.width)).toBeLessThan(1);
  expect(Math.abs(five.width - (2 * cost.width + (first[1].x - first[0].x - first[0].width)))).toBeLessThan(2);
});
