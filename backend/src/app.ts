import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { EventInput, EventType } from './domain/event.js';
import type { SessionState } from './domain/session-summary.js';
import { GetSessionDetail } from './application/get-session-detail.js';
import { GetUsageMetrics } from './application/get-usage-metrics.js';
import { ListSessions } from './application/list-sessions.js';
import { ListTestRuns } from './application/list-test-runs.js';
import { ListSkillInvocations } from './application/list-skill-invocations.js';
import { DescribeSubagentEvents, DescribingPublisher } from './application/describe-subagent-events.js';
import { ListSubagents } from './application/list-subagents.js';
import { ListMcpInvocations } from './application/list-mcp-invocations.js';
import { ListAgents } from './application/list-agents.js';
import { ExportTurns } from './application/export-turns.js';
import { InjectionWarnings, type WarningFilter } from './application/injection-warnings.js';
import { ManageBudgets } from './application/manage-budgets.js';
import { ManageEvaluations } from './application/manage-evaluations.js';
import { ManageSubscriptionUsage } from './application/manage-subscription-usage.js';
import type { EvaluationFilter } from './application/ports.js';
import type { EvaluationObjectType } from './domain/evaluation.js';
import { SqliteBudgetStore } from './infrastructure/sqlite-budget-store.js';
import { SqliteEvaluationStore } from './infrastructure/sqlite-evaluation-store.js';
import { SqliteInjectionDismissals } from './infrastructure/sqlite-injection-dismissals.js';
import { SqliteSubscriptionUsageStore } from './infrastructure/sqlite-subscription-usage-store.js';
import type { SubscriptionReading } from './domain/subscription-usage.js';
import { parseOtlpConfig } from './domain/otlp-config.js';
import { SqliteExportStore } from './infrastructure/sqlite-export-store.js';
import type { TestKind } from './domain/test-results.js';
import { IngestEvent } from './application/ingest-event.js';
import type { Clock } from './application/ports.js';
import { FsTranscriptReader } from './infrastructure/fs-transcript-reader.js';
import { SqliteEventRepository } from './infrastructure/sqlite-event-repository.js';
import { WebSocketPublisher } from './infrastructure/websocket-publisher.js';
import {
  eventInputSchema,
  listEventsQuerySchema,
  listSessionsQuerySchema,
  metricsQuerySchema,
  testRunsQuerySchema,
  skillInvocationsQuerySchema,
  subagentsQuerySchema,
  mcpInvocationsQuerySchema,
  agentsQuerySchema,
  budgetStatusQuerySchema,
  evaluationParamsSchema,
  evaluationsQuerySchema,
  injectionWarningsQuerySchema,
  maskingStatsQuerySchema,
  subscriptionUsageBodySchema,
} from './interfaces/http/schemas.js';

export interface AppOptions {
  databaseFile: string;
  logger?: boolean;
  /** Ruta del volumen con `~/.claude` (ADR-0003); sin ella, las rutas del Transcript se usan tal cual. */
  claudeHomeMount?: string;
  clock?: Clock;
  /** Exportación OTLP (ADR-0008): por defecto, las variables de entorno del proceso. */
  otlp?: { env?: Record<string, string | undefined>; fetch?: typeof fetch; intervalMs?: number };
  /** Presupuestos (ADR-0010): cada cuánto se revisan (0 lo apaga) y cuánto se reutiliza el gasto calculado. */
  budgets?: { intervalMs?: number; spendingTtlMs?: number };
}

declare module 'fastify' {
  interface FastifyInstance {
    exporter: ExportTurns;
    budgets: ManageBudgets;
  }
}

const EXPORT_INTERVAL_MS = 10_000;
const BUDGET_INTERVAL_MS = 10_000;

// Los payloads incluyen salidas de herramientas completas (p. ej. un `Read` grande).
const BODY_LIMIT_BYTES = 10 * 1024 * 1024;

