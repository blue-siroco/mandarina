import { Injectable, inject } from '@angular/core';
import { Observable, catchError, exhaustMap, map, of, scan, startWith, timer } from 'rxjs';
import { Evaluation, EvaluationList, EvaluationObjectType, EvaluationTagCount, ScoreFilter } from '../models/evaluation';
import { EvaluationSource } from '../ports/evaluation-source';

/** Las Evaluaciones las escribe la persona usuaria, no llegan por el WebSocket: basta con sondear (AC-58). */
export const EVALUATIONS_REFRESH_MS = 30_000;

export interface EvaluationsQuery {
  /** Solo las actualizadas en los últimos `windowMs`; sin él, todas. */
  windowMs?: number;
  objectTypes?: EvaluationObjectType[];
  score?: ScoreFilter;
  tag?: string;
  project?: string;
}

export interface EvaluationsState {
  /** La actualizada más recientemente primero; se conservan si falla un refresco. */
  items: Evaluation[];
  tags: EvaluationTagCount[];
  projects: string[];
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_EVALUATIONS: EvaluationsState = { items: [], tags: [], projects: [], loaded: false, failed: false };

export type EvaluationsResult = { ok: true; list: EvaluationList } | { ok: false };

export function reduceEvaluations(state: EvaluationsState, result: EvaluationsResult): EvaluationsState {
  if (!result.ok) return { ...state, loaded: true, failed: true };
  const { items, tags, projects } = result.list;
  return { items, tags, projects, loaded: true, failed: false };
}

/** Caso de uso: Evaluaciones de la pantalla `/evaluaciones`, que se refrescan solas (AC-58). */
@Injectable({ providedIn: 'root' })
export class WatchEvaluations {
  private readonly source = inject(EvaluationSource);

  execute({ windowMs, ...filter }: EvaluationsQuery = {}): Observable<EvaluationsState> {
    return timer(0, EVALUATIONS_REFRESH_MS).pipe(
      // Si una petición tarda más que el intervalo, no se apilan otras detrás.
      exhaustMap(() =>
        // La ventana avanza con el reloj en cada refresco, como las fichas del board.
        this.source.list({ ...filter, since: windowMs === undefined ? undefined : new Date(Date.now() - windowMs) }).pipe(
          map((list): EvaluationsResult => ({ ok: true, list })),
          catchError(() => of<EvaluationsResult>({ ok: false })),
        ),
      ),
      scan(reduceEvaluations, INITIAL_EVALUATIONS),
      startWith(INITIAL_EVALUATIONS),
    );
  }

  /** URL de descarga del Dataset con los filtros vigentes (AC-58). */
  exportUrl({ windowMs, ...filter }: EvaluationsQuery = {}): string {
    return this.source.exportUrl({ ...filter, since: windowMs === undefined ? undefined : new Date(Date.now() - windowMs) });
  }
}
