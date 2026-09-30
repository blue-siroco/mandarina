import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { map, switchMap, timer } from 'rxjs';
import { plural, tailPath } from '../../../shared/format';
import { RANGES } from '../../../shared/periods';
import { SelectFilter } from '../../../shared/ui/select-filter/select-filter';
import { ToggleGroup } from '../../../shared/ui/toggle-group/toggle-group';
import { UsageSummary } from '../../../usage/presentation/usage-summary/usage-summary';
import {
  BoardFilter,
  INITIAL_BOARD,
  WatchSessionBoard,
  countStates,
  groupByProject,
} from '../../application/watch-session-board';
import { SessionState } from '../../models/session';
import { SessionCard } from '../session-card/session-card';

export const DEFAULT_RANGE = '24h';

export const STATE_FILTERS: ReadonlyArray<{ key: SessionState | null; label: string }> = [
  { key: null, label: 'Todas' },
  { key: 'active', label: 'Activas' },
  { key: 'idle', label: 'Inactivas' },
  { key: 'orphaned', label: 'Huérfanas' },
  { key: 'closed', label: 'Cerradas' },
];

export const ALL_DIRECTORIES = 'Todos los Directorios';

/** "3 activas · 2 inactivas · 1 huérfana", sin los Estados que no tienen Sesiones. */
export function stateSummary(counts: Record<SessionState, number>): string {
  const parts = [
    counts.active > 0 ? plural(counts.active, 'activa', 'activas') : null,
    counts.idle > 0 ? plural(counts.idle, 'inactiva', 'inactivas') : null,
    counts.orphaned > 0 ? plural(counts.orphaned, 'huérfana', 'huérfanas') : null,
    counts.closed > 0 ? plural(counts.closed, 'cerrada', 'cerradas') : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : 'Sin Sesiones en este periodo';
}

/** Board de Sesiones, pantalla de inicio (AC-16). */
@Component({
  selector: 'app-session-board',
  imports: [RouterLink, SessionCard, UsageSummary, ToggleGroup, SelectFilter],
  templateUrl: './session-board.html',
  styleUrl: './session-board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionBoard {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly watch = inject(WatchSessionBoard);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: convertToParamMap({}) });

  protected readonly range = computed(
    () => RANGES.find((r) => r.key === this.params().get('rango')) ?? RANGES.find((r) => r.key === DEFAULT_RANGE)!,
  );
  protected readonly stateFilter = computed(
    () => STATE_FILTERS.find((s) => s.key !== null && s.key === this.params().get('estado'))?.key ?? null,
  );
  protected readonly directory = computed(() => this.params().get('directorio'));

  // El Estado se filtra en el cliente para que el resumen cuente todas las Sesiones del periodo.
  private readonly query = computed<BoardFilter>(() => ({
    windowMs: this.range().ms,
    directory: this.directory() ?? undefined,
  }));
  protected readonly state = toSignal(
    toObservable(this.query).pipe(switchMap((query) => this.watch.execute(query))),
    { initialValue: INITIAL_BOARD },
  );
  /** Reloj de los "hace N min"; no hace falta más precisión. */
  protected readonly now = toSignal(timer(0, 5000).pipe(map(() => new Date())), { initialValue: new Date() });

  private readonly items = computed(() => this.state().list?.items ?? []);
  protected readonly summary = computed(() => stateSummary(countStates(this.items())));
  protected readonly groups = computed(() => {
    const filter = this.stateFilter();
    return groupByProject(filter ? this.items().filter((s) => s.state === filter) : this.items());
  });
  protected readonly filtering = computed(() => this.stateFilter() !== null || this.directory() !== null);

  protected readonly stateLabels = STATE_FILTERS.map((s) => s.label);
  protected readonly stateIndex = computed(() => STATE_FILTERS.findIndex((s) => s.key === this.stateFilter()));
  protected readonly rangeLabels = RANGES.map((r) => r.label);
  protected readonly rangeIndex = computed(() => RANGES.findIndex((r) => r.key === this.range().key));
  protected readonly directories = computed(() => this.state().list?.facets.directories ?? []);
  protected readonly allDirectories = ALL_DIRECTORIES;

  private readonly collapsed = signal<ReadonlySet<string>>(new Set());
  private readonly showClosed = signal<ReadonlySet<string>>(new Set());
  protected readonly skeletonCards = [1, 2, 3];
  protected readonly plural = plural;
  protected readonly tailPath = tailPath;

  protected isCollapsed(project: string): boolean {
    return this.collapsed().has(project);
  }

  protected isShowingClosed(project: string): boolean {
    return this.showClosed().has(project);
  }

  protected toggleProject(project: string): void {
    this.collapsed.update((set) => toggled(set, project));
  }

  protected toggleClosed(project: string): void {
    this.showClosed.update((set) => toggled(set, project));
  }

  protected onStateChange(index: number): void {
    this.navigate({ estado: STATE_FILTERS[index]?.key ?? null });
  }

  protected onRangeChange(index: number): void {
    const key = RANGES[index]?.key ?? DEFAULT_RANGE;
    this.navigate({ rango: key === DEFAULT_RANGE ? null : key });
  }

  protected selectDirectory(directory: string | null): void {
    this.navigate({ directorio: directory });
  }

  protected clearFilters(): void {
    this.navigate({ estado: null, directorio: null });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}

function toggled(set: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
