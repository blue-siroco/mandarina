// Resumen de una línea de la entrada de una herramienta ("npm test"), igual
// que el del backend (`backend/src/domain/tool-summary.ts`): la lista de
// Eventos lo calcula en el cliente porque el Evento solo trae el payload.

const MAX_LENGTH = 80;

const MAIN_FIELD: Record<string, string> = {
  Bash: 'command',
  Read: 'file_path',
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
  Grep: 'pattern',
  Glob: 'pattern',
  WebFetch: 'url',
  WebSearch: 'query',
  Task: 'description',
  Agent: 'description',
  Skill: 'skill',
};

export function oneLine(text: string, max = MAX_LENGTH): string {
  const line = text.split('\n')[0]?.trim() ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function summarizeToolInput(toolName: string | null, payload: Record<string, unknown>): string | null {
  const input = payload['tool_input'];
  if (input === null || typeof input !== 'object') return null;
  const fields = input as Record<string, unknown>;
  const preferred = toolName ? MAIN_FIELD[toolName] : undefined;
  const value = preferred ? fields[preferred] : undefined;
  if (typeof value === 'string' && value.trim() !== '') return oneLine(value);
  const fallback = Object.values(fields).find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return fallback ? oneLine(fallback) : null;
}

const MCP_PREFIX = 'mcp__';
const MCP_RESOURCE_TOOLS: ReadonlySet<string> = new Set(['ListMcpResourcesTool', 'ReadMcpResourceTool']);

/** Herramienta de un Servidor MCP, o de sus recursos (AC-41). */
export function isMcpTool(toolName: string | null): boolean {
  return toolName !== null && (toolName.startsWith(MCP_PREFIX) || MCP_RESOURCE_TOOLS.has(toolName));
}

/** `mcp__playwright__browser_navigate` → `playwright · browser_navigate`; el resto, tal cual (AC-43). */
export function toolLabel(toolName: string): string {
  if (!toolName.startsWith(MCP_PREFIX)) return toolName;
  const rest = toolName.slice(MCP_PREFIX.length);
  const cut = rest.lastIndexOf('__');
  return cut > 0 && cut + 2 < rest.length ? `${rest.slice(0, cut)} · ${rest.slice(cut + 2)}` : toolName;
}
