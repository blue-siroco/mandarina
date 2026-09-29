import { Observable } from 'rxjs';
import { McpInvocationList } from '../models/mcp';

export interface McpFilter {
  since: Date;
  project?: string;
  server?: string;
  sessionId?: string;
}

/** Origen de las invocaciones de Herramientas MCP. */
export abstract class McpSource {
  abstract fetch(filter: McpFilter): Observable<McpInvocationList>;
}
