const HOUR = 60 * 60 * 1000;

/** Periodos del board y de la pantalla de skills; `title` rotula lo que se mide en ese periodo (AC-13, AC-32). */
export const RANGES = [
  { key: '1h', label: '1 h', title: 'Última hora', ms: HOUR },
  { key: '24h', label: '24 h', title: 'Últimas 24 h', ms: 24 * HOUR },
  { key: '7d', label: '7 d', title: 'Últimos 7 días', ms: 7 * 24 * HOUR },
  { key: 'todo', label: 'Todo', title: 'Todo el histórico', ms: undefined },
] as const;

export type RangeKey = (typeof RANGES)[number]['key'];
