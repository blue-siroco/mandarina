// Imitación en memoria de la API del backend (`spec/api-spec.yaml`) + WebSocket
// `/ws`, alimentada por la simulación. Sirve para probar el frontend sin
// backend real. No persiste ni enmascara secretos: eso es trabajo del backend.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createBudgetBook } from './mock-budgets.mjs';
import { SUBAGENT_MODEL, computeMetrics, costOf, syntheticUsage } from './mock-metrics.mjs';
import { listSessions, sessionDetail, syntheticTokens } from './mock-sessions.mjs';
import { agentProfile, describeEvents, listAgents, listSubagents } from './mock-subagents.mjs';
import { listTestRuns } from './mock-test-runs.mjs';
import { listSkillInvocations } from './mock-skill-invocations.mjs';
import { listMcpInvocations } from './mock-mcp.mjs';
import { createEvaluationBook, isObjectType } from './mock-evaluations.mjs';
import { createInjectionBook } from './mock-injection.mjs';
import { exporterStatus } from './mock-exporter.mjs';
import { createSimulation, waitingSeedEvents } from './scenario.mjs';

const REQUIRED = ['schema_version', 'harness', 'project', 'directory', 'session_id', 'event_type', 'native_event_type', 'occurred_at', 'payload'];
const EVENT_TYPES = new Set(['session.started', 'prompt.submitted', 'tool.pre', 'tool.post', 'subagent.started', 'subagent.stopped', 'turn.ended', 'session.ended', 'tool.blocked', 'permission.requested', 'session.notified']);
const SESSION_STATES = new Set(['active', 'idle', 'orphaned', 'closed']);
const TEST_KINDS = new Set(['unit', 'e2e']);

function validationError(body) {
  if (body === null || typeof body !== 'object') return 'El cuerpo debe ser un objeto JSON';
  const missing = REQUIRED.filter((key) => body[key] === undefined);
  if (missing.length) return `Faltan campos: ${missing.join(', ')}`;
  if (!EVENT_TYPES.has(body.event_type)) return `event_type desconocido: ${body.event_type}`;
  const { block } = body;
  if (block !== undefined && block !== null && (typeof block.rule !== 'string' || typeof block.reason !== 'string')) {
    return 'block debe tener rule y reason';
  }
  return null;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(undefined);
      }
    });
  });
}

/**
 * @param {object} options
 * @param {number} [options.intervalMs] Cada cuánto se genera un Evento en vivo; 0 lo desactiva.
 * @param {number} [options.historySize] Eventos precargados al arrancar.
 * @param {number} [options.seed] Semilla de la simulación.
 * @param {boolean} [options.waitingSeeds] Añade tres Sesiones que esperan (permiso, pregunta y Subagente; AC-93).
 */
