import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const WEEK_AGO = '2026-09-19T00:00:00.000Z';
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const VITEST_GREEN = ' Test Files  1 passed (1)\n      Tests  3 passed (3)\n   Duration  812ms\n';
const VITEST_RED =
  ' FAIL  test/sum.test.ts > sum > AC-01: suma\nAssertionError: expected 3 to be 4\n\n      Tests  1 failed | 2 passed (3)\n   Duration  1.2s\n';
const PLAYWRIGHT_GREEN = 'Running 2 tests using 1 worker\n\n  2 passed (2.4s)\n';

let app: FastifyInstance;
let receivedAt: Date;

beforeEach(async () => {
  receivedAt = NOW;
  app = await buildApp({ databaseFile: ':memory:', clock: { now: () => receivedAt } });
  await app.ready();
});

afterEach(async () => app.close());

interface Bash {
  session?: string;
  project?: string;
  subagent?: string | null;
  tool?: string;
  eventType?: string;
  nativeEventType?: string;
  payload: Record<string, unknown>;
}

async function ingest(at: Date, { session = 's1', project = 'demo', subagent = null, tool = 'Bash', eventType = 'tool.post', nativeEventType = 'PostToolUse', payload }: Bash) {
  receivedAt = at;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    payload: {
      schema_version: 1,
      harness: 'claude-code',
      project,
      directory: `/code/${project}`,
      session_id: session,
      subagent_id: subagent,
      event_type: eventType,
      native_event_type: nativeEventType,
      tool_name: tool,
      occurred_at: at.toISOString(),
      transcript_path: null,
      payload,
    },
  });
  expect(response.statusCode).toBe(202);
  receivedAt = NOW;
  return (response.json() as { id: string }).id;
}

const bash = (command: string, stdout: string) => ({ tool_input: { command }, tool_response: { stdout, stderr: '' } });

async function testRuns(query = `?since=${WEEK_AGO}`) {
  const response = await app.inject({ method: 'GET', url: `/api/v1/test-runs${query}` });
  return { status: response.statusCode, body: response.json() as { items: Array<Record<string, unknown>>; facets: { projects: string[] } } };
}

describe('AC-27: GET /api/v1/test-runs', () => {
  it('devuelve las Ejecuciones de tests, la más reciente primero', async () => {
    const green = await ingest(minutesAgo(30), { payload: bash('npx vitest run', VITEST_GREEN) });
    await ingest(minutesAgo(20), { payload: bash('ls', 'nada') });
    const red = await ingest(minutesAgo(10), {
      subagent: 'agent-1',
      nativeEventType: 'PostToolUseFailure',
      payload: { tool_input: { command: 'npm test' }, error: `Exit code 1\n${VITEST_RED}` },
    });

    const { status, body } = await testRuns();

    expect(status).toBe(200);
    expect(body.items.map((r) => r.id)).toStrictEqual([`${red}:vitest`, `${green}:vitest`]);
    expect(body.items[0]).toStrictEqual({
      id: `${red}:vitest`,
      event_id: red,
      project: 'demo',
      directory: '/code/demo',
      session_id: 's1',
      subagent_id: 'agent-1',
      kind: 'unit',
      runner: 'vitest',
      command: 'npm test',
      status: 'failed',
      counts: { total: 3, passed: 2, failed: 1, skipped: 0 },
      duration_ms: 1200,
      finished_at: minutesAgo(10).toISOString(),
      failures: [{ name: 'sum > AC-01: suma', file: 'test/sum.test.ts', message: 'AssertionError: expected 3 to be 4', ac: 'AC-01' }],
    });
  });

  it('solo cuenta los tool.post de Bash recibidos desde `since`', async () => {
    await ingest(new Date('2026-09-10T10:00:00.000Z'), { payload: bash('npm test', VITEST_GREEN) });
    await ingest(minutesAgo(5), { eventType: 'tool.pre', payload: bash('npm test', VITEST_GREEN) });
    await ingest(minutesAgo(4), { tool: 'Read', payload: bash('npm test', VITEST_GREEN) });

    expect((await testRuns()).body.items).toStrictEqual([]);
  });

  it('filtra por Proyecto y Tipo de tests; las facetas no dependen del filtro', async () => {
    await ingest(minutesAgo(30), { project: 'demo', payload: bash('npx vitest run', VITEST_GREEN) });
    await ingest(minutesAgo(20), { project: 'mandarina', payload: bash('npx playwright test', PLAYWRIGHT_GREEN) });
    await ingest(minutesAgo(10), { project: 'mandarina', payload: bash('npm test', VITEST_GREEN) });

    const e2e = await testRuns(`?since=${WEEK_AGO}&kind=e2e`);
    expect(e2e.body.items.map((r) => [r.project, r.kind, r.runner])).toStrictEqual([['mandarina', 'e2e', 'playwright']]);

    const demo = await testRuns(`?since=${WEEK_AGO}&project=demo`);
    expect(demo.body.items.map((r) => r.project)).toStrictEqual(['demo']);
    expect(demo.body.facets.projects).toStrictEqual(['demo', 'mandarina']);
  });

  it('enmascara los secretos del comando', async () => {
    await ingest(minutesAgo(1), { payload: bash('API_KEY=supersecreto123 npm test', VITEST_GREEN) });
    expect((await testRuns()).body.items[0]?.command).toBe('API_KEY=[REDACTED_PASSWORD] npm test');
  });

  it.each(['', '?since=ayer', `?since=${WEEK_AGO}&kind=integration`, `?since=${WEEK_AGO}&project=`, `?since=${WEEK_AGO}&extra=1`])(
    '%s → 400',
    async (query) => expect((await testRuns(query)).status).toBe(400),
  );
});
