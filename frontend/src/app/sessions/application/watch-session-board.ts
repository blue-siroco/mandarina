import { Injectable, inject } from '@angular/core';
import {
  Observable,
  asyncScheduler,
  catchError,
  exhaustMap,
  map,
  merge,
  of,
  scan,
  startWith,
  throttleTime,
  timer,
} from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { SessionList, SessionState, SessionSummary } from '../models/session';
import { SessionSource } from '../ports/session-source';

/** Sin Eventos, los Estados también cambian con el tiempo (Activa → Inactiva → Huérfana). */
export const BOARD_REFRESH_MS = 10_000;
/** Una ráfaga de Eventos provoca como mucho una recarga por segundo. */
export const LIVE_THROTTLE_MS = 1000;

/** Filtros del board; la ventana es una duración para que avance con el tiempo. */
export interface BoardFilter {
  /** Solo Sesiones con Eventos en los últimos `windowMs`; sin ella, todas. */
  windowMs?: number;
  states?: SessionState[];
  directory?: string;
}

export interface BoardState {
  list: SessionList | null;
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_BOARD: BoardState = { list: null, loaded: false, failed: false };

type Result = { ok: true; list: SessionList } | { ok: false };

export function reduceBoard(state: BoardState, result: Result): BoardState {
  return result.ok ? { list: result.list, loaded: true, failed: false } : { ...state, loaded: true, failed: true };
}

export interface ProjectGroup {
  project: string;
  /** Sesiones no Cerradas, por inicio (la más nueva primero). */
  open: SessionSummary[];
  closed: SessionSummary[];
  activeCount: number;
  lastActivityAt: Date;
}

const byStartDesc = (a: SessionSummary, b: SessionSummary) =>
  b.startedAt.getTime() - a.startedAt.getTime() || a.sessionId.localeCompare(b.sessionId);

/**
 * Agrupa por Proyecto en orden alfabético y, dentro, por inicio (la más nueva
 * primero). Nada depende de la actividad, así que ni los grupos ni las
 * tarjetas cambian de sitio al llegar Eventos (design §6.1, AC-16).
 */
export function groupByProject(items: SessionSummary[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  for (const session of items) {
    let group = groups.get(session.project);
    if (!group) {
      group = { project: session.project, open: [], closed: [], activeCount: 0, lastActivityAt: session.lastActivityAt };
      groups.set(session.project, group);
    }
    (session.state === 'closed' ? group.closed : group.open).push(session);
    if (session.state === 'active') group.activeCount += 1;
    if (session.lastActivityAt > group.lastActivityAt) group.lastActivityAt = session.lastActivityAt;
  }
  for (const group of groups.values()) {
    group.open.sort(byStartDesc);
    group.closed.sort(byStartDesc);
  }
  return [...groups.values()].sort((a, b) => a.project.localeCompare(b.project, 'es', { sensitivity: 'base' }));
}

export function countStates(items: SessionSummary[]): Record<SessionState, number> {
  const counts: Record<SessionState, number> = { active: 0, idle: 0, orphaned: 0, closed: 0 };
  for (const s of items) counts[s.state] += 1;
  return counts;
}

/** Caso de uso: board de Sesiones que se actualiza en vivo (AC-16). */
@Injectable({ providedIn: 'root' })
export class WatchSessionBoard {
  private readonly source = inject(SessionSource);
  private readonly live = inject(LiveEvents);

  execute({ windowMs, states, directory }: BoardFilter): Observable<BoardState> {
    const liveTrigger$ = this.live.events$.pipe(
      throttleTime(LIVE_THROTTLE_MS, asyncScheduler, { leading: true, trailing: true }),
    );
    return merge(timer(0, BOARD_REFRESH_MS), liveTrigger$).pipe(
      exhaustMap(() => {
        // `since` se recalcula en cada recarga: "últimas 24 h" avanza con el reloj.
        const since = windowMs === undefined ? undefined : new Date(Date.now() - windowMs);
        return this.source.list({ since, states, directory }).pipe(
          map((list): Result => ({ ok: true, list })),
          catchError(() => of<Result>({ ok: false })),
        );
      }),
      scan(reduceBoard, INITIAL_BOARD),
      startWith(INITIAL_BOARD),
    );
  }
}
