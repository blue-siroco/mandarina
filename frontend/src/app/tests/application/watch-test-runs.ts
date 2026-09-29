import { Injectable, inject } from '@angular/core';
import { Observable, auditTime, catchError, filter, map, of, scan, startWith, switchMap } from 'rxjs';
import { windowStart } from '../../blocks/application/watch-blocks';
import { LiveEvents } from '../../events/application/live-events';
import { TestRun, TestRunList } from '../models/test-run';
import { TestRunSource } from '../ports/test-run-source';

export const TEST_WINDOW_DAYS = 7;
/**
 * Las Ejecuciones de tests se leen en el servidor a partir de los Eventos (ADR-0007):
 * cuando termina un comando `Bash` se vuelven a pedir. Una ráfaga de comandos
 * provoca una sola petición.
 */
export const TEST_REFRESH_DEBOUNCE_MS = 1000;

export interface TestRunsState {
  /** La más reciente primero; se conservan si falla un refresco. */
  runs: TestRun[];
  projects: string[];
  loaded: boolean;
  failed: boolean;
}

export const INITIAL_TEST_RUNS: TestRunsState = { runs: [], projects: [], loaded: false, failed: false };

export type TestRunsResult = { ok: true; list: TestRunList } | { ok: false };

export function reduceTestRuns(state: TestRunsState, result: TestRunsResult): TestRunsState {
  return result.ok
    ? { runs: result.list.items, projects: result.list.projects, loaded: true, failed: false }
    : { ...state, loaded: true, failed: true };
}

/** Caso de uso: Ejecuciones de tests de los últimos 7 días, en vivo (AC-28). */
@Injectable({ providedIn: 'root' })
export class WatchTestRuns {
  private readonly source = inject(TestRunSource);
  private readonly live = inject(LiveEvents);

  execute(): Observable<TestRunsState> {
    const bashFinished$ = this.live.events$.pipe(
      filter((events) => events.some((e) => e.eventType === 'tool.post' && e.toolName === 'Bash')),
      auditTime(TEST_REFRESH_DEBOUNCE_MS),
    );
    return bashFinished$.pipe(
      startWith(null),
      switchMap(() =>
        this.source.fetch(windowStart(new Date(), TEST_WINDOW_DAYS)).pipe(
          map((list): TestRunsResult => ({ ok: true, list })),
          catchError(() => of<TestRunsResult>({ ok: false })),
        ),
      ),
      scan(reduceTestRuns, INITIAL_TEST_RUNS),
      startWith(INITIAL_TEST_RUNS),
    );
  }
}