export function createMockApi({ intervalMs = 1500, historySize = 40, seed = 1, waitingSeeds = false } = {}) {
  const simulation = createSimulation({ seed, waits: waitingSeeds });
  /** Más antiguo primero; se sirve invertido. */
  const events = [];
  const book = createEvaluationBook();
  const injections = createInjectionBook();
  const budgets = createBudgetBook(costOf, syntheticUsage, SUBAGENT_MODEL);
  let timer;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mock');
    if (req.method === 'GET' && url.pathname === '/api/v1/health') return sendJson(res, 200, { status: 'ok' });
    if (req.method === 'GET' && url.pathname === '/api/v1/events') return list(url, res);
    if (req.method === 'GET' && url.pathname === '/api/v1/metrics') return metrics(url, res);
    if (req.method === 'GET' && url.pathname === '/api/v1/sessions') return sessions(url, res);
    if (req.method === 'GET' && url.pathname === '/api/v1/test-runs') return testRuns(url, res);
    if (req.method === 'GET' && url.pathname === '/api/v1/skill-invocations') return skillInvocations(url, res);
    if (req.method === 'GET' && url.pathname === '/api/v1/subagents') return subagents(url, res);
    if (req.method === 'GET' && url.pathname === '/api/v1/mcp-invocations') return mcpInvocations(url, res);
    if (req.method === 'GET' && url.pathname === '/api/v1/agents') return agents(url, res);
    if (req.method === 'GET' && url.pathname === '/api/v1/exporter') return sendJson(res, 200, exporterStatus(events));
    if (url.pathname === '/api/v1/evaluations' || url.pathname.startsWith('/api/v1/evaluations/')) return evaluations(req, url, res);
    if (url.pathname === '/api/v1/injection-warnings' || url.pathname.startsWith('/api/v1/injection-warnings/')) return injectionWarnings(req, url, res);
    if (req.method === 'GET' && url.pathname === '/api/v1/masking-stats') return maskingStats(url, res);
    if (url.pathname === '/api/v1/budgets' || url.pathname.startsWith('/api/v1/budgets/')) return budgetRoutes(req, url, res);
    if (req.method === 'GET' && url.pathname.startsWith('/api/v1/agents/')) return agents(url, res, decodeURIComponent(url.pathname.slice('/api/v1/agents/'.length)));
    if (req.method === 'GET' && url.pathname.startsWith('/api/v1/sessions/')) {
      const detail = sessionDetail(events, decodeURIComponent(url.pathname.slice('/api/v1/sessions/'.length)), Date.now(), book.scores('session'), injections.alertsBySession(events));
      return detail ? sendJson(res, 200, detail) : sendJson(res, 404, { message: 'No existe la Sesión' });
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/events') {
      const body = await readJson(req);
      const error = validationError(body);
      if (error) return sendJson(res, 400, { message: error });
      return sendJson(res, 202, { id: ingest(body).id });
    }
    sendJson(res, 404, { message: 'No encontrado' });
  });
  const wss = new WebSocketServer({ server, path: '/ws' });

  function list(url, res) {
    const limit = Number(url.searchParams.get('limit') ?? 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return sendJson(res, 400, { message: 'limit debe estar entre 1 y 500' });
    const before = url.searchParams.get('before');
    let end = events.length;
    if (before) {
      end = events.findIndex((e) => e.id === before);
      if (end === -1) return sendJson(res, 400, { message: `No existe el Evento ${before}` });
    }
    const sessionId = url.searchParams.get('session_id');
    const types = url.searchParams.getAll('event_type');
    if (types.some((t) => !EVENT_TYPES.has(t))) return sendJson(res, 400, { message: 'event_type desconocido' });
    const since = url.searchParams.get('since');
    const matching = events
      .slice(0, end)
      .filter((e) => (sessionId === null || e.session_id === sessionId) && (types.length === 0 || types.includes(e.event_type)))
      .filter((e) => since === null || e.received_at >= new Date(since).toISOString());
    sendJson(res, 200, { items: describeEvents(matching.slice(-limit).reverse(), events, injections.ofEvent) });
  }

  function sessions(url, res) {
    const since = url.searchParams.get('since');
    const states = url.searchParams.getAll('state');
    if (states.some((s) => !SESSION_STATES.has(s))) return sendJson(res, 400, { message: 'state desconocido' });
    if (since !== null && Number.isNaN(Date.parse(since))) return sendJson(res, 400, { message: 'since debe ser una fecha ISO' });
    const filter = {
      since: since === null ? undefined : new Date(since),
      states,
      directory: url.searchParams.get('directory') ?? undefined,
      project: url.searchParams.get('project') ?? undefined,
    };
    sendJson(res, 200, listSessions(events, filter, Date.now(), book.scores('session'), injections.alertsBySession(events)));
  }

  function testRuns(url, res) {
    const since = new Date(url.searchParams.get('since') ?? '');
    if (Number.isNaN(since.getTime())) return sendJson(res, 400, { message: 'since debe ser una fecha ISO' });
    const kind = url.searchParams.get('kind') ?? undefined;
    if (kind !== undefined && !TEST_KINDS.has(kind)) return sendJson(res, 400, { message: 'kind debe ser unit o e2e' });
    const project = url.searchParams.get('project') ?? undefined;
    if (project === '') return sendJson(res, 400, { message: 'project no puede estar vacío' });
    sendJson(res, 200, listTestRuns(events, { since, project, kind }));
  }

  function skillInvocations(url, res) {
    const since = new Date(url.searchParams.get('since') ?? '');
    if (Number.isNaN(since.getTime())) return sendJson(res, 400, { message: 'since debe ser una fecha ISO' });
    const project = url.searchParams.get('project') ?? undefined;
    const sessionId = url.searchParams.get('session_id') ?? undefined;
    if (project === '' || sessionId === '') return sendJson(res, 400, { message: 'project y session_id no pueden estar vacíos' });
    sendJson(res, 200, listSkillInvocations(events, { since, project, sessionId }));
  }

  function subagents(url, res) {
    const since = new Date(url.searchParams.get('since') ?? '');
    if (Number.isNaN(since.getTime())) return sendJson(res, 400, { message: 'since debe ser una fecha ISO' });
    const project = url.searchParams.get('project') ?? undefined;
    const type = url.searchParams.get('type') ?? undefined;
    if (project === '' || type === '') return sendJson(res, 400, { message: 'project y type no pueden estar vacíos' });
    const internal = url.searchParams.get('include_internal');
    if (internal !== null && internal !== 'true' && internal !== 'false') return sendJson(res, 400, { message: 'include_internal debe ser true o false' });
    sendJson(res, 200, listSubagents(events, { since, project, type, includeInternal: internal === 'true' }, { syntheticTokens }));
  }

  function mcpInvocations(url, res) {
    const since = new Date(url.searchParams.get('since') ?? '');
    if (Number.isNaN(since.getTime())) return sendJson(res, 400, { message: 'since debe ser una fecha ISO' });
    const [project, server, sessionId] = ['project', 'server', 'session_id'].map((k) => url.searchParams.get(k) ?? undefined);
    if ([project, server, sessionId].includes('')) return sendJson(res, 400, { message: 'project, server y session_id no pueden estar vacíos' });
    sendJson(res, 200, listMcpInvocations(events, { since, project, server, sessionId }));
  }

  function agents(url, res, type) {
    const since = new Date(url.searchParams.get('since') ?? '');
    if (Number.isNaN(since.getTime())) return sendJson(res, 400, { message: 'since debe ser una fecha ISO' });
    const project = url.searchParams.get('project') ?? undefined;
    if (project === '') return sendJson(res, 400, { message: 'project no puede estar vacío' });
    const deps = { syntheticTokens, subagentScores: book.scores('subagent') };
    sendJson(res, 200, type === undefined ? listAgents(events, { since, project }, deps) : agentProfile(events, type, { since, project }, deps));
  }

  /** Filtros comunes del listado y de la exportación; `undefined` si alguno es inválido. */
  function evaluationFilter(url) {
    const types = url.searchParams.getAll('object_type');
    const score = url.searchParams.get('score') ?? undefined;
    const since = url.searchParams.get('since') ?? undefined;
    const [tag, project, sessionId] = ['tag', 'project', 'session_id'].map((k) => url.searchParams.get(k) ?? undefined);
    if (types.some((t) => !isObjectType(t))) return undefined;
    if (score !== undefined && !['up', 'down', 'none'].includes(score)) return undefined;
    if (since !== undefined && Number.isNaN(Date.parse(since))) return undefined;
    if ([tag, project, sessionId].includes('')) return undefined;
    return { objectTypes: types, score, tag, project, since: since === undefined ? undefined : new Date(since).toISOString(), sessionId };
  }

  function injectionWarnings(req, url, res) {
    const rest = url.pathname.slice('/api/v1/injection-warnings'.length).split('/').filter(Boolean).map(decodeURIComponent);
    if (req.method === 'GET' && rest.length === 0) {
      const since = new Date(url.searchParams.get('since') ?? '');
      const severities = url.searchParams.getAll('severity');
      const dismissed = url.searchParams.get('dismissed') ?? undefined;
      const [project, pattern, sessionId] = ['project', 'pattern', 'session_id'].map((k) => url.searchParams.get(k) ?? undefined);
      if (Number.isNaN(since.getTime()) || severities.some((s) => !['low', 'medium', 'high'].includes(s))) return sendJson(res, 400, { message: 'since o severity inválidos' });
      if ((dismissed !== undefined && !['true', 'false', 'all'].includes(dismissed)) || [project, pattern, sessionId].includes('')) return sendJson(res, 400, { message: 'Algún filtro es inválido' });
      return sendJson(res, 200, injections.list(events, { since, project, sessionId, severities, pattern, dismissed }));
    }
    if (rest.length === 2 && rest[1] === 'dismissal' && (req.method === 'PUT' || req.method === 'DELETE')) {
      const done = req.method === 'PUT' ? injections.dismiss(events, rest[0]) : injections.restore(events, rest[0]);
      return done ? res.writeHead(204).end() : sendJson(res, 404, { message: 'No existe el aviso' });
    }
    sendJson(res, 404, { message: 'No encontrado' });
  }

  /** Difunde los cambios de estado de los Presupuestos (AC-81). */
  function broadcastBudgets() {
    for (const message of budgets.transitions(events)) {
      const data = JSON.stringify(message);
      for (const client of wss.clients) if (client.readyState === client.OPEN) client.send(data);
    }
  }

  async function budgetRoutes(req, url, res) {
    const rest = url.pathname.slice('/api/v1/budgets'.length).split('/').filter(Boolean).map(decodeURIComponent);
    const reply = (result) => {
      broadcastBudgets();
      return sendJson(res, result.status, result.body);
    };
    if (req.method === 'GET' && rest.length === 0) return sendJson(res, 200, budgets.list(events));
    if (req.method === 'POST' && rest.length === 0) return reply(budgets.create(events, await readJson(req)));
    if (req.method === 'GET' && rest[0] === 'status' && rest.length === 1) {
      const [sessionId, project] = ['session_id', 'project'].map((k) => url.searchParams.get(k));
      if (!sessionId || !project) return sendJson(res, 400, { message: 'Faltan session_id y project' });
      return sendJson(res, 200, budgets.status(events, sessionId, project));
    }
    if (rest.length === 1 && req.method === 'PUT') return reply(budgets.update(events, rest[0], await readJson(req)));
    if (rest.length === 1 && req.method === 'DELETE') {
      if (!budgets.remove(rest[0])) return sendJson(res, 404, { message: 'No existe el Presupuesto' });
      broadcastBudgets();
      return res.writeHead(204).end();
    }
    if (rest.length === 2 && rest[1] === 'allowances' && req.method === 'POST') return reply(budgets.addAllowance(rest[0], await readJson(req)));
    if (rest.length === 3 && rest[1] === 'allowances' && req.method === 'DELETE') {
      if (!budgets.removeAllowance(rest[0], rest[2])) return sendJson(res, 404, { message: 'No existe la excepción' });
      broadcastBudgets();
      return res.writeHead(204).end();
    }
    sendJson(res, 404, { message: 'No encontrado' });
  }

  function maskingStats(url, res) {
    const since = new Date(url.searchParams.get('since') ?? '');
    if (Number.isNaN(since.getTime())) return sendJson(res, 400, { message: 'since debe ser una fecha ISO' });
    sendJson(res, 200, injections.maskingStats(events, since));
  }

  async function evaluations(req, url, res) {
    const rest = url.pathname.slice('/api/v1/evaluations'.length).split('/').filter(Boolean).map(decodeURIComponent);
    if (req.method === 'GET' && rest.length === 0) {
      const filter = evaluationFilter(url);
      return filter ? sendJson(res, 200, book.list(events, filter)) : sendJson(res, 400, { message: 'Algún filtro es inválido' });
    }
    if (req.method === 'GET' && rest[0] === 'tags' && rest.length === 1) return sendJson(res, 200, { items: book.tags() });
    if (req.method === 'GET' && rest[0] === 'export' && rest.length === 1) {
      const filter = evaluationFilter(url);
      if (!filter) return sendJson(res, 400, { message: 'Algún filtro es inválido' });
      const body = book.exportLines(events, filter).map((line) => `${JSON.stringify(line)}\n`).join('');
      return res.writeHead(200, { 'content-type': 'application/x-ndjson' }).end(body);
    }
    const [type, id] = rest;
    if (rest.length !== 2 || !isObjectType(type)) return sendJson(res, 400, { message: 'Objeto a evaluar inválido' });
    if (req.method === 'PUT') {
      const result = book.put(events, type, id, await readJson(req));
      return sendJson(res, result.status, result.body);
    }
    if (req.method === 'DELETE') {
      return book.remove(type, id) ? res.writeHead(204).end() : sendJson(res, 404, { message: 'No tiene Evaluación' });
    }
    sendJson(res, 404, { message: 'No encontrado' });
  }

  function metrics(url, res) {
    const since = new Date(url.searchParams.get('since') ?? '');
    if (Number.isNaN(since.getTime())) return sendJson(res, 400, { message: 'since debe ser una fecha ISO' });
    const directory = url.searchParams.get('directory') ?? undefined;
    if (directory === '') return sendJson(res, 400, { message: 'directory no puede estar vacío' });
    const breakdown = url.searchParams.get('breakdown');
    if (breakdown !== null && breakdown !== 'true' && breakdown !== 'false') return sendJson(res, 400, { message: 'breakdown debe ser true o false' });
    sendJson(res, 200, computeMetrics(events, since, new Date(), { directory, breakdown: breakdown === 'true' }));
  }

  function ingest(input, receivedAt = new Date()) {
    const event = {
      subagent_id: null,
      tool_name: null,
      transcript_path: null,
      block: null,
      ...input,
      id: randomUUID(),
      received_at: receivedAt.toISOString(),
    };
    events.push(event);
    const message = JSON.stringify({ type: 'event.ingested', event: describeEvents([event], events, injections.ofEvent)[0] });
    for (const client of wss.clients) if (client.readyState === client.OPEN) client.send(message);
    return event;
  }

  // Historial precargado, repartido en los últimos minutos.
  const start = Date.now() - historySize * 5000;
  for (let i = 0; i < historySize; i++) {
    const at = new Date(start + i * 5000);
    ingest(simulation.next(at), at);
  }
  // Sesiones que ya esperan al arrancar: permiso, pregunta y Subagente (AC-93).
  if (waitingSeeds) for (const event of waitingSeedEvents(new Date())) ingest(event, new Date(event.occurred_at));

  return {
    events,
    ingest,
    listen(port = 4000, host = '0.0.0.0') {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          if (intervalMs > 0) timer = setInterval(() => {
            ingest(simulation.next());
            broadcastBudgets();
          }, intervalMs);
          resolve(server.address());
        });
      });
    },
    close() {
      clearInterval(timer);
      for (const client of wss.clients) client.terminate();
      wss.close();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
