import { Provider } from '@angular/core';
import { HttpUsageMetricsSource } from './infrastructure/http-usage-metrics-source';
import { UsageMetricsSource } from './ports/usage-metrics-source';

/** Composition root del feature de uso. */
export function provideUsage(): Provider[] {
  return [{ provide: UsageMetricsSource, useClass: HttpUsageMetricsSource }];
}
