// Lectura de Ejecuciones de tests a partir de la salida de un comando `Bash`
// (AC-26, ADR-0007). Es una heurística sobre el texto que imprime cada runner:
// los tests fijan con salidas reales el formato que se espera de cada uno.
import { summarizeToolInput } from './tool-summary.js';

export type TestRunner = 'vitest' | 'jest' | 'node-test' | 'playwright';
export type TestKind = 'unit' | 'e2e';

export interface TestCounts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface TestFailure {
  name: string;
  file: string | null;
  /** Primera línea del error. */
  message: string | null;
  /** `AC-*` que cita el nombre del test. */
  ac: string | null;
}

export interface TestResult {
  runner: TestRunner;
  counts: TestCounts;
  duration_ms: number | null;
  failures: TestFailure[];
}

export interface TestRun extends TestResult {
  id: string;
  event_id: string;
  project: string;
  directory: string;
  session_id: string;
  subagent_id: string | null;
  kind: TestKind;
  command: string | null;
  status: 'passed' | 'failed';
  finished_at: string;
}

export const MAX_FAILURES = 20;
const MAX_MESSAGE_LENGTH = 200;

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const TEST_COMMAND = /\b(tests?|spec|e2e|vitest|jest|playwright)\b/i;
const AC_ID = /\bAC-\d+[a-z]?\b/;

/** El comando lanza tests: evita leer resúmenes de un `cat` o un `grep` cualquiera. */
export const runsTests = (command: string): boolean => TEST_COMMAND.test(command);

const UNIT_FACTOR: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

function toMs(value: string, unit: string): number {
  const factor = UNIT_FACTOR[unit] ?? 1;
  return factor === 1 ? Number(value) : Math.round(Number(value) * factor);
}

