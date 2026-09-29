import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { map, timer } from 'rxjs';
import { shortId } from '../../../shared/format';
import { SelectFilter } from '../../../shared/ui/select-filter/select-filter';
import { projectStatuses } from '../../application/test-status';
import { INITIAL_TEST_RUNS, WatchTestRuns } from '../../application/watch-test-runs';
import { KIND_LABELS, STATUS_LABELS, formatTestDuration, runnerLabel } from '../test-labels';
import { TestSuite } from '../test-suite/test-suite';

export const ALL_PROJECTS = 'Todos los Proyectos';

/** Pantalla del Estado de los tests (AC-28). */
@Component({
  selector: 'app-tests-page',
  imports: [DatePipe, RouterLink, SelectFilter, TestSuite],
  templateUrl: './tests-page.html',
  styleUrl: './tests-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestsPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: convertToParamMap({}) });

  protected readonly state = toSignal(inject(WatchTestRuns).execute(), { initialValue: INITIAL_TEST_RUNS });
  /** Refresca los "hace N min" sin esperar a una Ejecución nueva. */
  protected readonly now = toSignal(timer(0, 30_000).pipe(map(() => new Date())), { initialValue: new Date() });

  protected readonly project = computed(() => this.params().get('proyecto'));
  protected readonly runs = computed(() => {
    const project = this.project();
    return this.state().runs.filter((r) => project === null || r.project === project);
  });
  protected readonly statuses = computed(() => {
    const project = this.project();
    const projects = this.state().projects.filter((p) => project === null || p === project);
    return projectStatuses(this.runs(), projects);
  });

  protected readonly allProjects = ALL_PROJECTS;
  protected readonly kindLabels = KIND_LABELS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly runnerLabel = runnerLabel;
  protected readonly formatTestDuration = formatTestDuration;
  protected readonly shortId = shortId;

  protected selectProject(project: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { proyecto: project },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
