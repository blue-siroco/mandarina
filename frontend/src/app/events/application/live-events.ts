import { Injectable, inject } from '@angular/core';
import { Observable, distinctUntilChanged, filter, map, share, shareReplay, startWith } from 'rxjs';
import { SubscriptionUsage } from '../../subscription/models/subscription-usage';
import { BudgetStateChange, LiveConnection, LiveSignal, ObservedEvent } from '../models/observed-event';
import { EventFeed } from '../ports/event-feed';

/**
 * Un único WebSocket para toda la app: el board, la lista, el detalle y los
 * Bloqueos escuchan el mismo flujo en lugar de abrir una conexión cada uno.
 */
@Injectable({ providedIn: 'root' })
export class LiveEvents {
  private readonly signals$ = inject(EventFeed).live().pipe(share());

  /** Eventos nuevos, según llegan. */
  readonly events$: Observable<ObservedEvent[]> = this.signals$.pipe(
    filter((s): s is Extract<LiveSignal, { kind: 'event' }> => s.kind === 'event'),
    map((s) => [s.event]),
  );

  /** Cambios de estado de los Presupuestos, según llegan (AC-81). */
  readonly budgetChanges$: Observable<BudgetStateChange> = this.signals$.pipe(
    filter((s): s is Extract<LiveSignal, { kind: 'budget' }> => s.kind === 'budget'),
    map((s) => s.change),
  );

  /** Lecturas nuevas de la cuota de la suscripción; `null` es que la cuenta ya no la informa (AC-136). */
  readonly subscriptionUsage$: Observable<SubscriptionUsage | null> = this.signals$.pipe(
    filter((s): s is Extract<LiveSignal, { kind: 'subscription' }> => s.kind === 'subscription'),
    map((s) => s.usage),
  );

  /**
   * Estado de la conexión. Recuerda el último valor para quien se suscriba
   * tarde, y mantiene el socket abierto mientras viva la app (lo usa el shell).
   */
  readonly connection$: Observable<LiveConnection> = this.signals$.pipe(
    filter((s): s is Extract<LiveSignal, { kind: 'connection' }> => s.kind === 'connection'),
    map((s) => s.connection),
    startWith<LiveConnection>('connecting'),
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: false }),
  );
}
