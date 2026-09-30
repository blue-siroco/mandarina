// JSON Schemas de la API; reflejan `spec/api-spec.yaml`.
import { EVALUATION_OBJECT_TYPES } from '../../domain/evaluation.js';
import { EVENT_TYPES, SUPPORTED_SCHEMA_VERSION } from '../../domain/event.js';

const nullableString = { type: ['string', 'null'] } as const;
const nonEmpty = { type: 'string', minLength: 1 } as const;

export const eventInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'harness',
    'project',
    'directory',
    'session_id',
    'event_type',
    'native_event_type',
    'occurred_at',
    'payload',
  ],
  properties: {
    schema_version: { type: 'integer', const: SUPPORTED_SCHEMA_VERSION },
    harness: nonEmpty,
    project: nonEmpty,
    directory: nonEmpty,
    session_id: nonEmpty,
    subagent_id: nullableString,
    event_type: { type: 'string', enum: EVENT_TYPES },
    native_event_type: nonEmpty,
    tool_name: nullableString,
    occurred_at: { type: 'string', format: 'date-time' },
    transcript_path: nullableString,
    payload: { type: 'object' },
    block: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['rule', 'reason'],
          properties: { rule: nonEmpty, reason: nonEmpty },
        },
        { type: 'null' },
      ],
    },
  },
} as const;

// Fastify convierte un parámetro repetido (o uno solo) en array: `?event_type=a&event_type=b`.
export const listEventsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
    before: nonEmpty,
    session_id: nonEmpty,
    project: nonEmpty,
    event_type: { type: 'array', items: { type: 'string', enum: EVENT_TYPES } },
    since: { type: 'string', format: 'date-time' },
  },
} as const;

export const SESSION_STATES = ['active', 'idle', 'orphaned', 'closed'] as const;

export const listSessionsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    since: { type: 'string', format: 'date-time' },
    state: { type: 'array', items: { type: 'string', enum: SESSION_STATES } },
    directory: nonEmpty,
    project: nonEmpty,
  },
} as const;

export const TEST_KINDS = ['unit', 'e2e'] as const;

export const testRunsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['since'],
  properties: {
    since: { type: 'string', format: 'date-time' },
    project: nonEmpty,
    kind: { type: 'string', enum: TEST_KINDS },
  },
} as const;

export const skillInvocationsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['since'],
  properties: {
    since: { type: 'string', format: 'date-time' },
    project: nonEmpty,
    session_id: nonEmpty,
  },
} as const;

export const subagentsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['since'],
  properties: {
    since: { type: 'string', format: 'date-time' },
    project: nonEmpty,
    type: nonEmpty,
    include_internal: { type: 'boolean', default: false },
  },
} as const;

export const mcpInvocationsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['since'],
  properties: {
    since: { type: 'string', format: 'date-time' },
    project: nonEmpty,
    server: nonEmpty,
    session_id: nonEmpty,
  },
} as const;

export const agentsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['since'],
  properties: {
    since: { type: 'string', format: 'date-time' },
    project: nonEmpty,
  },
} as const;

export const metricsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['since'],
  properties: {
    since: { type: 'string', format: 'date-time' },
    directory: nonEmpty,
    breakdown: { type: 'boolean', default: false },
  },
} as const;

export const evaluationsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    object_type: { type: 'array', items: { type: 'string', enum: EVALUATION_OBJECT_TYPES } },
    score: { type: 'string', enum: ['up', 'down', 'none'] },
    tag: nonEmpty,
    project: nonEmpty,
    since: { type: 'string', format: 'date-time' },
    session_id: nonEmpty,
  },
} as const;

export const injectionWarningsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['since'],
  properties: {
    since: { type: 'string', format: 'date-time' },
    project: nonEmpty,
    session_id: nonEmpty,
    severity: { type: 'array', items: { type: 'string', enum: ['low', 'medium', 'high'] } },
    pattern: nonEmpty,
    dismissed: { type: 'string', enum: ['true', 'false', 'all'] },
  },
} as const;

export const maskingStatsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['since'],
  properties: { since: { type: 'string', format: 'date-time' } },
} as const;

export const budgetStatusQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['session_id', 'project'],
  properties: { session_id: nonEmpty, project: nonEmpty },
} as const;

export const evaluationParamsSchema = {
  type: 'object',
  required: ['object_type', 'object_id'],
  properties: {
    object_type: { type: 'string', enum: EVALUATION_OBJECT_TYPES },
    object_id: nonEmpty,
  },
} as const;

const subscriptionWindow = {
  type: 'object',
  additionalProperties: false,
  required: ['used_percentage', 'resets_at'],
  properties: {
    used_percentage: { type: 'number', minimum: 0, maximum: 100 },
    // Epoch en segundos, como lo pasa Claude Code al statusLine.
    // Acotado (año 2100): un epoch desmesurado no es una fecha válida y daría un 500 al convertirlo.
    resets_at: { type: 'integer', minimum: 0, maximum: 4_102_444_800 },
  },
} as const;

export const subscriptionUsageBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: { session_id: { type: 'string', minLength: 1, maxLength: 200 }, five_hour: subscriptionWindow, seven_day: subscriptionWindow },
} as const;

// Descargas (ADR-0013; AC-143): `content` es un booleano estricto, cualquier otro valor da 400.
const contentParam = { type: 'boolean', default: false } as const;

export const exportSessionQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: { content: contentParam },
} as const;

export const exportEventsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    project: nonEmpty,
    session_id: nonEmpty,
    event_type: { type: 'array', items: { type: 'string', enum: EVENT_TYPES } },
    tool: { type: 'array', items: nonEmpty },
    since: { type: 'string', format: 'date-time' },
    content: contentParam,
  },
} as const;
