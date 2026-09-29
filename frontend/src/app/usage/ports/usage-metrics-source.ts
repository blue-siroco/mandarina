import { Observable } from 'rxjs';
import { UsageMetrics, UsageQuery } from '../models/usage-metrics';

/** Origen de las métricas de uso. */
export abstract class UsageMetricsSource {
  abstract fetch(since: Date, query?: UsageQuery): Observable<UsageMetrics>;
}
