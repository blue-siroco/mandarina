import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { map, switchMap, timer } from 'rxjs';
import { formatCompact, formatCost, formatDuration, formatInteger, formatPercent, relativeTime } from '../../../shared/format';
import { RANGES } from '../../../shared/periods';
import { SelectFilter } from '../../../shared/ui/select-filter/select-filter';
import { ToggleGroup } from '../../../shared/ui/toggle-group/toggle-group';
import { INITIAL_AGENTS, WatchAgents } from '../../application/watch-agents';
import { NO_TYPE } from '../../infrastructure/http-agent-source';
import { AgentQuery, AgentTypeSummary } from '../../models/agent';
import { formatPerLaunch, ratedUpRatio, typeLabel } from '../agent-labels';

export const ALL_PROJECTS = 'Todos los Proyectos';
/** Los Lanzamientos son esporádicos: con 24 h la comparativa sale casi vacía. */
export const DEFAULT_AGENTS_RANGE = '7d';

interface Column {
  key: string;
  label: string;
  value: (t: AgentTypeSummary) => number | string | null;
  format: (t: AgentTypeSummary) => string;
}

const dash = (v: number | null, f: (n: number) => string) => (v === null ? '—' : f(v));

/** Columnas de la comparativa (AC-47); la primera cifra, Lanzamientos, ordena por defecto. */
export const COLUMNS: Column[] = [
  { key: 'type', label: 'Tipo', value: (t) => typeLabel(t.type), format: (t) => typeLabel(t.type) },
  { key: 'launches', label: 'Lanzamientos', value: (t) => t.launches, format: (t) => formatInteger(t.launches) },
  { key: 'running', label: 'En marcha', value: (t) => t.running, format: (t) => formatInteger(t.running) },
  { key: 'no-response', label: 'Sin respuesta', value: (t) => t.noResponse, format: (t) => formatInteger(t.noResponse) },
  { key: 'duration', label: 'Duración mediana', value: (t) => t.durationP50Ms, format: (t) => dash(t.durationP50Ms, formatDuration) },
  { key: 'tokens', label: 'Tokens', value: (t) => t.tokens.input + t.tokens.output, format: (t) => formatCompact(t.tokens.input + t.tokens.output) },
  { key: 'sessions', label: 'Sesiones', value: (t) => t.sessions, format: (t) => formatInteger(t.sessions) },
  { key: 'cost', label: 'Coste por Lanzamiento', value: (t) => t.costPerLaunchUsd, format: (t) => dash(t.costPerLaunchUsd, formatCost) },
  { key: 'errors', label: 'Herramientas con error / Lanzamiento', value: (t) => t.toolErrorsPerLaunch, format: (t) => formatPerLaunch(t.toolErrorsPerLaunch) },
  { key: 'blocks', label: 'Bloqueos / Lanzamiento', value: (t) => t.blocksPerLaunch, format: (t) => formatPerLaunch(t.blocksPerLaunch) },
  // Sin tokens de entrada no hay tasa: al ordenar cuenta como la menor (AC-75).
  { key: 'cache', label: 'Caché', value: (t) => t.cacheHitRate ?? -1, format: (t) => dash(t.cacheHitRate, formatPercent) },
  // Sin Lanzamientos puntuados no hay porcentaje: al ordenar cuenta como el menor (AC-59).
  { key: 'rating', label: 'Bien', value: (t) => ratedUpRatio(t) ?? -1, format: (t) => dash(ratedUpRatio(t), formatPercent) },
];

/** Pantalla Agentes: comparativa de los Tipos de Subagente (AC-47). */
@Component({
  selector: 'app-agents-page',
  imports: [RouterLink, SelectFilter, ToggleGroup],
  templateUrl: './agents-page.html',
  styleUrl: './agents-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentsPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly watch = inject(WatchAgents);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: convertToParamMap({}) });

  protected readonly range = computed(
    () => RANGES.find((r) => r.key === this.params().get('periodo')) ?? RANGES.find((r) => r.key === DEFAULT_AGENTS_RANGE)!,
  );
  protected readonly project = computed(() => this.params().get('proyecto'));
  private readonly query = computed((): AgentQuery => ({ windowMs: this.range().ms, project: this.project() ?? undefined }), {
    equal: (a, b) => a.windowMs === b.windowMs && a.project === b.project,
  });
  protected readonly state = toSignal(toObservable(this.query).pipe(switchMap((q) => this.watch.list(q))), { initialValue: INITIAL_AGENTS });
  /** Refresca los "hace N min" sin esperar a un Lanzamiento nuevo. */
  protected readonly now = toSignal(timer(0, 30_000).pipe(map(() => new Date())), { initialValue: new Date() });

  private readonly sort = signal<{ key: string; direction: 'asc' | 'desc' }>({ key: 'launches', direction: 'desc' });
  protected readonly rows = computed(() => {
    const { key, direction } = this.sort();
    const column = COLUMNS.find((c) => c.key === key)!;
    const sign = direction === 'asc' ? 1 : -1;
    return [...this.state().types].sort((a, b) => {
      const va = column.value(a);
      const vb = column.value(b);
      // Lo desconocido va siempre al final, se ordene como se ordene.
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return sign * (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb)));
    });
  });

  protected readonly columns = COLUMNS;
  protected readonly rangeLabels = RANGES.map((r) => r.label);
  protected readonly rangeIndex = computed(() => RANGES.findIndex((r) => r.key === this.range().key));
  protected readonly allProjects = ALL_PROJECTS;
  protected readonly relativeTime = relativeTime;
  protected readonly noType = NO_TYPE;

  protected ariaSort(column: Column): 'ascending' | 'descending' | 'none' {
    const { key, direction } = this.sort();
    if (key !== column.key) return 'none';
    return direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortBy(column: Column): void {
    this.sort.update(({ key, direction }) => ({
      key: column.key,
      direction: key === column.key && direction === 'desc' ? 'asc' : 'desc',
    }));
  }

  protected onRangeChange(index: number): void {
    const key = RANGES[index]?.key ?? DEFAULT_AGENTS_RANGE;
    this.navigate({ periodo: key === DEFAULT_AGENTS_RANGE ? null : key });
  }

  protected selectProject(project: string | null): void {
    this.navigate({ proyecto: project });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
