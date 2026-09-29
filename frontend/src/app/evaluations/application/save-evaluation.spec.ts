import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { EvaluationInput } from '../models/evaluation';
import { EvaluationSource } from '../ports/evaluation-source';
import { evaluation } from '../testing/evaluation-fixtures';
import { EvaluationDraft, NOTE_DEBOUNCE_MS, SaveEvaluation, SaveOutcome } from './save-evaluation';

const input = (overrides: Partial<EvaluationInput> = {}): EvaluationInput => ({ score: 1, tags: [], note: null, ...overrides });

describe('AC-57: SaveEvaluation', () => {
  let put: ReturnType<typeof vi.fn<(type: string, id: string, input: EvaluationInput) => Observable<unknown>>>;
  let remove: ReturnType<typeof vi.fn<(type: string, id: string) => Observable<void>>>;
  let drafts: Subject<EvaluationDraft>;
  let outcomes: SaveOutcome[];

  beforeEach(() => {
    vi.useFakeTimers();
    put = vi.fn(() => of(evaluation()));
    remove = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({ providers: [{ provide: EvaluationSource, useValue: { put, remove } }] });
    drafts = new Subject();
    outcomes = [];
    TestBed.inject(SaveEvaluation)
      .autosave('turn', 'p1', drafts)
      .subscribe((o) => outcomes.push(o));
  });

  afterEach(() => vi.useRealTimers());

  it('guarda al momento la Puntuación y las Etiquetas, con la Evaluación entera', async () => {
    drafts.next({ input: input({ score: -1, tags: ['bug-fix'] }), when: 'now' });
    await vi.advanceTimersByTimeAsync(0);
    expect(put).toHaveBeenCalledExactlyOnceWith('turn', 'p1', { score: -1, tags: ['bug-fix'], note: null });
    expect(outcomes).toStrictEqual([{ status: 'saved', evaluation: evaluation() }]);
  });

  it('espera 600 ms sin escribir para guardar la Nota y guarda solo la última', async () => {
    drafts.next({ input: input({ note: 'M' }), when: 'note' });
    await vi.advanceTimersByTimeAsync(NOTE_DEBOUNCE_MS - 1);
    drafts.next({ input: input({ note: 'Mal resuelto' }), when: 'note' });
    await vi.advanceTimersByTimeAsync(NOTE_DEBOUNCE_MS - 1);
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(put).toHaveBeenCalledExactlyOnceWith('turn', 'p1', { score: 1, tags: [], note: 'Mal resuelto' });
  });

  it('al salir del campo guarda la Nota sin esperar', async () => {
    drafts.next({ input: input({ note: 'Casi' }), when: 'note' });
    drafts.next({ input: input({ note: 'Casi' }), when: 'now' });
    await vi.advanceTimersByTimeAsync(0);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('si la Evaluación queda vacía la borra en lugar de guardarla', async () => {
    drafts.next({ input: input({ score: null, tags: [], note: '   ' }), when: 'now' });
    await vi.advanceTimersByTimeAsync(0);
    expect(remove).toHaveBeenCalledExactlyOnceWith('turn', 'p1');
    expect(put).not.toHaveBeenCalled();
    expect(outcomes).toStrictEqual([{ status: 'saved', evaluation: null }]);
  });

  it('una Nota en blanco se guarda como null', async () => {
    drafts.next({ input: input({ note: '  ' }), when: 'now' });
    await vi.advanceTimersByTimeAsync(0);
    expect(put).toHaveBeenCalledWith('turn', 'p1', { score: 1, tags: [], note: null });
  });

  it('un fallo se avisa y el siguiente cambio vuelve a intentarlo con todo lo escrito', async () => {
    put.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    drafts.next({ input: input({ note: 'a' }), when: 'now' });
    await vi.advanceTimersByTimeAsync(0);
    expect(outcomes).toStrictEqual([{ status: 'error' }]);

    drafts.next({ input: input({ note: 'ab', tags: ['x'] }), when: 'now' });
    await vi.advanceTimersByTimeAsync(0);
    expect(put).toHaveBeenLastCalledWith('turn', 'p1', { score: 1, tags: ['x'], note: 'ab' });
    expect(outcomes.at(-1)).toStrictEqual({ status: 'saved', evaluation: evaluation() });
  });

  it('borrar una Evaluación que nunca se guardó (404) cuenta como guardado', async () => {
    remove.mockReturnValueOnce(throwError(() => ({ status: 404 })));
    drafts.next({ input: input({ score: null }), when: 'now' });
    await vi.advanceTimersByTimeAsync(0);
    expect(outcomes).toStrictEqual([{ status: 'saved', evaluation: null }]);
  });

  it('un cambio nuevo cancela el guardado anterior que aún no ha respondido', async () => {
    const slow = new Subject<unknown>();
    put.mockReturnValueOnce(slow);
    drafts.next({ input: input({ score: 1 }), when: 'now' });
    await vi.advanceTimersByTimeAsync(0);
    drafts.next({ input: input({ score: -1 }), when: 'now' });
    await vi.advanceTimersByTimeAsync(0);
    slow.next(evaluation({ score: 1 }));
    expect(outcomes).toStrictEqual([{ status: 'saved', evaluation: evaluation() }]);
  });
});
