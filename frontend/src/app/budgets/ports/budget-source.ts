import { Observable } from 'rxjs';
import { AllowanceTarget, Budget, BudgetAllowance, BudgetInput, BudgetList } from '../models/budget';

/** Origen de los Presupuestos, su configuración y sus excepciones (AC-76 a AC-78). */
export abstract class BudgetSource {
  abstract list(): Observable<BudgetList>;
  abstract create(input: BudgetInput): Observable<Budget>;
  abstract update(id: string, input: BudgetInput): Observable<Budget>;
  abstract remove(id: string): Observable<void>;
  abstract addAllowance(id: string, target: AllowanceTarget): Observable<BudgetAllowance>;
  abstract removeAllowance(id: string, allowanceId: string): Observable<void>;
}
