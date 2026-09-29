import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, auditTime, catchError, filter, map, merge, of, scan, startWith, switchMap } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { DismissedFilter, InjectionSeverity, InjectionWarning, InjectionWarningList } from '../models/security';
import { SecuritySource } from '../ports/security-source';

/**
 * Los avisos salen de las respuestas de las herramientas: se vuelven a pedir cuando llega
 * un `tool.post`. Una ráfaga provoca una sola petición (AC-66).
 */
export const WARNINGS_REFRESH_DEBOUNCE_MS = 1000;

export interface WarningsQuery {
  /** Solo los recibidos en los últimos `windowMs`; sin él, todo el histórico. */
  windowMs?: number;
  severities?: InjectionSeverity[];
  pattern?: string;
  project?: string;
  sessionId?: string;
  dismissed?: DismissedFilter;
}

export interface WarningsState {
  /** El más reciente primero; se conservan si falla un refresco. */
  items: InjectionWarning[];
  projects: string[];
  patterns: string[];
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_WARNINGS: WarningsState = { items: [], projects: [], patterns: [], loaded: false, failed: false };

export type WarningsResult = { ok: true; list: InjectionWarningList } | { ok: false };

export function reduceWarnings(state: WarningsState, result: WarningsResult): WarningsState {
  if (!result.ok) return { ...state, loaded: true, failed: true };
  const { items, projects, patterns } = result.list;
  return { items, projects, patterns, loaded: true, failed: false };
}

/** Caso de uso: Avisos de inyección de `/seguridad`, en vivo (AC-66). */
@Injectable({ providedIn: 'root' })
export class WatchInjectionWarnings {
  private readonly source = inject(SecuritySource);
  private readonly live = inject(LiveEvents);

  /** `refresh$` fuerza una petición, p. ej. tras descartar un aviso. */
  execute({ windowMs, ...filters }: WarningsQuery = {}, refresh$: Observable<unknown> = EMPTY): Observable<WarningsState> {
    const changed$ = this.live.events$.pipe(
      filter((events) => events.some((e) => e.eventType === 'tool.post')),
      auditTime(WARNINGS_REFRESH_DEBOUNCE_MS),
    );
    return merge(changed$, refresh$).pipe(
      startWith(null),
      switchMap(() =>
        // La ventana avanza con el reloj en cada refresco.
        this.source.warnings({ ...filters, since: windowMs === undefined ? new Date(0) : new Date(Date.now() - windowMs) }).pipe(
          map((list): WarningsResult => ({ ok: true, list })),
          catchError(() => of<WarningsResult>({ ok: false })),
        ),
      ),
      scan(reduceWarnings, INITIAL_WARNINGS),
      startWith(INITIAL_WARNINGS),
    );
  }
}
