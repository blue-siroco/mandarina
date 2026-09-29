import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { NOTE_DEBOUNCE_MS } from '../../application/save-evaluation';
import { Evaluation, EvaluationInput, EvaluationObjectType } from '../../models/evaluation';
import { EvaluationSource } from '../../ports/evaluation-source';
import { evaluation } from '../../testing/evaluation-fixtures';
import { EvaluationControls } from './evaluation-controls';

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('AC-57: EvaluationControls', () => {
  let put: ReturnType<typeof vi.fn<(type: string, id: string, input: EvaluationInput) => Observable<Evaluation>>>;
  let remove: ReturnType<typeof vi.fn<(type: string, id: string) => Observable<void>>>;
  let tags: ReturnType<typeof vi.fn<() => Observable<Array<{ tag: string; count: number }>>>>;

  async function render(inputs: { evaluation?: Evaluation | null; objectType?: EvaluationObjectType; label?: string } = {}) {
    await TestBed.configureTestingModule({
      imports: [EvaluationControls],
      providers: [{ provide: EvaluationSource, useValue: { put, remove, tags } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(EvaluationControls);
    fixture.componentRef.setInput('objectType', inputs.objectType ?? 'turn');
    fixture.componentRef.setInput('objectId', 'p1');
    if ('evaluation' in inputs) fixture.componentRef.setInput('evaluation', inputs.evaluation);
    if (inputs.label) fixture.componentRef.setInput('label', inputs.label);
    await fixture.whenStable();
    return fixture;
  }

  const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
  const up = (f: ComponentFixture<unknown>) => el(f).querySelector<HTMLButtonElement>('[data-testid="score-up"]')!;
  const down = (f: ComponentFixture<unknown>) => el(f).querySelector<HTMLButtonElement>('[data-testid="score-down"]')!;
  const tagInput = (f: ComponentFixture<unknown>) => el(f).querySelector<HTMLInputElement>('[data-testid="tag-input"]')!;
  const noteField = (f: ComponentFixture<unknown>) => el(f).querySelector<HTMLTextAreaElement>('[data-testid="evaluation-note"]')!;
  const status = (f: ComponentFixture<unknown>) => text(el(f).querySelector('[data-testid="evaluation-status"]'));
  const chips = (f: ComponentFixture<unknown>) => [...el(f).querySelectorAll('[data-testid="evaluation-tag"] lucia--filterchip')].map((c) => (c as unknown as { filterChip: { text: string } }).filterChip.text);

  async function type(fixture: ComponentFixture<unknown>, field: HTMLInputElement | HTMLTextAreaElement, value: string) {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  beforeEach(() => {
    put = vi.fn((_t, _id, input) => of(evaluation({ object_type: 'turn', object_id: 'p1', score: input.score, tags: input.tags, note: input.note })));
    remove = vi.fn(() => of(undefined));
    tags = vi.fn(() => of([{ tag: 'usada', count: 2 }]));
  });

  afterEach(() => vi.useRealTimers());

  it('mientras no se han cargado las Evaluaciones espera, deshabilitado', async () => {
    const fixture = await render();
    expect(el(fixture).querySelector('[role="group"]')?.getAttribute('aria-busy')).toBe('true');
    expect([up(fixture).disabled, down(fixture).disabled, tagInput(fixture).disabled, noteField(fixture).disabled]).toStrictEqual([true, true, true, true]);
    fixture.componentRef.setInput('evaluation', null);
    await fixture.whenStable();
    expect(up(fixture).disabled).toBe(false);
  });

  it('muestra la Evaluación recibida: Puntuación, Etiquetas y Nota', async () => {
    const fixture = await render({ evaluation: evaluation({ score: -1, tags: ['hallucination', 'bug-fix'], note: 'Inventó un endpoint' }), label: 'Evaluación del Turno 2' });
    expect(el(fixture).querySelector('[data-testid="evaluation-controls"]')?.getAttribute('aria-label')).toBe('Evaluación del Turno 2');
    expect(down(fixture).getAttribute('aria-pressed')).toBe('true');
    expect(up(fixture).getAttribute('aria-pressed')).toBe('false');
    expect(chips(fixture)).toStrictEqual(['hallucination', 'bug-fix']);
    expect(noteField(fixture).value).toBe('Inventó un endpoint');
    expect(status(fixture)).toBe('');
  });

  it('los botones tienen nombre accesible "Bien" y "Mal"', async () => {
    const fixture = await render({ evaluation: null });
    expect(up(fixture).getAttribute('aria-label')).toBe('Bien');
    expect(down(fixture).getAttribute('aria-label')).toBe('Mal');
  });

  it('puntuar guarda al momento con la Evaluación entera y avisa "Guardado"', async () => {
    const fixture = await render({ evaluation: null });
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    up(fixture).click();
    await fixture.whenStable();
    expect(put).toHaveBeenCalledExactlyOnceWith('turn', 'p1', { score: 1, tags: [], note: null });
    expect(up(fixture).getAttribute('aria-pressed')).toBe('true');
    expect(status(fixture)).toBe('Guardado');
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ score: 1 }));
  });

  it('pulsar el botón activo quita la Puntuación y, si no queda nada, borra la Evaluación', async () => {
    const fixture = await render({ evaluation: evaluation({ score: 1, tags: [], note: null }) });
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    up(fixture).click();
    await fixture.whenStable();
    expect(up(fixture).getAttribute('aria-pressed')).toBe('false');
    expect(remove).toHaveBeenCalledExactlyOnceWith('turn', 'p1');
    expect(put).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledWith(null);
  });

  it('cambiar de un botón al otro deja solo el nuevo', async () => {
    const fixture = await render({ evaluation: evaluation({ score: 1 }) });
    down(fixture).click();
    await fixture.whenStable();
    expect([up(fixture).getAttribute('aria-pressed'), down(fixture).getAttribute('aria-pressed')]).toStrictEqual(['false', 'true']);
    expect(put).toHaveBeenLastCalledWith('turn', 'p1', expect.objectContaining({ score: -1 }));
  });

  it('Enter añade la Etiqueta normalizada, vacía el campo y guarda; la coma también', async () => {
    const fixture = await render({ evaluation: null });
    const field = tagInput(fixture);
    field.value = 'Bug fix';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(chips(fixture)).toStrictEqual(['bug-fix']);
    expect(field.value).toBe('');
    expect(put).toHaveBeenLastCalledWith('turn', 'p1', { score: null, tags: ['bug-fix'], note: null });

    field.value = 'Refactor';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(chips(fixture)).toStrictEqual(['bug-fix', 'refactor']);
  });

  it('no repite una Etiqueta ni añade una vacía', async () => {
    const fixture = await render({ evaluation: evaluation({ tags: ['bug-fix'] }) });
    const field = tagInput(fixture);
    for (const value of ['BUG FIX', '¡!', '  ']) {
      field.value = value;
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    }
    await fixture.whenStable();
    expect(chips(fixture)).toStrictEqual(['bug-fix']);
    expect(put).not.toHaveBeenCalled();
  });

  it('al salir del campo añade lo que se había escrito sin confirmar', async () => {
    const fixture = await render({ evaluation: null });
    tagInput(fixture).value = 'sin confirmar';
    tagInput(fixture).dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(chips(fixture)).toStrictEqual(['sin-confirmar']);
  });

  it('quita una Etiqueta con su botón, que dice cuál', async () => {
    const fixture = await render({ evaluation: evaluation({ tags: ['a', 'b'] }) });
    const remove1 = el(fixture).querySelector<HTMLButtonElement>('button[aria-label="Quitar la Etiqueta a"]')!;
    remove1.click();
    await fixture.whenStable();
    expect(chips(fixture)).toStrictEqual(['b']);
    expect(put).toHaveBeenLastCalledWith('turn', 'p1', expect.objectContaining({ tags: ['b'] }));
  });

  it('el autocompletado ofrece las Etiquetas usadas y las sugeridas', async () => {
    const fixture = await render({ evaluation: null });
    const listId = tagInput(fixture).getAttribute('list')!;
    const options = [...el(fixture).querySelectorAll(`datalist#${listId} option`)].map((o) => (o as HTMLOptionElement).value);
    expect(options).toStrictEqual(['usada', 'bug-fix', 'hallucination', 'prompt-breakdown', 'refactor']);
  });

  /** Con temporizadores simulados `whenStable` no vuelve: se escribe y se avanza el reloj a mano. */
  function typeFake(fixture: ComponentFixture<unknown>, field: HTMLTextAreaElement, value: string) {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  it('la Nota se guarda 600 ms después de dejar de escribir', async () => {
    const fixture = await render({ evaluation: null });
    vi.useFakeTimers();
    typeFake(fixture, noteField(fixture), 'Buen tra');
    await vi.advanceTimersByTimeAsync(NOTE_DEBOUNCE_MS - 1);
    typeFake(fixture, noteField(fixture), 'Buen trabajo');
    expect(status(fixture)).toBe('Guardando…');
    await vi.advanceTimersByTimeAsync(NOTE_DEBOUNCE_MS - 1);
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(put).toHaveBeenCalledExactlyOnceWith('turn', 'p1', { score: null, tags: [], note: 'Buen trabajo' });
  });

  it('al salir del campo de la Nota se guarda sin esperar, y sin cambios no guarda', async () => {
    const fixture = await render({ evaluation: evaluation({ score: 1, tags: [], note: 'Igual' }) });
    vi.useFakeTimers();
    noteField(fixture).dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(0);
    expect(put).not.toHaveBeenCalled();

    typeFake(fixture, noteField(fixture), 'Cambiada');
    noteField(fixture).dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(0);
    expect(put).toHaveBeenCalledExactlyOnceWith('turn', 'p1', { score: 1, tags: [], note: 'Cambiada' });
  });

  it('si falla avisa "No se pudo guardar" sin perder lo escrito, y el siguiente cambio lo reintenta', async () => {
    put.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    const fixture = await render({ evaluation: null });
    tagInput(fixture).value = 'x';
    tagInput(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(status(fixture)).toBe('No se pudo guardar');
    expect(chips(fixture)).toStrictEqual(['x']);

    up(fixture).click();
    await fixture.whenStable();
    expect(put).toHaveBeenLastCalledWith('turn', 'p1', { score: 1, tags: ['x'], note: null });
    expect(status(fixture)).toBe('Guardado');
  });

  it('las Evaluaciones que llegan después del primer valor no pisan lo que se está editando', async () => {
    const fixture = await render({ evaluation: null });
    await type(fixture, noteField(fixture), 'Escribiendo');
    fixture.componentRef.setInput('evaluation', evaluation({ note: 'Otra', score: -1 }));
    await fixture.whenStable();
    expect(noteField(fixture).value).toBe('Escribiendo');
    expect(down(fixture).getAttribute('aria-pressed')).toBe('false');
  });

  it('guarda en la ruta del tipo de objeto que se le indica', async () => {
    const fixture = await render({ evaluation: null, objectType: 'subagent' });
    up(fixture).click();
    await fixture.whenStable();
    expect(put).toHaveBeenCalledWith('subagent', 'p1', expect.anything());
  });
});
