import { Observable, of } from 'rxjs';
import { DownloadPreview, DownloadTarget } from '../models/download';
import { DownloadPreviewDto } from '../mappers/download.mapper';
import { DownloadSource } from '../ports/download-source';

export const downloadPreviewDto = (over: Partial<DownloadPreviewDto> = {}): DownloadPreviewDto => ({
  total: 120,
  exported: 120,
  truncated: false,
  omitted: 0,
  fields: ['id', 'session_id', 'event_type', 'tool_name', 'occurred_at'],
  ...over,
});

export const downloadPreview = (over: Partial<DownloadPreview> = {}): DownloadPreview => ({
  ...downloadPreviewDto(),
  ...over,
});

/** Doble del puerto: registra las peticiones y responde con lo que dicte `respond`. */
export function stubDownloadSource(respond: (content: boolean) => Observable<DownloadPreview> = () => of(downloadPreview())) {
  const calls: { target: DownloadTarget; content: boolean }[] = [];
  const source: DownloadSource = {
    preview: (target, content) => (calls.push({ target, content }), respond(content)),
    url: (_target, content) => `/api/v1/test/export?content=${content}`,
  };
  return { source, calls, provider: { provide: DownloadSource, useValue: source } };
}
