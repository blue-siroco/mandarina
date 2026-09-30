import { Observable } from 'rxjs';
import { SubscriptionUsage } from '../models/subscription-usage';

/** Origen del uso de la cuota de la suscripción (AC-136). `null` es una cuenta sin suscripción. */
export abstract class SubscriptionUsageSource {
  /** Última lectura conocida por el servidor. */
  abstract current(): Observable<SubscriptionUsage | null>;
  /** Lecturas nuevas según llegan, por el flujo en vivo compartido. */
  abstract changes(): Observable<SubscriptionUsage | null>;
}
