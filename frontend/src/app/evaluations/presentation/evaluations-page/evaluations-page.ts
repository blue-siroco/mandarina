import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { switchMap } from 'rxjs';
import { formatInteger } from '../../../shared/format';
import { SelectFilter } from '../../../shared/ui/select-filter/select-filter';
import { ToggleGroup } from '../../../shared/ui/toggle-group/toggle-group';
import { INITIAL_EVALUATIONS, EvaluationsQuery, WatchEvaluations } from '../../application/watch-evaluations';
import { Evaluation, EvaluationObjectType, ScoreFilter } from '../../models/evaluation';

const HOUR = 60 * 60 * 1000;

/** Periodos de la pantalla; se mide la última actualización de cada Evaluación (AC-58). */
export const EVALUATION_RANGES = [
  { key: '1h', label: '1 h', title: 'Última hora', ms: HOUR },
  { key: '24h', label: '24 h', title: 'Últimas 24 h', ms: 24 * HOUR },
  { key: '7d', label: '7 d', title: 'Últimos 7 días', ms: 7 * 24 * HOUR },
  { key: '30d', label: '30 d', title: 'Últimos 30 días', ms: 30 * 24 * HOUR },
  { key: 'todo', label: 'Todo', title: 'Todo el histórico', ms: undefined },
] as const;
/** Las Evaluaciones son pocas y valiosas: por defecto se ven todas. */
export const DEFAULT_EVALUATION_RANGE = 'todo';

export const TYPE_OPTIONS: ReadonlyArray<{ key: EvaluationObjectType; label: string }> = [
  { key: 'session', label: 'Sesión' },
  { key: 'turn', label: 'Turno' },
  { key: 'subagent', label: 'Subagente' },
];

export const SCORE_OPTIONS: ReadonlyArray<{ key: ScoreFilter; label: string }> = [
  { key: 'up', label: '+1 (bien)' },
  { key: 'down', label: '−1 (mal)' },
  { key: 'none', label: 'Sin puntuar' },
];

export const ALL_TYPES = 'Todos los tipos';
export const ALL_SCORES = 'Toda Puntuación';
export const ALL_TAGS = 'Todas las Etiquetas';
export const ALL_PROJECTS = 'Todos los Proyectos';

const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.key, o.label])) as Record<EvaluationObjectType, string>;

/** Enlace al objeto evaluado en el detalle de Sesión (AC-58). */
export function objectLink(evaluation: Evaluation): { link: string[]; queryParams: Record<string, string> | null } {
  const link = ['/sesiones', evaluation.sessionId];
  if (evaluation.objectType === 'turn') return { link, queryParams: { pestana: 'linea' } };
  if (evaluation.objectType === 'subagent') return { link, queryParams: { pestana: 'subagentes', subagente: evaluation.objectId } };
  return { link, queryParams: null };
}

/** Pantalla de Evaluaciones: lista, filtros, uso de Etiquetas y exportación del Dataset (AC-58). */
@Component({
  selector: 'app-evaluations-page',
  imports: [DatePipe, RouterLink, SelectFilter, ToggleGroup],
  templateUrl: './evaluations-page.html',
  styleUrl: './evaluations-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvaluationsPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly watch = inject(WatchEvaluations);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: convertToParamMap({}) });

  protected readonly range = computed(
    () => EVALUATION_RANGES.find((r) => r.key === this.params().get('periodo')) ?? EVALUATION_RANGES.find((r) => r.key === DEFAULT_EVALUATION_RANGE)!,
  );
  protected readonly type = computed(() => TYPE_OPTIONS.find((o) => o.key === this.params().get('tipo')) ?? null);
  protected readonly score = computed(() => SCORE_OPTIONS.find((o) => o.key === this.params().get('puntuacion')) ?? null);
  protected readonly tag = computed(() => this.params().get('etiqueta'));
  protected readonly project = computed(() => this.params().get('proyecto'));

  private readonly query = computed(
    (): EvaluationsQuery => ({
      windowMs: this.range().ms,
      objectTypes: this.type() ? [this.type()!.key] : undefined,
      score: this.score()?.key,
      tag: this.tag() ?? undefined,
      project: this.project() ?? undefined,
    }),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );
  protected readonly state = toSignal(toObservable(this.query).pipe(switchMap((q) => this.watch.execute(q))), {
    initialValue: INITIAL_EVALUATIONS,
  });
  /** Se recalcula con cada refresco para que el periodo avance con el reloj. */
  protected readonly exportHref = computed(() => {
    this.state();
    return this.watch.exportUrl(this.query());
  });

  protected readonly rangeLabels = EVALUATION_RANGES.map((r) => r.label);
  protected readonly rangeIndex = computed(() => EVALUATION_RANGES.findIndex((r) => r.key === this.range().key));
  protected readonly typeLabels = TYPE_OPTIONS.map((o) => o.label);
  protected readonly scoreLabels = SCORE_OPTIONS.map((o) => o.label);
  protected readonly tagNames = computed(() => this.state().tags.map((t) => t.tag));
  protected readonly allTypes = ALL_TYPES;
  protected readonly allScores = ALL_SCORES;
  protected readonly allTags = ALL_TAGS;
  protected readonly allProjects = ALL_PROJECTS;
  protected readonly typeLabel = (type: EvaluationObjectType) => TYPE_LABELS[type];
  protected readonly objectLink = objectLink;
  protected readonly formatInteger = formatInteger;

  protected onRangeChange(index: number): void {
    const key = EVALUATION_RANGES[index]?.key ?? DEFAULT_EVALUATION_RANGE;
    this.navigate({ periodo: key === DEFAULT_EVALUATION_RANGE ? null : key });
  }

  protected selectType(label: string | null): void {
    this.navigate({ tipo: TYPE_OPTIONS.find((o) => o.label === label)?.key ?? null });
  }

  protected selectScore(label: string | null): void {
    this.navigate({ puntuacion: SCORE_OPTIONS.find((o) => o.label === label)?.key ?? null });
  }

  protected selectTag(tag: string | null): void {
    this.navigate({ etiqueta: tag });
  }

  protected selectProject(project: string | null): void {
    this.navigate({ proyecto: project });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