function firstLine(text: string | undefined): string | null {
  const line = text?.trim();
  if (!line) return null;
  return line.length > MAX_MESSAGE_LENGTH ? `${line.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : line;
}

/** Primera línea no vacía tras `index` que no sea otra cabecera. */
function nextMessage(lines: string[], index: number, isHeader: (line: string) => boolean): string | null {
  for (let i = index + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (isHeader(line)) return null;
    if (line.trim() !== '') return firstLine(line);
  }
  return null;
}

function failure(name: string, file: string | null, message: string | null): TestFailure {
  return { name, file, message, ac: AC_ID.exec(name)?.[0] ?? null };
}

function dedupe(failures: TestFailure[]): TestFailure[] {
  const seen = new Set<string>();
  return failures.filter((f) => {
    const key = `${f.file}\u0000${f.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Cifras de "1 failed | 3 passed" o "1 failed, 3 passed". */
function countWords(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [, n, word] of text.matchAll(/(\d+) ([a-z]+(?: not run)?)/g)) counts[word!] = (counts[word!] ?? 0) + Number(n);
  return counts;
}

const sumDurations = (durations: number[]) => (durations.length === 0 ? null : durations.reduce((a, b) => a + b, 0));

function vitest(lines: string[]): TestResult | null {
  const counts: TestCounts = { total: 0, passed: 0, failed: 0, skipped: 0 };
  let found = false;
  const durations: number[] = [];
  for (const line of lines) {
    const summary = /^\s*Tests\s+(\d+ [a-z].*?)\s*\((\d+)\)\s*$/.exec(line);
    if (summary) {
      found = true;
      const words = countWords(summary[1]!);
      counts.total += Number(summary[2]);
      counts.passed += words.passed ?? 0;
      counts.failed += words.failed ?? 0;
      counts.skipped += (words.skipped ?? 0) + (words.todo ?? 0);
    }
    const duration = /^\s*Duration\s+([\d.]+)(ms|s|m)\b/.exec(line);
    if (duration) durations.push(toMs(duration[1]!, duration[2]!));
  }
  if (!found) return null;

  const header = /^\s*FAIL\s+(\S+)\s*(.*)$/;
  const failures: TestFailure[] = [];
  lines.forEach((line, i) => {
    const match = header.exec(line);
    if (!match) return;
    const file = match[1]!;
    const rest = match[2]!.trim();
    const name = rest.startsWith('>') ? rest.slice(1).trim() : file;
    failures.push(failure(name, file, nextMessage(lines, i, (l) => header.test(l))));
  });
  return { runner: 'vitest', counts, duration_ms: sumDurations(durations), failures: dedupe(failures) };
}

function jest(lines: string[]): TestResult | null {
  const counts: TestCounts = { total: 0, passed: 0, failed: 0, skipped: 0 };
  let found = false;
  const durations: number[] = [];
  for (const line of lines) {
    const summary = /^\s*Tests:\s+(.*?)(\d+) total\s*$/.exec(line);
    if (summary) {
      found = true;
      const words = countWords(summary[1]!);
      counts.total += Number(summary[2]);
      counts.passed += words.passed ?? 0;
      counts.failed += words.failed ?? 0;
      counts.skipped += (words.skipped ?? 0) + (words.todo ?? 0) + (words.pending ?? 0);
    }
    const time = /^\s*Time:\s+([\d.]+)\s*(ms|s|m)\b/.exec(line);
    if (time) durations.push(toMs(time[1]!, time[2]!));
  }
  if (!found) return null;

  const bullet = /^\s*● (.+?)\s*$/;
  const failures: TestFailure[] = [];
  let file: string | null = null;
  lines.forEach((line, i) => {
    const suite = /^\s*FAIL\s+(\S+)/.exec(line);
    if (suite) file = suite[1]!;
    const match = bullet.exec(line);
    if (!match || match[1]!.startsWith('Console')) return;
    failures.push(failure(match[1]!, file, nextMessage(lines, i, (l) => bullet.test(l))));
  });
  return { runner: 'jest', counts, duration_ms: sumDurations(durations), failures: dedupe(failures) };
}

function nodeTest(lines: string[]): TestResult | null {
  const stats: Record<string, number> = {};
  let found = false;
  for (const line of lines) {
    const match = /^(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo|duration_ms) ([\d.]+)\s*$/.exec(line);
    if (!match) continue;
    if (match[1] === 'tests') found = true;
    stats[match[1]!] = (stats[match[1]!] ?? 0) + Number(match[2]);
  }
  if (!found || stats.pass === undefined) return null;
  const counts: TestCounts = {
    total: stats.tests ?? 0,
    passed: stats.pass,
    failed: (stats.fail ?? 0) + (stats.cancelled ?? 0),
    skipped: (stats.skipped ?? 0) + (stats.todo ?? 0),
  };
  return { runner: 'node-test', counts, duration_ms: stats.duration_ms ?? null, failures: [...specFailures(lines), ...tapFailures(lines)] };
}

/** Sección "✖ failing tests:" del reporter spec: solo trae los tests hoja. */
function specFailures(lines: string[]): TestFailure[] {
  const start = lines.findIndex((l) => /^✖ failing tests:/.test(l));
  if (start === -1) return [];
  const failures: TestFailure[] = [];
  let file: string | null = null;
  const title = /^✖ (.+?) \([\d.]+m?s\)\s*$/;
  for (let i = start + 1; i < lines.length; i++) {
    const location = /^test at (.+?):\d+:\d+\s*$/.exec(lines[i]!);
    if (location) file = location[1]!;
    const match = title.exec(lines[i]!);
    if (match) failures.push(failure(match[1]!, file, nextMessage(lines, i, (l) => title.test(l) || l.startsWith('test at '))));
  }
  return failures;
}

/** `not ok` de TAP, sin las suites que solo fallan porque falla un subtest. */
function tapFailures(lines: string[]): TestFailure[] {
  const failures: TestFailure[] = [];
  lines.forEach((line, i) => {
    const match = /^\s*not ok \d+ - (.+?)\s*$/.exec(line);
    if (!match) return;
    const block: string[] = [];
    for (let j = i + 1; j < lines.length && !/^\s*\.\.\.\s*$/.test(lines[j]!); j++) block.push(lines[j]!);
    const field = (name: string) => block.findIndex((l) => new RegExp(`^\\s*${name}:`).test(l));
    const typeLine = block[field('failureType')];
    if (typeLine?.includes('subtestsFailed')) return;
    const location = /location: '(.+?):\d+:\d+'/.exec(block[field('location')] ?? '');
    const errorAt = field('error');
    let message: string | null = null;
    if (errorAt !== -1) {
      const inline = /error: (?:'(.*)'|"(.*)"|(?![|>])(.+))\s*$/.exec(block[errorAt]!);
      message = inline ? firstLine(inline[1] ?? inline[2] ?? inline[3]) : firstLine(block[errorAt + 1]);
    }
    failures.push(failure(match[1]!, location?.[1] ?? null, message));
  });
  return failures;
}

const PLAYWRIGHT_SUMMARY = /^\s*(\d+) (passed|failed|flaky|skipped|interrupted|did not run)(?: \(([\d.]+)(ms|s|m|h)\))?\s*$/;
// "[chromium] › e2e/a.spec.ts:10:5 › Suite › título ─────".
const PLAYWRIGHT_TEST = /^\s*(?:\d+\) )?(?:\[[^\]]+\] › )?([^\s›]+?):\d+:\d+ › (.+?)\s*─*\s*$/;

