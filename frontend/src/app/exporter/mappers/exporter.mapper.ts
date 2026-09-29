import { ExportState, ExportedTurn, ExporterStatus } from '../models/exporter';

/** `ExportedTurn` de `spec/api-spec.yaml`. */
export interface ExportedTurnDto {
  turn_id: string;
  session_id: string;
  project: string;
  state: ExportState;
  attempts: number;
  last_error: string | null;
  updated_at: string;
}

/** `ExporterStatus` de `spec/api-spec.yaml`. */
export interface ExporterStatusDto {
  enabled: boolean;
  endpoint_host: string | null;
  include_content: boolean;
  enabled_since: string | null;
  counts: Record<ExportState, number>;
  last_exported_at: string | null;
  recent: ExportedTurnDto[];
}

export const toExportedTurn = (dto: ExportedTurnDto): ExportedTurn => ({
  turnId: dto.turn_id,
  sessionId: dto.session_id,
  project: dto.project,
  state: dto.state,
  attempts: dto.attempts,
  lastError: dto.last_error,
  updatedAt: new Date(dto.updated_at),
});

export const toExporterStatus = (dto: ExporterStatusDto): ExporterStatus => ({
  enabled: dto.enabled,
  endpointHost: dto.endpoint_host,
  includeContent: dto.include_content,
  counts: { ...dto.counts },
  lastExportedAt: dto.last_exported_at === null ? null : new Date(dto.last_exported_at),
  recent: dto.recent.map(toExportedTurn),
});
