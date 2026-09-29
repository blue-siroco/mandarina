import { testRunsFromEvent, type TestKind, type TestRun } from '../domain/test-results.js';
import type { EventRepository } from './ports.js';

export const TEST_RUNS_LIMIT = 500;
// Cada candidato puede no ser una Ejecución (p. ej. `npm run build:test`):
// se leen más Eventos que Ejecuciones se devuelven.
const CANDIDATES_LIMIT = TEST_RUNS_LIMIT * 4;

export interface TestRunsFilter {
  since: Date;
  project?: string;
  kind?: TestKind;
}

export interface TestRunList {
  items: TestRun[];
  facets: { projects: string[] };
}

/** Caso de uso: Ejecuciones de tests de la ventana (AC-27, ADR-0007). */
export class ListTestRuns {
  constructor(private readonly repository: EventRepository) {}

  execute({ since, project, kind }: TestRunsFilter): TestRunList {
    const runs = this.repository.testCandidates(since.toISOString(), CANDIDATES_LIMIT).flatMap(testRunsFromEvent);
    const items = runs
      .filter((r) => (project === undefined || r.project === project) && (kind === undefined || r.kind === kind))
      .slice(0, TEST_RUNS_LIMIT);
    return { items, facets: { projects: [...new Set(runs.map((r) => r.project))].sort() } };
  }
}
