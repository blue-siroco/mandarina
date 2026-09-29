import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { denyDecision, resolveProject, resolveUrl, toEvent } from '../lib/normalize.mjs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const now = new Date('2026-09-25T10:00:00.000Z');
const env = { MANDARINA_PROJECT: 'demo' };

// AC-01
const mapping = [
  ['SessionStart', 'session.started'],
  ['UserPromptSubmit', 'prompt.submitted'],
  ['PreToolUse', 'tool.pre'],
  ['PostToolUse', 'tool.post'],
  // AC-25: una herramienta que falla también cierra su invocación (ADR-0007).
  ['PostToolUseFailure', 'tool.post'],
  ['SubagentStart', 'subagent.started'],
  ['SubagentStop', 'subagent.stopped'],
  ['Stop', 'turn.ended'],
  ['SessionEnd', 'session.ended'],
];

for (const [hook, eventType] of mapping) {
  test(`${hook === 'PostToolUseFailure' ? 'AC-25' : 'AC-01'}: ${hook} se normaliza como ${eventType}`, () => {
    const native = fixture(hook);
    const event = toEvent(native, { env, now });
    assert.equal(event.event_type, eventType);
    assert.equal(event.native_event_type, hook);
    assert.equal(event.schema_version, 1);
    assert.equal(event.harness, 'claude-code');
    assert.equal(event.project, 'demo');
    assert.equal(event.directory, 'C:\\Codev\\demo');
    assert.equal(event.session_id, native.session_id);
    assert.equal(event.transcript_path, native.transcript_path);
    assert.equal(event.occurred_at, '2026-09-25T10:00:00.000Z');
    assert.deepEqual(event.payload, native);
  });
}

test('AC-01: tool_name se extrae en los hooks de herramienta y es null en el resto', () => {
  assert.equal(toEvent(fixture('PreToolUse'), { env, now }).tool_name, 'Bash');
  assert.equal(toEvent(fixture('UserPromptSubmit'), { env, now }).tool_name, null);
});

test('AC-01: subagent_id identifica al Subagente y es null en la Sesión principal', () => {
  assert.equal(toEvent(fixture('PreToolUse-subagent'), { env, now }).subagent_id, 'agent-9a8b7c');
  assert.equal(toEvent(fixture('SubagentStop'), { env, now }).subagent_id, 'agent-9a8b7c');
  assert.equal(toEvent(fixture('PreToolUse'), { env, now }).subagent_id, null);
});

test('AC-01: un hook no capturado no produce Evento', () => {
  assert.equal(toEvent({ ...fixture('Stop'), hook_event_name: 'Notification' }, { env, now }), null);
});

test('AC-03: MANDARINA_PROJECT tiene prioridad', () => {
  assert.equal(resolveProject({ MANDARINA_PROJECT: 'x', CLAUDE_PROJECT_DIR: '/a/b' }, '/c/d'), 'x');
});

test('AC-03: sin MANDARINA_PROJECT se usa la carpeta de CLAUDE_PROJECT_DIR', () => {
  assert.equal(resolveProject({ CLAUDE_PROJECT_DIR: 'C:\\Codev\\mandarina' }, 'C:\\Codev\\mandarina\\frontend'), 'mandarina');
});

test('AC-03: sin variables se usa la carpeta del cwd', () => {
  assert.equal(resolveProject({}, '/home/dev/proyectos/demo/'), 'demo');
});

test('AC-20: un PreToolUse con block se normaliza como tool.blocked con block', () => {
  const block = { rule: 'dangerous-rm', reason: 'motivo' };
  const event = toEvent(fixture('PreToolUse'), { env, now, block });
  assert.equal(event.event_type, 'tool.blocked');
  assert.equal(event.native_event_type, 'PreToolUse');
  assert.deepEqual(event.block, block);
});

test('AC-20: sin block ningún Evento lleva el campo block', () => {
  for (const [hook] of mapping) assert.equal('block' in toEvent(fixture(hook), { env, now }), false, hook);
  // Un block fuera de PreToolUse no tiene sentido: la herramienta ya se ejecutó.
  const post = toEvent(fixture('PostToolUse'), { env, now, block: { rule: 'x', reason: 'y' } });
  assert.equal(post.event_type, 'tool.post');
  assert.equal('block' in post, false);
});

test('AC-20: denyDecision produce la salida de hook que deniega en Claude Code', () => {
  assert.deepEqual(denyDecision({ rule: 'sensitive-file', reason: 'Acceso a ".env".' }), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'Mandarina bloqueó esta acción (sensitive-file): Acceso a ".env".',
    },
  });
});

test('AC-03: la URL por defecto es 127.0.0.1:4000 y se puede sobrescribir', () => {
  assert.equal(resolveUrl({}), 'http://127.0.0.1:4000');
  assert.equal(resolveUrl({ MANDARINA_URL: 'http://localhost:5000/' }), 'http://localhost:5000');
});
