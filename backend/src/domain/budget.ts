// Presupuestos de Coste estimado (AC-76, AC-77; roadmap §1.15, ADR-0010).

export const BUDGET_SCOPES = ['session', 'project_day', 'global_day'] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];
export type BudgetAction = 'warn' | 'stop';
export type BudgetState = 'within' | 'near' | 'exceeded';

/** Lo que la persona usuaria configura en un Presupuesto. */
export interface BudgetInput {
  scope: BudgetScope;
  /** Obligatorio en `project_day`, opcional en `session` y siempre `null` en `global_day`. */
  project: string | null;
  limit_usd: number;
  warn_ratio: number;
  action: BudgetAction;
  enabled: boolean;
}

export const DEFAULT_WARN_RATIO = 0.8;

export type NormalizedBudget = { ok: true; value: BudgetInput } | { ok: false; message: string };

const invalid = (message: string): NormalizedBudget => ({ ok: false, message });

/** Valida el cuerpo de un `POST` o `PUT` y aplica los valores por defecto. */
export function normalizeBudget(input: unknown): NormalizedBudget {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid('El Presupuesto debe ser un objeto');
  const raw = input as Record<string, unknown>;
  const scope = raw.scope;
  if (typeof scope !== 'string' || !(BUDGET_SCOPES as readonly string[]).includes(scope)) {
    return invalid(`El ámbito debe ser uno de: ${BUDGET_SCOPES.join(', ')}`);
  }
  const project = typeof raw.project === 'string' && raw.project.trim() !== '' ? raw.project.trim() : null;
  if (raw.project !== undefined && raw.project !== null && typeof raw.project !== 'string') return invalid('El Proyecto debe ser un texto');
  if (scope === 'project_day' && project === null) return invalid('Un Presupuesto por Proyecto y día necesita un Proyecto');
  if (scope === 'global_day' && project !== null) return invalid('Un Presupuesto global del día no lleva Proyecto');
  const limit = raw.limit_usd;
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return invalid('El límite debe ser un número mayor que 0');
  const warn = raw.warn_ratio === undefined ? DEFAULT_WARN_RATIO : raw.warn_ratio;
  if (typeof warn !== 'number' || !Number.isFinite(warn) || warn <= 0 || warn > 1) return invalid('El umbral de aviso debe ser mayor que 0 y como mucho 1');
  const action = raw.action === undefined ? 'stop' : raw.action;
  if (action !== 'warn' && action !== 'stop') return invalid('La acción debe ser warn o stop');
  const enabled = raw.enabled === undefined ? true : raw.enabled;
  if (typeof enabled !== 'boolean') return invalid('El campo activo debe ser verdadero o falso');
  return { ok: true, value: { scope: scope as BudgetScope, project, limit_usd: limit, warn_ratio: warn, action, enabled } };
}

/** Dentro por debajo del umbral, Cerca hasta el límite (incluido) y Superado por encima. */
export function budgetState(spent: number, limit: number, warnRatio: number): BudgetState {
  if (spent > limit) return 'exceeded';
  return spent >= warnRatio * limit ? 'near' : 'within';
}

/** Las 00:00 del día natural de `date` en la zona horaria del proceso (`TZ`). */
export const startOfLocalDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Las 00:00 del día siguiente: el fin del día natural de `date`. */
export const endOfLocalDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

const money = (usd: number) => `~$${usd.toFixed(2).replace('.', ',')}`;

/** Frase para la persona usuaria cuando un Presupuesto detiene al agente (AC-79). */
export function stopReason(budget: { scope: BudgetScope; project: string | null }, limitUsd: number, spentUsd: number): string {
  const label =
    budget.scope === 'session'
      ? 'Presupuesto por Sesión'
      : budget.scope === 'project_day'
        ? `Presupuesto de ${budget.project} del día`
        : 'Presupuesto global del día';
  return `${label} superado: ${money(spentUsd)} de ${money(limitUsd)}. Amplía el límite o permite seguir en Mandarina (/presupuestos).`;
}
