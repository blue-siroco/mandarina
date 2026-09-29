import { Injectable, inject } from '@angular/core';
import { Observable, catchError, exhaustMap, map, of, scan, startWith, timer } from 'rxjs';
import { MaskingStats } from '../models/security';
import { SecuritySource } from '../ports/security-source';

/** Los marcadores se cuentan sobre los payloads guardados y no emiten Eventos propios: se sondea (AC-67). */
export const MASKING_REFRESH_MS = 30_000;

export interface MaskingState {
  /** Última estadística conocida; se conserva si falla un refresco. */
  stats: MaskingStats | null;
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_MASKING: MaskingState = { stats: null, loaded: false, failed: false };

export type MaskingResult = { ok: true; stats: MaskingStats } | { ok: false };

export function reduceMasking(state: MaskingState, result: MaskingResult): MaskingState {
  return result.ok ? { stats: result.stats, loaded: true, failed: false } : { ...state, loaded: true, failed: true };
}

/** Caso de uso: marcadores de Enmascarado por Proyecto y tipo, refrescados solos (AC-67). */
@Injectable({ providedIn: 'root' })
export class WatchMaskingStats {
  private readonly source = inject(SecuritySource);

  execute(windowMs?: number): Observable<MaskingState> {
    return timer(0, MASKING_REFRESH_MS).pipe(
      // Si una petición tarda más que el intervalo, no se apilan otras detrás.
      exhaustMap(() =>
        this.source.maskingStats(windowMs === undefined ? new Date(0) : new Date(Date.now() - windowMs)).pipe(
          map((stats): MaskingResult => ({ ok: true, stats })),
          catchError(() => of<MaskingResult>({ ok: false })),
        ),
      ),
      scan(reduceMasking, INITIAL_MASKING),
      startWith(INITIAL_MASKING),
    );
  }
}
