// Descarga de Eventos (ADR-0013; AC-144, AC-145): JSONL con una cabecera y un Evento por línea.
// Es solo lectura: no escribe en SQLite ni en el almacén de la Exportación OTLP (export-turns.ts).

import { downloadFields, downloadWindow, MAX_DOWNLOAD_EVENTS, toDownloadedEvent, type DownloadWindow } from '../domain/download-events.js';
import type { Clock, EventFilter, EventRepository } from './ports.js';

export interface DownloadHeader extends DownloadWindow {
  kind: 'session' | 'events';
  generated_at: string;
  include_content: boolean;
  /** Solo en `events`: los filtros aplicados, con los nombres de la API. */
  filters?: Record<string, unknown>;
}

export interface DownloadPreview extends DownloadWindow {
  fields: string[];
}

export class ExportEvents {
  constructor(
    private readonly repository: EventRepository,
    private readonly clock: Clock,
    /** Inyectable para probar el truncado sin 50 000 Eventos (AC-145). */
    private readonly cap = MAX_DOWNLOAD_EVENTS,
  ) {}

  /** Recuento y campos sin leer ningún Evento (AC-145). */
  preview(filter: EventFilter, includeContent: boolean): DownloadPreview {
    return { ...downloadWindow(this.repository.countEvents(filter), this.cap), fields: downloadFields(includeContent) };
  }

  /**
   * Líneas del fichero, ya con su salto de línea. Es perezoso: cada Evento se lee y se
   * serializa al pedir la línea, así el cliente recibe la cabecera antes de que se lean todos.
   */
  lines(filter: EventFilter, includeContent: boolean): Iterable<string> {
    const { total, events } = this.repository.eventWindow(filter, this.cap);
    const header: DownloadHeader = {
      kind: 'events',
      generated_at: this.clock.now().toISOString(),
      include_content: includeContent,
      filters: filtersOf(filter),
      ...downloadWindow(total, this.cap),
    };
    return (function* () {
      yield `${JSON.stringify({ export: header })}\n`;
      for (const event of events) yield `${JSON.stringify(toDownloadedEvent(event, includeContent))}\n`;
    })();
  }
}

function filtersOf(filter: EventFilter): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  if (filter.project !== undefined) filters.project = filter.project;
  if (filter.sessionId !== undefined) filters.session_id = filter.sessionId;
  if (filter.eventTypes !== undefined && filter.eventTypes.length > 0) filters.event_type = filter.eventTypes;
  if (filter.toolNames !== undefined && filter.toolNames.length > 0) filters.tool = filter.toolNames;
  if (filter.since !== undefined) filters.since = filter.since;
  return filters;
}
