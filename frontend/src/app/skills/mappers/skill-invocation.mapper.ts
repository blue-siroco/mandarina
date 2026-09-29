import {
  SkillInvocation,
  SkillInvocationList,
  SkillInvocationStatus,
  SkillInvoker,
  SkillUsage,
} from '../models/skill-invocation';

/** `SkillInvocation` de `spec/api-spec.yaml`. */
export interface SkillInvocationDto {
  id: string;
  event_id: string | null;
  project: string;
  directory: string;
  session_id: string;
  subagent_id: string | null;
  subagent_type: string | null;
  turn: number | null;
  skill: string;
  args: string | null;
  invoker: SkillInvoker;
  status: SkillInvocationStatus;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  error: string | null;
}

/** `SkillUsage` de `spec/api-spec.yaml`. */
export interface SkillUsageDto {
  project: string;
  skill: string;
  total: number;
  by_invoker: Record<SkillInvoker, number>;
  last_at: string;
}

/** Respuesta de `GET /api/v1/skill-invocations`. */
export interface SkillInvocationListDto {
  items: SkillInvocationDto[];
  stats: SkillUsageDto[];
  facets: { projects: string[] };
}

export function toSkillInvocation(dto: SkillInvocationDto): SkillInvocation {
  return {
    id: dto.id,
    eventId: dto.event_id,
    project: dto.project,
    directory: dto.directory,
    sessionId: dto.session_id,
    subagentId: dto.subagent_id,
    subagentType: dto.subagent_type,
    turn: dto.turn,
    skill: dto.skill,
    args: dto.args,
    invoker: dto.invoker,
    status: dto.status,
    startedAt: new Date(dto.started_at),
    endedAt: dto.ended_at === null ? null : new Date(dto.ended_at),
    durationMs: dto.duration_ms,
    error: dto.error,
  };
}

export function toSkillUsage(dto: SkillUsageDto): SkillUsage {
  return {
    project: dto.project,
    skill: dto.skill,
    total: dto.total,
    byInvoker: { ...dto.by_invoker },
    lastAt: new Date(dto.last_at),
  };
}

export function toSkillInvocationList(dto: SkillInvocationListDto): SkillInvocationList {
  return {
    items: dto.items.map(toSkillInvocation),
    stats: dto.stats.map(toSkillUsage),
    projects: [...dto.facets.projects],
  };
}
