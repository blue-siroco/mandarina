// Descargas de Sesión (JSON) y de Eventos (JSONL) — ADR-0013, AC-142 a AC-146.
// Solo lectura sobre los Eventos en memoria. Mismas reglas que el backend: tope de
// Eventos, orden cronológico ascendente, estructura por defecto y contenido opt-in.
import { maskSecrets } from '../../adapters/claude-code/lib/mask.mjs';

/** Tope de Eventos por descarga (AC-145); los tests lo bajan por inyección. */
export const DOWNLOAD_LIMIT = 50_000;

const BASE_FIELDS = ['id', 'harness', 'project', 'directory', 'session_id', 'subagent_id', 'event_type', 'native_event_type', 'tool_name', 'occurred_at', 'received_at', 'block.rule'];
const CONTENT_FIELDS = ['payload', 'block.reason'];

export const downloadFields = (includeContent) => (includeContent ? [...BASE_FIELDS, ...CONTENT_FIELDS] : BASE_FIELDS);

/** `content` solo admite true/false; devuelve `undefined` si es inválido (AC-143). */
export function parseContent(url) {
  const raw = url.searchParams.get('content');
  if (raw === null || raw === 'false') return false;
  return raw === 'true' ? true : undefined;
}

/** Filtros de la descarga de Eventos; `{ error }` si alguno es inválido (AC-144). */
export function parseEventFilters(url, eventTypes) {
  const project = url.searchParams.get('project') ?? undefined;
  const sessionId = url.searchParams.get('session_id') ?? undefined;
  const since = url.searchParams.get('since') ?? undefined;
  const types = url.searchParams.getAll('event_type');
  const tools = url.searchParams.getAll('tool');
  if (project === '' || sessionId === '') return { error: 'project y session_id no pueden estar vacíos' };
  if (types.some((t) => !eventTypes.has(t))) return { error: 'event_type desconocido' };
  if (tools.some((t) => t === '')) return { error: 'tool no puede estar vacío' };
  if (since !== undefined && Number.isNaN(Date.parse(since))) return { error: 'since debe ser una fecha ISO' };
  const filters = {};
  if (project !== undefined) filters.project = project;
  if (sessionId !== undefined) filters.session_id = sessionId;
  if (types.length) filters.event_type = types;
  if (tools.length) filters.tool = tools;
  if (since !== undefined) filters.since = new Date(since).toISOString();
  return { filters };
}

export function filterEvents(events, f) {
  return events.filter(
    (e) =>
      (f.project === undefined || e.project === f.project) &&
      (f.session_id === undefined || e.session_id === f.session_id) &&
      (f.event_type === undefined || f.event_type.includes(e.event_type)) &&
      (f.tool === undefined || f.tool.includes(e.tool_name)) &&
      (f.since === undefined || e.received_at >= f.since),
  );
}

/** Aplica el tope quedándose con los más recientes; los Eventos ya vienen en orden ascendente. */
export function capEvents(matching, limit = DOWNLOAD_LIMIT) {
  const kept = matching.length > limit ? matching.slice(matching.length - limit) : matching;
  const total = matching.length;
  return { kept, counts: { total, exported: kept.length, truncated: kept.length < total, omitted: total - kept.length } };
}

export const previewOf = (counts, includeContent) => ({ ...counts, fields: downloadFields(includeContent) });

function downloadedEvent(e, includeContent) {
  const out = {
    id: e.id,
    harness: e.harness,
    project: e.project,
    directory: e.directory,
    session_id: e.session_id,
    subagent_id: e.subagent_id ?? null,
    event_type: e.event_type,
    native_event_type: e.native_event_type,
    tool_name: e.tool_name ?? null,
    occurred_at: e.occurred_at,
    received_at: e.received_at,
    block: e.block ? { rule: e.block.rule } : null,
  };
  if (!includeContent) return out;
  // Doble red de seguridad (AC-143): se enmascara aunque el Evento ya lo estuviera.
  if (e.block) out.block = maskSecrets({ rule: e.block.rule, reason: e.block.reason });
  out.payload = maskSecrets(e.payload ?? {});
  return out;
}

const header = (kind, includeContent, counts, filters) => ({
  kind,
  generated_at: new Date().toISOString(),
  include_content: includeContent,
  ...(filters === undefined ? {} : { filters }),
  ...counts,
});

const without = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([k]) => !keys.includes(k)));

/** Quita del detalle de Sesión lo que es contenido: los campos no aparecen (AC-142). */
function structureOnly(detail) {
  const subagent = ({ tools, ...rest }) => ({ ...rest, ...(tools ? { tools: tools.map((t) => without(t, 'summary')) } : {}) });
  return {
    ...detail,
    turns: detail.turns.map((t) => without(t, 'prompt')),
    subagents: detail.subagents.map((s) => subagent(without(s, 'task', 'result'))),
    blocks: detail.blocks.map((b) => without(b, 'summary', 'reason')),
  };
}

/** Cuerpo de la Descarga de Sesión (AC-142). */
export function sessionDownload(detail, sessionEvents, includeContent, limit = DOWNLOAD_LIMIT) {
  const { kept, counts } = capEvents(sessionEvents, limit);
  return {
    export: header('session', includeContent, counts),
    session: includeContent ? maskSecrets(detail) : structureOnly(detail),
    events: kept.map((e) => downloadedEvent(e, includeContent)),
  };
}

/** Líneas de la Descarga de Eventos: cabecera y un Evento por línea (AC-144). */
export function eventsDownloadLines(matching, includeContent, filters, limit = DOWNLOAD_LIMIT) {
  const { kept, counts } = capEvents(matching, limit);
  return [{ export: header('events', includeContent, counts, filters) }, ...kept.map((e) => downloadedEvent(e, includeContent))];
}
