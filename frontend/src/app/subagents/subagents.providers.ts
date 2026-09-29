import { Provider } from '@angular/core';
import { HttpSubagentSource } from './infrastructure/http-subagent-source';
import { SubagentSource } from './ports/subagent-source';

/** Composition root del feature de Subagentes. */
export function provideSubagents(): Provider[] {
  return [{ provide: SubagentSource, useClass: HttpSubagentSource }];
}
