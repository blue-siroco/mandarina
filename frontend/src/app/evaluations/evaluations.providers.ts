import { Provider } from '@angular/core';
import { HttpEvaluationSource } from './infrastructure/http-evaluation-source';
import { EvaluationSource } from './ports/evaluation-source';

/** Composition root del feature de Evaluaciones humanas. */
export function provideEvaluations(): Provider[] {
  return [{ provide: EvaluationSource, useClass: HttpEvaluationSource }];
}
