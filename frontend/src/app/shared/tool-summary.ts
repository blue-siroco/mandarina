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

const nonEmptyLines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const firstLine = (text: string): string => oneLine(nonEmptyLines(text)[0] ?? text);

function summarizeError(error: string): string {
  const [first, second] = nonEmptyLines(error);
  // "Exit code 1" solo no dice qué pasó: se le añade la primera línea de la salida.
  const joined = first && second && /^exit code \d+$/i.test(first) ? `${first} · ${second}` : (first ?? error);
  return oneLine(joined);
}

function summarizeBash(fields: Record<string, unknown>): string {
  const line = nonEmptyLines(asText(fields['stdout']) ?? asText(fields['stderr']) ?? '')[0];
  if (line) return oneLine(line);
  if (fields['interrupted'] === true) return 'interrumpido';
  const code = fields['exit_code'] ?? fields['exitCode'] ?? fields['returnCode'];
  return `exit ${typeof code === 'number' ? code : 0}`;
}

function summarizeRead(file: unknown): string | null {
  if (file === null || typeof file !== 'object') return null;
  const { numLines, content } = file as Record<string, unknown>;
  if (typeof numLines === 'number') return count(numLines, 'línea', 'líneas');
  return typeof content === 'string' ? count(content.split('\n').length, 'línea', 'líneas') : null;
}

/** Respuesta que no es un objeto: texto directo o bloques de texto de un Servidor MCP. */
function summarizeTextResponse(response: unknown): string | null {
  const direct = asText(response);
  if (direct) return firstLine(direct);
  if (!Array.isArray(response)) return null;
  const block = response.find((b): b is { text: string } => typeof b?.text === 'string' && b.text.trim() !== '');
  return block ? firstLine(block.text) : null;
}

/**
 * Resumen de una línea de la SALIDA de una herramienta (AC-113): el `tool.post`
 * trae `tool_response` (o `error` si falló), ya enmascarado por el servidor.
 * Es texto plano: la plantilla lo interpola, nunca lo trata como HTML.
 */
export function summarizeToolOutput(toolName: string | null, payload: Record<string, unknown>): string | null {
  const error = asText(payload['error']);
  if (error) return summarizeError(error);
  const response = payload['tool_response'];
  if (response === null || typeof response !== 'object' || Array.isArray(response)) return summarizeTextResponse(response);
  const fields = response as Record<string, unknown>;
  if (toolName === 'Bash') return summarizeBash(fields);
  if (toolName === 'Read') return summarizeRead(fields['file']);
  return typeof fields['numFiles'] === 'number' ? count(fields['numFiles'], 'archivo', 'archivos') : null;
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
