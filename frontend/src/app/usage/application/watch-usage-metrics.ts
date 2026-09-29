import { Injectable, inject } from '@angular/core';
import { Observable, catchError, exhaustMap, map, of, scan, startWith, timer } from 'rxjs';
import { UsageMetrics, UsageQuery } from '../models/usage-metrics';
import { UsageMetricsSource } from '../ports/usage-metrics-source';

/**
 * Los tokens salen de los Transcripts, que no emiten Eventos propios: se
 * sondea en lugar de reaccionar al WebSocket. El backend solo vuelve a parsear
 * un Transcript si cambió, así que el sondeo es barato.
 */
export const USAGE_REFRESH_MS = 5000;

export interface UsageState {
  /** Últimas cifras conocidas; se conservan si falla un refresco. */
  metrics: UsageMetrics | null;
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_USAGE_STATE: UsageState = { metrics: null, loaded: false, failed: false };

export type UsageResult = { ok: true; metrics: UsageMetrics } | { ok: false };

/** Inicio de la ventana del periodo del board; sin periodo cubre todo el histórico. */
export function usageWindowStart(windowMs: number | undefined, now: Date): Date {
  return windowMs === undefined ? new Date(0) : new Date(now.getTime() - windowMs);
}

export function reduceUsage(state: UsageState, result: UsageResult): UsageState {
  return result.ok
    ? { metrics: result.metrics, loaded: true, failed: false }
    : { ...state, loaded: true, failed: true };
}

/** Caso de uso: fichas de uso del periodo y el Directorio del board, que se refrescan solas (AC-13, AC-39). */
@Injectable({ providedIn: 'root' })
export class WatchUsageMetrics {
  private readonly source = inject(UsageMetricsSource);

  execute(windowMs?: number, { directory, breakdown }: UsageQuery = {}): Observable<UsageState> {
    // Solo lo que se pide: las fichas no pagan el desglose (AC-38).
    const query: UsageQuery = {};
    if (directory !== undefined) query.directory = directory;
    if (breakdown) query.breakdown = true;
    return timer(0, USAGE_REFRESH_MS).pipe(
      // Si una petición tarda más que el intervalo, no se apilan otras detrás.
      // La ventana se recalcula en cada refresco: "últimas 24 h" avanza con el reloj.
      exhaustMap(() =>
        this.source.fetch(usageWindowStart(windowMs, new Date()), query).pipe(
          map((metrics): UsageResult => ({ ok: true, metrics })),
          catchError(() => of<UsageResult>({ ok: false })),
        ),
      ),
      scan(reduceUsage, INITIAL_USAGE_STATE),
      startWith(INITIAL_USAGE_STATE),
    );
  }
}
