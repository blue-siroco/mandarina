import { Provider } from '@angular/core';
import { HttpAgentSource } from './infrastructure/http-agent-source';
import { AgentSource } from './ports/agent-source';

/** Composition root del feature de agentes. */
export function provideAgents(): Provider[] {
  return [{ provide: AgentSource, useClass: HttpAgentSource }];
}
