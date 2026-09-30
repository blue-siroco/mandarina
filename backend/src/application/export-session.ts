// Descarga de Sesión (ADR-0013; AC-142, AC-143, AC-145): el detalle de la Sesión más sus
// Eventos, en un solo JSON. Reutiliza `GetSessionDetail`; solo lectura.

import { downloadFields, downloadWindow, MAX_DOWNLOAD_EVENTS, toDownloadedEvent, type DownloadedEvent } from '../domain/download-events.js';
import { redactSessionDetail } from '../domain/download-session.js';
import type { DownloadHeader, DownloadPreview } from './export-events.js';
import type { SessionDetail } from './get-session-detail.js';
import type { Clock, EventRepository } from './ports.js';

export interface SessionDownload {
  export: DownloadHeader;
  session: SessionDetail;
  events: DownloadedEvent[];
}

export class ExportSession {
  constructor(
    private readonly repository: EventRepository,
    private readonly detail: { execute(sessionId: string): Promise<SessionDetail | undefined> },
    private readonly clock: Clock,
    /** Inyectable para probar el truncado sin 50 000 Eventos (AC-145). */
    private readonly cap = MAX_DOWNLOAD_EVENTS,
  ) {}

  /** `undefined` si la Sesión no existe. No lee los Eventos, solo los cuenta. */
  preview(sessionId: string, includeContent: boolean): DownloadPreview | undefined {
    if (this.repository.sessionContext(sessionId) === undefined) return undefined;
    const total = this.repository.countEvents({ sessionId });
    return { ...downloadWindow(total, this.cap), fields: downloadFields(includeContent) };
  }

  async execute(sessionId: string, includeContent: boolean): Promise<SessionDownload | undefined> {
    const detail = await this.detail.execute(sessionId);
    if (detail === undefined) return undefined;
    const { total, events } = this.repository.eventWindow({ sessionId }, this.cap);
    return {
      export: {
        kind: 'session',
        generated_at: this.clock.now().toISOString(),
        include_content: includeContent,
        ...downloadWindow(total, this.cap),
      },
      session: redactSessionDetail(detail, includeContent),
      events: [...events].map((event) => toDownloadedEvent(event, includeContent)),
    };
  }
}
