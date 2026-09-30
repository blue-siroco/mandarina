import { of } from 'rxjs';
import { INITIAL_SUBSCRIPTION_STATE, WatchSubscriptionUsage } from '../application/watch-subscription-usage';
import { SubscriptionUsageDto, UsageWindowDto, toSubscriptionUsage } from '../mappers/subscription-usage.mapper';

/** Hora de referencia de las pruebas: las ventanas se sitúan respecto a ella. */
export const NOW = new Date('2026-09-30T10:00:00.000Z');
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

export const windowDto = (overrides: Partial<UsageWindowDto> = {}): UsageWindowDto => ({
  used_percent: 38,
  remaining_percent: 62,
  resets_at: at(72 * 60_000),
  status: 'comfortable',
  ...overrides,
});

export const subscriptionUsageDto = (overrides: Partial<SubscriptionUsageDto> = {}): SubscriptionUsageDto => ({
  five_hour: windowDto(),
  seven_day: windowDto({ used_percent: 60, remaining_percent: 40, resets_at: at(3 * 86_400_000 + 5 * 3_600_000) }),
  updated_at: at(-5 * 60_000),
  ...overrides,
});

export const subscriptionUsage = (overrides: Partial<SubscriptionUsageDto> = {}) => toSubscriptionUsage(subscriptionUsageDto(overrides))!;

/** Para las pruebas de otras features que alojan la ficha: sin suscripción no se pinta nada. */
export const noSubscription = {
  provide: WatchSubscriptionUsage,
  useValue: { state$: of({ ...INITIAL_SUBSCRIPTION_STATE, loaded: true }) },
};
