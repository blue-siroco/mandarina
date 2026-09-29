import { WatchBudgets } from '../application/watch-budgets';
import { Observable, of } from 'rxjs';
import {
  BudgetAllowanceDto,
  BudgetDto,
  BudgetListDto,
  BudgetSubjectDto,
  toAllowance,
  toBudget,
  toBudgetList,
} from '../mappers/budget.mapper';
import { AllowanceTarget, Budget, BudgetAllowance, BudgetInput, BudgetList } from '../models/budget';
import { BudgetSource } from '../ports/budget-source';

export const SESSION_ID = '7f3c2a10-1b2c-4d5e-9f00-aa11bb22cc33';

export const budgetSubjectDto = (overrides: Partial<BudgetSubjectDto> = {}): BudgetSubjectDto => ({
  session_id: null,
  project: null,
  spent_usd: 12,
  ratio: 0.24,
  state: 'within',
  allowed: false,
  ...overrides,
});

export const budgetAllowanceDto = (overrides: Partial<BudgetAllowanceDto> = {}): BudgetAllowanceDto => ({
  id: 'al1',
  budget_id: 'b1',
  session_id: SESSION_ID,
  project: null,
  until: null,
  created_at: '2026-09-25T10:00:00.000Z',
  ...overrides,
});

export const budgetDto = (overrides: Partial<BudgetDto> = {}): BudgetDto => ({
  id: 'b1',
  scope: 'global_day',
  project: null,
  limit_usd: 50,
  warn_ratio: 0.8,
  action: 'stop',
  enabled: true,
  state: 'within',
  spent_usd: 12,
  subjects: [budgetSubjectDto()],
  sessions_tracked: 0,
  allowances: [],
  created_at: '2026-09-25T09:00:00.000Z',
  updated_at: '2026-09-25T09:00:00.000Z',
  ...overrides,
});

/** Un Presupuesto por Sesión con una Sesión Superada y otra Cerca. */
export const sessionBudgetDto = (overrides: Partial<BudgetDto> = {}): BudgetDto =>
  budgetDto({
    id: 'b2',
    scope: 'session',
    project: null,
    limit_usd: 5,
    state: 'exceeded',
    spent_usd: 9.5,
    sessions_tracked: 3,
    subjects: [
      budgetSubjectDto({ session_id: SESSION_ID, project: 'mandarina', spent_usd: 9.5, ratio: 1.9, state: 'exceeded' }),
      budgetSubjectDto({ session_id: 's-otra', project: 'lucia', spent_usd: 4.2, ratio: 0.84, state: 'near' }),
    ],
    ...overrides,
  });

export const budgetListDto = (overrides: Partial<BudgetListDto> = {}): BudgetListDto => ({
  items: [budgetDto(), sessionBudgetDto()],
  generated_at: '2026-09-25T12:00:00.000Z',
  ...overrides,
});

export const budget = (overrides: Partial<BudgetDto> = {}): Budget => toBudget(budgetDto(overrides));
export const sessionBudget = (overrides: Partial<BudgetDto> = {}): Budget => toBudget(sessionBudgetDto(overrides));
export const budgetList = (overrides: Partial<BudgetListDto> = {}): BudgetList => toBudgetList(budgetListDto(overrides));
export const allowance = (overrides: Partial<BudgetAllowanceDto> = {}): BudgetAllowance => toAllowance(budgetAllowanceDto(overrides));

/** Doble del puerto para las pruebas: registra las llamadas y responde con lo que se le da. */
export function stubBudgetSource(overrides: Partial<Record<keyof BudgetSource, unknown>> = {}) {
  const calls = {
    list: 0,
    create: [] as BudgetInput[],
    update: [] as Array<[string, BudgetInput]>,
    remove: [] as string[],
    addAllowance: [] as Array<[string, AllowanceTarget]>,
    removeAllowance: [] as Array<[string, string]>,
  };
  const source = {
    list: (): Observable<BudgetList> => ((calls.list += 1), of(budgetList())),
    create: (input: BudgetInput) => (calls.create.push(input), of(budget({ id: 'nuevo' }))),
    update: (id: string, input: BudgetInput) => (calls.update.push([id, input]), of(budget({ id }))),
    remove: (id: string) => (calls.remove.push(id), of(undefined)),
    addAllowance: (id: string, target: AllowanceTarget) => (calls.addAllowance.push([id, target]), of(allowance({ budget_id: id }))),
    removeAllowance: (id: string, allowanceId: string) => (calls.removeAllowance.push([id, allowanceId]), of(undefined)),
    ...overrides,
  };
  return { provider: { provide: BudgetSource, useValue: source }, calls };
}

/** Para las pruebas de otras features que alojan algo alimentado por los Presupuestos: no hay ninguno. */
export const noBudgets = { provide: WatchBudgets, useValue: { state$: of({ items: [], loaded: true, failed: false }) } };
