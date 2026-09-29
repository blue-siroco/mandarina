import { Provider } from '@angular/core';
import { HttpSecuritySource } from './infrastructure/http-security-source';
import { SecuritySource } from './ports/security-source';

/** Composition root del feature de Seguridad (Avisos de inyección y Enmascarado). */
export function provideSecurity(): Provider[] {
  return [{ provide: SecuritySource, useClass: HttpSecuritySource }];
}
