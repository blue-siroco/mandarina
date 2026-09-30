import { Provider } from '@angular/core';
import { HttpSubscriptionUsageSource } from './infrastructure/http-subscription-usage-source';
import { SubscriptionUsageSource } from './ports/subscription-usage-source';

/** Composition root del feature de uso de la suscripción. */
export function provideSubscription(): Provider[] {
  return [{ provide: SubscriptionUsageSource, useClass: HttpSubscriptionUsageSource }];
}
