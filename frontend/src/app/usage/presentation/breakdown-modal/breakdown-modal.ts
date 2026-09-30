import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import '@lucia/button';
import { of, switchMap } from 'rxjs';
import { formatInteger, plural, tailPath } from '../../../shared/format';
import { ModelBadge } from '../../../shared/ui/model-badge/model-badge';
import { ToggleGroup } from '../../../shared/ui/toggle-group/toggle-group';
import { INITIAL_USAGE_STATE, WatchUsageMetrics } from '../../application/watch-usage-metrics';
import { MetricsSlice } from '../../models/usage-metrics';
import { BreakdownColumn, BreakdownRow, BreakdownView, KpiKey, SortDirection, breakdownColumns, sortRows } from '../breakdown-columns';

export const VIEWS: ReadonlyArray<{ key: BreakdownView; label: string }> = [
  { key: 'directory', label: 'Por Directorio' },
  { key: 'model', label: 'Por modelo' },
];

/** La última vista usada es una comodidad de cada navegador, no va en la URL (AC-39). */
export const VIEW_STORAGE_KEY = 'mandarina.desglose.vista';

function loadView(): BreakdownView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'model' ? 'model' : 'directory';
  } catch {
    return 'directory';
  }
}

function saveView(view: BreakdownView): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Sin almacenamiento (modo privado, bloqueado) la vista vuelve a "Por Directorio".
  }
}

/** Desglose de una ficha del board por Directorio y por modelo, en una pantalla modal (AC-39, AC-40). */
@Component({
  selector: 'app-breakdown-modal',
  imports: [ModelBadge, ToggleGroup],
  templateUrl: './breakdown-modal.html',
  styleUrl: './breakdown-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class BreakdownModal {
  readonly isOpen = input(false);
  readonly kpi = input.required<KpiKey>();
  /** Nombre de la ficha ("Coste estimado"). */
  readonly label = input.required<string>();
  /** Rótulo del periodo del board ("Últimos 7 días"). */
  readonly periodTitle = input.required<string>();
  readonly windowMs = input<number | undefined>(undefined);
  /** Filtro de Directorio del board, si lo hay. */
  readonly directory = input<string | null>(null);
  readonly closed = output<void>();
  readonly directorySelected = output<string>();

  /** Botón de cerrar solo-icono: la fuente `ico_TTech` no viene en el tarball, así que el aspa va como texto. */
  protected readonly closeButton = { text: '✕', typeButton: 'secondary', icon: '', position: 'after', disabled: false };

  private readonly watch = inject(WatchUsageMetrics);
  private readonly window = viewChild<ElementRef<HTMLElement>>('window');

  protected readonly view = signal<BreakdownView>(loadView());
  private readonly sort = signal<{ key: string | null; direction: SortDirection }>({ key: null, direction: 'desc' });

  protected readonly state = toSignal(
    toObservable(computed(() => ({ open: this.isOpen(), windowMs: this.windowMs(), directory: this.directory() }))).pipe(
      switchMap(({ open, windowMs, directory }) =>
        open ? this.watch.execute(windowMs, { directory: directory ?? undefined, breakdown: true }) : of(INITIAL_USAGE_STATE),
      ),
    ),
    { initialValue: INITIAL_USAGE_STATE },
  );

  protected readonly total = computed((): MetricsSlice | null => {
    const m = this.state().metrics;
    if (!m) return null;
    return {
      sessions: { working: m.sessions.working, paused: m.sessions.paused, orphaned: m.sessions.orphaned },
      subagentsRunning: m.subagentsRunning,
      tokens: m.tokens,
      estimatedCostUsd: m.estimatedCostUsd,
      unpricedModels: m.unpricedModels,
      cache: m.cache,
    };
  });
  protected readonly columns = computed(() => breakdownColumns(this.kpi(), this.view()));
  private readonly activeColumn = computed(() => this.columns().find((c) => c.key === this.sort().key) ?? this.columns()[0]!);
  protected readonly rows = computed((): BreakdownRow[] => {
    const breakdown = this.state().metrics?.breakdown;
    const total = this.total();
    if (!breakdown || !total) return [];
    const rows: BreakdownRow[] = this.view() === 'directory' ? breakdown.byDirectory : breakdown.byModel;
    return sortRows(rows, this.activeColumn(), this.sort().key === null ? 'desc' : this.sort().direction, total);
  });
  /** Avisos de la ficha de coste (AC-40). */
  protected readonly costWarnings = computed(() => {
    const m = this.state().metrics;
    if (this.kpi() === 'cache' && m?.cache && m.cache.unpricedModels.length > 0) {
      return [`Sin Tarifa, no suman importes: ${m.cache.unpricedModels.join(', ')}`];
    }
    if (this.kpi() !== 'cost' || !m) return [];
    const warnings: string[] = [];
    if (m.unpricedModels.length > 0) warnings.push(`Sin Tarifa, no suman coste: ${m.unpricedModels.join(', ')}`);
    if (m.transcripts.unavailable > 0) {
      warnings.push(`${plural(m.transcripts.unavailable, 'Transcript no disponible', 'Transcripts no disponibles')}: su coste no se conoce`);
    }
    return warnings;
  });

  protected readonly viewLabels = VIEWS.map((v) => v.label);
  protected readonly viewIndex = computed(() => VIEWS.findIndex((v) => v.key === this.view()));
  protected readonly tailPath = tailPath;
  protected readonly formatInteger = formatInteger;

  constructor() {
    // Al abrir, el foco entra en el modal para que `Esc` y el tabulador funcionen dentro.
    effect(() => {
      if (this.isOpen()) queueMicrotask(() => this.window()?.nativeElement.focus());
    });
  }

  protected cell(column: BreakdownColumn, row: BreakdownRow): string {
    const value = column.value(row, this.total()!);
    return value === null ? '—' : column.format(value);
  }

  /** Un ahorro neto de caché negativo es un sobrecoste: rojo, además del signo del importe (AC-123). */
  protected tone(column: BreakdownColumn, row: BreakdownRow): 'danger' | null {
    if (column.key !== 'net') return null;
    const value = column.value(row, this.total()!);
    return typeof value === 'number' && value < 0 ? 'danger' : null;
  }

  protected toneTitle(column: BreakdownColumn, row: BreakdownRow): string | null {
    return this.tone(column, row) ? 'Sobrecoste: la caché costó más de lo que ahorró' : null;
  }

  protected ariaSort(column: BreakdownColumn): 'ascending' | 'descending' | 'none' {
    if (column !== this.activeColumn()) return 'none';
    return this.sort().key === null || this.sort().direction === 'desc' ? 'descending' : 'ascending';
  }

  protected sortBy(column: BreakdownColumn): void {
    const current = this.activeColumn() === column ? this.ariaSort(column) : 'none';
    this.sort.set({ key: column.key, direction: current === 'descending' ? 'asc' : 'desc' });
  }

  protected onViewChange(index: number): void {
    const view = VIEWS[index]?.key ?? 'directory';
    this.view.set(view);
    this.sort.set({ key: null, direction: 'desc' });
    saveView(view);
  }

  protected selectDirectory(directory: string): void {
    this.directorySelected.emit(directory);
    this.close();
  }

  close(): void {
    this.closed.emit();
  }

  protected onCloseButtonClick(): void {
    this.close();
  }

  /** Solo cierra un clic en la capa, no uno dentro de la ventana. */
  protected onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
