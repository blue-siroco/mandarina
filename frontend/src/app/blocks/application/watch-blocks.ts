import { Injectable, inject } from '@angular/core';
import { Observable, catchError, filter, map, merge, of, scan, startWith } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { mergeEvents } from '../../events/application/watch-recent-events';
import { ObservedEvent } from '../../events/models/observed-event';
import { EventFeed } from '../../events/ports/event-feed';

export const BLOCK_WINDOW_DAYS = 7;
export const BLOCKS_LIMIT = 500;

export interface BlocksState {
  /** Más recientes primero. */
  blocks: ObservedEvent[];
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_BLOCKS: BlocksState = { blocks: [], loaded: false, failed: false };

type Change = { kind: 'history'; blocks: ObservedEvent[] | null } | { kind: 'live'; blocks: ObservedEvent[] };

export function reduceBlocks(state: BlocksState, change: Change): BlocksState {
  if (change.kind === 'live') return { ...state, blocks: mergeEvents(state.blocks, change.blocks, BLOCKS_LIMIT) };
  return {
    loaded: true,
    failed: change.blocks === null,
    blocks: mergeEvents(state.blocks, change.blocks ?? [], BLOCKS_LIMIT),
  };
}

/** 00:00 locales de hace `days - 1` días: la ventana incluye hoy entero. */
export function windowStart(now: Date, days = BLOCK_WINDOW_DAYS): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

/** Caso de uso: Bloqueos de los últimos 7 días, en vivo (AC-22). */
@Injectable({ providedIn: 'root' })
export class WatchBlocks {
  private readonly feed = inject(EventFeed);
  private readonly live = inject(LiveEvents);

  execute(): Observable<BlocksState> {
    const history$ = this.feed
      .search({ eventTypes: ['tool.blocked'], since: windowStart(new Date()), limit: BLOCKS_LIMIT })
      .pipe(
        map((blocks): Change => ({ kind: 'history', blocks })),
        catchError(() => of<Change>({ kind: 'history', blocks: null })),
      );
    const live$ = this.live.events$.pipe(
      map((events) => events.filter((e) => e.eventType === 'tool.blocked')),
      filter((blocks) => blocks.length > 0),
      map((blocks): Change => ({ kind: 'live', blocks })),
    );
    return merge(history$, live$).pipe(scan(reduceBlocks, INITIAL_BLOCKS), startWith(INITIAL_BLOCKS));
  }
}
