// Imitación de los Avisos de inyección y de las estadísticas de Enmascarado
// (AC-63 a AC-65) sobre los Eventos en memoria. Sigue el catálogo de
// `backend/src/domain/injection.ts` de forma abreviada. El mock no enmascara nada
// (sus Eventos no llevan secretos), así que las estadísticas de Enmascarado son
// sintéticas: se derivan de la actividad de cada Proyecto, de forma determinista.

const PATTERNS = [
  { id: 'ignore-previous', category: 'override', severity: 'medium', regex: /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all|any)\b[^.\n]{0,40}\b(?:instructions?|prompts?|rules?|guidelines?|context)\b/i },
  { id: 'fake-system-tag', category: 'impersonation', severity: 'high', regex: /<\/?(?:system|assistant|user|instructions?)\b[^>]{0,40}>|<\|im_(?:start|end)\|>|\[\/?(?:SYSTEM|INST)\]/i },
  { id: 'fake-turn', category: 'impersonation', severity: 'high', regex: /^[ \t]*(?:Human|Assistant|System):[ \t]/m },
  { id: 'tag-characters', category: 'hidden', severity: 'high', regex: /[\u{E0000}-\u{E007F}]/u },
  { id: 'html-comment-instruction', category: 'hidden', severity: 'low', regex: /<!--[^>]{0,300}?\b(?:ignore|assistant|instructions?|you must|system prompt)\b[^>]{0,300}?-->/i },
  { id: 'exfiltrate-request', category: 'exfiltration', severity: 'high', regex: /\b(?:send|post|upload|forward|leak|exfiltrate|email)\b[^.\n]{0,80}\b(?:secrets?|credentials?|api[ _-]?keys?|tokens?|passwords?|\.env|ssh keys?|private keys?|system prompt|conversation)\b[^\n]{0,80}?https?:\/\//i },
];

const MARKER_TYPES = ['API_KEY', 'TOKEN', 'PRIVATE_KEY', 'PASSWORD', 'EMAIL', 'PHONE', 'IBAN', 'CARD', 'ID'];
const SNIPPET_MAX = 200;

const record = (value) => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {});

function snippetAround(text, index, length) {
  const raw = text.slice(Math.max(0, index - 60), index + length + 60).replace(/\s+/g, ' ').trim();
  return raw.length > SNIPPET_MAX ? `${raw.slice(0, SNIPPET_MAX - 1)}…` : raw;
}

export function isScannedTool(toolName, toolInput) {
  if (!toolName) return false;
  if (['WebFetch', 'WebSearch', 'Read'].includes(toolName) || toolName.startsWith('mcp__')) return true;
  const command = record(toolInput).command;
  return toolName === 'Bash' && typeof command === 'string' && /\b(?:curl|wget)\b/.test(command);
}

function sourceOf(toolName, toolInput) {
  const input = record(toolInput);
  const pick = (field) => (typeof input[field] === 'string' && input[field].trim() ? input[field].split('\n')[0].trim().slice(0, 120) : null);
  if (toolName === 'WebFetch') return pick('url');
  if (toolName === 'WebSearch') return pick('query');
  if (toolName === 'Read') return pick('file_path');
  if (toolName === 'Bash') return pick('command');
  if (toolName.startsWith('mcp__')) {
    const [server, ...tool] = toolName.slice(5).split('__');
    return `${server} · ${tool.join('__')}`;
  }
  return null;
}

const textOf = (response) => (typeof response === 'string' ? response : JSON.stringify(response ?? ''));

/** Avisos de un `tool.post`, tal como los derivaría el backend. */
function scan(event) {
  if (event.event_type !== 'tool.post' || event.native_event_type !== 'PostToolUse') return [];
  const input = event.payload?.tool_input;
  if (!isScannedTool(event.tool_name, input) || event.payload?.tool_response === undefined) return [];
  const text = textOf(event.payload.tool_response);
  const found = [];
  for (const { id, category, severity, regex } of PATTERNS) {
    const match = regex.exec(text);
    if (match) found.push({ id: `${event.id}:${id}`, event, pattern: id, category, severity, snippet: snippetAround(text, match.index, match[0].length) });
  }
  return found;
}

