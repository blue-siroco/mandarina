import { parseTestResults, runsTests, testRunsFromEvent } from '../src/domain/test-results.js';

// Salidas reales de cada runner (recortadas), tal como llegan en `tool_response.stdout`.
const VITEST_RED = `
 RUN  v4.0.8 /app

 ✓ test/token-usage.test.ts (6 tests) 5ms
 ❯ test/sum.test.ts (4 tests | 1 failed) 7ms
   ✓ sum > suma positivos 1ms
   × sum > AC-01: suma dos números 4ms
     → expected 3 to be 4 // Object.is equality

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/sum.test.ts > sum > AC-01: suma dos números
AssertionError: expected 3 to be 4 // Object.is equality

- Expected
+ Received

 ❯ test/sum.test.ts:5:17

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 8 passed | 1 skipped (10)
   Start at  10:00:00
   Duration  1.23s (transform 50ms, setup 0ms, collect 80ms, tests 12ms)
`;

const VITEST_GREEN = `
 ✓ test/sum.test.ts (3 tests) 2ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  812ms
`;

const JEST_RED = `
FAIL src/sum.test.js
  sum
    ✕ AC-02: suma dos números (3 ms)
    ✓ suma positivos (1 ms)

  ● sum › AC-02: suma dos números

    expect(received).toBe(expected) // Object.is equality

    Expected: 4
    Received: 3

Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 skipped, 2 passed, 4 total
Snapshots:   0 total
Time:        0.512 s
`;

const NODE_SPEC_RED = `
▶ normalize
  ✔ AC-01: SessionStart se normaliza (0.5ms)
  ✖ AC-25: PostToolUseFailure se normaliza como tool.post (1.2ms)
✖ normalize (2ms)
ℹ tests 5
ℹ suites 1
ℹ pass 3
ℹ fail 1
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 45.6

✖ failing tests:

test at test\\normalize.test.mjs:26:3
✖ AC-25: PostToolUseFailure se normaliza como tool.post (1.2ms)
  SyntaxError: Bad escaped character in JSON at position 83
      at JSON.parse (<anonymous>)
`;

const NODE_TAP_RED = `
TAP version 13
# Subtest: rules
    # Subtest: AC-20: bloquea rm -rf /
    not ok 1 - AC-20: bloquea rm -rf /
      ---
      duration_ms: 1.2
      location: '/app/test/rules.test.mjs:5:3'
      failureType: 'testCodeFailure'
      error: |-
        Expected values to be strictly equal:
        null !== 'dangerous-rm'
      code: 'ERR_ASSERTION'
      ...
    # Subtest: AC-20: permite rm -rf node_modules
    ok 2 - AC-20: permite rm -rf node_modules
      ---
      duration_ms: 0.3
      ...
    1..2
not ok 1 - rules
  ---
  duration_ms: 2.1
  failureType: 'subtestsFailed'
  error: '1 subtest failed'
  ...
1..1
# tests 2
# suites 1
# pass 1
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 30.25
`;

const PLAYWRIGHT_RED = `
Running 6 tests using 2 workers

  ✓  1 [chromium] › e2e/blocks.spec.ts:10:5 › AC-22: muestra los Bloqueos (1.2s)
  ✘  2 [chromium] › e2e/tests.spec.ts:12:3 › Tests › AC-28: muestra el estado (5.0s)

  1) [chromium] › e2e/tests.spec.ts:12:3 › Tests › AC-28: muestra el estado ────────────────────────

    Error: expect(locator).toBeVisible() failed

    Locator: getByTestId('test-status')
    Expected: visible

  1 failed
    [chromium] › e2e/tests.spec.ts:12:3 › Tests › AC-28: muestra el estado ─────────────────────────
  1 flaky
    [chromium] › e2e/usage.spec.ts:8:3 › AC-13: fichas ─────────────────────────────────────────────
  1 skipped
  3 passed (8.1s)
`;

const PLAYWRIGHT_GREEN = `
Running 2 tests using 1 worker

  ✓  1 [chromium] › e2e/events.spec.ts:5:3 › AC-09: lista (0.8s)
  ✓  2 [chromium] › e2e/blocks.spec.ts:10:5 › AC-22: Bloqueos (1.1s)

  2 passed (2.4s)
`;

describe('AC-26: runsTests', () => {
  it.each(['npm test', 'npx vitest run', 'node --test "test/*.test.mjs"', 'npx playwright test', 'npm run e2e', 'npx jest', 'npm run test:unit'])(
    'reconoce %s como un comando de tests',
    (command) => expect(runsTests(command)).toBe(true),
  );

  it.each(['ls -la', 'npm run build', 'cat latest.log', 'git status'])('%s no lanza tests', (command) =>
    expect(runsTests(command)).toBe(false),
  );
});

