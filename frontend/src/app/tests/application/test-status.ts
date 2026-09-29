// Estado de los tests de cada Proyecto (ver `CONTEXT.md`).
import { TestRun } from '../models/test-run';

export interface ProjectTestStatus {
  project: string;
  /** Última Ejecución de cada Tipo de tests; `null` = Sin datos. */
  unit: TestRun | null;
  e2e: TestRun | null;
}

/** `runs` va de la más reciente a la más antigua. Orden alfabético: las tarjetas no bailan al llegar Ejecuciones. */
export function projectStatuses(runs: TestRun[], projects: string[]): ProjectTestStatus[] {
  const names = [...new Set([...projects, ...runs.map((r) => r.project)])].sort((a, b) => a.localeCompare(b));
  return names.map((project) => ({
    project,
    unit: runs.find((r) => r.project === project && r.kind === 'unit') ?? null,
    e2e: runs.find((r) => r.project === project && r.kind === 'e2e') ?? null,
  }));
}
