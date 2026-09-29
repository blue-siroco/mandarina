import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { switchMap } from 'rxjs';
import { formatCompact, formatCost, formatDuration, shortId } from '../../../shared/format';
import { RANGES } from '../../../shared/periods';
import { CheckFilter } from '../../../shared/ui/check-filter/check-filter';
import { SelectFilter } from '../../../shared/ui/select-filter/select-filter';
import { ToggleGroup } from '../../../shared/ui/toggle-group/toggle-group';
import { INITIAL_SUBAGENTS, WatchSubagents } from '../../application/watch-subagents';
import { SubagentQuery, SubagentStatus } from '../../models/subagent';

export const ALL_PROJECTS = 'Todos los Proyectos';
export const ALL_TYPES = 'Todos los Tipos';
/** Como el board: los tokens se leen de los Transcripts y 24 h mantiene barata la lectura. */
export const DEFAULT_SUBAGENTS_RANGE = '24h';

/** El estado siempre se dice con texto, no solo con color (spec/design.md §7). */
export const STATUS_LABELS: Record<SubagentStatus, string> = { running: 'En marcha', finished: 'Terminado', no_response: 'Sin respuesta' };
/** En la URL del perfil, los Lanzamientos sin Tipo conocido (AC-47). */
export const NO_TYPE = 'sin-tipo';

/** Pantalla de Subagentes de todas las Sesiones (AC-37); la vista por Tipo está en `/agentes` (AC-47). */
@Component({
  selector: 'app-subagents-page',
  imports: [CheckFilter, DatePipe, RouterLink, SelectFilter, ToggleGroup],
  templateUrl: './subagents-page.html',
  styleUrl: './subagents-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubagentsPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly watch = inject(WatchSubagents);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: convertToParamMap({}) });

  protected readonly range = computed(
    () => RANGES.find((r) => r.key === this.params().get('periodo')) ?? RANGES.find((r) => r.key === DEFAULT_SUBAGENTS_RANGE)!,
  );
  protected readonly project = computed(() => this.params().get('proyecto'));
  protected readonly type = computed(() => this.params().get('tipo'));
  protected readonly showInternal = computed(() => this.params().get('internos') === '1');

  private readonly query = computed(
    (): SubagentQuery => ({
      windowMs: this.range().ms,
      project: this.project() ?? undefined,
      type: this.type() ?? undefined,
      includeInternal: this.showInternal(),
    }),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );
  protected readonly state = toSignal(toObservable(this.query).pipe(switchMap((q) => this.watch.execute(q))), {
    initialValue: INITIAL_SUBAGENTS,
  });

  protected readonly rangeLabels = RANGES.map((r) => r.label);
  protected readonly rangeIndex = computed(() => RANGES.findIndex((r) => r.key === this.range().key));
  protected readonly allProjects = ALL_PROJECTS;
  protected readonly allTypes = ALL_TYPES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly noType = NO_TYPE;
  protected readonly formatDuration = formatDuration;
  protected readonly formatCompact = formatCompact;
  protected readonly formatCost = formatCost;
  protected readonly shortId = shortId;

  protected onRangeChange(index: number): void {
    const key = RANGES[index]?.key ?? DEFAULT_SUBAGENTS_RANGE;
    this.navigate({ periodo: key === DEFAULT_SUBAGENTS_RANGE ? null : key });
  }

  protected selectProject(project: string | null): void {
    this.navigate({ proyecto: project });
  }

  protected selectType(type: string | null): void {
    this.navigate({ tipo: type });
  }

  protected setShowInternal(show: boolean): void {
    this.navigate({ internos: show ? '1' : null });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
