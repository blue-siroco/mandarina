import { Injectable, inject } from '@angular/core';
import { Observable, auditTime, catchError, filter, map, of, scan, startWith, switchMap } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { affectsSubagents } from '../../subagents/application/watch-subagents';
import { AgentProfile, AgentQuery, AgentTypeSummary } from '../models/agent';
import { AgentFilter, AgentSource } from '../ports/agent-source';

/** Los perfiles se derivan en el servidor: se vuelven a pedir con cada Evento de Subagente o de Lanzamiento. */
export const AGENT_REFRESH_DEBOUNCE_MS = 1000;

export interface AgentsState {
  /** Ordenados por Lanzamientos; se conservan si falla un refresco. */
  types: AgentTypeSummary[];
  projects: string[];
  loaded: boolean;
  failed: boolean;
}

export interface AgentProfileState {
  profile: AgentProfile | null;
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_AGENTS: AgentsState = { types: [], projects: [], loaded: false, failed: false };
export const INITIAL_PROFILE: AgentProfileState = { profile: null, loaded: false, failed: false };

type Result<T> = { ok: true; value: T } | { ok: false };

const filterOf = ({ windowMs, project }: AgentQuery): AgentFilter => ({
  // La ventana avanza con el reloj en cada refresco, como las fichas del board.
  since: windowMs === undefined ? new Date(0) : new Date(Date.now() - windowMs),
  project,
});

/** Casos de uso: comparativa de Tipos de Subagente y perfil de uno, en vivo (AC-47, AC-48). */
@Injectable({ providedIn: 'root' })
export class WatchAgents {
  private readonly source = inject(AgentSource);
  private readonly live = inject(LiveEvents);

  private refreshing<T>(fetch: () => Observable<T>): Observable<Result<T>> {
    return this.live.events$.pipe(
      filter((events) => events.some(affectsSubagents)),
      auditTime(AGENT_REFRESH_DEBOUNCE_MS),
      startWith(null),
      switchMap(() =>
        fetch().pipe(
          map((value): Result<T> => ({ ok: true, value })),
          catchError(() => of<Result<T>>({ ok: false })),
        ),
      ),
    );
  }

  list(query: AgentQuery = {}): Observable<AgentsState> {
    return this.refreshing(() => this.source.list(filterOf(query))).pipe(
      scan(
        (state: AgentsState, result): AgentsState =>
          result.ok ? { types: result.value.items, projects: result.value.projects, loaded: true, failed: false } : { ...state, loaded: true, failed: true },
        INITIAL_AGENTS,
      ),
      startWith(INITIAL_AGENTS),
    );
  }

  profile(type: string | null, query: AgentQuery = {}): Observable<AgentProfileState> {
    return this.refreshing(() => this.source.profile(type, filterOf(query))).pipe(
      scan(
        (state: AgentProfileState, result): AgentProfileState =>
          result.ok ? { profile: result.value, loaded: true, failed: false } : { ...state, loaded: true, failed: true },
        INITIAL_PROFILE,
      ),
      startWith(INITIAL_PROFILE),
    );
  }
}