export async function buildApp({
  databaseFile,
  logger = false,
  claudeHomeMount,
  clock = { now: () => new Date() },
  otlp = {},
  budgets: budgetOptions = {},
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    bodyLimit: BODY_LIMIT_BYTES,
    // Por defecto Fastify borra en silencio los campos no declarados; el
    // contrato exige rechazarlos (AC-04) para detectar Adaptadores desalineados.
    ajv: { customOptions: { removeAdditional: false } },
  });
  const repository = new SqliteEventRepository(databaseFile);
  const publisher = new WebSocketPublisher();
  const injections = new InjectionWarnings(repository, new SqliteInjectionDismissals(repository.connection), clock);
  const describer = new DescribeSubagentEvents(repository, injections);
  // Un solo lector para que las tres rutas compartan su caché de Transcripts.
  const transcripts = new FsTranscriptReader(claudeHomeMount);
  const exporter = new ExportTurns(
    repository,
    transcripts,
    new SqliteExportStore(repository.connection),
    clock,
    parseOtlpConfig(otlp.env ?? process.env),
    otlp.fetch ?? fetch,
  );
  const describing = new DescribingPublisher(describer, publisher);
  const ingest = new IngestEvent(
    repository,
    { publish: (event) => { describing.publish(event); exporter.notify(); } },
    clock,
    { next: randomUUID },
  );
  const metrics = new GetUsageMetrics(repository, transcripts, clock);
  const evaluationStore = new SqliteEvaluationStore(repository.connection);
  const evaluations = new ManageEvaluations(repository, transcripts, evaluationStore, clock);
  const sessions = new ListSessions(repository, transcripts, clock, evaluationStore, injections);
  const sessionDetail = new GetSessionDetail(repository, transcripts, clock, evaluationStore, injections);
  const testRuns = new ListTestRuns(repository);
  const skillInvocations = new ListSkillInvocations(repository, transcripts, clock);
  const subagentList = new ListSubagents(repository, transcripts, clock);
  const mcpInvocations = new ListMcpInvocations(repository, clock);
  const agents = new ListAgents(repository, transcripts, clock, evaluationStore);

  const budgets = new ManageBudgets(
    repository,
    transcripts,
    new SqliteBudgetStore(repository.connection),
    clock,
    { next: randomUUID },
    publisher,
    { spendingTtlMs: budgetOptions.spendingTtlMs },
  );
  app.decorate('exporter', exporter);
  app.decorate('budgets', budgets);
  const stopExporter = exporter.start(otlp.intervalMs ?? EXPORT_INTERVAL_MS);
  const stopBudgets = budgets.start(budgetOptions.intervalMs ?? BUDGET_INTERVAL_MS);
  app.addHook('onClose', async () => {
    stopExporter();
    stopBudgets();
    repository.close();
  });
  await app.register(websocket);

  app.get('/ws', { websocket: true }, (socket) => publisher.add(socket));

  app.get('/api/v1/health', async () => ({ status: 'ok' }));

  app.post<{ Body: EventInput }>('/api/v1/events', { schema: { body: eventInputSchema } }, async (request, reply) => {
    const event = ingest.execute(request.body);
    return reply.code(202).send({ id: event.id });
  });

  app.get<{
    Querystring: { limit: number; before?: string; session_id?: string; project?: string; event_type?: EventType[]; since?: string };
  }>(
    '/api/v1/events',
    { schema: { querystring: listEventsQuerySchema } },
    async (request, reply) => {
      const { limit, before, session_id, project, event_type, since } = request.query;
      const items = repository.list({
        limit,
        before,
        sessionId: session_id,
        project,
        eventTypes: event_type,
        since: since === undefined ? undefined : new Date(since).toISOString(),
      });
      if (items === undefined) return reply.code(400).send({ message: `No existe el Evento ${request.query.before}` });
      return { items: describer.execute(items) };
    },
  );

  app.get<{ Querystring: { since: string; directory?: string; breakdown?: boolean } }>(
    '/api/v1/metrics',
    { schema: { querystring: metricsQuerySchema } },
    async (request) => {
      const { since, directory, breakdown } = request.query;
      return metrics.execute(new Date(since), { directory, breakdown });
    },
  );

  app.get<{ Querystring: { since?: string; state?: SessionState[]; directory?: string; project?: string } }>(
    '/api/v1/sessions',
    { schema: { querystring: listSessionsQuerySchema } },
    async (request) => {
      const { since, state, directory, project } = request.query;
      return sessions.execute({ since: since === undefined ? undefined : new Date(since), states: state, directory, project });
    },
  );

  app.get<{ Querystring: { since: string; project?: string; kind?: TestKind } }>(
    '/api/v1/test-runs',
    { schema: { querystring: testRunsQuerySchema } },
    async (request) => {
      const { since, project, kind } = request.query;
      return testRuns.execute({ since: new Date(since), project, kind });
    },
  );

  app.get<{ Querystring: { since: string; project?: string; session_id?: string } }>(
    '/api/v1/skill-invocations',
    { schema: { querystring: skillInvocationsQuerySchema } },
    async (request) => {
      const { since, project, session_id } = request.query;
      return skillInvocations.execute({ since: new Date(since), project, sessionId: session_id });
    },
  );

  app.get<{ Querystring: { since: string; project?: string; type?: string; include_internal?: boolean } }>(
    '/api/v1/subagents',
    { schema: { querystring: subagentsQuerySchema } },
    async (request) => {
      const { since, project, type, include_internal } = request.query;
      return subagentList.execute({ since: new Date(since), project, type, includeInternal: include_internal });
    },
  );

  app.get<{ Querystring: { since: string; project?: string; server?: string; session_id?: string } }>(
    '/api/v1/mcp-invocations',
    { schema: { querystring: mcpInvocationsQuerySchema } },
    async (request) => {
      const { since, project, server, session_id } = request.query;
      return mcpInvocations.execute({ since: new Date(since), project, server, sessionId: session_id });
    },
  );

  app.get<{ Querystring: { since: string; project?: string } }>(
    '/api/v1/agents',
    { schema: { querystring: agentsQuerySchema } },
    async (request) => agents.list({ since: new Date(request.query.since), project: request.query.project }),
  );

  app.get<{ Params: { type: string }; Querystring: { since: string; project?: string } }>(
    '/api/v1/agents/:type',
    { schema: { querystring: agentsQuerySchema } },
    async (request) => agents.profile(request.params.type, { since: new Date(request.query.since), project: request.query.project }),
  );

  app.get('/api/v1/exporter', async () => exporter.status());

  const subscriptionUsage = new ManageSubscriptionUsage(new SqliteSubscriptionUsageStore(repository.connection), clock, publisher);

  app.get('/api/v1/subscription-usage', async () => ({ usage: subscriptionUsage.current() }));

  app.put<{ Body: SubscriptionReading & { session_id?: string } }>(
    '/api/v1/subscription-usage',
    // El cuerpo real son unos pocos bytes: un tope pequeño evita escrituras y difusiones con cuerpos enormes.
    { schema: { body: subscriptionUsageBodySchema }, bodyLimit: 1024 },
    async (request, reply) => {
      const result = subscriptionUsage.record(request.body);
      return result.ok ? reply.code(204).send() : reply.code(result.status).send({ message: result.message });
    },
  );

  // Tras cambiar un Presupuesto se revisa al momento, sin esperar al temporizador (AC-81).
  const changed = async <T>(value: T): Promise<T> => {
    await budgets.tick();
    return value;
  };

  app.get('/api/v1/budgets', async () => budgets.list());

  app.get<{ Querystring: { session_id: string; project: string } }>(
    '/api/v1/budgets/status',
    { schema: { querystring: budgetStatusQuerySchema } },
    async (request) => budgets.status(request.query.session_id, request.query.project),
  );

  app.post('/api/v1/budgets', async (request, reply) => {
    const result = await budgets.create(request.body);
    return result.ok ? reply.code(201).send(await changed(result.value)) : reply.code(result.status).send({ message: result.message });
  });

  app.put<{ Params: { id: string } }>('/api/v1/budgets/:id', async (request, reply) => {
    const result = await budgets.update(request.params.id, request.body);
    return result.ok ? changed(result.value) : reply.code(result.status).send({ message: result.message });
  });

  app.delete<{ Params: { id: string } }>('/api/v1/budgets/:id', async (request, reply) => {
    if (!budgets.remove(request.params.id)) return reply.code(404).send({ message: `No existe el Presupuesto ${request.params.id}` });
    await budgets.tick();
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/v1/budgets/:id/allowances', async (request, reply) => {
    const result = await budgets.addAllowance(request.params.id, request.body);
    return result.ok ? reply.code(201).send(await changed(result.value)) : reply.code(result.status).send({ message: result.message });
  });

  app.delete<{ Params: { id: string; allowance_id: string } }>('/api/v1/budgets/:id/allowances/:allowance_id', async (request, reply) => {
    if (!budgets.removeAllowance(request.params.id, request.params.allowance_id)) {
      return reply.code(404).send({ message: 'No existe la excepción' });
    }
    await budgets.tick();
    return reply.code(204).send();
  });

  interface EvaluationQuery {
    object_type?: EvaluationObjectType[];
    score?: 'up' | 'down' | 'none';
    tag?: string;
    project?: string;
    since?: string;
    session_id?: string;
  }
  const toFilter = (q: EvaluationQuery): EvaluationFilter => ({
    objectTypes: q.object_type,
    score: q.score,
    tag: q.tag,
    project: q.project,
    since: q.since === undefined ? undefined : new Date(q.since).toISOString(),
    sessionId: q.session_id,
  });

  app.get<{ Querystring: EvaluationQuery }>('/api/v1/evaluations', { schema: { querystring: evaluationsQuerySchema } }, async (request) =>
    evaluations.list(toFilter(request.query)),
  );

  app.get<{
    Querystring: {
      since: string;
      project?: string;
      session_id?: string;
      severity?: WarningFilter['severities'];
      pattern?: string;
      dismissed?: WarningFilter['dismissed'];
    };
  }>('/api/v1/injection-warnings', { schema: { querystring: injectionWarningsQuerySchema } }, async (request) => {
    const { since, project, session_id, severity, pattern, dismissed } = request.query;
    return injections.list({ since: new Date(since), project, sessionId: session_id, severities: severity, pattern, dismissed });
  });

  app.put<{ Params: { id: string } }>('/api/v1/injection-warnings/:id/dismissal', async (request, reply) =>
    injections.dismiss(request.params.id) ? reply.code(204).send() : reply.code(404).send({ message: `No existe el aviso ${request.params.id}` }),
  );

  app.delete<{ Params: { id: string } }>('/api/v1/injection-warnings/:id/dismissal', async (request, reply) =>
    injections.restore(request.params.id) ? reply.code(204).send() : reply.code(404).send({ message: `No existe el aviso ${request.params.id}` }),
  );

  app.get<{ Querystring: { since: string } }>('/api/v1/masking-stats', { schema: { querystring: maskingStatsQuerySchema } }, async (request) =>
    injections.maskingStats(new Date(request.query.since)),
  );

  app.get('/api/v1/evaluations/tags', async () => ({ items: evaluations.tags() }));

  app.get<{ Querystring: EvaluationQuery }>('/api/v1/evaluations/export', { schema: { querystring: evaluationsQuerySchema } }, async (request, reply) => {
    const lines = await evaluations.exportLines(toFilter(request.query));
    return reply.type('application/x-ndjson').send(lines.map((line) => `${JSON.stringify(line)}\n`).join(''));
  });

  type EvaluationParams = { object_type: EvaluationObjectType; object_id: string };

  app.put<{ Params: EvaluationParams; Body: unknown }>(
    '/api/v1/evaluations/:object_type/:object_id',
    { schema: { params: evaluationParamsSchema } },
    async (request, reply) => {
      const result = evaluations.put(request.params.object_type, request.params.object_id, request.body);
      return result.ok ? result.evaluation : reply.code(result.status).send({ message: result.message });
    },
  );

  app.delete<{ Params: EvaluationParams }>(
    '/api/v1/evaluations/:object_type/:object_id',
    { schema: { params: evaluationParamsSchema } },
    async (request, reply) => {
      const { object_type, object_id } = request.params;
      if (!evaluations.remove(object_type, object_id)) return reply.code(404).send({ message: `${object_type} ${object_id} no tiene Evaluación` });
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string } }>('/api/v1/sessions/:id', async (request, reply) => {
    const detail = await sessionDetail.execute(request.params.id);
    if (!detail) return reply.code(404).send({ message: `No existe la Sesión ${request.params.id}` });
    return detail;
  });

  return app;
}
