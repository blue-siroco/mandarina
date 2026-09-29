import { TestFailure, TestKind, TestRun, TestRunList, TestRunStatus, TestRunner } from '../models/test-run';

/** `TestRun` de `spec/api-spec.yaml`. */
export interface TestRunDto {
  id: string;
  event_id: string;
  project: string;
  directory: string;
  session_id: string;
  subagent_id: string | null;
  kind: TestKind;
  runner: TestRunner;
  command: string | null;
  status: TestRunStatus;
  counts: { total: number; passed: number; failed: number; skipped: number };
  duration_ms: number | null;
  finished_at: string;
  failures: TestFailure[];
}

/** Respuesta de `GET /api/v1/test-runs`. */
export interface TestRunListDto {
  items: TestRunDto[];
  facets: { projects: string[] };
}

export function toTestRun(dto: TestRunDto): TestRun {
  return {
    id: dto.id,
    eventId: dto.event_id,
    project: dto.project,
    directory: dto.directory,
    sessionId: dto.session_id,
    subagentId: dto.subagent_id,
    kind: dto.kind,
    runner: dto.runner,
    command: dto.command,
    status: dto.status,
    counts: { ...dto.counts },
    durationMs: dto.duration_ms,
    finishedAt: new Date(dto.finished_at),
    failures: dto.failures.map((f) => ({ ...f })),
  };
}

export function toTestRunList(dto: TestRunListDto): TestRunList {
  return { items: dto.items.map(toTestRun), projects: [...dto.facets.projects] };
}
