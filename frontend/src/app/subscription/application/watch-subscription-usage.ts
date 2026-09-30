import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, map, merge, of, scan, shareReplay, startWith, switchMap, timer } from 'rxjs';
import { SubscriptionUsage } from '../models/subscription-usage';
import { SubscriptionUsageSource } from '../ports/subscription-usage-source';

/** Además del aviso del WebSocket se vuelve a pedir de vez en cuando, por si se perdió alguno. */
export const SUBSCRIPTION_REFRESH_MS = 60_000;

export interface SubscriptionUsageState {
  /** `null`: sin suscripción, o sin lectura todavía. La ficha no se pinta. */
  usage: SubscriptionUsage | null;
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_SUBSCRIPTION_STATE: SubscriptionUsageState = { usage: null, loaded: false, failed: false };

export type SubscriptionResult = { ok: true; usage: SubscriptionUsage | null } | { ok: false };

/** Un fallo de red conserva la última lectura (AC-136). */
export function reduceSubscription(state: SubscriptionUsageState, result: SubscriptionResult): SubscriptionUsageState {
  return result.ok ? { usage: result.usage, loaded: true, failed: false } : { ...state, loaded: true, failed: true };
}

const ok = (usage: SubscriptionUsage | null): SubscriptionResult => ({ ok: true, usage });

/**
 * Caso de uso: uso de la cuota de la suscripción para la ficha del board (AC-136). Lee la
 * última lectura al suscribirse y cada minuto, y aplica cada `subscription.usage` del
 * WebSocket según llega.
 */
@Injectable({ providedIn: 'root' })
export class WatchSubscriptionUsage {
  private readonly source = inject(SubscriptionUsageSource);

  readonly state$: Observable<SubscriptionUsageState> = defer(() =>
    merge(
      timer(0, SUBSCRIPTION_REFRESH_MS).pipe(
        switchMap(() =>
          this.source.current().pipe(
            map(ok),
            catchError(() => of<SubscriptionResult>({ ok: false })),
          ),
        ),
      ),
      this.source.changes().pipe(map(ok)),
    ),
  ).pipe(
    scan(reduceSubscription, INITIAL_SUBSCRIPTION_STATE),
    startWith(INITIAL_SUBSCRIPTION_STATE),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
}
