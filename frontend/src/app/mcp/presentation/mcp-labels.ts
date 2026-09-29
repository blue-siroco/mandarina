// Textos de las Herramientas MCP (spec/design.md §6.3, §6.4e).
import { formatPercent } from '../../shared/format';
import { McpInvocationStatus } from '../models/mcp';

/** El estado siempre se dice con texto, no solo con color (spec/design.md §7). */
export const STATUS_LABELS: Record<McpInvocationStatus, string> = {
  ok: 'Bien',
  error: 'Error',
  interrupted: 'Interrumpida',
  blocked: 'Bloqueada',
  running: 'En curso',
  no_response: 'Sin respuesta',
};

const kb = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

/** "320 B", "4,2 KB", "1,1 MB". */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${kb.format(bytes / 1024)} KB`;
  return `${kb.format(bytes / (1024 * 1024))} MB`;
}

/** "850 ms", "2,5 s": las Herramientas MCP tardan de milisegundos a segundos. */
export function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${kb.format(ms / 1000)} s`;
}

export const formatRate = (rate: number | null) => (rate === null ? '—' : formatPercent(rate));
