/** Severidad de un Aviso de inyección (AC-63). */
export type InjectionSeverity = 'low' | 'medium' | 'high';
export type InjectionCategory = 'override' | 'impersonation' | 'hidden' | 'exfiltration';
/** `false` los vigentes, `true` los descartados y `all` todos (AC-64). */
export type DismissedFilter = 'false' | 'true' | 'all';

export interface FollowingTool {
  eventId: string;
  toolName: string;
  summary: string | null;
}

/** Contenido leído por una herramienta que parece dar órdenes al agente (AC-63, AC-64). */
export interface InjectionWarning {
  id: string;
  eventId: string;
  sessionId: string;
  project: string;
  subagentId: string | null;
  toolName: string;
  source: string | null;
  pattern: string;
  category: InjectionCategory;
  severity: InjectionSeverity;
  snippet: string;
  occurredAt: Date;
  dismissed: boolean;
  followedBy: FollowingTool[];
}

export interface InjectionWarningList {
  items: InjectionWarning[];
  projects: string[];
  patterns: string[];
}

export interface InjectionFilter {
  since: Date;
  project?: string;
  sessionId?: string;
  severities?: InjectionSeverity[];
  pattern?: string;
  dismissed?: DismissedFilter;
}

/** Tipos de marcador que deja el Enmascarado, en el orden de las columnas (AC-60, AC-61, AC-67). */
export const MARKER_TYPES = ['API_KEY', 'TOKEN', 'PRIVATE_KEY', 'PASSWORD', 'EMAIL', 'PHONE', 'IBAN', 'CARD', 'ID'] as const;
export type MarkerType = (typeof MARKER_TYPES)[number];
export type MarkerCounts = Record<MarkerType, number>;

export interface MaskingProject {
  project: string;
  total: number;
  counts: MarkerCounts;
}

export interface MaskingStats {
  since: Date;
  totals: MarkerCounts;
  items: MaskingProject[];
}
