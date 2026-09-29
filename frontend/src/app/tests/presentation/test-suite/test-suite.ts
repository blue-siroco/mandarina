import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { plural, relativeTime, shortId } from '../../../shared/format';
import { TestKind, TestRun } from '../../models/test-run';
import { KIND_LABELS, STATUS_LABELS, SuiteStatus, formatTestDuration, runnerLabel } from '../test-labels';

/** Bloque Unitarios / E2E de la tarjeta de un Proyecto (spec/design.md §6.4b). */
@Component({
  selector: 'app-test-suite',
  imports: [RouterLink],
  templateUrl: './test-suite.html',
  styleUrl: './test-suite.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-testid': 'test-suite',
    '[attr.data-kind]': 'kind()',
    '[attr.data-status]': 'status()',
  },
})
export class TestSuite {
  readonly kind = input.required<TestKind>();
  /** Última Ejecución de este Tipo de tests; `null` = Sin datos. */
  readonly run = input.required<TestRun | null>();
  readonly now = input.required<Date>();

  protected readonly status = computed<SuiteStatus>(() => this.run()?.status ?? 'none');
  protected readonly title = computed(() => KIND_LABELS[this.kind()]);
  protected readonly statusLabel = computed(() => STATUS_LABELS[this.status()]);
  /** Fallidos que la salida del runner no dejó leer o que superan el máximo de la API. */
  protected readonly hiddenFailures = computed(() => {
    const run = this.run();
    return run ? Math.max(0, run.counts.failed - run.failures.length) : 0;
  });

  protected readonly plural = plural;
  protected readonly relativeTime = relativeTime;
  protected readonly shortId = shortId;
  protected readonly formatTestDuration = formatTestDuration;
  protected readonly runnerLabel = runnerLabel;
}
