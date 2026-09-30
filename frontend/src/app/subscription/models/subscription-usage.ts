/** Estado de una ventana de la cuota; `reset_pending` es que su hora de reinicio ya pasó (AC-138). */
export type UsageWindowStatus = 'comfortable' | 'near' | 'exhausted' | 'reset_pending';

/** Una ventana de la cuota de la suscripción: la de 5 horas o la semanal (AC-137). */
export interface UsageWindow {
  usedPercent: number;
  /** Lo que queda: es la cifra que se enseña, no lo consumido. */
  remainingPercent: number;
  resetsAt: Date;
  status: UsageWindowStatus;
}

/** Última lectura de la cuota de la cuenta; cada ventana puede faltar por separado. */
export interface SubscriptionUsage {
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  updatedAt: Date;
}
