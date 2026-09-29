import { Injectable, inject } from '@angular/core';
import { Observable, Subject, catchError, defer, map, merge, of, scan, shareReplay, startWith, switchMap, timer } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { Budget, BudgetList } from '../models/budget';
import { BudgetSource } from '../ports/budget-source';

/** Lo gastado cambia con los Transcripts, que no emiten Eventos: además del aviso del WebSocket, se sondea (AC-82). */
export const BUDGETS_REFRESH_MS = 30_000;

export interface BudgetsState {
  /** En el orden en que se crearon; se conservan si falla un refresco. */
  items: Budget[];
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_BUDGETS: BudgetsState = { items: [], loaded: false, failed: false };

export type BudgetsResult = { ok: true; list: BudgetList } | { ok: false };

export function reduceBudgets(state: BudgetsState, result: BudgetsResult): BudgetsState {
  return result.ok ? { items: result.list.items, loaded: true, failed: false } : { ...state, loaded: true, failed: true };
}

/**
 * Caso de uso: los Presupuestos con su estado, compartidos por la pantalla, el aviso de
 * la cabecera y la ficha de coste del board (AC-82 a AC-84). Se refrescan al llegar un
 * `budget.state` por el WebSocket, al pedirlo (`refresh`) y cada 30 s.
 */
@Injectable({ providedIn: 'root' })
export class WatchBudgets {
  private readonly source = inject(BudgetSource);
  private readonly live = inject(LiveEvents);
  private readonly forced$ = new Subject<void>();

  readonly state$: Observable<BudgetsState> = defer(() => merge(timer(0, BUDGETS_REFRESH_MS), this.live.budgetChanges$, this.forced$)).pipe(
    switchMap(() =>
      this.source.list().pipe(
        map((list): BudgetsResult => ({ ok: true, list })),
        catchError(() => of<BudgetsResult>({ ok: false })),
      ),
    ),
    scan(reduceBudgets, INITIAL_BUDGETS),
    startWith(INITIAL_BUDGETS),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** Vuelve a pedir los Presupuestos, p. ej. tras crear o editar uno. */
  refresh(): void {
    this.forced$.next();
  }
}
