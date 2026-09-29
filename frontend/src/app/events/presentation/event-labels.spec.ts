import { observedEvent } from '../testing/event-fixtures';
import { EVENT_CATEGORIES, EVENT_TYPE_LABELS, inCategory, maskedSegments, summarizeEvent } from './event-labels';

describe('AC-17: summarizeEvent', () => {
  it('resume una herramienta con su nombre y su entrada', () => {
    expect(summarizeEvent(observedEvent({ toolName: 'Bash', payload: { tool_input: { command: 'npm test' } } }))).toBe(
      'Bash · npm test',
    );
  });

  it('usa solo el nombre si no hay entrada', () => {
    expect(summarizeEvent(observedEvent({ toolName: 'Bash', payload: {} }))).toBe('Bash');
  });

  it('resume un prompt con su primera línea', () => {
    const prompt = observedEvent({ eventType: 'prompt.submitted', toolName: null, payload: { prompt: 'Hola\nmundo' } });
    expect(summarizeEvent(prompt)).toBe('Hola');
  });

  it('muestra el tipo de Subagente', () => {
    const sub = observedEvent({ eventType: 'subagent.started', toolName: null, payload: { agent_type: 'Explore' } });
    expect(summarizeEvent(sub)).toBe('Explore');
  });

  it('resume también un Bloqueo', () => {
    const blocked = observedEvent({ eventType: 'tool.blocked', payload: { tool_input: { command: 'rm -rf /' } } });
    expect(summarizeEvent(blocked)).toBe('Bash · rm -rf /');
  });

  it('un fin de Turno no tiene resumen', () => {
    expect(summarizeEvent(observedEvent({ eventType: 'turn.ended', toolName: null }))).toBeNull();
  });
});

describe('AC-17: categorías', () => {
  it('tienen el orden de spec/design.md §5.5', () => {
    expect(EVENT_CATEGORIES.map((c) => c.label)).toStrictEqual([
      'Todos',
      'Prompts',
      'Herramientas',
      'Subagentes',
      'Sesión',
      'Turnos',
      'Bloqueos',
      'MCP',
      'Avisos',
    ]);
  });

  it.each([
    ['all', 'turn.ended', true],
    ['tools', 'tool.post', true],
    ['tools', 'tool.blocked', false],
    ['blocks', 'tool.blocked', true],
    ['prompts', 'tool.pre', false],
  ] as const)('%s incluye %s: %s', (category, eventType, expected) => {
    expect(inCategory(observedEvent({ eventType }), category)).toBe(expected);
  });

  it('todas las etiquetas de Tipo de evento existen', () => {
    expect(EVENT_TYPE_LABELS['tool.blocked']).toBe('Bloqueado');
  });
});

describe('AC-17: maskedSegments', () => {
  it('marca los valores enmascarados por el servidor como secreto', () => {
    expect(maskedSegments('key=*** y token ***')).toStrictEqual([
      { text: 'key=', secret: false },
      { text: '‹secreto›', secret: true },
      { text: ' y token ', secret: false },
      { text: '‹secreto›', secret: true },
    ]);
  });

  it('AC-60: los marcadores con tipo también se marcan, y conservan su texto', () => {
    expect(maskedSegments('a [REDACTED_API_KEY] b [REDACTED_EMAIL]')).toStrictEqual([
      { text: 'a ', secret: false },
      { text: '[REDACTED_API_KEY]', secret: true },
      { text: ' b ', secret: false },
      { text: '[REDACTED_EMAIL]', secret: true },
    ]);
  });

  it('sin secretos devuelve el texto tal cual', () => {
    expect(maskedSegments('npm test')).toStrictEqual([{ text: 'npm test', secret: false }]);
  });
});

describe('AC-36: resumen de los Eventos de Subagente', () => {
  const subagent = { type: 'e2e-builder', description: 'generar tests del AC-28', durationMs: null, internal: false };

  it('el inicio muestra el Tipo y la tarea', () => {
    const started = observedEvent({ eventType: 'subagent.started', toolName: null, subagent });
    expect(summarizeEvent(started)).toBe('e2e-builder · generar tests del AC-28');
  });

  it('el fin añade la duración', () => {
    const stopped = observedEvent({ eventType: 'subagent.stopped', toolName: null, subagent: { ...subagent, durationMs: 180_000 } });
    expect(summarizeEvent(stopped)).toBe('e2e-builder · generar tests del AC-28 · 3 min');
  });

  it('sin Tipo ni tarea sigue leyendo el payload', () => {
    const legacy = observedEvent({ eventType: 'subagent.stopped', toolName: null, payload: { agent_type: 'Plan' }, subagent: null });
    expect(summarizeEvent(legacy)).toBe('Plan');
    const internal = observedEvent({
      eventType: 'subagent.stopped',
      toolName: null,
      subagent: { type: null, description: null, durationMs: null, internal: true },
    });
    expect(summarizeEvent(internal)).toBeNull();
  });
});

describe('AC-43: Eventos de Herramientas MCP', () => {
  const navigate = observedEvent({ toolName: 'mcp__playwright__browser_navigate', payload: { tool_input: { url: 'http://localhost:4200' } } });

  it('se resumen como servidor · herramienta · entrada', () => {
    expect(summarizeEvent(navigate)).toBe('playwright · browser_navigate · http://localhost:4200');
  });

  it('tienen su categoría, que deja fuera las demás herramientas', () => {
    expect(EVENT_CATEGORIES.map((c) => c.key)).toContain('mcp');
    expect(inCategory(navigate, 'mcp')).toBe(true);
    expect(inCategory(observedEvent({ toolName: 'ReadMcpResourceTool' }), 'mcp')).toBe(true);
    expect(inCategory(observedEvent({ toolName: 'Bash' }), 'mcp')).toBe(false);
    expect(inCategory(observedEvent({ eventType: 'prompt.submitted', toolName: null }), 'mcp')).toBe(false);
  });
});

describe('AC-68: categoría Avisos', () => {
  const warning = (dismissed: boolean) => ({ id: 'e:p', pattern: 'fake-system-tag', severity: 'high' as const, dismissed });

  it('deja solo los Eventos con avisos vigentes, sea cual sea su Tipo', () => {
    expect(inCategory(observedEvent({ eventType: 'tool.post', warnings: [warning(false)] }), 'warnings')).toBe(true);
    expect(inCategory(observedEvent({ eventType: 'prompt.submitted', warnings: [warning(false)] }), 'warnings')).toBe(true);
    expect(inCategory(observedEvent({ warnings: [] }), 'warnings')).toBe(false);
  });

  it('un aviso descartado no cuenta', () => {
    expect(inCategory(observedEvent({ warnings: [warning(true)] }), 'warnings')).toBe(false);
    expect(inCategory(observedEvent({ warnings: [warning(true), warning(false)] }), 'warnings')).toBe(true);
  });
});
