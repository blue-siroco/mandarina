import { TestBed } from '@angular/core/testing';
import { evaluation, stubEvaluationSource } from '../../../evaluations/testing/evaluation-fixtures';
import { SessionSubagent } from '../../models/session';
import { sessionDetail } from '../../testing/session-fixtures';
import { SubagentList } from './subagent-list';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const base = sessionDetail().subagents[0]!;

async function render(subagents: SessionSubagent[]) {
  await TestBed.configureTestingModule({ imports: [SubagentList], providers: [stubEvaluationSource().provider] }).compileComponents();
  const fixture = TestBed.createComponent(SubagentList);
  fixture.componentRef.setInput('subagents', subagents);
  await fixture.whenStable();
  return fixture;
}

async function expand(subagents: SessionSubagent[]) {
  const fixture = await render(subagents);
  const el = fixture.nativeElement as HTMLElement;
  (el.querySelector('[data-testid="subagent-toggle"]') as HTMLButtonElement).click();
  await fixture.whenStable();
  return el;
}

describe('AC-24: SubagentList', () => {
  it('la fila muestra el tipo y la descripción de la Tarea', async () => {
    const fixture = await render([base]);
    const row = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="subagent-row"]');
    expect(text(row)).toContain('Explore');
    expect(text(row)).toContain('Buscar plugins');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="subagent-detail"]')).toBeNull();
  });

  it('al expandir muestra la Tarea, las herramientas con su resultado en texto y la respuesta', async () => {
    const el = await expand([base]);

    expect(text(el.querySelector('[data-testid="subagent-prompt"]'))).toBe('Busca los plugins de observabilidad');
    const tools = [...el.querySelectorAll('[data-testid="subagent-tool"]')] as HTMLElement[];
    expect(tools.map((t) => [t.dataset['status'], text(t.querySelector('.call__status'))])).toStrictEqual([
      ['ok', 'Bien'],
      ['error', 'Error'],
    ]);
    expect(text(tools[0])).toContain('Grep');
    expect(text(tools[0])).toContain('observe');
    expect(text(el.querySelector('[data-testid="subagent-result"]'))).toBe('Hay 3 plugins.');
  });

  it('mientras sigue en marcha avisa en lugar de la respuesta', async () => {
    const el = await expand([{ ...base, stoppedAt: null, status: 'running', result: null }]);
    expect(el.querySelector('[data-testid="subagent-running"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="subagent-result"]')).toBeNull();
  });

  it('AC-126: sin fin y con el Turno terminado se ve "Sin respuesta" y lo explica, sin "En marcha"', async () => {
    const stale: SessionSubagent = { ...base, stoppedAt: null, status: 'no_response', result: null };
    const el = await expand([stale]);
    const row = el.querySelector('[data-testid="subagent-row"]');
    expect(text(row)).toContain('Sin respuesta');
    expect(text(row)).not.toContain('En marcha');
    expect(text(el.querySelector('[data-testid="subagent-no-response"]'))).toBe('El Turno terminó sin que el Subagente avisara de su fin.');
    expect(el.querySelector('[data-testid="subagent-running"]')).toBeNull();
  });

  it('AC-126: terminado muestra su duración', async () => {
    const fixture = await render([base]);
    expect(text((fixture.nativeElement as HTMLElement).querySelector('[data-testid="subagent-status"]'))).toBe('3 min');
  });

  it('sin Transcript lo dice y conserva las herramientas de los Eventos', async () => {
    const el = await expand([{ ...base, task: null }]);
    expect(text(el.querySelector('[data-testid="subagent-task-unavailable"]'))).toContain('Tarea no disponible');
    expect(el.querySelectorAll('[data-testid="subagent-tool"]')).toHaveLength(2);
  });
});

