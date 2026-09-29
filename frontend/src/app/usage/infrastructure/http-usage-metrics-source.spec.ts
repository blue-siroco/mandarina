import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UsageMetrics } from '../models/usage-metrics';
import { breakdown, breakdownDto, usageMetrics, usageMetricsDto } from '../testing/usage-fixtures';
import { HttpUsageMetricsSource } from './http-usage-metrics-source';

describe('AC-13: HttpUsageMetricsSource', () => {
  let source: HttpUsageMetricsSource;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpUsageMetricsSource],
    });
    source = TestBed.inject(HttpUsageMetricsSource);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide las métricas desde `since` y las traduce al modelo de la UI', () => {
    let received: UsageMetrics | undefined;
    source.fetch(new Date('2026-09-24T22:00:00.000Z')).subscribe((m) => (received = m));

    const request = http.expectOne((r) => r.url === '/api/v1/metrics');
    expect(request.request.params.get('since')).toBe('2026-09-24T22:00:00.000Z');
    request.flush(usageMetricsDto());

    expect(received).toStrictEqual(usageMetrics());
    expect(request.request.params.has('directory')).toBe(false);
    expect(request.request.params.has('breakdown')).toBe(false);
  });

  it('AC-71: traduce la eficiencia de la caché y tolera un backend que aún no la manda', () => {
    const received: UsageMetrics[] = [];
    source.fetch(new Date(0)).subscribe((m) => received.push(m));
    source.fetch(new Date(0)).subscribe((m) => received.push(m));
    const [withCache, withoutCache] = http.match((r) => r.url === '/api/v1/metrics');
    withCache!.flush(usageMetricsDto());
    withoutCache!.flush({ ...usageMetricsDto(), cache: undefined });

    expect(received[0]!.cache).toMatchObject({ hitRate: 0.95, readTokens: 4_700_000, savingsNetUsd: 17.62, rewrites: 3, unpricedModels: [] });
    expect(received[1]!.cache).toBeNull();
  });

  it('AC-38: envía el Directorio y pide el desglose, y lo traduce', () => {
    let received: UsageMetrics | undefined;
    source.fetch(new Date(0), { directory: 'C:\Codev\demo', breakdown: true }).subscribe((m) => (received = m));

    const request = http.expectOne((r) => r.url === '/api/v1/metrics');
    expect(request.request.params.get('directory')).toBe('C:\Codev\demo');
    expect(request.request.params.get('breakdown')).toBe('true');
    request.flush(usageMetricsDto({ breakdown: breakdownDto() }));

    expect(received?.breakdown).toStrictEqual(breakdown());
  });
});
