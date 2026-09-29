import { Injectable, inject } from '@angular/core';
import { Observable, auditTime, catchError, filter, map, of, scan, startWith, switchMap } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { ObservedEvent } from '../../events/models/observed-event';
import { SkillInvocation, SkillInvocationList, SkillInvocationQuery, SkillUsage } from '../models/skill-invocation';
import { SkillInvocationSource } from '../ports/skill-invocation-source';

/**
 * Las Invocaciones de skill se leen en el servidor a partir de los Eventos
 * (AC-29): se vuelven a pedir cuando llega uno que puede crear una o cambiar su
 * estado. Una ráfaga de Eventos provoca una sola petición.
 */
export const SKILL_REFRESH_DEBOUNCE_MS = 1000;

// Una `/nombre` llega como prompt; el fin del Turno o del Subagente la termina.
const STARTS_OR_ENDS: ReadonlySet<ObservedEvent['eventType']> = new Set([
  'prompt.submitted',
  'turn.ended',
  'subagent.stopped',
  'session.ended',
]);

export const affectsSkills = (e: ObservedEvent) => e.toolName === 'Skill' || STARTS_OR_ENDS.has(e.eventType);

export interface SkillInvocationsState {
  /** La más reciente primero; se conservan si falla un refresco. */
  invocations: SkillInvocation[];
  stats: SkillUsage[];
  projects: string[];
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_SKILL_INVOCATIONS: SkillInvocationsState = {
  invocations: [],
  stats: [],
  projects: [],
  loaded: false,
  failed: false,
};

export type SkillInvocationsResult = { ok: true; list: SkillInvocationList } | { ok: false };

export function reduceSkillInvocations(state: SkillInvocationsState, result: SkillInvocationsResult): SkillInvocationsState {
  return result.ok
    ? { invocations: result.list.items, stats: result.list.stats, projects: result.list.projects, loaded: true, failed: false }
    : { ...state, loaded: true, failed: true };
}

/** Caso de uso: Invocaciones de skill de una ventana o de una Sesión, en vivo (AC-31, AC-32). */
@Injectable({ providedIn: 'root' })
export class WatchSkillInvocations {
  private readonly source = inject(SkillInvocationSource);
  private readonly live = inject(LiveEvents);

  execute({ windowMs, sessionId }: SkillInvocationQuery = {}): Observable<SkillInvocationsState> {
    const relevant = (e: ObservedEvent) => affectsSkills(e) && (sessionId === undefined || e.sessionId === sessionId);
    const changed$ = this.live.events$.pipe(
      filter((events) => events.some(relevant)),
      auditTime(SKILL_REFRESH_DEBOUNCE_MS),
    );
    return changed$.pipe(
      startWith(null),
      switchMap(() =>
        // La ventana avanza con el reloj en cada refresco, como las fichas del board.
        this.source.fetch(windowMs === undefined ? new Date(0) : new Date(Date.now() - windowMs), sessionId).pipe(
          map((list): SkillInvocationsResult => ({ ok: true, list })),
          catchError(() => of<SkillInvocationsResult>({ ok: false })),
        ),
      ),
      scan(reduceSkillInvocations, INITIAL_SKILL_INVOCATIONS),
      startWith(INITIAL_SKILL_INVOCATIONS),
    );
  }
}
