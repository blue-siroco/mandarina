import { Provider } from '@angular/core';
import { HttpTestRunSource } from './infrastructure/http-test-run-source';
import { TestRunSource } from './ports/test-run-source';

/** Composition root del feature de tests. */
export function provideTests(): Provider[] {
  return [{ provide: TestRunSource, useClass: HttpTestRunSource }];
}
