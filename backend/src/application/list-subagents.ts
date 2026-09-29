import type { LaunchStatus } from '../domain/agent-profiles.js';
import { collectLaunches } from './collect-launches.js';
import type { TokenUsageView } from './get-usage-metrics.js';
import type { Clock, EventRepository, TranscriptReader } from './ports.js';

export const SUBAGENTS_LIMIT = 500;

export interface SubagentsFilter {
  since: Date;
  project?: string;
  type?: string;
  includeInternal?: boolean;
}

/** `SubagentListItem` de `spec/api-spec.yaml` (AC-35). */
export interface SubagentListItem {
  session_id: string;
  project: string;
  directory: string;
  subagent_id: string | null;
  tool_use_id: string | null;
  agent_type: string | null;
  description: string | null;
  internal: boolean;
  status: LaunchStatus;
  started_at: string;
  stopped_at: string | null;
  duration_ms: number;
  tool_count: number;
  model: string | null;
  tokens: TokenUsageView | null;
  estimated_cost_usd: number | null;
}

export interface SubagentList {
  items: SubagentListItem[];
  facets: { projects: string[]; types: string[] };
}

/** Caso de uso: Subagentes de todas las Sesiones del periodo (AC-35); la vista por Tipo está en `ListAgents` (AC-46). */
export class ListSubagents {
  constructor(
    private readonly repository: EventRepository,
    private readonly transcripts: TranscriptReader,
    private readonly clock: Clock,
  ) {}

  async execute({ since, project, type, includeInternal = false }: SubagentsFilter): Promise<SubagentList> {
    const launches = await collectLaunches(this.repository, this.transcripts, this.clock.now(), since);
    const all = launches
      .filter((l) => includeInternal || !l.internal)
      .map(
        (l): SubagentListItem => ({
          session_id: l.session_id,
          project: l.project,
          directory: l.directory,
          subagent_id: l.subagent_id,
          tool_use_id: l.tool_use_id,
          agent_type: l.type,
          description: l.description,
          internal: l.internal,
          status: l.status,
          started_at: l.started_at,
          stopped_at: l.stopped_at,
          duration_ms: l.duration_ms,
          tool_count: l.tool_count,
          model: l.model,
          tokens: l.tokens,
          estimated_cost_usd: l.estimated_cost_usd,
        }),
      );
    const filtered = all.filter((s) => (project === undefined || s.project === project) && (type === undefined || s.agent_type === type));
    return {
      items: filtered.slice(0, SUBAGENTS_LIMIT),
      facets: {
        projects: [...new Set(all.map((s) => s.project))].sort(),
        types: [...new Set(all.map((s) => s.agent_type).filter((t): t is string => t !== null))].sort(),
      },
    };
  }
}
