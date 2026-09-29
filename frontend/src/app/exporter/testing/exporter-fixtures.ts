import { ExportedTurnDto, ExporterStatusDto, toExportedTurn, toExporterStatus } from '../mappers/exporter.mapper';

export const exportedTurnDto = (overrides: Partial<ExportedTurnDto> = {}): ExportedTurnDto => ({
  turn_id: 'p1',
  session_id: 's1',
  project: 'mandarina',
  state: 'exported',
  attempts: 1,
  last_error: null,
  updated_at: '2026-09-25T12:00:30.000Z',
  ...overrides,
});

export const exporterStatusDto = (overrides: Partial<ExporterStatusDto> = {}): ExporterStatusDto => ({
  enabled: true,
  endpoint_host: 'collector.local:4318',
  include_content: false,
  enabled_since: '2026-09-25T11:00:00.000Z',
  counts: { pending: 1, exported: 2, failed: 1 },
  last_exported_at: '2026-09-25T12:00:30.000Z',
  recent: [
    exportedTurnDto(),
    exportedTurnDto({
      turn_id: 'p2',
      session_id: 's2',
      project: 'otro',
      state: 'pending',
      attempts: 2,
      last_error: 'HTTP 503',
      updated_at: '2026-09-25T12:00:10.000Z',
    }),
    exportedTurnDto({
      turn_id: 'p3',
      session_id: 's3',
      state: 'failed',
      attempts: 4,
      last_error: 'connect ECONNREFUSED',
      updated_at: '2026-09-25T11:59:00.000Z',
    }),
  ],
  ...overrides,
});

export const exportedTurn = (overrides: Partial<ExportedTurnDto> = {}) => toExportedTurn(exportedTurnDto(overrides));
export const exporterStatus = (overrides: Partial<ExporterStatusDto> = {}) => toExporterStatus(exporterStatusDto(overrides));
