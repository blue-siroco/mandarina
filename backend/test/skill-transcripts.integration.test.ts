import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const WEEK_AGO = '2026-09-18T12:00:00.000Z';
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const at = (m: number) => minutesAgo(m).toISOString();

let app: FastifyInstance;
let home: string;
let receivedAt: Date;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'mandarina-skills-'));
  receivedAt = NOW;
  app = await buildApp({ databaseFile: ':memory:', claudeHomeMount: home, clock: { now: () => receivedAt } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(home, { recursive: true, force: true });
});

async function ingest(eventType: string, when: Date, options: { subagent?: string | null; tool?: string | null; payload?: Record<string, unknown> } = {}) {
  receivedAt = when;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    payload: {
      schema_version: 1,
      harness: 'claude-code',
      project: 'demo',
      directory: '/code/demo',
      session_id: 's1',
      subagent_id: options.subagent ?? null,
      event_type: eventType,
      native_event_type: 'X',
      tool_name: options.tool ?? null,
      occurred_at: when.toISOString(),
      transcript_path: '/home/dev/.claude/projects/demo/s1.jsonl',
      payload: options.payload ?? {},
    },
  });
  expect(response.statusCode).toBe(202);
  receivedAt = NOW;
}

function writeTranscript(relative: string, lines: object[]) {
  const file = join(home, 'projects', 'demo', relative);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));
  utimesSync(file, minutesAgo(30), minutesAgo(30));
}

const skillUse = (id: string, skill: string, minutes: number) => ({
  type: 'assistant',
  timestamp: at(minutes),
  message: { content: [{ type: 'tool_use', id, name: 'Skill', input: { skill } }] },
});
const skillResult = (id: string, isError = false) => ({
  type: 'user',
  timestamp: at(0),
  message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: isError ? 'Unknown skill' : 'Launching skill' }] },
});

describe('AC-29, AC-30: skills de los Transcripts', () => {
  it('añade las del agente y de sus Subagentes que el hook no envió, sin duplicar las que sí', async () => {
    // Transcript del agente principal: una que llegó por el hook (t1) y otra que no (t2).
    writeTranscript('s1.jsonl', [skillUse('t1', 'grilling', 29), skillResult('t1'), skillUse('t2', 'domain-modeling', 28), skillResult('t2')]);
    // Transcript de un Subagente sin hook activo: sus skills solo constan aquí.
    writeTranscript('s1/subagents/agent-a1.jsonl', [skillUse('t3', 'tdd', 20), skillResult('t3'), skillUse('t4', 'nope', 19), skillResult('t4', true)]);
    writeTranscript('s1/subagents/agent-a1.meta.json', [{ agentType: 'ui-builder', description: 'Construir la tabla' }]);

    await ingest('prompt.submitted', minutesAgo(30), { payload: { prompt: 'hola' } });
    await ingest('tool.pre', minutesAgo(29), { tool: 'Skill', payload: { tool_input: { skill: 'grilling' }, tool_use_id: 't1' } });
    await ingest('subagent.started', minutesAgo(21), { subagent: 'a1', payload: { agent_type: 'ui-builder' } });
    await ingest('subagent.stopped', minutesAgo(15), { subagent: 'a1', payload: { agent_type: 'ui-builder' } });
    await ingest('turn.ended', minutesAgo(10));

    const response = await app.inject({ method: 'GET', url: `/api/v1/skill-invocations?since=${WEEK_AGO}` });
    const body = response.json() as { items: Array<Record<string, unknown>>; stats: Array<Record<string, unknown>> };

    expect(body.items.map((i) => [i.skill, i.invoker, i.status, i.event_id === null])).toStrictEqual([
      ['nope', 'subagent', 'failed', true],
      ['tdd', 'subagent', 'finished', true],
      ['domain-modeling', 'agent', 'finished', true],
      ['grilling', 'agent', 'finished', false],
    ]);
    expect(body.items[1]).toMatchObject({ subagent_id: 'a1', subagent_type: 'ui-builder', turn: 1, ended_at: at(15), duration_ms: 5 * 60_000 });
    expect(body.stats.find((s) => s.skill === 'tdd')).toMatchObject({ by_invoker: { agent: 0, subagent: 1, user: 0 } });
  });

  it('solo cuenta las del periodo y filtra por Sesión', async () => {
    writeTranscript('s1.jsonl', [skillUse('t1', 'viejo', 60 * 24 * 8), skillUse('t2', 'nuevo', 5)]);
    await ingest('prompt.submitted', minutesAgo(6), { payload: { prompt: 'hola' } });

    const week = await app.inject({ method: 'GET', url: `/api/v1/skill-invocations?since=${WEEK_AGO}&session_id=s1` });
    expect((week.json() as { items: Array<{ skill: string }> }).items.map((i) => i.skill)).toStrictEqual(['nuevo']);
  });
});
