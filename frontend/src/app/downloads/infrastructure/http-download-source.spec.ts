import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DownloadPreview } from '../models/download';
import { downloadPreview, downloadPreviewDto } from '../testing/download-fixtures';
import { HttpDownloadSource } from './http-download-source';

describe('AC-147: HttpDownloadSource', () => {
  let source: HttpDownloadSource;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), HttpDownloadSource] });
    source = TestBed.inject(HttpDownloadSource);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('la URL de la Sesión lleva su id y content explícito', () => {
    expect(source.url({ kind: 'session', sessionId: 's 1' }, false)).toBe('/api/v1/sessions/s%201/export?content=false');
    expect(source.url({ kind: 'session', sessionId: 's1' }, true)).toBe('/api/v1/sessions/s1/export?content=true');
  });

  it('la URL de Eventos lleva los filtros, con event_type y tool repetidos', () => {
    const url = source.url(
      {
        kind: 'events',
        filters: {
          project: 'mandarina',
          sessionId: 's1',
          eventTypes: ['tool.pre', 'tool.post'],
          tools: ['Bash', 'Read'],
          since: new Date('2026-09-30T09:00:00.000Z'),
        },
      },
      true,
    );
    expect(url).toBe(
      '/api/v1/events/export?project=mandarina&session_id=s1&event_type=tool.pre&event_type=tool.post&tool=Bash&tool=Read&since=2026-09-30T09%3A00%3A00.000Z&content=true',
    );
  });

  it('sin filtros solo lleva content', () => {
    expect(source.url({ kind: 'events', filters: {} }, false)).toBe('/api/v1/events/export?content=false');
  });

  it('la vista previa de la Sesión pide .../export/preview y traduce el DTO', () => {
    let received: DownloadPreview | undefined;
    source.preview({ kind: 'session', sessionId: 's1' }, false).subscribe((p) => (received = p));
    http.expectOne('/api/v1/sessions/s1/export/preview?content=false').flush(downloadPreviewDto());
    expect(received).toStrictEqual(downloadPreview());
  });

  it('la vista previa de Eventos pide /events/export/preview con los mismos filtros', () => {
    let received: DownloadPreview | undefined;
    source.preview({ kind: 'events', filters: { project: 'p', tools: ['Bash'] } }, true).subscribe((p) => (received = p));
    http.expectOne('/api/v1/events/export/preview?project=p&tool=Bash&content=true').flush(downloadPreviewDto());
    expect(received?.total).toBe(120);
  });
});
