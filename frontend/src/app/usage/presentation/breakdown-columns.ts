// Columnas del desglose de cada ficha (spec/design.md §5.3b, AC-40).
import { formatCompact, formatCost, formatInteger, formatPercent } from '../../shared/format';
import { DirectoryBreakdown, MetricsSlice, ModelBreakdown } from '../models/usage-metrics';

export type KpiKey = 'working' | 'paused' | 'input' | 'output' | 'cache' | 'cost' | 'tools';
export type BreakdownView = 'directory' | 'model';
export type SortDirection = 'asc' | 'desc';

/** Una fila del desglose, o el total (que no tiene Directorio ni modelo). */
export type BreakdownRow = MetricsSlice & Partial<Pick<DirectoryBreakdown, 'directory' | 'project' | 'mainModel'>> & Partial<Pick<ModelBreakdown, 'model' | 'rate' | 'costBreakdown'>>;

export interface BreakdownColumn {
  key: string;
  label: string;
  /** Cifra por la que se ordena; `null` se muestra como "—" y va al final. */
  value: (row: BreakdownRow, total: MetricsSlice) => number | string | null;
  format: (value: number | string) => string;
  numeric: boolean;
}

const totalInput = (row: MetricsSlice) => row.tokens.input + row.tokens.cacheRead + row.tokens.cacheCreation;
const asInteger = (v: number | string) => formatInteger(Number(v));
const asCompact = (v: number | string) => formatCompact(Number(v));
const asPercent = (v: number | string) => formatPercent(Number(v));
const asCost = (v: number | string) => formatCost(Number(v));
const asText = (v: number | string) => String(v);

const count = (key: string, label: string, value: (row: MetricsSlice) => number): BreakdownColumn => ({
  key,
  label,
  value,
  format: asInteger,
  numeric: true,
});

const COLUMNS: Record<KpiKey, (view: BreakdownView) => BreakdownColumn[]> = {
  working: () => [
    count('working', 'Sesiones trabajando', (r) => r.sessions.working),
    count('subagents', 'Subagentes en marcha', (r) => r.subagentsRunning),
  ],
  paused: () => [count('paused', 'Sesiones en pausa', (r) => r.sessions.paused), count('orphaned', 'Huérfanas', (r) => r.sessions.orphaned)],
  input: () => [
    { key: 'input', label: 'Entrada', value: totalInput, format: asCompact, numeric: true },
    {
      key: 'cache',
      label: 'Leído de caché',
      value: (r) => (totalInput(r) > 0 ? r.tokens.cacheRead / totalInput(r) : null),
      format: asPercent,
      numeric: true,
    },
    { key: 'written', label: 'Escritos en caché', value: (r) => r.tokens.cacheCreation, format: asCompact, numeric: true },
  ],
  output: (view) => [
    { key: 'output', label: 'Salida', value: (r) => r.tokens.output, format: asCompact, numeric: true },
    ...(view === 'directory'
      ? [{ key: 'main-model', label: 'Modelo principal', value: (r: BreakdownRow) => r.mainModel ?? null, format: asText, numeric: false }]
      : []),
  ],
  // Ahorro neto primero: es la métrica por la que ordena el desglose (AC-74). Puede ser negativo.
  cache: () => [
    { key: 'net', label: 'Ahorro neto', value: (r) => r.cache?.savingsNetUsd ?? null, format: asCost, numeric: true },
    { key: 'hit-rate', label: 'Tasa de acierto', value: (r) => r.cache?.hitRate ?? null, format: asPercent, numeric: true },
    { key: 'read', label: 'Leídos de caché', value: (r) => r.cache?.readTokens ?? null, format: asCompact, numeric: true },
    { key: 'write-5m', label: 'Escritos (5 min)', value: (r) => r.cache?.write5mTokens ?? null, format: asCompact, numeric: true },
    { key: 'write-1h', label: 'Escritos (1 h)', value: (r) => r.cache?.write1hTokens ?? null, format: asCompact, numeric: true },
    { key: 'gross', label: 'Ahorro bruto', value: (r) => r.cache?.savingsGrossUsd ?? null, format: asCost, numeric: true },
    { key: 'overhead', label: 'Sobrecoste de escritura', value: (r) => r.cache?.writeOverheadUsd ?? null, format: asCost, numeric: true },
    { key: 'rewrites', label: 'Reescrituras', value: (r) => r.cache?.rewrites ?? null, format: asInteger, numeric: true },
  ],
  cost: (view) => [
    { key: 'cost', label: 'Coste estimado', value: (r) => r.estimatedCostUsd, format: asCost, numeric: true },
    {
      key: 'share',
      label: '% del total',
      value: (r, total) => (total.estimatedCostUsd > 0 ? r.estimatedCostUsd / total.estimatedCostUsd : null),
      format: asPercent,
      numeric: true,
    },
    ...(view === 'model'
      ? [
          {
            key: 'rate',
            label: 'Tarifa (entrada / salida, $/M)',
            value: (r: BreakdownRow) => (r.rate ? `${r.rate.input} / ${r.rate.output}` : null),
            format: asText,
            numeric: false,
          },
          { key: 'cost-input', label: 'Entrada', value: (r: BreakdownRow) => r.costBreakdown?.input ?? null, format: asCost, numeric: true },
          { key: 'cost-output', label: 'Salida', value: (r: BreakdownRow) => r.costBreakdown?.output ?? null, format: asCost, numeric: true },
          { key: 'cost-read', label: 'Lectura de caché', value: (r: BreakdownRow) => r.costBreakdown?.cacheRead ?? null, format: asCost, numeric: true },
          {
            key: 'cost-write',
            label: 'Escritura de caché',
            value: (r: BreakdownRow) => r.costBreakdown?.cacheCreation ?? null,
            format: asCost,
            numeric: true,
          },
        ]
      : []),
  ],
  tools: () => [
    count('tools', 'Herramientas', (r) => r.activity.toolCalls),
    count('prompts', 'Prompts', (r) => r.activity.prompts),
    count('blocks', 'Bloqueos', (r) => r.activity.blocks),
  ],
};

/** Columnas de la ficha en cada vista; la primera es la métrica de la ficha y ordena por defecto. */
export function breakdownColumns(kpi: KpiKey, view: BreakdownView): BreakdownColumn[] {
  return COLUMNS[kpi](view);
}

/** Ordena sin mutar; los valores desconocidos van siempre al final. */
export function sortRows<T extends BreakdownRow>(rows: readonly T[], column: BreakdownColumn, direction: SortDirection, total: MetricsSlice): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = column.value(a, total);
    const vb = column.value(b, total);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return sign * (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb)));
  });
}
