import type { EventType, StoredEvent } from '../src/domain/event.js';
import type { UsageEntry } from '../src/domain/token-usage.js';
import { buildTurnTrace, type OtlpSpan, type TurnTraceInput } from '../src/domain/otlp-trace.js';

const T0 = Date.parse('2026-09-25T12:00:00.000Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const nanos = (seconds: number) => String(BigInt(T0 + seconds * 1000) * 1_000_000n);

let seq = 0;
function event(eventType: EventType, seconds: number, overrides: Partial<StoredEvent> = {}): StoredEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    schema_version: 1,
    harness: 'claude-code',
    project: 'demo',
    directory: '/code/demo',
    session_id: 's1',
    subagent_id: null,
    event_type: eventType,
    native_event_type: 'X',
    tool_name: null,
    occurred_at: at(seconds),
    received_at: at(seconds),
    transcript_path: null,
    payload: {},
    block: null,
    ...overrides,
  };
}

function entry(id: string, seconds: number, usage: Partial<UsageEntry['usage']> = {}, model = 'claude-sonnet-4-5'): UsageEntry {
  return {
    messageId: id,
    model,
    timestamp: at(seconds),
    usage: { input: 10, output: 20, cache_read: 100, cache_creation_5m: 5, cache_creation_1h: 0, ...usage },
  };
}

function input(overrides: Partial<TurnTraceInput> = {}): TurnTraceInput {
  const prompt = event('prompt.submitted', 0, { id: 'p1', payload: { prompt: 'arregla el test' } });
  const end = event('turn.ended', 60, { payload: { last_assistant_message: 'Hecho.' } });
  return {
    session: { session_id: 's1', project: 'demo', directory: '/code/demo', harness: 'claude-code' },
    turn: { id: 'p1', index: 3, started_at: at(0), ended_at: at(60) },
    events: [prompt, end],
    main: [],
    subagents: [],
    includeContent: false,
    ...overrides,
  };
}

const spansOf = (request: ReturnType<typeof buildTurnTrace>): OtlpSpan[] => request.resourceSpans[0]!.scopeSpans[0]!.spans;

function attrs(span: OtlpSpan): Record<string, unknown> {
  return Object.fromEntries(
    span.attributes.map((a) => [a.key, a.value.stringValue ?? a.value.intValue ?? a.value.doubleValue ?? a.value.boolValue]),
  );
}

const kindOf = (span: OtlpSpan) => attrs(span)['openinference.span.kind'];
const rootOf = (spans: OtlpSpan[]) => spans.find((s) => s.parentSpanId === undefined)!;

