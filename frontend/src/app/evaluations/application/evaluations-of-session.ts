import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, startWith } from 'rxjs';
import { Evaluation, evaluationKey } from '../models/evaluation';
import { EvaluationSource } from '../ports/evaluation-source';

export interface SessionEvaluations {
  /** Por `evaluationKey(tipo, id)`: la Sesión y sus Turnos y Subagentes evaluados. */
  byKey: ReadonlyMap<string, Evaluation>;
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_SESSION_EVALUATIONS: SessionEvaluations = { byKey: new Map(), loaded: false, failed: false };

/**
 * Caso de uso: las Evaluaciones de una Sesión, cargadas una vez al abrir su
 * detalle (AC-57). Guardar una no recarga nada: cada control lleva su estado.
 */
@Injectable({ providedIn: 'root' })
export class EvaluationsOfSession {
  private readonly source = inject(EvaluationSource);

  execute(sessionId: string): Observable<SessionEvaluations> {
    return this.source.list({ sessionId }).pipe(
      map(({ items }): SessionEvaluations => ({
        byKey: new Map(items.map((e) => [evaluationKey(e.objectType, e.objectId), e])),
        loaded: true,
        failed: false,
      })),
      // Sin Evaluaciones cargadas los controles siguen usables, vacíos: guardar no depende de leer.
      catchError(() => of<SessionEvaluations>({ byKey: new Map(), loaded: true, failed: true })),
      startWith(INITIAL_SESSION_EVALUATIONS),
    );
  }
}
