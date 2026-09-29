import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { SecuritySource } from '../ports/security-source';

export type DismissalOutcome = 'ok' | 'failed';

/**
 * Caso de uso: descartar un aviso como falso positivo, o volver a contarlo (AC-64, AC-66).
 * Nunca falla: el resultado dice si se guardó, para que la pantalla deshaga el cambio optimista.
 */
@Injectable({ providedIn: 'root' })
export class DismissInjectionWarning {
  private readonly source = inject(SecuritySource);

  execute(id: string, dismissed: boolean): Observable<DismissalOutcome> {
    return (dismissed ? this.source.dismiss(id) : this.source.restore(id)).pipe(
      map((): DismissalOutcome => 'ok'),
      catchError(() => of<DismissalOutcome>('failed')),
    );
  }
}