describe('AC-49: traza OTLP de un Turno', () => {
  it('describe el recurso y abre un span raíz AGENT del prompt al fin del Turno', () => {
    const request = buildTurnTrace(input());
    const resource = Object.fromEntries(
      request.resourceSpans[0]!.resource.attributes.map((a) => [a.key, a.value.stringValue]),
    );
    expect(resource).toEqual({
      'service.name': 'mandarina',
      'mandarina.project': 'demo',
      'mandarina.directory': '/code/demo',
      'mandarina.harness': 'claude-code',
    });
    const root = rootOf(spansOf(request));
    expect(root.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(root.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(root.startTimeUnixNano).toBe(nanos(0));
    expect(root.endTimeUnixNano).toBe(nanos(60));
    expect(attrs(root)).toMatchObject({ 'openinference.span.kind': 'AGENT', 'session.id': 's1', 'mandarina.turn.index': 3 });
  });

  it('crea un span LLM por respuesta del Turno, sin repetir message.id, con tokens y coste', () => {
    const request = buildTurnTrace(
      input({
        main: [entry('m0', -30), entry('m1', 10), entry('m1', 10), entry('m2', 50, { input: 1, output: 2 }), entry('m9', 120)],
      }),
    );
    const llm = spansOf(request).filter((s) => kindOf(s) === 'LLM');
    expect(llm).toHaveLength(2);
    const [first, second] = llm;
    const root = rootOf(spansOf(request));
    expect(first!.parentSpanId).toBe(root.spanId);
    expect(first!.startTimeUnixNano).toBe(nanos(0));
    expect(first!.endTimeUnixNano).toBe(nanos(10));
    // La segunda respuesta empieza donde acabó la anterior de su carril.
    expect(second!.startTimeUnixNano).toBe(nanos(10));
    expect(attrs(first!)).toMatchObject({
      'llm.model_name': 'claude-sonnet-4-5',
      'llm.token_count.prompt': 115,
      'llm.token_count.completion': 20,
      'llm.token_count.total': 135,
      'llm.token_count.prompt_details.cache_read': 100,
      'llm.token_count.prompt_details.cache_write': 5,
      'gen_ai.usage.input_tokens': 115,
      'gen_ai.usage.output_tokens': 20,
    });
    expect(attrs(first!)['mandarina.cost.usd']).toBeGreaterThan(0);
    const total = (attrs(first!)['mandarina.cost.usd'] as number) + (attrs(second!)['mandarina.cost.usd'] as number);
    expect(attrs(root)['mandarina.cost.usd']).toBeCloseTo(total, 10);
  });

  it('crea un span TOOL por invocación, con error, sin respuesta o bloqueada', () => {
    const request = buildTurnTrace(
      input({
        events: [
          event('prompt.submitted', 0, { id: 'p1' }),
          event('tool.pre', 5, { id: 'bash-ok', tool_name: 'Bash', payload: { tool_use_id: 't1' } }),
          event('tool.post', 8, { tool_name: 'Bash', payload: { tool_use_id: 't1' } }),
          event('tool.pre', 10, { id: 'bash-ko', tool_name: 'Bash', payload: { tool_use_id: 't2' } }),
          event('tool.post', 12, { tool_name: 'Bash', payload: { tool_use_id: 't2', error: 'Exit code 1\nFAIL x' } }),
          event('tool.pre', 20, { id: 'read-open', tool_name: 'Read', payload: { tool_use_id: 't3' } }),
          event('tool.blocked', 30, {
            id: 'blocked',
            tool_name: 'Bash',
            payload: { tool_use_id: 't4' },
            block: { rule: 'rm-rf', reason: 'rm -rf fuera del Directorio' },
          }),
          event('turn.ended', 60),
        ],
      }),
    );
    const tools = spansOf(request).filter((s) => kindOf(s) === 'TOOL');
    expect(tools.map((s) => s.name)).toEqual(['Bash', 'Bash', 'Read', 'Bash']);
    const [ok, ko, open, blocked] = tools;
    expect(ok!.startTimeUnixNano).toBe(nanos(5));
    expect(ok!.endTimeUnixNano).toBe(nanos(8));
    expect(ok!.status).toBeUndefined();
    expect(attrs(ok!)['tool.name']).toBe('Bash');
    expect(ko!.status).toEqual({ code: 2, message: 'Exit code 1' });
    expect(open!.endTimeUnixNano).toBe(nanos(60));
    expect(attrs(open!)['mandarina.tool.status']).toBe('no_response');
    expect(blocked!.status?.code).toBe(2);
    expect(blocked!.events).toEqual([
      {
        timeUnixNano: nanos(30),
        name: 'mandarina.block',
        attributes: [
          { key: 'mandarina.block.rule', value: { stringValue: 'rm-rf' } },
          { key: 'mandarina.block.reason', value: { stringValue: 'rm -rf fuera del Directorio' } },
        ],
      },
    ]);
  });

  it('cuelga cada Subagente del span de su Lanzamiento, con sus herramientas y respuestas debajo', () => {
    const request = buildTurnTrace(
      input({
        events: [
          event('prompt.submitted', 0, { id: 'p1' }),
          event('tool.pre', 5, {
            id: 'launch',
            tool_name: 'Agent',
            payload: { tool_use_id: 'tA', tool_input: { subagent_type: 'Explore', description: 'buscar', prompt: 'busca X' } },
          }),
          event('subagent.started', 6, { subagent_id: 'a1', payload: { agent_type: 'Explore' } }),
          event('tool.pre', 7, { subagent_id: 'a1', tool_name: 'Grep', payload: { tool_use_id: 'tG' } }),
          event('tool.post', 9, { subagent_id: 'a1', tool_name: 'Grep', payload: { tool_use_id: 'tG' } }),
          event('subagent.stopped', 20, { subagent_id: 'a1', payload: { agent_type: 'Explore', last_assistant_message: 'Está en y.ts' } }),
          event('tool.post', 21, { tool_name: 'Agent', payload: { tool_use_id: 'tA', tool_response: { agentId: 'a1' } } }),
          event('turn.ended', 60),
        ],
        subagents: [{ agentId: 'a1', entries: [entry('s1', 15, {}, 'claude-haiku-4-5')] }],
      }),
    );
    const spans = spansOf(request);
    const launch = spans.find((s) => s.name === 'Agent')!;
    const agent = spans.find((s) => kindOf(s) === 'AGENT' && s.parentSpanId !== undefined)!;
    expect(agent.parentSpanId).toBe(launch.spanId);
    // El Subagente empieza en su Lanzamiento, no en el hook `SubagentStart` (1.7).
    expect(agent.startTimeUnixNano).toBe(nanos(5));
    expect(agent.endTimeUnixNano).toBe(nanos(20));
    expect(attrs(agent)['mandarina.subagent.type']).toBe('Explore');
    const grep = spans.find((s) => s.name === 'Grep')!;
    expect(grep.parentSpanId).toBe(agent.spanId);
    const llm = spans.find((s) => kindOf(s) === 'LLM')!;
    expect(llm.parentSpanId).toBe(agent.spanId);
    // Su marca anterior es el fin del Grep, dentro de su carril.
    expect(llm.startTimeUnixNano).toBe(nanos(9));
  });

  it('da los mismos ids al construir dos veces la misma traza', () => {
    const build = () =>
      buildTurnTrace(
        input({
          events: [
            event('prompt.submitted', 0, { id: 'p1' }),
            event('tool.pre', 5, { id: 'x', tool_name: 'Bash', payload: { tool_use_id: 't1' } }),
            event('turn.ended', 60, { id: 'end' }),
          ],
          main: [entry('m1', 10)],
        }),
      );
    const ids = (request: ReturnType<typeof buildTurnTrace>) => spansOf(request).map((s) => [s.traceId, s.spanId, s.parentSpanId]);
    expect(ids(build())).toEqual(ids(build()));
    expect(new Set(spansOf(build()).map((s) => s.spanId)).size).toBe(3);
  });
});

describe('AC-50: contenido solo con su opt-in', () => {
  const events = () => [
    event('prompt.submitted', 0, { id: 'p1', payload: { prompt: 'arregla el test' } }),
    event('tool.pre', 5, { tool_name: 'Bash', payload: { tool_use_id: 't1', tool_input: { command: 'npm test' } } }),
    event('tool.post', 8, { tool_name: 'Bash', payload: { tool_use_id: 't1', tool_response: { stdout: 'ok' } } }),
    event('turn.ended', 60, { payload: { last_assistant_message: 'Hecho.' } }),
  ];

  it('sin el opt-in no exporta prompts, respuestas ni entradas y salidas', () => {
    const spans = spansOf(buildTurnTrace(input({ events: events(), main: [entry('m1', 10)] })));
    for (const span of spans) {
      expect(Object.keys(attrs(span))).not.toContain('input.value');
      expect(Object.keys(attrs(span))).not.toContain('output.value');
      expect(Object.keys(attrs(span))).not.toContain('llm.system_prompt');
    }
  });

  it('con el opt-in exporta el prompt, la respuesta y la entrada y salida de cada herramienta', () => {
    const spans = spansOf(buildTurnTrace(input({ events: events(), includeContent: true })));
    const root = rootOf(spans);
    expect(attrs(root)).toMatchObject({ 'input.value': 'arregla el test', 'output.value': 'Hecho.' });
    const bash = spans.find((s) => s.name === 'Bash')!;
    expect(attrs(bash)).toMatchObject({
      'input.value': '{"command":"npm test"}',
      'input.mime_type': 'application/json',
      'output.value': '{"stdout":"ok"}',
      'output.mime_type': 'application/json',
    });
    expect(Object.keys(attrs(root))).not.toContain('llm.system_prompt');
  });
});
