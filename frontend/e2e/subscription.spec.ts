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
const card = (page: import('@playwright/test').Page) => page.getByTestId('subscription-card');
const meter = (page: import('@playwright/test').Page, key: 'five-hour' | 'seven-day') =>
  page.locator(`[data-testid="subscription-meter"][data-window="${key}"]`);

test('AC-137, AC-138: con suscripción muestra los dos medidores con lo que queda y el reinicio', async ({ page }) => {
  await mockApi(page, { sessions: board, subscriptionUsage: { usage: usage() } });
  await page.goto('/sesiones');

  await expect(card(page)).toBeVisible();
  const five = meter(page, 'five-hour');
  await expect(five.getByRole('heading')).toHaveText('Sesión (5 h)');
  await expect(five.getByTestId('meter-remaining')).toHaveText('62 %');
  await expect(five.getByTestId('meter-state')).toHaveText('Holgado');
  await expect(five.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '62');
  await expect(five.getByTestId('meter-reset')).toHaveText(/^se reinicia a las \d{2}:\d{2} · en 1 h (11|12) min$/);

  const seven = meter(page, 'seven-day');
  await expect(seven.getByRole('heading')).toHaveText('Semanal (7 d)');
  await expect(seven.getByTestId('meter-remaining')).toHaveText('40 %');
  await expect(seven.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  await expect(seven.getByTestId('meter-reset')).toHaveText(/ · en 3 d 4 h| · en 3 d 5 h/);

  await expect(page.getByTestId('subscription-updated')).toHaveText('Actualizado hace 5 min');
  await expect(page.getByTestId('subscription-help')).toHaveAttribute('title', /compartido entre todas las Sesiones.*suscripción/);
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
  await expect(five.getByTestId('meter-remaining')).toHaveCount(0);
  await expect(five.getByRole('progressbar')).toHaveCount(0);
  await expect(meter(page, 'seven-day').getByTestId('meter-remaining')).toHaveText('40 %');
});

test('AC-137: sin suscripción (usage null) no hay ficha, pero el resto de fichas siguen', async ({ page }) => {
  await mockApi(page, { sessions: board, subscriptionUsage: { usage: null } });
  await page.goto('/sesiones');

  await expect(page.getByTestId('usage-card')).toHaveCount(6);
  await expect(card(page)).toHaveCount(0);
});

test('AC-136: un mensaje subscription.usage del WebSocket actualiza el %, y un null retira la ficha', async ({ page }) => {
  const api = await mockApi(page, { sessions: board, subscriptionUsage: { usage: usage() } });
  await page.goto('/sesiones');
  const socket = await api.socket();
  await expect(meter(page, 'five-hour').getByTestId('meter-remaining')).toHaveText('62 %');

  socket.send(JSON.stringify({ type: 'subscription.usage', usage: usage({ five_hour: window(9, 20 * MIN, 'near') }) }));
  await expect(meter(page, 'five-hour').getByTestId('meter-remaining')).toHaveText('9 %');
  await expect(meter(page, 'five-hour').getByTestId('meter-state')).toHaveText('Cerca');

  socket.send(JSON.stringify({ type: 'subscription.usage', usage: null }));
  await expect(card(page)).toHaveCount(0);
});

test('AC-137: en pantalla estrecha la ficha no desborda', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { sessions: board, subscriptionUsage: { usage: usage() } });
  await page.goto('/sesiones');
  await expect(card(page)).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
