import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { Subject, switchMap } from 'rxjs';
import { shortId } from '../../../shared/format';
import { toolLabel } from '../../../shared/tool-summary';
import { SelectFilter } from '../../../shared/ui/select-filter/select-filter';
import { DismissInjectionWarning } from '../../application/dismiss-injection-warning';
import { INITIAL_WARNINGS, WarningsQuery, WatchInjectionWarnings } from '../../application/watch-injection-warnings';
import { DismissedFilter, InjectionWarning } from '../../models/security';
import { CATEGORY_LABELS, DISMISSED_OPTIONS, SEVERITY_LABELS, SEVERITY_OPTIONS, SEVERITY_PARAMS, SOURCE_OPTIONS, sourceKind } from '../security-labels';

export const ALL_SEVERITIES = 'Toda severidad';
export const ALL_PATTERNS = 'Todos los patrones';
export const ALL_PROJECTS = 'Todos los Proyectos';
export const ALL_SOURCES = 'Todas las fuentes';
export const CURRENT_LABEL = 'Vigentes';

/** Enlace al Evento del aviso en el detalle de Sesión, con su Subagente desplegado si lo hay (AC-66). */
export function sessionLink(warning: InjectionWarning): { link: string[]; queryParams: Record<string, string> | null } {
  const link = ['/sesiones', warning.sessionId];
  return { link, queryParams: warning.subagentId ? { pestana: 'subagentes', subagente: warning.subagentId } : null };
}

/** Pestaña Avisos de inyección: lista filtrable, con descarte de falsos positivos (AC-66). */
@Component({
  selector: 'app-injection-warnings-tab',
  imports: [DatePipe, RouterLink, SelectFilter],
  templateUrl: './injection-warnings-tab.html',
  styleUrl: './injection-warnings-tab.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InjectionWarningsTab {
  /** Periodo en milisegundos; sin él, todo el histórico. */
  readonly windowMs = input<number | undefined>(undefined);

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly watch = inject(WatchInjectionWarnings);
  private readonly dismissal = inject(DismissInjectionWarning);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: convertToParamMap({}) });
  private readonly refresh$ = new Subject<void>();

  protected readonly severity = computed(() => SEVERITY_PARAMS[this.params().get('severidad') ?? ''] ?? null);
  protected readonly pattern = computed(() => this.params().get('patron'));
  protected readonly project = computed(() => this.params().get('proyecto'));
  protected readonly sourceOption = computed(() => SOURCE_OPTIONS.find((o) => o.param === this.params().get('fuente')) ?? null);
  protected readonly sessionId = computed(() => this.params().get('sesion'));
  protected readonly dismissedOption = computed(() => DISMISSED_OPTIONS.find((o) => o.param === this.params().get('descartados')) ?? null);
  protected readonly dismissedFilter = computed<DismissedFilter>(() => this.dismissedOption()?.filter ?? 'false');

  private readonly query = computed(
    (): WarningsQuery => ({
      windowMs: this.windowMs(),
      severities: this.severity() ? [this.severity()!] : undefined,
      pattern: this.pattern() ?? undefined,
      project: this.project() ?? undefined,
      sessionId: this.sessionId() ?? undefined,
      dismissed: this.dismissedFilter(),
    }),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );
  protected readonly state = toSignal(toObservable(this.query).pipe(switchMap((q) => this.watch.execute(q, this.refresh$))), {
    initialValue: INITIAL_WARNINGS,
  });

  /** Descartes pedidos y aún sin confirmar por una lista nueva: se ven al instante (AC-66). */
  private readonly optimistic = signal<ReadonlyMap<string, boolean>>(new Map());
  protected readonly dismissError = signal<string | null>(null);

  protected readonly rows = computed(() => {
    const overrides = this.optimistic();
    const wanted = this.dismissedFilter();
    // La fuente se filtra aquí: la API no la recibe y `source` es texto libre.
    const source = this.sourceOption()?.kind;
    return this.state()
      .items.map((w) => ({ ...w, dismissed: overrides.get(w.id) ?? w.dismissed }))
      .filter((w) => wanted === 'all' || w.dismissed === (wanted === 'true'))
      .filter((w) => !source || sourceKind(w.toolName) === source);
  });

  protected readonly severityLabel = computed(() => (this.severity() ? SEVERITY_LABELS[this.severity()!] : null));
  protected readonly severityOptions = SEVERITY_OPTIONS;
  protected readonly dismissedLabels = DISMISSED_OPTIONS.map((o) => o.label);
  protected readonly severityLabels = SEVERITY_LABELS;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly allSeverities = ALL_SEVERITIES;
  protected readonly allPatterns = ALL_PATTERNS;
  protected readonly allProjects = ALL_PROJECTS;
  protected readonly allSources = ALL_SOURCES;
  protected readonly sourceLabels = SOURCE_OPTIONS.map((o) => o.label);
  protected readonly currentLabel = CURRENT_LABEL;
  protected readonly shortId = shortId;
  protected readonly toolLabel = toolLabel;
  protected readonly sessionLink = sessionLink;

  constructor() {
    // Una lista nueva del servidor ya recoge los descartes: los cambios optimistas sobran.
    effect(() => {
      this.state();
      untracked(() => this.optimistic.set(new Map()));
    });
  }

  protected selectSeverity(label: string | null): void {
    this.navigate({ severidad: label === null ? null : label.toLowerCase() });
  }

  protected selectPattern(pattern: string | null): void {
    this.navigate({ patron: pattern });
  }

  protected selectProject(project: string | null): void {
    this.navigate({ proyecto: project });
  }

  protected selectSource(label: string | null): void {
    this.navigate({ fuente: SOURCE_OPTIONS.find((o) => o.label === label)?.param ?? null });
  }

  protected selectDismissed(label: string | null): void {
    this.navigate({ descartados: DISMISSED_OPTIONS.find((o) => o.label === label)?.param ?? null });
  }

  protected toggleDismissal(warning: InjectionWarning & { dismissed: boolean }): void {
    const dismissed = !warning.dismissed;
    this.dismissError.set(null);
    this.setOptimistic(warning.id, dismissed);
    this.dismissal.execute(warning.id, dismissed).subscribe((outcome) => {
      if (outcome === 'ok') {
        this.refresh$.next();
        return;
      }
      // Sin confirmar: vuelve a como estaba y se avisa.
      this.setOptimistic(warning.id, null);
      this.dismissError.set(dismissed ? 'No se pudo descartar el aviso.' : 'No se pudo restaurar el aviso.');
    });
  }

  private setOptimistic(id: string, dismissed: boolean | null): void {
    this.optimistic.update((current) => {
      const next = new Map(current);
      if (dismissed === null) next.delete(id);
      else next.set(id, dismissed);
      return next;
    });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
