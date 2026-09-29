import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, merge, of, scan, startWith } from 'rxjs';
import { ObservedEvent } from '../models/observed-event';
import { EventFeed } from '../ports/event-feed';
import { LiveEvents } from './live-events';

export const RECENT_EVENTS_LIMIT = 200;

export interface RecentEventsState {
  events: ObservedEvent[];
  /** El historial inicial ya llegó (o falló). */
  loaded: boolean;
  historyFailed: boolean;
}

export const INITIAL_STATE: RecentEventsState = {
  events: [],
  loaded: false,
  historyFailed: false,
};

type Change = { kind: 'history'; events: ObservedEvent[] | null } | { kind: 'live'; events: ObservedEvent[] };

/**
 * Une Eventos sin duplicados (por id), del más reciente al más antiguo según
 * la recepción, y recorta a `limit`. Un Evento puede llegar por el WebSocket
 * antes de que responda el historial, por eso se deduplica.
 */
export function mergeEvents(current: ObservedEvent[], incoming: ObservedEvent[], limit: number): ObservedEvent[] {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()]
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .slice(0, limit);
}

export function reduce(state: RecentEventsState, change: Change, limit = RECENT_EVENTS_LIMIT): RecentEventsState {
  if (change.kind === 'live') return { ...state, events: mergeEvents(state.events, change.events, limit) };
  return {
    ...state,
    loaded: true,
    historyFailed: change.events === null,
    events: mergeEvents(state.events, change.events ?? [], limit),
  };
}

/** Caso de uso: lista de Eventos recientes que se actualiza en vivo (AC-09). */
@Injectable({ providedIn: 'root' })
export class WatchRecentEvents {
  private readonly feed = inject(EventFeed);
  private readonly live = inject(LiveEvents);

  execute(): Observable<RecentEventsState> {
    const history$ = this.feed.search({ limit: RECENT_EVENTS_LIMIT }).pipe(
      map((events): Change => ({ kind: 'history', events })),
      catchError(() => of<Change>({ kind: 'history', events: null })),
    );
    const live$ = this.live.events$.pipe(map((events): Change => ({ kind: 'live', events })));
    return merge(history$, live$).pipe(
      scan((state: RecentEventsState, change: Change) => reduce(state, change), INITIAL_STATE),
      startWith(INITIAL_STATE),
    );
  }
}
