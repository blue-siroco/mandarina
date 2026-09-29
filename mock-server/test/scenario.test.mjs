import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, createSimulation, sessionScript } from '../lib/scenario.mjs';
import { evaluate } from '../../adapters/claude-code/lib/rules.mjs';

const hooks = (script) => script.steps.map((s) => s.hook_event_name);

test('una Sesión empieza con SessionStart y cada Turno acaba en Stop', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const script = sessionScript(createRandom(seed));
    // Los Subagentes internos llegan tras el `Stop` del Turno (AC-33).
    const names = script.steps.filter((s) => !(s.hook_event_name === 'SubagentStop' && s.agent_type === '')).map((s) => s.hook_event_name);
    assert.equal(names[0], 'SessionStart');
    assert.equal(names.filter((n) => n === 'UserPromptSubmit').length, names.filter((n) => n === 'Stop').length);
    assert.equal(names.at(-1), script.orphan ? 'Stop' : 'SessionEnd');
  }
});

test('cada PreToolUse no bloqueado va seguido de su PostToolUse (o PostToolUseFailure) con el mismo tool_use_id', () => {
  const { steps } = sessionScript(createRandom(7));
  steps.forEach((step, i) => {
    if (step.hook_event_name !== 'PreToolUse' || evaluate(step)) return;
    // El PostToolUse de `Agent` llega cuando el Subagente termina, no a continuación.
    const post = step.tool_name === 'Agent' ? steps.slice(i + 1).find((s) => s.tool_use_id === step.tool_use_id) : steps[i + 1];
    assert.ok(['PostToolUse', 'PostToolUseFailure'].includes(post.hook_event_name));
    assert.equal(post.tool_use_id, step.tool_use_id);
  });
});

test('AC-25, AC-26: la simulación lanza tests en verde y en rojo; los rojos llegan por PostToolUseFailure', () => {
  const sim = createSimulation({ seed: 3 });
  const events = Array.from({ length: 3000 }, () => sim.next(new Date('2026-09-25T10:00:00Z')));
  const runs = events.filter((e) => e.event_type === 'tool.post' && /test/.test(e.payload.tool_input?.command ?? ''));
  const failed = runs.filter((e) => e.native_event_type === 'PostToolUseFailure');
  assert.ok(failed.length > 0 && failed.length < runs.length, `${failed.length} de ${runs.length}`);
  for (const event of failed) assert.match(event.payload.error, /^Exit code 1\n/);
  assert.ok(runs.some((e) => e.payload.tool_input.command.includes('playwright')));
});

test('AC-20: la simulación emite Bloqueos con block válido y sin tool.post de la misma invocación', () => {
  const sim = createSimulation({ seed: 5 });
  const events = Array.from({ length: 3000 }, () => sim.next(new Date('2026-09-25T10:00:00Z')));
  const blocked = events.filter((e) => e.event_type === 'tool.blocked');
  assert.ok(blocked.length >= 5, `${blocked.length} Bloqueos`);
  const rules = new Set();
  for (const event of blocked) {
    assert.equal(event.native_event_type, 'PreToolUse');
    assert.equal(event.tool_name, 'Bash');
    assert.equal(typeof event.block.rule, 'string');
    assert.ok(event.block.rule.length > 0 && event.block.reason.length > 0);
    rules.add(event.block.rule);
    const toolUseId = event.payload.tool_use_id;
    assert.equal(events.some((e) => e.event_type !== 'tool.blocked' && e.payload.tool_use_id === toolUseId), false, toolUseId);
  }
  assert.ok(rules.size >= 3, `reglas: ${[...rules]}`);
  for (const event of events.filter((e) => e.event_type !== 'tool.blocked')) assert.equal('block' in event, false);
});

test('AC-20: los Bloqueos de la simulación son deterministas por semilla', () => {
  const run = () => {
    const sim = createSimulation({ seed: 9 });
    return Array.from({ length: 1000 }, () => sim.next(new Date('2026-09-25T10:00:00Z'))).filter((e) => e.event_type === 'tool.blocked');
  };
  assert.deepEqual(run(), run());
});

test('los Eventos de un Subagente llevan su agent_id entre SubagentStart y SubagentStop', () => {
  const script = Array.from({ length: 50 }, (_, i) => sessionScript(createRandom(i + 1))).find((s) =>
    hooks(s).includes('SubagentStart'),
  );
  const start = script.steps.findIndex((s) => s.hook_event_name === 'SubagentStart');
  const agentId = script.steps[start].agent_id;
  const stop = script.steps.findIndex((s, i) => i > start && s.hook_event_name === 'SubagentStop' && s.agent_id === agentId);
  assert.ok(stop > start);
  for (const step of script.steps.slice(start, stop + 1)) assert.equal(step.agent_id, agentId);
});

