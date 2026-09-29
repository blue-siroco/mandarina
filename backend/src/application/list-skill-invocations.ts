import {
  skillInvocationsOfSession,
  skillUsage,
  transcriptSkillInvocations,
  type SkillEventRow,
  type SkillInvocation,
  type SkillUsage,
} from '../domain/skill-invocations.js';
import { readTranscript } from './list-sessions.js';
import type { Clock, EventRepository, TranscriptReader } from './ports.js';

export const SKILL_INVOCATIONS_LIMIT = 500;
// Muchos candidatos no son invocaciones (Subagentes, `/rutas`): se leen más
// Eventos que invocaciones se devuelven.
const CANDIDATES_LIMIT = SKILL_INVOCATIONS_LIMIT * 10;

export interface SkillInvocationsFilter {
  since: Date;
  project?: string;
  sessionId?: string;
}

export interface SkillInvocationList {
  items: SkillInvocation[];
  stats: SkillUsage[];
  facets: { projects: string[] };
}

/**
 * Caso de uso: Invocaciones de skill de la ventana y su uso agregado (AC-30).
 * Une las de los Eventos con las que solo constan en los Transcripts (AC-29).
 */
export class ListSkillInvocations {
  constructor(
    private readonly repository: EventRepository,
    private readonly transcripts: TranscriptReader,
    private readonly clock: Clock,
  ) {}

  async execute({ since, project, sessionId }: SkillInvocationsFilter): Promise<SkillInvocationList> {
    const sinceIso = since.toISOString();
    const candidates = this.repository.skillCandidates(sinceIso, CANDIDATES_LIMIT);
    const payloads = new Map(candidates.map((e) => [e.id, e.payload]));

    // Los Turnos se numeran con la Sesión entera, aunque empezara antes de `since`.
    const bySession = new Map<string, SkillEventRow[]>();
    for (const row of this.repository.sessionRows({ since: sinceIso })) {
      const rows = bySession.get(row.session_id) ?? [];
      rows.push({ ...row, payload: payloads.get(row.id) });
      bySession.set(row.session_id, rows);
    }

    const now = this.clock.now();
    const perSession = await Promise.all(
      [...bySession.values()].map(async (rows) => {
        const fromEvents = skillInvocationsOfSession(rows, now);
        const pathRow = [...rows].reverse().find((r) => r.transcript_path !== null);
        const transcript = await readTranscript(this.transcripts, pathRow?.transcript_path ?? null);
        if (!transcript) return fromEvents;
        const fromTranscripts = transcriptSkillInvocations({
          rows,
          now,
          fromEvents,
          main: transcript.skills ?? [],
          subagents: transcript.subagents.map((s) => ({ agentId: s.agentId, agentType: s.meta?.agentType ?? null, uses: s.skills ?? [] })),
        }).filter((i) => i.started_at >= sinceIso);
        return [...fromEvents, ...fromTranscripts];
      }),
    );
    const all = perSession.flat().sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0));
    const filtered = all.filter(
      (i) => (project === undefined || i.project === project) && (sessionId === undefined || i.session_id === sessionId),
    );
    return {
      items: filtered.slice(0, SKILL_INVOCATIONS_LIMIT),
      stats: skillUsage(filtered),
      facets: { projects: [...new Set(all.map((i) => i.project))].sort() },
    };
  }
}
