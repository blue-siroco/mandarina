import {
  AllowanceTarget,
  Budget,
  BudgetAction,
  BudgetAllowance,
  BudgetInput,
  BudgetList,
  BudgetScope,
  BudgetState,
  BudgetSubject,
} from '../models/budget';

/** `BudgetSubject` de `spec/api-spec.yaml`. */
export interface BudgetSubjectDto {
  session_id: string | null;
  project: string | null;
  spent_usd: number;
  ratio: number;
  state: BudgetState;
  allowed: boolean;
}

/** `BudgetAllowance` de `spec/api-spec.yaml`. */
export interface BudgetAllowanceDto {
  id: string;
  budget_id: string;
  session_id: string | null;
  project: string | null;
  until: string | null;
  created_at: string;
}

/** `Budget` de `spec/api-spec.yaml`. */
export interface BudgetDto {
  id: string;
  scope: BudgetScope;
  project: string | null;
  limit_usd: number;
  warn_ratio: number;
  action: BudgetAction;
  enabled: boolean;
  state: BudgetState;
  spent_usd: number;
  subjects: BudgetSubjectDto[];
  sessions_tracked: number;
  allowances: BudgetAllowanceDto[];
  created_at: string;
  updated_at: string;
}

export interface BudgetListDto {
  items: BudgetDto[];
  generated_at: string;
}

/** `BudgetInput` de `spec/api-spec.yaml`. */
export interface BudgetInputDto {
  scope: BudgetScope;
  project: string | null;
  limit_usd: number;
  warn_ratio: number;
  action: BudgetAction;
  enabled: boolean;
}

const toSubject = (dto: BudgetSubjectDto): BudgetSubject => ({
  sessionId: dto.session_id,
  project: dto.project,
  spentUsd: dto.spent_usd,
  ratio: dto.ratio,
  state: dto.state,
  allowed: dto.allowed,
});

export const toAllowance = (dto: BudgetAllowanceDto): BudgetAllowance => ({
  id: dto.id,
  budgetId: dto.budget_id,
  sessionId: dto.session_id,
  project: dto.project,
  until: dto.until === null ? null : new Date(dto.until),
});

export const toBudget = (dto: BudgetDto): Budget => ({
  id: dto.id,
  scope: dto.scope,
  project: dto.project,
  limitUsd: dto.limit_usd,
  warnRatio: dto.warn_ratio,
  action: dto.action,
  enabled: dto.enabled,
  state: dto.state,
  spentUsd: dto.spent_usd,
  subjects: dto.subjects.map(toSubject),
  sessionsTracked: dto.sessions_tracked,
  allowances: dto.allowances.map(toAllowance),
});

export const toBudgetList = (dto: BudgetListDto): BudgetList => ({
  items: dto.items.map(toBudget),
  generatedAt: new Date(dto.generated_at),
});

export const toBudgetInputDto = (input: BudgetInput): BudgetInputDto => ({
  scope: input.scope,
  project: input.project,
  limit_usd: input.limitUsd,
  warn_ratio: input.warnRatio,
  action: input.action,
  enabled: input.enabled,
});

export const toAllowanceBody = (target: AllowanceTarget): { session_id: string } | { project: string } =>
  'sessionId' in target ? { session_id: target.sessionId } : { project: target.project };

/** Lo que se puede volver a enviar de un Presupuesto ya guardado. */
export const inputOf = (budget: Budget): BudgetInput => ({
  scope: budget.scope,
  project: budget.project,
  limitUsd: budget.limitUsd,
  warnRatio: budget.warnRatio,
  action: budget.action,
  enabled: budget.enabled,
});
