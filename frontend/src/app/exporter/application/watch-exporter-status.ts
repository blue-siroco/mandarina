import { Injectable, inject } from '@angular/core';
import { Observable, catchError, exhaustMap, map, of, scan, startWith, timer } from 'rxjs';
import { ExporterStatus } from '../models/exporter';
import { ExporterSource } from '../ports/exporter-source';

/** La exportación no emite Eventos propios y cambia despacio: basta con sondear (AC-53). */
export const EXPORTER_REFRESH_MS = 30_000;

export interface ExporterState {
  /** Último estado conocido; se conserva si falla un refresco. */
  status: ExporterStatus | null;
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_EXPORTER_STATE: ExporterState = { status: null, loaded: false, failed: false };

export type ExporterResult = { ok: true; status: ExporterStatus } | { ok: false };

export function reduceExporter(state: ExporterState, result: ExporterResult): ExporterState {
  return result.ok ? { status: result.status, loaded: true, failed: false } : { ...state, loaded: true, failed: true };
}

/** Caso de uso: estado de la Exportación OTLP, refrescado solo (AC-53). */
@Injectable({ providedIn: 'root' })
export class WatchExporterStatus {
  private readonly source = inject(ExporterSource);

  execute(): Observable<ExporterState> {
    return timer(0, EXPORTER_REFRESH_MS).pipe(
      // Si una petición tarda más que el intervalo, no se apilan otras detrás.
      exhaustMap(() =>
        this.source.fetch().pipe(
          map((status): ExporterResult => ({ ok: true, status })),
          catchError(() => of<ExporterResult>({ ok: false })),
        ),
      ),
      scan(reduceExporter, INITIAL_EXPORTER_STATE),
      startWith(INITIAL_EXPORTER_STATE),
    );
  }
}
