import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { inputOf } from '../mappers/budget.mapper';
import { AllowanceTarget, Budget, BudgetAllowance, BudgetInput } from '../models/budget';
import { BudgetSource } from '../ports/budget-source';
import { WatchBudgets } from './watch-budgets';

export type BudgetOutcome = { ok: true } | { ok: false; message: string };

const OK: BudgetOutcome = { ok: true };

/** El servidor explica qué valor no vale (400); si no responde, se dice. */
export function errorMessage(error: unknown, fallback = 'No se pudo guardar el cambio'): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Sin conexión con Mandarina';
    const message = (error.error as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message !== '') return message;
  }
  return fallback;
}

/**
 * Casos de uso de la configuración de Presupuestos (AC-76, AC-78, AC-82): guardar, activar,
 * ampliar el límite, borrar y dar o quitar excepciones. Nunca fallan: el resultado dice si se
 * guardó y con qué mensaje del servidor, para mostrarlo junto al campo sin perder lo escrito.
 */
@Injectable({ providedIn: 'root' })
export class ManageBudgets {
  private readonly source = inject(BudgetSource);
  private readonly watch = inject(WatchBudgets);

  /** Crea el Presupuesto (`id` nulo) o sustituye el existente. */
  save(id: string | null, input: BudgetInput): Observable<BudgetOutcome> {
    return this.done(id === null ? this.source.create(input) : this.source.update(id, input));
  }

  setEnabled(budget: Budget, enabled: boolean): Observable<BudgetOutcome> {
    return this.done(this.source.update(budget.id, { ...inputOf(budget), enabled }));
  }

  raiseLimit(budget: Budget, limitUsd: number): Observable<BudgetOutcome> {
    return this.done(this.source.update(budget.id, { ...inputOf(budget), limitUsd }));
  }

  remove(budget: Budget): Observable<BudgetOutcome> {
    return this.done(this.source.remove(budget.id));
  }

  allow(budget: Budget, target: AllowanceTarget): Observable<BudgetOutcome> {
    return this.done(this.source.addAllowance(budget.id, target));
  }

  removeAllowance(budget: Budget, allowance: BudgetAllowance): Observable<BudgetOutcome> {
    return this.done(this.source.removeAllowance(budget.id, allowance.id));
  }

  private done(request: Observable<unknown>): Observable<BudgetOutcome> {
    return request.pipe(
      tap(() => this.watch.refresh()),
      map((): BudgetOutcome => OK),
      catchError((error: unknown) => of<BudgetOutcome>({ ok: false, message: errorMessage(error) })),
    );
  }
}
