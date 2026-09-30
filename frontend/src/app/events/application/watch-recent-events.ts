import { Injectable, inject } from '@angular/core';
import { Observable, catchError, filter, map, merge, of, scan, startWith } from 'rxjs';
import { EventQuery, ObservedEvent } from '../models/observed-event';
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

/** Filtros de la lista de Eventos; la ventana es una duración para calcular `since` al pedir el historial (AC-110). */
export interface EventFilter {
  project?: string;
  sessionId?: string;
  windowMs?: number;
}

/** Un Evento en vivo entra en la lista solo si cumple el Proyecto y la Sesión activos (AC-111). */
export function matchesFilter(event: ObservedEvent, { project, sessionId }: EventFilter): boolean {
  return (project === undefined || event.project === project) && (sessionId === undefined || event.sessionId === sessionId);
}

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

  execute(filters: EventFilter = {}): Observable<RecentEventsState> {
    const query: EventQuery = { limit: RECENT_EVENTS_LIMIT };
    if (filters.project !== undefined) query.project = filters.project;
    if (filters.sessionId !== undefined) query.sessionId = filters.sessionId;
    if (filters.windowMs !== undefined) query.since = new Date(Date.now() - filters.windowMs);
    const history$ = this.feed.search(query).pipe(
      map((events): Change => ({ kind: 'history', events })),
      catchError(() => of<Change>({ kind: 'history', events: null })),
    );
    const live$ = this.live.events$.pipe(
      map((events) => events.filter((event) => matchesFilter(event, filters))),
      filter((events) => events.length > 0),
      map((events): Change => ({ kind: 'live', events })),
    );
    return merge(history$, live$).pipe(
      scan((state: RecentEventsState, change: Change) => reduce(state, change), INITIAL_STATE),
      startWith(INITIAL_STATE),
    );
  }
}