describe('AC-36: SubagentList sin ruido', () => {
  const internal: SessionSubagent = {
    ...base,
    key: 'x1',
    subagentId: 'x1',
    toolUseId: null,
    agentType: null,
    internal: true,
    task: null,
    tools: [],
    model: null,
    tokens: null,
    result: 'Sí, haz push',
  };
  const pending: SessionSubagent = {
    ...base,
    key: 'launch:t2',
    subagentId: null,
    toolUseId: 't2',
    agentType: 'e2e-builder',
    stoppedAt: null,
    status: 'running',
    task: { description: 'generar tests del AC-28', prompt: 'Genera los tests' },
    tools: [],
    result: null,
  };
  const rows = (el: HTMLElement) => [...el.querySelectorAll('[data-testid="subagent-row"]')];

  it('oculta los internos salvo con "Mostrar internos"', async () => {
    const fixture = await render([base, internal]);
    const el = fixture.nativeElement as HTMLElement;
    expect(rows(el)).toHaveLength(1);

    (el.querySelector('[data-testid="subagent-internal-filter"] input') as HTMLInputElement).click();
    await fixture.whenStable();
    expect(rows(el)).toHaveLength(2);
    expect(text(rows(el)[1])).toContain('interno');
  });

  it('un lanzamiento pendiente se ve en marcha con su Tipo y su Tarea', async () => {
    const fixture = await render([pending]);
    const row = rows(fixture.nativeElement as HTMLElement)[0];
    expect(text(row)).toContain('e2e-builder');
    expect(text(row)).toContain('generar tests del AC-28');
    expect(text(row)).toContain('En marcha');
  });

  it('abre desplegado el Subagente pedido, aunque sea interno', async () => {
    await TestBed.configureTestingModule({ imports: [SubagentList], providers: [stubEvaluationSource().provider] }).compileComponents();
    const fixture = TestBed.createComponent(SubagentList);
    fixture.componentRef.setInput('subagents', [base, internal]);
    fixture.componentRef.setInput('expandedKey', 'x1');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(rows(el)).toHaveLength(2);
    expect(el.querySelectorAll('[data-testid="subagent-detail"]')).toHaveLength(1);
    expect(text(el.querySelector('[data-testid="subagent-result"]'))).toBe('Sí, haz push');
  });
});

describe('AC-57: evaluar un Subagente', () => {
  const setup = async (subagents: SessionSubagent[], evaluations: unknown = null) => {
    const stub = stubEvaluationSource();
    await TestBed.configureTestingModule({ imports: [SubagentList], providers: [stub.provider] }).compileComponents();
    const fixture = TestBed.createComponent(SubagentList);
    fixture.componentRef.setInput('subagents', subagents);
    fixture.componentRef.setInput('evaluations', evaluations);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="subagent-toggle"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    return { el, stub, fixture };
  };
  const loaded = (...items: Array<ReturnType<typeof evaluation>>) => ({
    loaded: true,
    failed: false,
    byKey: new Map(items.map((e) => [`${e.objectType}:${e.objectId}`, e])),
  });

  it('al desplegarlo ofrece los controles de su Evaluación, con la que ya tiene', async () => {
    const saved = evaluation({ object_type: 'subagent', object_id: base.subagentId!, score: -1, tags: [], note: null });
    const { el } = await setup([base], loaded(saved));
    const controls = el.querySelector('[data-testid="subagent-evaluation"]')!;

    expect(controls.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Evaluación del Subagente Explore');
    expect(controls.querySelector('[data-testid="score-down"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('puntuarlo guarda la Evaluación del Subagente por su id', async () => {
    const { el, stub, fixture } = await setup([base], loaded());
    (el.querySelector('[data-testid="subagent-evaluation"] [data-testid="score-up"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(stub.calls.put.map(([type, id, input]) => [type, id, input.score])).toStrictEqual([['subagent', base.subagentId, 1]]);
  });

  it('un Subagente pendiente de enlazar no se puede evaluar', async () => {
    const { el } = await setup([{ ...base, subagentId: null }], loaded());
    expect(el.querySelector('[data-testid="subagent-detail"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="subagent-evaluation"]')).toBeNull();
  });

  it('un Subagente interno del Harness tampoco', async () => {
    const stub = stubEvaluationSource();
    await TestBed.configureTestingModule({ imports: [SubagentList], providers: [stub.provider] }).compileComponents();
    const fixture = TestBed.createComponent(SubagentList);
    fixture.componentRef.setInput('subagents', [{ ...base, internal: true }]);
    fixture.componentRef.setInput('expandedKey', base.key);
    fixture.componentRef.setInput('evaluations', loaded());
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="subagent-detail"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="subagent-evaluation"]')).toBeNull();
  });
});
