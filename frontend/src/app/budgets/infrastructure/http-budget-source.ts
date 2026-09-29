import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  BudgetAllowanceDto,
  BudgetDto,
  BudgetListDto,
  toAllowance,
  toAllowanceBody,
  toBudget,
  toBudgetInputDto,
  toBudgetList,
} from '../mappers/budget.mapper';
import { AllowanceTarget, Budget, BudgetAllowance, BudgetInput, BudgetList } from '../models/budget';
import { BudgetSource } from '../ports/budget-source';

const BUDGETS = '/api/v1/budgets';
const one = (id: string) => `${BUDGETS}/${encodeURIComponent(id)}`;

@Injectable()
export class HttpBudgetSource extends BudgetSource {
  private readonly http = inject(HttpClient);

  list(): Observable<BudgetList> {
    return this.http.get<BudgetListDto>(BUDGETS).pipe(map(toBudgetList));
  }

  create(input: BudgetInput): Observable<Budget> {
    return this.http.post<BudgetDto>(BUDGETS, toBudgetInputDto(input)).pipe(map(toBudget));
  }

  update(id: string, input: BudgetInput): Observable<Budget> {
    return this.http.put<BudgetDto>(one(id), toBudgetInputDto(input)).pipe(map(toBudget));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(one(id)).pipe(map(() => undefined));
  }

  addAllowance(id: string, target: AllowanceTarget): Observable<BudgetAllowance> {
    return this.http.post<BudgetAllowanceDto>(`${one(id)}/allowances`, toAllowanceBody(target)).pipe(map(toAllowance));
  }

  removeAllowance(id: string, allowanceId: string): Observable<void> {
    return this.http.delete<void>(`${one(id)}/allowances/${encodeURIComponent(allowanceId)}`).pipe(map(() => undefined));
  }
}
