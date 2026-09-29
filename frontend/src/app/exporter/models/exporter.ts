/** Estado de la Exportación OTLP de un Turno (AC-52, ADR-0008). */
export type ExportState = 'pending' | 'exported' | 'failed';

export interface ExportedTurn {
  turnId: string;
  sessionId: string;
  project: string;
  state: ExportState;
  attempts: number;
  lastError: string | null;
  updatedAt: Date;
}

export interface ExporterStatus {
  enabled: boolean;
  /** Host y puerto del colector, sin ruta ni credenciales. */
  endpointHost: string | null;
  includeContent: boolean;
  counts: Record<ExportState, number>;
  lastExportedAt: Date | null;
  /** El más reciente primero. */
  recent: ExportedTurn[];
}
