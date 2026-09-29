// Imitación de las Evaluaciones humanas (AC-54 a AC-56) en memoria. Sigue las
// reglas de `backend/src/domain/evaluation.ts` de forma simplificada; el mock no
// enmascara secretos ni tiene Transcripts, así que `model` y `response` son sintéticos.

const OBJECT_TYPES = ['session', 'turn', 'subagent'];
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 40;
const MAX_NOTE_LENGTH = 2000;
const SUMMARY_LENGTH = 200;

export function normalizeTag(raw) {
  const tag = raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_TAG_LENGTH)
    .replace(/-+$/, '');
  return tag === '' ? null : tag;
}

/** @returns {{ value: object } | { error: string }} */
export function normalizeEvaluation(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { error: 'La Evaluación debe ser un objeto' };
  const { score, tags, note } = input;
  if (score !== 1 && score !== -1 && score !== null) return { error: 'La Puntuación debe ser 1, -1 o null' };
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) return { error: 'Las Etiquetas deben ser una lista de textos' };
  if (note !== null && typeof note !== 'string') return { error: 'La Nota debe ser un texto o null' };
  const normalized = [...new Set(tags.map(normalizeTag).filter((t) => t !== null))];
  if (normalized.length > MAX_TAGS) return { error: `Como máximo ${MAX_TAGS} Etiquetas` };
  const text = note === null ? '' : note.trim();
  if (text.length > MAX_NOTE_LENGTH) return { error: `La Nota no puede pasar de ${MAX_NOTE_LENGTH} caracteres` };
  if (score === null && normalized.length === 0 && text === '') return { error: 'Una Evaluación vacía no se guarda: bórrala' };
  return { value: { score, tags: normalized, note: text === '' ? null : text } };
}

const oneLine = (value) => {
  const line = typeof value === 'string' ? value.trim().split('\n')[0].trim() : '';
  if (!line) return null;
  return line.length > SUMMARY_LENGTH ? `${line.slice(0, SUMMARY_LENGTH - 1)}…` : line;
};

const tagCounts = (records) => {
  const counts = new Map();
  for (const r of records) for (const tag of r.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
};

export const isObjectType = (value) => OBJECT_TYPES.includes(value);

export function createEvaluationBook() {
  /** Más reciente al final; sustituir una la mueve al final. */
  const records = [];
  const find = (type, id) => records.findIndex((r) => r.object_type === type && r.object_id === id);

  return {
    /** Puntuación de cada Sesión / Subagente evaluado. */
    scores: (type) => new Map(records.filter((r) => r.object_type === type).map((r) => [r.object_id, r.score])),

    /** @returns {{ status: number, body?: object }} */
    put(events, type, id, body, now = new Date()) {
      const parsed = normalizeEvaluation(body);
      if (parsed.error) return { status: 400, body: { message: parsed.error } };
      const context = contextOf(events, type, id);
      if (!context) return { status: 404, body: { message: `No existe el objeto a evaluar: ${type} ${id}` } };
      const at = find(type, id);
      const created = at === -1 ? now.toISOString() : records[at].created_at;
      if (at !== -1) records.splice(at, 1);
      const record = { object_type: type, object_id: id, ...context, ...parsed.value, created_at: created, updated_at: now.toISOString() };
      records.push(record);
      return { status: 200, body: describe(events, record) };
    },

    remove(type, id) {
      const at = find(type, id);
      if (at === -1) return false;
      records.splice(at, 1);
      return true;
    },

    list(events, filter) {
      const all = select(records, filter).reverse();
      return {
        items: all.slice(0, 500).map((r) => describe(events, r)),
        tags: tagCounts(all),
        facets: { projects: [...new Set(records.map((r) => r.project))].sort() },
      };
    },

    tags: () => tagCounts(records),

    exportLines(events, filter) {
      return select(records, filter)
        .reverse()
        .map((r) => {
          const d = describe(events, r);
          return {
            object_type: r.object_type,
            object_id: r.object_id,
            project: r.project,
            session_id: r.session_id,
            model: 'claude-opus-5-5',
            prompt: d.summary,
            response: r.object_type === 'session' ? null : 'Hecho.',
            tools: [],
            score: r.score,
            tags: r.tags,
            note: r.note,
            evaluated_at: r.updated_at,
          };
        });
    },
  };
}

function select(records, { objectTypes, score, tag, project, since, sessionId } = {}) {
  return records.filter(
    (r) =>
      (!objectTypes?.length || objectTypes.includes(r.object_type)) &&
      (score === undefined || (score === 'up' ? r.score === 1 : score === 'down' ? r.score === -1 : r.score === null)) &&
      (tag === undefined || r.tags.includes(tag)) &&
      (project === undefined || r.project === project) &&
      (since === undefined || r.updated_at >= since) &&
      (sessionId === undefined || r.session_id === sessionId),
  );
}

function contextOf(events, type, id) {
  if (type === 'session') {
    const own = events.filter((e) => e.session_id === id);
    return own.length ? { session_id: id, project: own.at(-1).project } : undefined;
  }
  if (type === 'turn') {
    const e = events.find((x) => x.id === id);
    return e && e.event_type === 'prompt.submitted' && e.subagent_id === null ? { session_id: e.session_id, project: e.project } : undefined;
  }
  const e = [...events].reverse().find((x) => x.subagent_id === id);
  return e ? { session_id: e.session_id, project: e.project } : undefined;
}

function describe(events, record) {
  let summary = null;
  let agentType = null;
  if (record.object_type === 'turn') summary = oneLine(events.find((e) => e.id === record.object_id)?.payload?.prompt);
  if (record.object_type === 'subagent') {
    const started = events.find((e) => e.subagent_id === record.object_id && e.event_type === 'subagent.started');
    agentType = started?.payload?.agent_type ?? null;
    summary = agentType ? `Tarea de ${agentType}` : null;
  }
  return { ...record, summary, agent_type: agentType };
}
