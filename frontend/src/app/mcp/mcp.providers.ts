import { Provider } from '@angular/core';
import { HttpMcpSource } from './infrastructure/http-mcp-source';
import { McpSource } from './ports/mcp-source';

/** Composition root del feature de Servidores MCP. */
export function provideMcp(): Provider[] {
  return [{ provide: McpSource, useClass: HttpMcpSource }];
}