describe('AC-26: parseTestResults — Vitest', () => {
  it('lee contadores, duración y tests fallidos con su error y su AC', () => {
    expect(parseTestResults(VITEST_RED)).toStrictEqual([
      {
        runner: 'vitest',
        counts: { total: 10, passed: 8, failed: 1, skipped: 1 },
        duration_ms: 1230,
        failures: [
          {
            name: 'sum > AC-01: suma dos números',
            file: 'test/sum.test.ts',
            message: 'AssertionError: expected 3 to be 4 // Object.is equality',
            ac: 'AC-01',
          },
        ],
      },
    ]);
  });

  it('una ejecución en verde no tiene fallidos', () => {
    expect(parseTestResults(VITEST_GREEN)).toStrictEqual([
      { runner: 'vitest', counts: { total: 3, passed: 3, failed: 0, skipped: 0 }, duration_ms: 812, failures: [] },
    ]);
  });

  it('ignora los códigos de color ANSI', () => {
    const colored = VITEST_GREEN.replace('Tests  3 passed', '\u001b[2mTests\u001b[22m  \u001b[1m\u001b[32m3 passed\u001b[39m\u001b[22m');
    expect(parseTestResults(colored)[0]?.counts.passed).toBe(3);
  });

  it('suma los resúmenes de varios paquetes seguidos', () => {
    const [run] = parseTestResults(`${VITEST_GREEN}\n${VITEST_RED}`);
    expect(run?.counts).toStrictEqual({ total: 13, passed: 11, failed: 1, skipped: 1 });
    expect(run?.duration_ms).toBe(2042);
  });
});

describe('AC-26: parseTestResults — Jest', () => {
  it('lee contadores, duración y el test fallido con su fichero', () => {
    expect(parseTestResults(JEST_RED)).toStrictEqual([
      {
        runner: 'jest',
        counts: { total: 4, passed: 2, failed: 1, skipped: 1 },
        duration_ms: 512,
        failures: [
          {
            name: 'sum › AC-02: suma dos números',
            file: 'src/sum.test.js',
            message: 'expect(received).toBe(expected) // Object.is equality',
            ac: 'AC-02',
          },
        ],
      },
    ]);
  });
});

describe('AC-26: parseTestResults — node:test', () => {
  it('lee el reporter spec', () => {
    expect(parseTestResults(NODE_SPEC_RED)).toStrictEqual([
      {
        runner: 'node-test',
        counts: { total: 5, passed: 3, failed: 1, skipped: 1 },
        duration_ms: 45.6,
        failures: [
          {
            name: 'AC-25: PostToolUseFailure se normaliza como tool.post',
            file: 'test\\normalize.test.mjs',
            message: 'SyntaxError: Bad escaped character in JSON at position 83',
            ac: 'AC-25',
          },
        ],
      },
    ]);
  });

  it('lee el reporter TAP y descarta las suites que fallan por sus subtests', () => {
    expect(parseTestResults(NODE_TAP_RED)).toStrictEqual([
      {
        runner: 'node-test',
        counts: { total: 2, passed: 1, failed: 1, skipped: 0 },
        duration_ms: 30.25,
        failures: [
          {
            name: 'AC-20: bloquea rm -rf /',
            file: '/app/test/rules.test.mjs',
            message: 'Expected values to be strictly equal:',
            ac: 'AC-20',
          },
        ],
      },
    ]);
  });
});

describe('AC-26: parseTestResults — Playwright', () => {
  it('lee contadores, duración y los fallidos (no los flaky)', () => {
    expect(parseTestResults(PLAYWRIGHT_RED)).toStrictEqual([
      {
        runner: 'playwright',
        counts: { total: 6, passed: 4, failed: 1, skipped: 1 },
        duration_ms: 8100,
        failures: [
          {
            name: 'Tests › AC-28: muestra el estado',
            file: 'e2e/tests.spec.ts',
            message: 'Error: expect(locator).toBeVisible() failed',
            ac: 'AC-28',
          },
        ],
      },
    ]);
  });

  it('una ejecución en verde', () => {
    expect(parseTestResults(PLAYWRIGHT_GREEN)).toStrictEqual([
      { runner: 'playwright', counts: { total: 2, passed: 2, failed: 0, skipped: 0 }, duration_ms: 2400, failures: [] },
    ]);
  });

  it('una prueba interrumpida cuenta como fallida', () => {
    const [run] = parseTestResults('Running 3 tests using 1 worker\n\n  1 interrupted\n  2 did not run\n');
    expect(run?.counts).toStrictEqual({ total: 3, passed: 0, failed: 1, skipped: 2 });
  });
});

