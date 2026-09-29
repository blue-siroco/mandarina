import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { UsageMetricsDto, toUsageMetrics } from '../mappers/usage-metrics.mapper';
import { UsageMetrics, UsageQuery } from '../models/usage-metrics';
import { UsageMetricsSource } from '../ports/usage-metrics-source';

@Injectable()
export class HttpUsageMetricsSource extends UsageMetricsSource {
  private readonly http = inject(HttpClient);

  fetch(since: Date, { directory, breakdown }: UsageQuery = {}): Observable<UsageMetrics> {
    let params = new HttpParams().set('since', since.toISOString());
    if (directory !== undefined) params = params.set('directory', directory);
    if (breakdown) params = params.set('breakdown', 'true');
    return this.http.get<UsageMetricsDto>('/api/v1/metrics', { params }).pipe(map(toUsageMetrics));
  }
}
