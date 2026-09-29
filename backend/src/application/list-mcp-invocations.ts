import {
  mcpInvocationsOfSession,
  mcpUsage,
  unusedDeferredOfSession,
  type McpEventRow,
  type McpInvocation,
  type McpServerUsage,
  type UnusedDeferred,
} from '../domain/mcp-invocations.js';
import type { Clock, EventRepository } from './ports.js';

export const MCP_INVOCATIONS_LIMIT = 500;
// Cada invocación son dos Eventos, y hay `ToolSearch` que no son invocaciones.
const CANDIDATES_LIMIT = MCP_INVOCATIONS_LIMIT * 10;

export interface McpInvocationsFilter {
  since: Date;
  project?: string;
  server?: string;
  sessionId?: string;
}

export interface McpInvocationList {
  items: McpInvocation[];
  servers: McpServerUsage[];
  unused_deferred: UnusedDeferred[];
  facets: { projects: string[]; servers: string[] };
}

/** Caso de uso: invocaciones de Herramientas MCP del periodo y su uso por servidor (AC-42). */
export class ListMcpInvocations {
  constructor(
    private readonly repository: EventRepository,
    private readonly clock: Clock,
  ) {}

  execute({ since, project, server, sessionId }: McpInvocationsFilter): McpInvocationList {
    const candidates = new Map(this.repository.mcpCandidates(since.toISOString(), CANDIDATES_LIMIT).map((c) => [c.id, c]));
    const sessionIds = [...new Set([...candidates.values()].map((c) => c.session_id))];

    // Los estados dependen de la Sesión entera (fin de Turno, de Subagente, Huérfana),
    // pero solo los Eventos del periodo traen su payload.
    const bySession = new Map<string, McpEventRow[]>();
    for (const row of this.repository.sessionRowsOf(sessionIds)) {
      const candidate = candidates.get(row.id);
      const rows = bySession.get(row.session_id) ?? [];
      rows.push({ ...row, payload: candidate?.payload, digest: candidate?.digest });
      bySession.set(row.session_id, rows);
    }

    const now = this.clock.now();
    const all: McpInvocation[] = [];
    const unused: Array<UnusedDeferred & { project: string }> = [];
    for (const rows of bySession.values()) {
      all.push(...mcpInvocationsOfSession(rows, now).filter((i) => candidates.has(i.id)));
      const sessionProject = rows.at(-1)!.project;
      unused.push(...unusedDeferredOfSession(rows).map((u) => ({ ...u, project: sessionProject })));
    }
    all.sort((a, b) => b.started_at.localeCompare(a.started_at));

    const matches = (item: { project: string; server: string; session_id: string }) =>
      (project === undefined || item.project === project) &&
      (server === undefined || item.server === server) &&
      (sessionId === undefined || item.session_id === sessionId);
    const filtered = all.filter(matches);
    return {
      items: filtered.slice(0, MCP_INVOCATIONS_LIMIT),
      servers: mcpUsage(filtered),
      unused_deferred: unused.filter(matches).map(({ project: _project, ...u }) => u),
      facets: {
        projects: [...new Set(all.map((i) => i.project))].sort(),
        servers: [...new Set(all.map((i) => i.server))].sort(),
      },
    };
  }
}