describe('AC-26: parseTestResults — salidas sin resumen', () => {
  it.each([
    ['vacía', ''],
    ['sin tests', 'No test files found, exiting with code 1'],
    ['error de compilación', 'error TS2322: Type string is not assignable to type number.'],
    ['log cualquiera', '3 passed in the queue\nTests are fun'],
  ])('%s no genera resultados', (_name, output) => expect(parseTestResults(output)).toStrictEqual([]));

  it('recorta la lista de fallidos a 20', () => {
    const fails = Array.from({ length: 25 }, (_, i) => ` FAIL  test/a.test.ts > caso ${i}\nError: x`).join('\n');
    const [run] = parseTestResults(`${fails}\n      Tests  25 failed (25)\n`);
    expect(run?.failures).toHaveLength(20);
    expect(run?.counts.failed).toBe(25);
  });
});

describe('AC-26: testRunsFromEvent', () => {
  const event = (payload: Record<string, unknown>, overrides: Record<string, unknown> = {}) => ({
    id: 'e1',
    project: 'demo',
    directory: 'C:\\Codev\\demo',
    session_id: 's1',
    subagent_id: null,
    event_type: 'tool.post',
    tool_name: 'Bash',
    occurred_at: '2026-09-25T10:00:00.000Z',
    payload,
    ...overrides,
  });

  it('una ejecución de Vitest en verde es de tests unitarios', () => {
    const runs = testRunsFromEvent(event({ tool_input: { command: 'npx vitest run' }, tool_response: { stdout: VITEST_GREEN, stderr: '' } }));
    expect(runs).toStrictEqual([
      {
        id: 'e1:vitest',
        event_id: 'e1',
        project: 'demo',
        directory: 'C:\\Codev\\demo',
        session_id: 's1',
        subagent_id: null,
        kind: 'unit',
        runner: 'vitest',
        command: 'npx vitest run',
        status: 'passed',
        counts: { total: 3, passed: 3, failed: 0, skipped: 0 },
        duration_ms: 812,
        finished_at: '2026-09-25T10:00:00.000Z',
        failures: [],
      },
    ]);
  });

  it('lee la salida de un PostToolUseFailure (`error`) y la marca en rojo', () => {
    const [run] = testRunsFromEvent(event({ tool_input: { command: 'npm test' }, error: `Exit code 1\n${VITEST_RED}` }));
    expect(run).toMatchObject({ status: 'failed', counts: { failed: 1 } });
  });

  it('Playwright es E2E, y cualquier runner es E2E si el comando nombra e2e', () => {
    const pw = testRunsFromEvent(event({ tool_input: { command: 'npx playwright test' }, tool_response: { stdout: PLAYWRIGHT_GREEN } }));
    const vitestE2e = testRunsFromEvent(event({ tool_input: { command: 'npm run e2e' }, tool_response: { stdout: VITEST_GREEN } }));
    expect(pw[0]?.kind).toBe('e2e');
    expect(vitestE2e[0]?.kind).toBe('e2e');
  });

  it('una salida con dos runners genera una Ejecución de cada uno', () => {
    const runs = testRunsFromEvent(
      event({ tool_input: { command: 'npx vitest run && npx playwright test' }, tool_response: { stdout: `${VITEST_GREEN}\n${PLAYWRIGHT_RED}` } }),
    );
    expect(runs.map((r) => [r.id, r.kind, r.status])).toStrictEqual([
      ['e1:vitest', 'unit', 'passed'],
      ['e1:playwright', 'e2e', 'failed'],
    ]);
  });

  it.each([
    ['otra herramienta', event({ tool_input: { command: 'npm test' }, tool_response: { stdout: VITEST_GREEN } }, { tool_name: 'Read' })],
    ['un tool.pre', event({ tool_input: { command: 'npm test' } }, { event_type: 'tool.pre' })],
    ['un comando que no lanza tests', event({ tool_input: { command: 'cat vitest.log' }, tool_response: { stdout: 'x' } })],
    ['un cat del resumen', event({ tool_input: { command: 'cat out.txt' }, tool_response: { stdout: VITEST_GREEN } })],
    ['un payload sin forma', event({ tool_input: 'npm test', tool_response: 42 })],
  ])('%s no es una Ejecución de tests', (_name, e) => expect(testRunsFromEvent(e)).toStrictEqual([]));
});
