import { Provider } from '@angular/core';
import { HttpSessionSource } from './infrastructure/http-session-source';
import { SessionSource } from './ports/session-source';

/** Composition root del feature de Sesiones. */
export function provideSessions(): Provider[] {
  return [{ provide: SessionSource, useClass: HttpSessionSource }];
}
