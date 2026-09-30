import { mergeReading, presentUsage, type SubscriptionReading, type SubscriptionUsage } from '../domain/subscription-usage.js';
import type { Broadcaster, Clock, SubscriptionUsageStore } from './ports.js';

/** `SubscriptionUsageMessage` de `specs/api-spec.yaml`. */
export interface SubscriptionUsageMessage {
  type: 'subscription.usage';
  usage: SubscriptionUsage | null;
}

export type RecordResult = { ok: true } | { ok: false; status: 400; message: string };

/**
 * Casos de uso del Uso de la suscripción (AC-130, AC-131): guardar y difundir la
 * última lectura de la cuenta, y consultarla con el estado calculado al momento.
 */
export class ManageSubscriptionUsage {
  constructor(
    private readonly store: SubscriptionUsageStore,
    private readonly clock: Clock,
    private readonly broadcaster: Broadcaster,
  ) {}

  /** Sin ventanas no hay nada que guardar: sería borrar la lectura sin motivo. */
  record(reading: SubscriptionReading): RecordResult {
    if (!reading.five_hour && !reading.seven_day) {
      return { ok: false, status: 400, message: 'Falta al menos una ventana: five_hour o seven_day' };
    }
    const now = this.clock.now();
    this.store.save(mergeReading(this.store.get(), reading, now));
    const message: SubscriptionUsageMessage = { type: 'subscription.usage', usage: this.current() };
    this.broadcaster.broadcast(message);
    return { ok: true };
  }

  /** `null` si nunca llegó una lectura: la cuenta no es de suscripción. */
  current(): SubscriptionUsage | null {
    const stored = this.store.get();
    return stored === null ? null : presentUsage(stored, this.clock.now());
  }
}
