import { SubscriptionUsage, UsageWindow, UsageWindowStatus } from '../models/subscription-usage';

/** `UsageWindow` de `spec/api-spec.yaml`. */
export interface UsageWindowDto {
  used_percent: number;
  remaining_percent: number;
  resets_at: string;
  status: UsageWindowStatus;
}

/** `SubscriptionUsage` de `spec/api-spec.yaml`. */
export interface SubscriptionUsageDto {
  five_hour?: UsageWindowDto | null;
  seven_day?: UsageWindowDto | null;
  updated_at: string;
}

function toWindow(dto: UsageWindowDto | null | undefined): UsageWindow | null {
  if (!dto) return null;
  return {
    usedPercent: dto.used_percent,
    remainingPercent: dto.remaining_percent,
    resetsAt: new Date(dto.resets_at),
    status: dto.status,
  };
}

/** Cada ventana puede faltar por separado; sin lectura (`null`) la cuenta no es de suscripción. */
export function toSubscriptionUsage(dto: SubscriptionUsageDto | null | undefined): SubscriptionUsage | null {
  if (!dto) return null;
  return { fiveHour: toWindow(dto.five_hour), sevenDay: toWindow(dto.seven_day), updatedAt: new Date(dto.updated_at) };
}