function playwright(lines: string[]): TestResult | null {
  const counts: TestCounts = { total: 0, passed: 0, failed: 0, skipped: 0 };
  let found = false;
  let duration: number | null = null;
  let section: string | null = null;
  const failed: Array<{ file: string; name: string }> = [];
  for (const line of lines) {
    const summary = PLAYWRIGHT_SUMMARY.exec(line);
    if (summary) {
      found = true;
      section = summary[2]!;
      const n = Number(summary[1]);
      counts.total += n;
      if (section === 'passed' || section === 'flaky') counts.passed += n;
      else if (section === 'failed' || section === 'interrupted') counts.failed += n;
      else counts.skipped += n;
      if (summary[3]) duration = toMs(summary[3], summary[4]!);
      continue;
    }
    const test = section === 'failed' || section === 'interrupted' ? PLAYWRIGHT_TEST.exec(line) : null;
    if (test) failed.push({ file: test[1]!, name: test[2]! });
  }
  if (!found) return null;

  // El error de cada test está en su bloque numerado "1) … ───".
  const failures = failed.map(({ file, name }) => {
    const at = lines.findIndex((l) => /^\s*\d+\) /.test(l) && PLAYWRIGHT_TEST.exec(l)?.[2] === name);
    const message = at === -1 ? null : nextMessage(lines, at, (l) => /^\s*\d+\) /.test(l) || PLAYWRIGHT_SUMMARY.test(l));
    return failure(name, file, message);
  });
  return { runner: 'playwright', counts, duration_ms: duration, failures: dedupe(failures) };
}

/** Resultados de cada runner reconocido en la salida; vacío si no hay resumen. */
export function parseTestResults(output: string, { playwrightHint = false } = {}): TestResult[] {
  const lines = output.replace(ANSI, '').split(/\r?\n/);
  // Las líneas "3 passed (2.4s)" son demasiado genéricas: solo cuentan con una
  // señal de que corrió Playwright.
  const ranPlaywright = playwrightHint || lines.some((l) => /^Running \d+ tests? using \d+ workers?/.test(l.trim()));
  const results = [vitest(lines), jest(lines), nodeTest(lines), ranPlaywright ? playwright(lines) : null];
  return results
    .filter((r): r is TestResult => r !== null)
    .map((r) => ({ ...r, failures: r.failures.slice(0, MAX_FAILURES) }));
}

/** Lo mínimo de un Evento para leer una Ejecución de tests. */
export interface TestEvent {
  id: string;
  project: string;
  directory: string;
  session_id: string;
  subagent_id: string | null;
  event_type: string;
  tool_name: string | null;
  occurred_at: string;
  payload: Record<string, unknown>;
}

function outputOf(payload: Record<string, unknown>): string {
  const parts: unknown[] = [payload.error];
  const response = payload.tool_response;
  if (typeof response === 'string') parts.push(response);
  else if (response && typeof response === 'object') {
    const fields = response as Record<string, unknown>;
    parts.push(fields.stdout, fields.stderr);
  }
  return parts.filter((p): p is string => typeof p === 'string').join('\n');
}

/** Ejecuciones de tests de un `tool.post` de `Bash` (AC-26); vacío si no lanzó tests. */
export function testRunsFromEvent(event: TestEvent): TestRun[] {
  if (event.event_type !== 'tool.post' || event.tool_name !== 'Bash') return [];
  const input = event.payload.tool_input;
  const command = input && typeof input === 'object' ? (input as Record<string, unknown>).command : undefined;
  if (typeof command !== 'string' || !runsTests(command)) return [];

  const namesE2e = /\be2e\b/i.test(command);
  return parseTestResults(outputOf(event.payload), { playwrightHint: /\bplaywright\b/i.test(command) }).map((result) => ({
    id: `${event.id}:${result.runner}`,
    event_id: event.id,
    project: event.project,
    directory: event.directory,
    session_id: event.session_id,
    subagent_id: event.subagent_id,
    kind: result.runner === 'playwright' || namesE2e ? 'e2e' : 'unit',
    runner: result.runner,
    command: summarizeToolInput('Bash', event.payload),
    status: result.counts.failed > 0 ? 'failed' : 'passed',
    counts: result.counts,
    duration_ms: result.duration_ms,
    finished_at: event.occurred_at,
    failures: result.failures,
  }));
}
