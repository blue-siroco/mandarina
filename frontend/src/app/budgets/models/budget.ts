import { BudgetLiveState } from '../../events/models/observed-event';

export type BudgetScope = 'session' | 'project_day' | 'global_day';
export type BudgetAction = 'warn' | 'stop';
export type BudgetState = BudgetLiveState;

/** A quién se aplica el Presupuesto y lo que lleva gastado (AC-77). */
export interface BudgetSubject {
  sessionId: string | null;
  project: string | null;
  spentUsd: number;
  ratio: number;
  state: BudgetState;
  /** Hay una excepción vigente que le deja seguir (AC-78). */
  allowed: boolean;
}

export interface BudgetAllowance {
  id: string;
  budgetId: string;
  sessionId: string | null;
  project: string | null;
  until: Date | null;
}

/** Lo que la persona usuaria configura (AC-76). `warnRatio` es una fracción, 0,8 = 80 %. */
export interface BudgetInput {
  scope: BudgetScope;
  project: string | null;
  limitUsd: number;
  warnRatio: number;
  action: BudgetAction;
  enabled: boolean;
}

export interface Budget extends BudgetInput {
  id: string;
  state: BudgetState;
  spentUsd: number;
  subjects: BudgetSubject[];
  sessionsTracked: number;
  allowances: BudgetAllowance[];
}

export interface BudgetList {
  items: Budget[];
  generatedAt: Date;
}

/** Excepción que se pide: una Sesión o un Proyecto, nunca los dos (AC-78). */
export type AllowanceTarget = { sessionId: string } | { project: string };

export const SCOPE_LABELS: Record<BudgetScope, string> = {
  session: 'Por Sesión',
  project_day: 'Proyecto y día',
  global_day: 'Global del día',
};

export const STATE_LABELS: Record<BudgetState, string> = {
  within: 'Dentro',
  near: 'Cerca',
  exceeded: 'Superado',
};

export const ACTION_LABELS: Record<BudgetAction, string> = { warn: 'Avisar', stop: 'Detener' };

export const DEFAULT_WARN_RATIO = 0.8;
