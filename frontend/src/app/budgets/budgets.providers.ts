import { Provider } from '@angular/core';
import { HttpBudgetSource } from './infrastructure/http-budget-source';
import { BudgetSource } from './ports/budget-source';

/** Composition root del feature de Presupuestos. */
export function provideBudgets(): Provider[] {
  return [{ provide: BudgetSource, useClass: HttpBudgetSource }];
}