function following(events, warning) {
  const own = events.filter((e) => e.session_id === warning.event.session_id);
  const start = own.findIndex((e) => e.id === warning.event.id);
  const lane = warning.event.subagent_id ?? null;
  const next = [];
  for (const e of own.slice(start + 1)) {
    if (next.length >= 3) break;
    if (lane === null && e.subagent_id === null && (e.event_type === 'prompt.submitted' || e.event_type === 'turn.ended')) break;
    if (lane !== null && e.subagent_id === lane && e.event_type === 'subagent.stopped') break;
    if ((e.subagent_id ?? null) !== lane || (e.event_type !== 'tool.pre' && e.event_type !== 'tool.blocked') || !e.tool_name) continue;
    const value = Object.values(record(e.payload?.tool_input)).find((v) => typeof v === 'string' && v.trim());
    next.push({ event_id: e.id, tool_name: e.tool_name, summary: value ? value.split('\n')[0].trim().slice(0, 80) : null });
  }
  return next;
}

export function createInjectionBook() {
  const dismissed = new Set();
  const cache = new Map();
  const warningsOfEvent = (event) => {
    if (!cache.has(event.id)) cache.set(event.id, scan(event));
    return cache.get(event.id);
  };
  const all = (events) => events.flatMap(warningsOfEvent);

  return {
    /** `warnings` de un Evento para `GET /events` y el WebSocket. */
    ofEvent: (event) => warningsOfEvent(event).map((w) => ({ id: w.id, pattern: w.pattern, severity: w.severity, dismissed: dismissed.has(w.id) })),

    alertsBySession(events) {
      const alerts = new Map();
      for (const w of all(events)) {
        if (w.severity !== 'high' || dismissed.has(w.id)) continue;
        alerts.set(w.event.session_id, (alerts.get(w.event.session_id) ?? 0) + 1);
      }
      return alerts;
    },

    list(events, { since, project, sessionId, severities = [], pattern, dismissed: wanted = 'false' }) {
      const sinceIso = since.toISOString();
      const inPeriod = all(events).filter((w) => w.event.received_at >= sinceIso);
      const items = inPeriod
        .filter((w) => !project || w.event.project === project)
        .filter((w) => !sessionId || w.event.session_id === sessionId)
        .filter((w) => severities.length === 0 || severities.includes(w.severity))
        .filter((w) => !pattern || w.pattern === pattern)
        .filter((w) => wanted === 'all' || dismissed.has(w.id) === (wanted === 'true'))
        .reverse()
        .slice(0, 500)
        .map((w) => ({
          id: w.id,
          event_id: w.event.id,
          session_id: w.event.session_id,
          project: w.event.project,
          subagent_id: w.event.subagent_id,
          tool_name: w.event.tool_name,
          source: sourceOf(w.event.tool_name, w.event.payload?.tool_input),
          pattern: w.pattern,
          category: w.category,
          severity: w.severity,
          snippet: w.snippet,
          occurred_at: w.event.occurred_at,
          dismissed: dismissed.has(w.id),
          followed_by: following(events, w),
        }));
      return {
        items,
        facets: { projects: [...new Set(inPeriod.map((w) => w.event.project))].sort(), patterns: [...new Set(inPeriod.map((w) => w.pattern))].sort() },
      };
    },

    dismiss(events, id) {
      if (!all(events).some((w) => w.id === id)) return false;
      dismissed.add(id);
      return true;
    },

    restore(events, id) {
      if (!all(events).some((w) => w.id === id)) return false;
      dismissed.delete(id);
      return true;
    },

    /** Recuento sintético por Proyecto: más actividad, más marcadores (AC-65). */
    maskingStats(events, since) {
      const sinceIso = since.toISOString();
      const perProject = new Map();
      for (const e of events) {
        if (e.received_at < sinceIso) continue;
        const acc = perProject.get(e.project) ?? { prompts: 0, bash: 0, reads: 0 };
        if (e.event_type === 'prompt.submitted') acc.prompts += 1;
        if (e.event_type === 'tool.pre' && e.tool_name === 'Bash') acc.bash += 1;
        if (e.event_type === 'tool.pre' && e.tool_name === 'Read') acc.reads += 1;
        perProject.set(e.project, acc);
      }
      const items = [...perProject]
        .map(([project, { prompts, bash, reads }]) => {
          const counts = Object.fromEntries(MARKER_TYPES.map((type) => [type, 0]));
          counts.PASSWORD = Math.floor(bash / 6);
          counts.API_KEY = Math.floor(bash / 12);
          counts.EMAIL = Math.floor(prompts / 3);
          counts.TOKEN = Math.floor(reads / 15);
          counts.PHONE = Math.floor(prompts / 9);
          return { project, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
        })
        .filter((item) => item.total > 0)
        .sort((a, b) => b.total - a.total || a.project.localeCompare(b.project));
      const totals = Object.fromEntries(MARKER_TYPES.map((type) => [type, items.reduce((n, item) => n + item.counts[type], 0)]));
      return { since: sinceIso, totals, items };
    },
  };
}
