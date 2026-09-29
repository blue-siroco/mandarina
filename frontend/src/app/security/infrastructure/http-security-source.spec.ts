import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { InjectionWarningList, MARKER_TYPES, MaskingStats } from '../models/security';
import { injectionWarningList, injectionWarningListDto, maskingStats, maskingStatsDto } from '../testing/security-fixtures';
import { HttpSecuritySource } from './http-security-source';

const SINCE = new Date('2026-09-18T12:00:00.000Z');

describe('AC-64, AC-65: HttpSecuritySource', () => {
  let source: HttpSecuritySource;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), HttpSecuritySource] });
    source = TestBed.inject(HttpSecuritySource);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide los avisos con sus filtros y los traduce al modelo de la UI', () => {
    let received: InjectionWarningList | undefined;
    source
      .warnings({ since: SINCE, project: 'demo', sessionId: 's1', severities: ['high', 'medium'], pattern: 'fake-turn', dismissed: 'all' })
      .subscribe((l) => (received = l));

    const request = http.expectOne((r) => r.url === '/api/v1/injection-warnings');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('since')).toBe('2026-09-18T12:00:00.000Z');
    expect(request.request.params.get('project')).toBe('demo');
    expect(request.request.params.get('session_id')).toBe('s1');
    expect(request.request.params.getAll('severity')).toStrictEqual(['high', 'medium']);
    expect(request.request.params.get('pattern')).toBe('fake-turn');
    expect(request.request.params.get('dismissed')).toBe('all');
    request.flush(injectionWarningListDto());

    expect(received).toStrictEqual(injectionWarningList());
    expect(received?.items[0]?.occurredAt).toStrictEqual(new Date('2026-09-25T11:50:00.000Z'));
    expect(received?.projects).toStrictEqual(['lucia', 'mandarina']);
  });

  it('solo envía los filtros que se piden', () => {
    source.warnings({ since: SINCE }).subscribe();
    const request = http.expectOne((r) => r.url === '/api/v1/injection-warnings');
    expect(request.request.params.keys()).toStrictEqual(['since']);
    request.flush(injectionWarningListDto());
  });

  it('descarta y restaura un aviso por su id, codificado en la ruta', () => {
    let done = 0;
    source.dismiss('ev1:fake-turn').subscribe(() => done++);
    const put = http.expectOne('/api/v1/injection-warnings/ev1%3Afake-turn/dismissal');
    expect(put.request.method).toBe('PUT');
    put.flush(null, { status: 204, statusText: 'No Content' });

    source.restore('ev1:fake-turn').subscribe(() => done++);
    const del = http.expectOne('/api/v1/injection-warnings/ev1%3Afake-turn/dismissal');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(2);
  });

  it('pide las estadísticas de Enmascarado desde since y las traduce', () => {
    let received: MaskingStats | undefined;
    source.maskingStats(SINCE).subscribe((s) => (received = s));
    const request = http.expectOne((r) => r.url === '/api/v1/masking-stats');
    expect(request.request.params.get('since')).toBe('2026-09-18T12:00:00.000Z');
    request.flush(maskingStatsDto());

    expect(received).toStrictEqual(maskingStats());
    expect(received?.since).toStrictEqual(new Date('2026-09-18T12:00:00.000Z'));
  });

  it('completa con ceros los tipos que la API no envía', () => {
    let received: MaskingStats | undefined;
    source.maskingStats(SINCE).subscribe((s) => (received = s));
    http.expectOne((r) => r.url === '/api/v1/masking-stats').flush(
      maskingStatsDto({ totals: { EMAIL: 2 }, items: [{ project: 'demo', total: 2, counts: { EMAIL: 2 } }] }),
    );
    expect(Object.keys(received!.totals)).toStrictEqual([...MARKER_TYPES]);
    expect(received!.items[0]!.counts.PHONE).toBe(0);
    expect(received!.totals.EMAIL).toBe(2);
  });
});
