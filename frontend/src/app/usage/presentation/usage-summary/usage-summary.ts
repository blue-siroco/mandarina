import { DatePipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { dayProgress } from '../../../budgets/application/budget-alerts';
import { INITIAL_BUDGETS, WatchBudgets } from '../../../budgets/application/watch-budgets';
import { STATE_LABELS } from '../../../budgets/models/budget';
import { INITIAL_USAGE_STATE, WatchUsageMetrics } from '../../application/watch-usage-metrics';
import { CacheEfficiency, UsageMetrics } from '../../models/usage-metrics';
import { KpiKey } from '../breakdown-columns';
import { BreakdownModal } from '../breakdown-modal/breakdown-modal';

export type { KpiKey } from '../breakdown-columns';

export interface KpiCard {
  key: KpiKey;
  label: string;
  value: string;
  detail: string;
  /** Variante de acento de spec/design.md §5.3. */
  accent?: 'brand';
  /** `danger`: el detalle es malo y se pinta en rojo, además de decirlo con texto (AC-74). */
  tone?: 'danger';
}

const compact = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('es-ES');
const percent = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' });

const plural = (n: number, one: string, many: string) => `${integer.format(n)} ${n === 1 ? one : many}`;

/** Ficha Caché (AC-74): la tasa de acierto y, de detalle, el ahorro neto o el sobrecoste, y las Reescrituras. */
export function cacheCard(cache: CacheEfficiency | null): KpiCard {
  const money = (value: number) => `~${usd.format(Math.abs(value))}`;
  const parts: string[] = [];
  if (cache === null) parts.push('Sin datos');
  else {
    // Un ahorro negativo se dice como tal: escribir en caché costó más de lo que se ahorró.
    parts.push(cache.savingsNetUsd < 0 ? `Sobrecoste ${money(cache.savingsNetUsd)}` : `Ahorro ${money(cache.savingsNetUsd)}`);
    if (cache.rewrites > 0) parts.push(plural(cache.rewrites, 'Reescritura', 'Reescrituras'));
  }
  return {
    key: 'cache',
    label: 'Caché',
    value: cache?.hitRate == null ? '—' : percent.format(cache.hitRate),
    detail: parts.join(' · '),
    tone: cache !== null && cache.savingsNetUsd < 0 ? 'danger' : undefined,
  };
}

/** Traduce las métricas a las fichas de AC-13, en el orden en que se muestran. */
export function toKpiCards(m: UsageMetrics): KpiCard[] {
  const { tokens } = m;
  const totalInput = tokens.input + tokens.cacheRead + tokens.cacheCreation;
  const topModel = m.byModel[0]?.model;
  // Proporción de la entrada servida desde caché: cuanto más alta, más barata la Sesión.
  const cacheShare = totalInput > 0 ? `${percent.format(tokens.cacheRead / totalInput)} leído de caché` : 'Sin caché';

  let costDetail = 'Según las Tarifas públicas';
  if (m.unpricedModels.length > 0) costDetail = `Sin Tarifa: ${m.unpricedModels.join(', ')}`;
  else if (m.transcripts.unavailable > 0) {
    costDetail = plural(m.transcripts.unavailable, 'Transcript no disponible', 'Transcripts no disponibles');
  }

  return [
    {
      key: 'working',
      label: 'Trabajando',
      value: integer.format(m.sessions.working),
      detail: plural(m.subagentsRunning, 'Subagente en marcha', 'Subagentes en marcha'),
    },
    {
      key: 'paused',
      label: 'En pausa',
      value: integer.format(m.sessions.paused),
      detail: plural(m.sessions.orphaned, 'Huérfana', 'Huérfanas'),
    },
    {
      key: 'input',
      label: 'Tokens de entrada',
      value: compact.format(totalInput),
      detail: `${cacheShare} · ${compact.format(tokens.cacheCreation)} escritos`,
    },
    {
      key: 'output',
      label: 'Tokens de salida',
      value: compact.format(tokens.output),
      detail: topModel ? `Sobre todo ${topModel}` : 'Sin respuestas del modelo',
    },
    cacheCard(m.cache),
    {
      key: 'cost',
      label: 'Coste estimado',
      value: `~${usd.format(m.estimatedCostUsd)}`,
      detail: costDetail,
      accent: 'brand',
    },
    {
      key: 'tools',
      label: 'Herramientas',
      value: integer.format(m.activity.toolCalls),
      detail: `${plural(m.activity.prompts, 'prompt', 'prompts')} · ${plural(m.activity.blocks, 'Bloqueo', 'Bloqueos')}`,
    },
  ];
}

@Component({
  selector: 'app-usage-summary',
  imports: [BreakdownModal, DatePipe, PercentPipe],
  templateUrl: './usage-summary.html',
  styleUrl: './usage-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageSummary {
  /** Duración del periodo del board; `undefined` es todo el histórico. */
  readonly windowMs = input<number | undefined>(undefined);
  /** Rótulo del periodo ("Últimas 24 h"). */
  readonly title = input.required<string>();
  /** Filtro de Directorio del board: las fichas lo siguen (AC-39). */
  readonly directory = input<string | null>(null);
  /** Se pulsó un Directorio en el desglose: el board aplica ese filtro. */
  readonly directorySelected = output<string>();

  private readonly watch = inject(WatchUsageMetrics);
  protected readonly state = toSignal(
    toObservable(computed(() => ({ windowMs: this.windowMs(), directory: this.directory() }))).pipe(
      switchMap(({ windowMs, directory }) => this.watch.execute(windowMs, { directory: directory ?? undefined })),
    ),
    { initialValue: INITIAL_USAGE_STATE },
  );
  protected readonly cards = computed(() => {
    const metrics = this.state().metrics;
    return metrics ? toKpiCards(metrics) : [];
  });
  protected readonly skeletonCards = [1, 2, 3, 4, 5, 6, 7];

  /** Presupuesto global del día: es del día natural, no del periodo elegido en el board (AC-84). */
  private readonly budgets = toSignal(inject(WatchBudgets).state$, { initialValue: INITIAL_BUDGETS });
  protected readonly dayBudget = computed(() => dayProgress(this.budgets().items));
  protected readonly stateLabels = STATE_LABELS;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Ficha cuyo desglose está abierto (AC-39). */
  protected readonly openCard = signal<KpiCard | null>(null);

  protected open(card: KpiCard, event?: Event): void {
    event?.preventDefault();
    this.openCard.set(card);
  }

  /** Al cerrar, el foco vuelve a la ficha que abrió el modal. */
  protected onClosed(): void {
    const key = this.openCard()?.key;
    this.openCard.set(null);
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-kpi="${key}"]`)?.focus());
  }
}
