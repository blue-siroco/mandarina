import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DownloadPreviewDto, toDownloadPreview } from '../mappers/download.mapper';
import { DownloadPreview, DownloadTarget } from '../models/download';
import { DownloadSource } from '../ports/download-source';

@Injectable()
export class HttpDownloadSource extends DownloadSource {
  private readonly http = inject(HttpClient);

  preview(target: DownloadTarget, content: boolean): Observable<DownloadPreview> {
    return this.http
      .get<DownloadPreviewDto>(this.build(target, content, '/preview'))
      .pipe(map(toDownloadPreview));
  }

  url(target: DownloadTarget, content: boolean): string {
    return this.build(target, content, '');
  }

  /** Ruta relativa: el dev server la proxifica. `content` va siempre explícito para no depender del valor por defecto. */
  private build(target: DownloadTarget, content: boolean, suffix: string): string {
    const params = new URLSearchParams();
    let path: string;
    if (target.kind === 'session') {
      path = `/api/v1/sessions/${encodeURIComponent(target.sessionId)}/export`;
    } else {
      path = '/api/v1/events/export';
      const { project, sessionId, eventTypes, tools, since } = target.filters;
      if (project) params.append('project', project);
      if (sessionId) params.append('session_id', sessionId);
      for (const type of eventTypes ?? []) params.append('event_type', type);
      for (const tool of tools ?? []) params.append('tool', tool);
      if (since) params.append('since', since.toISOString());
    }
    params.append('content', String(content));
    return `${path}${suffix}?${params.toString()}`;
  }
}
