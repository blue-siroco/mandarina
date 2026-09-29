import { formatCost, shortId } from '../../shared/format';
import { Budget, BudgetState, BudgetSubject } from '../models/budget';

export interface BudgetAlertItem {
  budget: Budget;
  subject: BudgetSubject;
}

export interface WorstAlert extends BudgetAlertItem {
  /** Otros ámbitos Cerca o Superados además del peor. */
  more: number;
}

const RANK: Record<BudgetState, number> = { within: 0, near: 1, exceeded: 2 };

/** Los ámbitos de Presupuestos activos que están Cerca o Superados y no tienen una excepción vigente (AC-83). */
export function alertsOf(budgets: Budget[]): BudgetAlertItem[] {
  return budgets
    .filter((b) => b.enabled)
    .flatMap((budget) => budget.subjects.filter((s) => s.state !== 'within' && !s.allowed).map((subject) => ({ budget, subject })));
}

/** El peor por estado y, a igual estado, por proporción gastada. */
export function worstAlert(budgets: Budget[]): WorstAlert | null {
  const all = alertsOf(budgets);
  const worst = all.reduce<BudgetAlertItem | undefined>(
    (best, item) =>
      !best || RANK[item.subject.state] > RANK[best.subject.state] || (RANK[item.subject.state] === RANK[best.subject.state] && item.subject.ratio > best.subject.ratio)
        ? item
        : best,
    undefined,
  );
  return worst ? { ...worst, more: all.length - 1 } : null;
}

/** Nombre corto de lo que vigila un Presupuesto. */
export function budgetLabel(budget: Pick<Budget, 'scope' | 'project'>, subject?: Pick<BudgetSubject, 'sessionId'>): string {
  if (budget.scope === 'global_day') return 'Presupuesto global del día';
  if (budget.scope === 'project_day') return `Presupuesto de ${budget.project} del día`;
  return subject?.sessionId ? `Presupuesto por Sesión (${shortId(subject.sessionId)})` : 'Presupuesto por Sesión';
}

/** "Presupuesto global del día superado: ~$52 de ~$50" (AC-83). */
export function alertMessage({ budget, subject }: BudgetAlertItem): string {
  const verb = subject.state === 'exceeded' ? 'superado' : 'cerca del límite';
  return `${budgetLabel(budget, subject)} ${verb}: ${formatCost(subject.spentUsd)} de ${formatCost(budget.limitUsd)}`;
}

/** Lo gastado hoy frente al Presupuesto global del día, para la ficha de coste del board (AC-84). */
export interface DayBudgetProgress {
  label: string;
  percent: number;
  ratio: number;
  state: BudgetState;
}

/** El Presupuesto global del día activo más apurado; `null` si no hay ninguno. */
export function dayProgress(budgets: Budget[]): DayBudgetProgress | null {
  const global = budgets
    .filter((b) => b.enabled && b.scope === 'global_day')
    .map((b) => ({ budget: b, spent: b.subjects[0]?.spentUsd ?? b.spentUsd }))
    .sort((a, b) => b.spent / b.budget.limitUsd - a.spent / a.budget.limitUsd)[0];
  if (!global) return null;
  const ratio = global.spent / global.budget.limitUsd;
  return {
    label: `Hoy: ${formatCost(global.spent)} de ${formatCost(global.budget.limitUsd)}`,
    percent: Math.min(100, Math.round(ratio * 100)),
    ratio,
    state: global.budget.subjects[0]?.state ?? global.budget.state,
  };
}
