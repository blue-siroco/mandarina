import { Injectable, inject } from '@angular/core';
import { Observable, auditTime, catchError, filter, map, of, scan, startWith, switchMap } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { ObservedEvent } from '../../events/models/observed-event';
import { SubagentItem, SubagentList, SubagentQuery } from '../models/subagent';
import { SubagentSource } from '../ports/subagent-source';

/**
 * Los Subagentes se derivan en el servidor (AC-33): se vuelven a pedir cuando
 * llega un Evento de Subagente o de su lanzamiento. Una ráfaga provoca una sola petición.
 */
export const SUBAGENT_REFRESH_DEBOUNCE_MS = 1000;

const LAUNCH_TOOLS: ReadonlySet<string> = new Set(['Agent', 'Task']);

export const affectsSubagents = (e: ObservedEvent) =>
  e.eventType === 'subagent.started' ||
  e.eventType === 'subagent.stopped' ||
  (e.toolName !== null && LAUNCH_TOOLS.has(e.toolName));

export interface SubagentsState {
  /** El más reciente primero; se conservan si falla un refresco. */
  subagents: SubagentItem[];
  projects: string[];
  types: string[];
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_SUBAGENTS: SubagentsState = { subagents: [], projects: [], types: [], loaded: false, failed: false };

export type SubagentsResult = { ok: true; list: SubagentList } | { ok: false };

export function reduceSubagents(state: SubagentsState, result: SubagentsResult): SubagentsState {
  return result.ok
    ? { subagents: result.list.items, projects: result.list.projects, types: result.list.types, loaded: true, failed: false }
    : { ...state, loaded: true, failed: true };
}

/** Caso de uso: Subagentes de todas las Sesiones del periodo, en vivo (AC-37). */
@Injectable({ providedIn: 'root' })
export class WatchSubagents {
  private readonly source = inject(SubagentSource);
  private readonly live = inject(LiveEvents);

  execute({ windowMs, project, type, includeInternal }: SubagentQuery = {}): Observable<SubagentsState> {
    const changed$ = this.live.events$.pipe(
      filter((events) => events.some(affectsSubagents)),
      auditTime(SUBAGENT_REFRESH_DEBOUNCE_MS),
    );
    return changed$.pipe(
      startWith(null),
      switchMap(() =>
        // La ventana avanza con el reloj en cada refresco, como las fichas del board.
        this.source
          .fetch({ since: windowMs === undefined ? new Date(0) : new Date(Date.now() - windowMs), project, type, includeInternal })
          .pipe(
            map((list): SubagentsResult => ({ ok: true, list })),
            catchError(() => of<SubagentsResult>({ ok: false })),
          ),
      ),
      scan(reduceSubagents, INITIAL_SUBAGENTS),
      startWith(INITIAL_SUBAGENTS),
    );
  }
}
