import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { SessionSource } from '../../sessions/ports/session-source';

/** Opciones de los desplegables de Proyecto y Sesión de la lista de Eventos. */
export interface EventFilterOptions {
  projects: string[];
  sessions: Array<{ id: string; project: string }>;
}

export const NO_FILTER_OPTIONS: EventFilterOptions = { projects: [], sessions: [] };

/**
 * Los Proyectos y Sesiones ya vistos salen de las Sesiones, no de los Eventos cargados:
 * con un filtro activo los Eventos solo traerían el elegido y no se podría cambiar (AC-110).
 */
@Injectable({ providedIn: 'root' })
export class LoadEventFilterOptions {
  private readonly sessions = inject(SessionSource);

  execute(): Observable<EventFilterOptions> {
    return this.sessions.list({}).pipe(
      map(({ items, facets }) => ({
        projects: facets.projects,
        sessions: items.map((s) => ({ id: s.sessionId, project: s.project })),
      })),
      catchError(() => of(NO_FILTER_OPTIONS)),
    );
  }
}
