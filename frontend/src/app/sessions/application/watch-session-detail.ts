import { Injectable, inject } from '@angular/core';
import {
  Observable,
  asyncScheduler,
  catchError,
  exhaustMap,
  filter,
  forkJoin,
  map,
  merge,
  of,
  scan,
  startWith,
  throttleTime,
  timer,
} from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { ObservedEvent } from '../../events/models/observed-event';
import { EventFeed } from '../../events/ports/event-feed';
import { SessionDetail } from '../models/session';
import { SessionSource } from '../ports/session-source';
import { BOARD_REFRESH_MS, LIVE_THROTTLE_MS } from './watch-session-board';

/** Eventos de la Sesión que se piden para los carriles y la lista (el máximo de la API). */
export const SESSION_EVENTS_LIMIT = 500;

export interface DetailState {
  detail: SessionDetail | null;
  /** Más recientes primero, como en la lista de Eventos. */
  events: ObservedEvent[];
  loaded: boolean;
  notFound: boolean;
  failed: boolean;
}

export const INITIAL_DETAIL: DetailState = { detail: null, events: [], loaded: false, notFound: false, failed: false };

type Result = { ok: true; detail: SessionDetail | null; events: ObservedEvent[] } | { ok: false };

export function reduceDetail(state: DetailState, result: Result): DetailState {
  if (!result.ok) return { ...state, loaded: true, failed: true };
  return {
    detail: result.detail,
    events: result.detail ? result.events : [],
    loaded: true,
    notFound: result.detail === null,
    failed: false,
  };
}

/** Caso de uso: detalle de Sesión que se refresca mientras recibe Eventos (AC-19). */
@Injectable({ providedIn: 'root' })
export class WatchSessionDetail {
  private readonly source = inject(SessionSource);
  private readonly feed = inject(EventFeed);
  private readonly live = inject(LiveEvents);

  execute(sessionId: string): Observable<DetailState> {
    const own$ = this.live.events$.pipe(
      filter((events) => events.some((e) => e.sessionId === sessionId)),
      throttleTime(LIVE_THROTTLE_MS, asyncScheduler, { leading: true, trailing: true }),
    );
    return merge(timer(0, BOARD_REFRESH_MS), own$).pipe(
      exhaustMap(() =>
        forkJoin({
          detail: this.source.detail(sessionId),
          events: this.feed.search({ sessionId, limit: SESSION_EVENTS_LIMIT }),
        }).pipe(
          map(({ detail, events }): Result => ({ ok: true, detail, events })),
          catchError(() => of<Result>({ ok: false })),
        ),
      ),
      scan(reduceDetail, INITIAL_DETAIL),
      startWith(INITIAL_DETAIL),
    );
  }
}
