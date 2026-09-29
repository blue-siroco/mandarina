import {
  FollowingTool,
  InjectionCategory,
  InjectionSeverity,
  InjectionWarning,
  InjectionWarningList,
  MARKER_TYPES,
  MarkerCounts,
  MaskingStats,
} from '../models/security';

/** `InjectionWarning` de `spec/api-spec.yaml`. */
export interface InjectionWarningDto {
  id: string;
  event_id: string;
  session_id: string;
  project: string;
  subagent_id: string | null;
  tool_name: string;
  source: string | null;
  pattern: string;
  category: InjectionCategory;
  severity: InjectionSeverity;
  snippet: string;
  occurred_at: string;
  dismissed: boolean;
  followed_by: Array<{ event_id: string; tool_name: string; summary: string | null }>;
}

export interface InjectionWarningListDto {
  items: InjectionWarningDto[];
  facets: { projects: string[]; patterns: string[] };
}

/** `MaskingStats` de `spec/api-spec.yaml`. */
export interface MaskingStatsDto {
  since: string;
  totals: Record<string, number>;
  items: Array<{ project: string; total: number; counts: Record<string, number> }>;
}

const toFollowing = (dto: InjectionWarningDto['followed_by'][number]): FollowingTool => ({
  eventId: dto.event_id,
  toolName: dto.tool_name,
  summary: dto.summary,
});

export const toInjectionWarning = (dto: InjectionWarningDto): InjectionWarning => ({
  id: dto.id,
  eventId: dto.event_id,
  sessionId: dto.session_id,
  project: dto.project,
  subagentId: dto.subagent_id,
  toolName: dto.tool_name,
  source: dto.source,
  pattern: dto.pattern,
  category: dto.category,
  severity: dto.severity,
  snippet: dto.snippet,
  occurredAt: new Date(dto.occurred_at),
  dismissed: dto.dismissed,
  followedBy: dto.followed_by.map(toFollowing),
});

export const toInjectionWarningList = (dto: InjectionWarningListDto): InjectionWarningList => ({
  items: dto.items.map(toInjectionWarning),
  projects: dto.facets.projects,
  patterns: dto.facets.patterns,
});

/** Todos los tipos presentes, aunque la API no envíe alguno. */
const toCounts = (counts: Record<string, number>): MarkerCounts =>
  Object.fromEntries(MARKER_TYPES.map((type) => [type, counts[type] ?? 0])) as MarkerCounts;

export const toMaskingStats = (dto: MaskingStatsDto): MaskingStats => ({
  since: new Date(dto.since),
  totals: toCounts(dto.totals),
  items: dto.items.map((item) => ({ project: item.project, total: item.total, counts: toCounts(item.counts) })),
});
