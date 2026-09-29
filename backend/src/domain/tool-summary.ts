// Resumen de una línea de la entrada de una herramienta ("Bash · npm test"),
// para la tarjeta de Sesión y la tabla de Bloqueos (design §6.1, §6.4).

const MAX_LENGTH = 80;

// Campo más representativo de cada herramienta nativa de Claude Code.
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

function truncate(text: string): string {
  const line = text.split('\n')[0]!.trim();
  return line.length > MAX_LENGTH ? `${line.slice(0, MAX_LENGTH - 1)}…` : line;
}

export function summarizeToolInput(toolName: string | null, payload: Record<string, unknown>): string | null {
  const input = payload.tool_input;
  if (input === null || typeof input !== 'object') return null;
  const fields = input as Record<string, unknown>;
  const preferred = toolName ? MAIN_FIELD[toolName] : undefined;
  const value = preferred ? fields[preferred] : undefined;
  if (typeof value === 'string' && value.trim() !== '') return truncate(value);
  const fallback = Object.values(fields).find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return fallback ? truncate(fallback) : null;
}
