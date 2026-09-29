/** `agent-abc` y `abc` son el mismo Subagente: el hook y el nombre de su Transcript no coinciden en el prefijo. */
export function normalizeAgentId(id: string): string {
  return id.startsWith('agent-') ? id.slice('agent-'.length) : id;
}
