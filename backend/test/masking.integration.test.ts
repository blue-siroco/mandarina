import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

let app: FastifyInstance;
let home: string;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'mandarina-masking-'));
  app = await buildApp({ databaseFile: ':memory:', claudeHomeMount: home, clock: { now: () => NOW } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(home, { recursive: true, force: true });
});

async function ingest(eventType: string, at: Date, options: { subagent?: string; payload?: Record<string, unknown>; project?: string } = {}) {
  await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    payload: {
      schema_version: 1,
      harness: 'claude-code',
      project: options.project ?? 'demo',
      directory: '/code/demo',
      session_id: 's1',
      subagent_id: options.subagent ?? null,
      event_type: eventType,
      native_event_type: 'X',
      occurred_at: at.toISOString(),
      transcript_path: '/home/dev/.claude/projects/demo/s1.jsonl',
      payload: options.payload ?? {},
    },
  });
}

function writeTranscript(relative: string, lines: object[]) {
  const file = join(home, 'projects', 'demo', relative);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));
}

describe('AC-62: lo que el servidor lee del Transcript sale enmascarado', () => {
  it('la Tarea, la respuesta y las herramientas de un Subagente no llevan secretos ni datos personales', async () => {
    await ingest('prompt.submitted', minutesAgo(10));
    await ingest('subagent.started', minutesAgo(9), { subagent: 'agent-a1', payload: { agent_type: 'Explore' } });
    await ingest('subagent.stopped', minutesAgo(8), { subagent: 'agent-a1', payload: { agent_type: 'Explore' } });
    writeTranscript('s1.jsonl', []);
    writeTranscript('s1/subagents/agent-a1.meta.json', [{ agentType: 'Explore', description: 'Buscar la clave' }]);
    writeTranscript('s1/subagents/agent-a1.jsonl', [
      { type: 'user', message: { content: 'Busca la clave sk-ant-api03-abcdefghijklmnop de ana@example.com' } },
      {
        type: 'assistant',
        timestamp: minutesAgo(8.5).toISOString(),
        message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'echo GITHUB_TOKEN=ghp_abcdefghijklmnopqrstu' } }] },
      },
      { type: 'assistant', timestamp: minutesAgo(8.2).toISOString(), message: { content: [{ type: 'text', text: 'La clave es Bearer abcdefgh12345678 y el teléfono +34612345678.' }] } },
    ]);

    const detail = (await app.inject({ method: 'GET', url: '/api/v1/sessions/s1' })).json<{ subagents: Array<Record<string, any>> }>();
    const text = JSON.stringify(detail.subagents);

    expect(text).not.toContain('sk-ant-api03');
    expect(text).not.toContain('ana@example.com');
    expect(text).not.toContain('ghp_');
    expect(text).not.toContain('abcdefgh12345678');
    expect(text).not.toContain('+34612345678');
    expect(detail.subagents[0]?.task.prompt).toBe('Busca la clave [REDACTED_API_KEY] de [REDACTED_EMAIL]');
    expect(detail.subagents[0]?.result).toBe('La clave es Bearer [REDACTED_TOKEN] y el teléfono [REDACTED_PHONE].');
  });
});
