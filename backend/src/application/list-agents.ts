import { agentProfile, agentSummaries, type AgentProfile, type AgentTypeSummary } from '../domain/agent-profiles.js';
import { collectLaunches } from './collect-launches.js';
import type { Clock, EvaluationStore, EventRepository, TranscriptReader } from './ports.js';

/** En la URL, los Lanzamientos sin Tipo conocido. */
export const NO_TYPE = 'sin-tipo';

export interface AgentsFilter {
  since: Date;
  project?: string;
}

export interface AgentTypeList {
  items: AgentTypeSummary[];
  facets: { projects: string[] };
}

/** Casos de uso: comparativa de Tipos de Subagente y perfil de cada uno (AC-46). */
export class ListAgents {
  constructor(
    private readonly repository: EventRepository,
    private readonly transcripts: TranscriptReader,
    private readonly clock: Clock,
    private readonly evaluations: EvaluationStore,
  ) {}

  private async launches({ since, project }: AgentsFilter) {
    // Los Subagentes internos no son agentes en que delegue nadie (AC-33).
    const ratings = this.evaluations.subagentScores();
    const all = (await collectLaunches(this.repository, this.transcripts, this.clock.now(), since))
      .filter((l) => !l.internal)
      .map((l) => ({ ...l, rating: ratings.get(l.subagent_id ?? '') ?? null }));
    return { all, filtered: all.filter((l) => project === undefined || l.project === project) };
  }

  async list(filter: AgentsFilter): Promise<AgentTypeList> {
    const { all, filtered } = await this.launches(filter);
    return { items: agentSummaries(filtered), facets: { projects: [...new Set(all.map((l) => l.project))].sort() } };
  }

  async profile(type: string, filter: AgentsFilter): Promise<AgentProfile> {
    const wanted = type === NO_TYPE ? null : type;
    const { filtered } = await this.launches(filter);
    return agentProfile(
      filtered.filter((l) => l.type === wanted),
      wanted,
    );
  }
}