test('genera algunas Sesiones Huérfanas (sin SessionEnd)', () => {
  const scripts = Array.from({ length: 200 }, (_, i) => sessionScript(createRandom(i + 1)));
  const orphans = scripts.filter((s) => s.orphan).length;
  assert.ok(orphans > 0 && orphans < 60, `${orphans} huérfanas de 200`);
});

test('la simulación produce Eventos normalizados válidos y deterministas por semilla', () => {
  const run = () => {
    const sim = createSimulation({ seed: 42 });
    return Array.from({ length: 100 }, () => sim.next(new Date('2026-09-25T10:00:00Z')));
  };
  const events = run();
  assert.deepEqual(events, run());
  for (const event of events) {
    assert.equal(event.schema_version, 1);
    assert.equal(event.harness, 'claude-code');
    assert.match(event.event_type, /^(session|prompt|tool|subagent|turn)\./);
  }
  assert.ok(new Set(events.map((e) => e.session_id)).size > 3, 'varias Sesiones');
});

test('includeSecrets mete secretos en algunos comandos Bash', () => {
  const sim = createSimulation({ seed: 3, includeSecrets: true });
  const commands = Array.from({ length: 2000 }, () => sim.next())
    .map((e) => e.payload.tool_input?.command ?? '')
    .join('\n');
  assert.match(commands, /ghp_|Bearer /);
});

test('AC-29: la simulación carga skills con la herramienta Skill y con prompts /nombre', () => {
  const sim = createSimulation({ seed: 3 });
  const events = Array.from({ length: 3000 }, () => sim.next(new Date('2026-09-25T10:00:00Z')));
  const tool = events.filter((e) => e.event_type === 'tool.pre' && e.tool_name === 'Skill');
  assert.ok(tool.length > 0 && tool.every((e) => typeof e.payload.tool_input.skill === 'string'));
  assert.ok(tool.some((e) => e.subagent_id !== null), 'algún Subagente carga una skill');
  assert.ok(events.some((e) => e.event_type === 'prompt.submitted' && /^\/[\w:-]+/.test(e.payload.prompt)));
});

test('AC-33: los Subagentes se lanzan con Agent, a veces sin SubagentStart, y hay Subagentes internos', () => {
  const steps = Array.from({ length: 80 }, (_, i) => sessionScript(createRandom(i + 1)).steps).flat();
  const launches = steps.filter((s) => s.hook_event_name === 'PreToolUse' && s.tool_name === 'Agent');
  assert.ok(launches.length > 0 && launches.every((l) => l.tool_input.subagent_type && l.tool_input.description && !l.agent_id));

  const posts = steps.filter((s) => s.hook_event_name === 'PostToolUse' && s.tool_name === 'Agent');
  assert.equal(posts.length, launches.length);
  const starts = new Set(steps.filter((s) => s.hook_event_name === 'SubagentStart').map((s) => s.agent_id));
  const lost = posts.filter((p) => !starts.has(`agent-${p.tool_response.agentId}`));
  assert.ok(lost.length > 0 && lost.length < posts.length, `${lost.length} de ${posts.length} sin SubagentStart`);

  const internal = steps.filter((s) => s.hook_event_name === 'SubagentStop' && s.agent_type === '');
  assert.ok(internal.length > 0 && internal.every((s) => !starts.has(s.agent_id) && s.last_assistant_message));
});

test('AC-41: la simulación usa Herramientas MCP con su servidor, capturas, fallos y ToolSearch', () => {
  const steps = Array.from({ length: 80 }, (_, i) => sessionScript(createRandom(i + 1)).steps).flat();
  const mcp = steps.filter((s) => s.hook_event_name === 'PreToolUse' && s.tool_name?.startsWith('mcp__'));
  assert.ok(mcp.length > 0 && mcp.every((s) => s.mcp_server?.name === 'playwright'));
  const posts = steps.filter((s) => s.hook_event_name === 'PostToolUse' && s.tool_name?.startsWith('mcp__'));
  assert.ok(posts.every((s) => typeof s.duration_ms === 'number'));
  assert.ok(posts.some((s) => s.tool_response.some((b) => b.type === 'image')));
  assert.ok(steps.some((s) => s.hook_event_name === 'PostToolUseFailure' && s.tool_name?.startsWith('mcp__')));
  assert.ok(steps.some((s) => s.tool_name === 'ToolSearch' && s.tool_response?.matches?.length > 0));
});
