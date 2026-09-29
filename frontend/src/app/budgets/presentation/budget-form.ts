import { Budget, BudgetAction, BudgetInput, BudgetScope, DEFAULT_WARN_RATIO } from '../models/budget';

/** Lo escrito en el formulario, todavía como texto (AC-82). */
export interface BudgetDraft {
  scope: BudgetScope;
  project: string;
  limit: string;
  /** Porcentaje del límite a partir del cual pasa a Cerca. */
  threshold: string;
  action: BudgetAction;
}

export interface DraftErrors {
  project?: string;
  limit?: string;
  threshold?: string;
}

export const EMPTY_DRAFT: BudgetDraft = {
  scope: 'global_day',
  project: '',
  limit: '',
  threshold: String(DEFAULT_WARN_RATIO * 100),
  action: 'stop',
};

/** Acepta coma o punto decimal; `null` si no es un número. */
export function parseAmount(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Las mismas reglas que el servidor (AC-76), para avisar mientras se escribe. */
export function validateDraft(draft: BudgetDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (draft.scope === 'project_day' && draft.project.trim() === '') errors.project = 'Elige el Proyecto';
  const limit = parseAmount(draft.limit);
  if (limit === null || limit <= 0) errors.limit = 'El límite debe ser un número mayor que 0';
  const threshold = parseAmount(draft.threshold);
  if (threshold === null || threshold <= 0 || threshold > 100) errors.threshold = 'El umbral debe estar entre 1 y 100 %';
  return errors;
}

/** Solo con un borrador válido. En `global_day` el Proyecto no viaja. */
export function toBudgetInput(draft: BudgetDraft, enabled: boolean): BudgetInput {
  const project = draft.scope === 'global_day' || draft.project.trim() === '' ? null : draft.project.trim();
  return {
    scope: draft.scope,
    project,
    limitUsd: parseAmount(draft.limit)!,
    warnRatio: parseAmount(draft.threshold)! / 100,
    action: draft.action,
    enabled,
  };
}

export function draftOf(budget: Budget): BudgetDraft {
  return {
    scope: budget.scope,
    project: budget.project ?? '',
    limit: String(budget.limitUsd),
    threshold: String(Math.round(budget.warnRatio * 1000) / 10),
    action: budget.action,
  };
}
