import { EventType } from '../../events/models/observed-event';

/** Filtros de la Descarga de Eventos: los mismos que acepta `/api/v1/events/export`. */
export interface EventDownloadFilters {
  project?: string;
  sessionId?: string;
  eventTypes?: readonly EventType[];
  tools?: readonly string[];
  since?: Date;
}

/** Qué se descarga: una Sesión (JSON) o los Eventos que pasan unos filtros (JSONL). */
export type DownloadTarget =
  | { kind: 'session'; sessionId: string }
  | { kind: 'events'; filters: EventDownloadFilters };

/** Lo que llevará el fichero, sin descargarlo (AC-145, AC-147). */
export interface DownloadPreview {
  total: number;
  exported: number;
  truncated: boolean;
  omitted: number;
  fields: string[];
}
