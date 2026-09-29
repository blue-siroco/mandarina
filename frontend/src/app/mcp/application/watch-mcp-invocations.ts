import { Injectable, inject } from '@angular/core';
import { Observable, auditTime, catchError, filter, map, of, scan, startWith, switchMap } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { ObservedEvent } from '../../events/models/observed-event';
import { isMcpTool } from '../../shared/tool-summary';
import { McpInvocation, McpInvocationList, McpQuery, McpServerUsage, UnusedDeferredTool } from '../models/mcp';
import { McpSource } from '../ports/mcp-source';

/**
 * Las invocaciones se derivan en el servidor (AC-41): se vuelven a pedir cuando
 * llega un Evento que puede crear una o cambiar su estado. Una ráfaga provoca una sola petición.
 */
export const MCP_REFRESH_DEBOUNCE_MS = 1000;

// El fin de un Turno, de un Subagente o de la Sesión convierte una en curso en "sin respuesta".
const ENDS: ReadonlySet<ObservedEvent['eventType']> = new Set(['turn.ended', 'subagent.stopped', 'session.ended']);

export const affectsMcp = (e: ObservedEvent) => isMcpTool(e.toolName) || e.toolName === 'ToolSearch' || ENDS.has(e.eventType);

export interface McpState {
  /** La más reciente primero; se conservan si falla un refresco. */
  invocations: McpInvocation[];
  servers: McpServerUsage[];
  unusedDeferred: UnusedDeferredTool[];
  projects: string[];
  serverNames: string[];
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_MCP: McpState = {
  invocations: [],
  servers: [],
  unusedDeferred: [],
  projects: [],
  serverNames: [],
  loaded: false,
  failed: false,
};

export type McpResult = { ok: true; list: McpInvocationList } | { ok: false };

export function reduceMcp(state: McpState, result: McpResult): McpState {
  if (!result.ok) return { ...state, loaded: true, failed: true };
  const { items, servers, unusedDeferred, projects, serverNames } = result.list;
  return { invocations: items, servers, unusedDeferred, projects, serverNames, loaded: true, failed: false };
}

/** Caso de uso: invocaciones de Herramientas MCP de una ventana o de una Sesión, en vivo (AC-43, AC-44). */
@Injectable({ providedIn: 'root' })
export class WatchMcpInvocations {
  private readonly source = inject(McpSource);
  private readonly live = inject(LiveEvents);

  execute({ windowMs, project, server, sessionId }: McpQuery = {}): Observable<McpState> {
    const relevant = (e: ObservedEvent) => affectsMcp(e) && (sessionId === undefined || e.sessionId === sessionId);
    const changed$ = this.live.events$.pipe(
      filter((events) => events.some(relevant)),
      auditTime(MCP_REFRESH_DEBOUNCE_MS),
    );
    return changed$.pipe(
      startWith(null),
      switchMap(() =>
        // La ventana avanza con el reloj en cada refresco, como las fichas del board.
        this.source
          .fetch({ since: windowMs === undefined ? new Date(0) : new Date(Date.now() - windowMs), project, server, sessionId })
          .pipe(
            map((list): McpResult => ({ ok: true, list })),
            catchError(() => of<McpResult>({ ok: false })),
          ),
      ),
      scan(reduceMcp, INITIAL_MCP),
      startWith(INITIAL_MCP),
    );
  }
}
