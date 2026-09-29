/** Tipo de tests (ver `CONTEXT.md`). */
export type TestKind = 'unit' | 'e2e';

export type TestRunner = 'vitest' | 'jest' | 'node-test' | 'playwright';

export type TestRunStatus = 'passed' | 'failed';

export interface TestCounts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface TestFailure {
  name: string;
  file: string | null;
  message: string | null;
  ac: string | null;
}

/** Ejecución de tests leída de un Evento `Bash` (AC-26, ADR-0007). */
export interface TestRun {
  id: string;
  eventId: string;
  project: string;
  directory: string;
  sessionId: string;
  subagentId: string | null;
  kind: TestKind;
  runner: TestRunner;
  command: string | null;
  status: TestRunStatus;
  counts: TestCounts;
  durationMs: number | null;
  finishedAt: Date;
  failures: TestFailure[];
}

export interface TestRunList {
  /** La más reciente primero. */
  items: TestRun[];
  /** Proyectos con alguna Ejecución en la ventana. */
  projects: string[];
}
