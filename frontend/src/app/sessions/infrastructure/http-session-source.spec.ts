import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionDetail, SessionList } from '../models/session';
import { SESSION_ID, sessionDetailDto } from '../testing/session-fixtures';
import { HttpSessionSource } from './http-session-source';

describe('AC-15, AC-18: HttpSessionSource', () => {
  let source: HttpSessionSource;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), HttpSessionSource] });
    source = TestBed.inject(HttpSessionSource);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide las Sesiones con since, Estados repetidos y Directorio', () => {
    let list: SessionList | undefined;
    source
      .list({ since: new Date('2026-09-25T00:00:00.000Z'), states: ['active', 'idle'], directory: 'C:\\x' })
      .subscribe((l) => (list = l));

    const request = http.expectOne((r) => r.url === '/api/v1/sessions');
    expect(request.request.params.get('since')).toBe('2026-09-25T00:00:00.000Z');
    expect(request.request.params.getAll('state')).toStrictEqual(['active', 'idle']);
    expect(request.request.params.get('directory')).toBe('C:\\x');
    request.flush({ items: [], facets: { projects: [], directories: [] } });

    expect(list).toStrictEqual({ items: [], facets: { projects: [], directories: [] } });
  });

  it('sin filtros no manda parámetros', () => {
    source.list({}).subscribe();
    const request = http.expectOne((r) => r.url === '/api/v1/sessions');
    expect(request.request.params.keys()).toStrictEqual([]);
    request.flush({ items: [], facets: { projects: [], directories: [] } });
  });

  it('pide el detalle con el id codificado', () => {
    let detail: SessionDetail | null | undefined;
    source.detail(SESSION_ID).subscribe((d) => (detail = d));
    http.expectOne(`/api/v1/sessions/${SESSION_ID}`).flush(sessionDetailDto());
    expect(detail?.sessionId).toBe(SESSION_ID);

    source.detail('a/b').subscribe();
    http.expectOne('/api/v1/sessions/a%2Fb').flush(sessionDetailDto());
  });

  it('un 404 es "no existe" (null), no un error', () => {
    let detail: SessionDetail | null | undefined;
    source.detail('nope').subscribe((d) => (detail = d));
    http.expectOne('/api/v1/sessions/nope').flush({ message: 'No existe' }, { status: 404, statusText: 'Not Found' });
    expect(detail).toBeNull();
  });

  it('un 500 sí es un error', () => {
    let failed = false;
    source.detail('x').subscribe({ error: () => (failed = true) });
    http.expectOne('/api/v1/sessions/x').flush({}, { status: 500, statusText: 'Error' });
    expect(failed).toBe(true);
  });
});
