import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { formatCompact, formatDuration, shortId } from '../../../shared/format';
import { EvaluationControls } from '../../../evaluations/presentation/evaluation-controls/evaluation-controls';
import { Evaluation, evaluationKey } from '../../../evaluations/models/evaluation';
import { SessionEvaluations } from '../../../evaluations/application/evaluations-of-session';
import { toolLabel } from '../../../shared/tool-summary';
import { CheckFilter } from '../../../shared/ui/check-filter/check-filter';
import { ModelBadge } from '../../../shared/ui/model-badge/model-badge';
import { SessionSubagent, ToolCallStatus } from '../../models/session';

/** Resultado de cada herramienta con texto, no solo color (design §2.5). */
export const TOOL_STATUS_LABELS: Record<ToolCallStatus, string> = {
  ok: 'Bien',
  error: 'Error',
  blocked: 'Bloqueada',
  running: 'En curso',
};

/** Subagentes de una Sesión con su Tarea, sus herramientas y su respuesta (AC-24, AC-36). */
@Component({
  selector: 'app-subagent-list',
  imports: [CheckFilter, DatePipe, EvaluationControls, ModelBadge],
  templateUrl: './subagent-list.html',
  styleUrl: './subagent-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubagentList {
  readonly subagents = input.required<SessionSubagent[]>();
  /** Fila que se abre desplegada al llegar desde la pantalla Subagentes (`?subagente=`). */
  readonly expandedKey = input<string | null>(null);
  /** Evaluaciones de la Sesión (AC-57); `null` mientras no se han cargado. */
  readonly evaluations = input<SessionEvaluations | null>(null);

  protected readonly statusLabels = TOOL_STATUS_LABELS;
  protected readonly formatDuration = formatDuration;
  protected readonly formatCompact = formatCompact;
  protected readonly short = shortId;
  protected readonly toolLabel = toolLabel;
  private readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly showInternal = signal(false);

  protected readonly internalCount = computed(() => this.subagents().filter((s) => s.internal).length);
  protected readonly visible = computed(() => {
    const show = this.showInternal() || this.subagents().some((s) => s.internal && s.key === this.expandedKey());
    return this.subagents().filter((s) => show || !s.internal);
  });

  constructor() {
    effect(() => {
      const key = this.expandedKey();
      if (key !== null) this.expanded.update((current) => new Set([...current, key]));
    });
  }

  /** `undefined` mientras se cargan; `null` si el Subagente no tiene Evaluación. */
  protected evaluationOf(subagentId: string): Evaluation | null | undefined {
    const loaded = this.evaluations();
    return loaded?.loaded ? (loaded.byKey.get(evaluationKey('subagent', subagentId)) ?? null) : undefined;
  }

  protected isExpanded(key: string): boolean {
    return this.expanded().has(key);
  }

  protected toggle(key: string): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
}
