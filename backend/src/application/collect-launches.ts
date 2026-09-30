import { normalizeAgentId } from '../domain/agent-id.js';
import { cacheEfficiency } from '../domain/cache-efficiency.js';
import { ownActivity, type LaunchRecord, type LaunchStatus } from '../domain/agent-profiles.js';
import { summarizeSession, type SessionEventRow } from '../domain/session-summary.js';
import { subagentLives } from '../domain/subagent-lifecycle.js';
import { testRunsFromEvent } from '../domain/test-results.js';
import { usageByModel } from '../domain/token-usage.js';
import { usageOf } from './get-session-detail.js';
import { metaLinksOf, readTranscript } from './list-sessions.js';
import type { EventRepository, TranscriptReader } from './ports.js';

// Cada candidato puede no ser una Ejecución de tests: se leen de sobra, como en AC-27.
const TEST_CANDIDATES_LIMIT = 2000;
const RESULT_LENGTH = 300;

/** Un Lanzamiento con lo que la pantalla Subagentes necesita además del perfil. */
export type CollectedLaunch = LaunchRecord & { directory: string; internal: boolean };

const oneLine = (value: string | null) => {
  const line = value?.trim().split('\n')[0]?.trim();
  if (!line) return null;
  return line.length > RESULT_LENGTH ? `${line.slice(0, RESULT_LENGTH - 1)}…` : line;
};

/**
 * Lanzamientos de las Sesiones con actividad desde `since` que empezaron desde
 * entonces o siguen en marcha, con lo que hizo cada Subagente (AC-35, AC-45).
 */
export async function collectLaunches(
  repository: EventRepository,
  transcripts: TranscriptReader,
  now: Date,
  since: Date,
): Promise<CollectedLaunch[]> {
  const sinceIso = since.toISOString();
  const bySession = new Map<string, SessionEventRow[]>();
  for (const row of repository.sessionRows({ since: sinceIso })) {
    const rows = bySession.get(row.session_id);
    if (rows) rows.push(row);
    else bySession.set(row.session_id, [row]);
  }

  // Resultado de los tests que lanzó cada Subagente (AC-26), por Sesión y Subagente.
  const tests = new Map<string, { passed: number; failed: number }>();
  for (const run of repository.testCandidates(sinceIso, TEST_CANDIDATES_LIMIT).flatMap(testRunsFromEvent)) {
    if (run.subagent_id === null) continue;
    const key = `${run.session_id}\u0000${normalizeAgentId(run.subagent_id)}`;
    const acc = tests.get(key) ?? { passed: 0, failed: 0 };
    acc[run.status] += 1;
    tests.set(key, acc);
  }

  const perSession = await Promise.all(
    [...bySession.values()].map(async (rows) => {
      const pathRow = [...rows].reverse().find((r) => r.transcript_path !== null);
      const transcript = await readTranscript(transcripts, pathRow?.transcript_path ?? null);
      const metaLinks = metaLinksOf(transcript);
      const core = summarizeSession(rows, now, transcript?.mtimeMs, metaLinks);
      // Sin fin solo está en marcha con la Sesión viva y el Turno abierto (AC-126).
      const live = (core.state === 'active' || core.state === 'idle') && core.turn_open;
      const lives = subagentLives(rows, metaLinks);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const typeOf = new Map(lives.filter((l) => l.subagent_id).map((l) => [l.subagent_id!, l.agent_type]));
      // Una Sesión arrancada como agente (`claude --agent …`) lo dice en los Eventos del agente principal.
      const sessionAgent = rows.find((r) => r.session_agent_type)?.session_agent_type ?? null;

      return lives
        .filter((life) => life.started_at >= sinceIso || (live && life.stopped_at === null))
        .map((life): CollectedLaunch => {
          const id = life.subagent_id;
          const file = id === null ? undefined : transcript?.subagents.find((s) => s.agentId === normalizeAgentId(id));
          const usage = file ? usageOf(file.entries) : null;
          const cache = file && file.entries.length > 0 ? cacheEfficiency(usageByModel(file.entries, new Date(0))) : null;
          const launch = life.launch_event_id ? byId.get(life.launch_event_id) : undefined;
          let status: LaunchStatus = 'finished';
          if (life.stopped_at === null) status = live ? 'running' : 'no_response';
          const end = life.stopped_at ?? (live ? now.toISOString() : core.last_event_at);
          const own = ownActivity(id === null ? [] : rows.filter((r) => r.subagent_id === id), file?.skills);
          return {
            type: life.agent_type ?? file?.meta?.agentType ?? null,
            launcher: launch?.subagent_id ? (typeOf.get(launch.subagent_id) ?? null) : sessionAgent,
            session_id: core.session_id,
            project: core.project,
            directory: core.directory,
            internal: life.internal,
            subagent_id: id,
            tool_use_id: life.tool_use_id,
            description: life.description ?? file?.meta?.description ?? null,
            status,
            background: launch?.launch_background === true || file?.meta?.background === true,
            started_at: life.started_at,
            stopped_at: life.stopped_at,
            duration_ms: Math.max(0, Date.parse(end) - Date.parse(life.started_at)),
            ...own,
            // Un Subagente sin Eventos propios solo deja sus herramientas en el Transcript.
            tool_count: own.tool_count || (file?.activity.tools.length ?? 0),
            model: usage?.models[0] ?? null,
            tokens: usage?.tokens ?? null,
            estimated_cost_usd: usage?.estimated_cost_usd ?? null,
            cache_hit_rate: cache?.hit_rate ?? null,
            cache_savings_net_usd: cache?.savings_net_usd ?? null,
            result: status === 'finished' ? oneLine(file?.activity.result ?? null) : null,
            tests: (id && tests.get(`${core.session_id}\u0000${normalizeAgentId(id)}`)) || { passed: 0, failed: 0 },
          };
        });
    }),
  );
  return perSession.flat().sort((a, b) => b.started_at.localeCompare(a.started_at));
}
