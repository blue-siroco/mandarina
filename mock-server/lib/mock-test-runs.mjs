// Ejecuciones de tests del mock (`GET /api/v1/test-runs`, AC-27). Lee solo los
// formatos que genera la simulación (Vitest y Playwright sin color). El lector
// completo, con Jest y `node:test`, está en `backend/src/domain/test-results.ts`.

const TEST_COMMAND = /\b(tests?|spec|e2e|vitest|jest|playwright)\b/i;
const AC_ID = /\bAC-\d+[a-z]?\b/;
const LIMIT = 500;

const toMs = (value, unit) => Math.round(Number(value) * { ms: 1, s: 1000, m: 60_000 }[unit]);
const failure = (name, file, message) => ({ name, file, message, ac: AC_ID.exec(name)?.[0] ?? null });

function vitest(lines) {
  const summary = lines.map((l) => /^\s*Tests\s+(.+?)\s*\((\d+)\)\s*$/.exec(l)).find(Boolean);
  if (!summary) return null;
  const count = (word) => Number(new RegExp(`(\\d+) ${word}`).exec(summary[1])?.[1] ?? 0);
  const duration = lines.map((l) => /^\s*Duration\s+([\d.]+)(ms|s|m)\b/.exec(l)).find(Boolean);
  const failures = [];
  lines.forEach((line, i) => {
    const match = /^\s*FAIL\s+(\S+) > (.+)$/.exec(line);
    if (match) failures.push(failure(match[2].trim(), match[1], lines[i + 1]?.trim() || null));
  });
  return {
    runner: 'vitest',
    counts: { total: Number(summary[2]), passed: count('passed'), failed: count('failed'), skipped: count('skipped') },
    duration_ms: duration ? toMs(duration[1], duration[2]) : null,
    failures,
  };
}

function playwright(lines) {
  if (!lines.some((l) => /^Running \d+ tests? using/.test(l))) return null;
  const counts = { total: 0, passed: 0, failed: 0, skipped: 0 };
  let duration = null;
  let section = null;
  const failures = [];
  for (const line of lines) {
    const summary = /^\s*(\d+) (passed|failed|flaky|skipped)(?: \(([\d.]+)(ms|s|m)\))?\s*$/.exec(line);
    if (summary) {
      section = summary[2];
      const n = Number(summary[1]);
      counts.total += n;
      counts[section === 'flaky' ? 'passed' : section] += n;
      if (summary[3]) duration = toMs(summary[3], summary[4]);
      continue;
    }
    const test = section === 'failed' ? /^\s*\[[^\]]+\] › (\S+?):\d+:\d+ › (.+?)\s*─*$/.exec(line) : null;
    if (!test) continue;
    const header = lines.findIndex((l) => /^\s*\d+\) /.test(l) && l.includes(test[2]));
    const message = header === -1 ? null : lines.slice(header + 1).find((l) => l.trim() !== '')?.trim() ?? null;
    failures.push(failure(test[2], test[1], message));
  }
  return { runner: 'playwright', counts, duration_ms: duration, failures };
}

function outputOf(payload) {
  const response = payload.tool_response ?? {};
  return [payload.error, response.stdout, response.stderr].filter((p) => typeof p === 'string').join('\n');
}

export function testRunsFromEvent(event) {
  const command = event.payload?.tool_input?.command;
  if (event.event_type !== 'tool.post' || event.tool_name !== 'Bash' || typeof command !== 'string' || !TEST_COMMAND.test(command)) return [];
  const lines = outputOf(event.payload).split(/\r?\n/);
  return [vitest(lines), playwright(lines)]
    .filter(Boolean)
    .map((result) => ({
      id: `${event.id}:${result.runner}`,
      event_id: event.id,
      project: event.project,
      directory: event.directory,
      session_id: event.session_id,
      subagent_id: event.subagent_id,
      kind: result.runner === 'playwright' || /\be2e\b/i.test(command) ? 'e2e' : 'unit',
      runner: result.runner,
      command: command.split('\n')[0].trim(),
      status: result.counts.failed > 0 ? 'failed' : 'passed',
      counts: result.counts,
      duration_ms: result.duration_ms,
      finished_at: event.occurred_at,
      failures: result.failures.slice(0, 20),
    }));
}

/** `events` va del más antiguo al más reciente. */
export function listTestRuns(events, { since, project, kind }) {
  const runs = events
    .filter((e) => e.received_at >= since.toISOString())
    .flatMap(testRunsFromEvent)
    .reverse();
  return {
    items: runs.filter((r) => (!project || r.project === project) && (!kind || r.kind === kind)).slice(0, LIMIT),
    facets: { projects: [...new Set(runs.map((r) => r.project))].sort() },
  };
}
