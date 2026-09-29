// Textos de la pantalla de tests (spec/design.md §6.4b).
import { formatDuration } from '../../shared/format';
import { TestKind, TestRun, TestRunner } from '../models/test-run';

const seconds = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

export const KIND_LABELS: Record<TestKind, string> = { unit: 'Unitarios', e2e: 'E2E' };

const RUNNER_LABELS: Record<TestRunner, string> = {
  vitest: 'Vitest',
  jest: 'Jest',
  'node-test': 'node:test',
  playwright: 'Playwright',
};

export const runnerLabel = (runner: TestRunner) => RUNNER_LABELS[runner];

export type SuiteStatus = TestRun['status'] | 'none';

/** El resultado siempre se dice con texto, no solo con color (spec/design.md §7). */
export const STATUS_LABELS: Record<SuiteStatus, string> = { passed: 'Pasan', failed: 'Fallan', none: 'Sin datos' };

/** Los tests duran segundos: la décima importa más que en las Sesiones. */
export function formatTestDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${seconds.format(ms / 1000)} s`;
  return formatDuration(ms);
}
