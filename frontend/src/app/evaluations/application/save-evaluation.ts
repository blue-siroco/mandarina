import { Injectable, inject } from '@angular/core';
import { Observable, catchError, debounce, map, of, switchMap, timer } from 'rxjs';
import { Evaluation, EvaluationInput, EvaluationObjectType, isEmptyInput } from '../models/evaluation';
import { EvaluationSource } from '../ports/evaluation-source';

/** La Nota se guarda este tiempo después de dejar de escribir (AC-57). */
export const NOTE_DEBOUNCE_MS = 600;

/** Un cambio de la persona usuaria; lleva la Evaluación entera, no solo lo que cambió. */
export interface EvaluationDraft {
  input: EvaluationInput;
  /** `note`: sigue escribiendo, se espera al debounce. `now`: se guarda al momento (Puntuación, Etiquetas o salir del campo). */
  when: 'note' | 'now';
}

/** Resultado de guardar; `evaluation` es `null` si la Evaluación quedó vacía y se borró. */
export type SaveOutcome = { status: 'saved'; evaluation: Evaluation | null } | { status: 'error' };

/**
 * Caso de uso: guardar sin botón las Evaluaciones de un objeto (AC-57). Si el
 * resultado queda vacío se borra en vez de guardar. Cada borrador lleva la
 * Evaluación completa, así que el último gana y un fallo no pierde lo escrito.
 */
@Injectable({ providedIn: 'root' })
export class SaveEvaluation {
  private readonly source = inject(EvaluationSource);

  autosave(objectType: EvaluationObjectType, objectId: string, drafts$: Observable<EvaluationDraft>): Observable<SaveOutcome> {
    return drafts$.pipe(
      debounce((draft) => (draft.when === 'note' ? timer(NOTE_DEBOUNCE_MS) : of(0))),
      // Un borrador nuevo cancela el guardado anterior: es más reciente y lo contiene.
      switchMap((draft) => this.persist(objectType, objectId, draft.input)),
    );
  }

  private persist(objectType: EvaluationObjectType, objectId: string, input: EvaluationInput): Observable<SaveOutcome> {
    const note = (input.note ?? '').trim() === '' ? null : input.note;
    const clean = { ...input, note };
    const request: Observable<Evaluation | null> = isEmptyInput(clean)
      ? this.source.remove(objectType, objectId).pipe(map(() => null))
      : this.source.put(objectType, objectId, clean);
    return request.pipe(
      map((evaluation): SaveOutcome => ({ status: 'saved', evaluation })),
      catchError((error: { status?: number }) =>
        // Borrar lo que nunca se guardó (404) es un éxito: ya no hay nada que borrar.
        of<SaveOutcome>(isEmptyInput(clean) && error?.status === 404 ? { status: 'saved', evaluation: null } : { status: 'error' }),
      ),
    );
  }
}
