import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import '@lucia/info';
import { formatCompact, formatPercent } from '../../../shared/format';
import { ModelBadge } from '../../../shared/ui/model-badge/model-badge';
import { SessionDetail } from '../../models/session';

export type ContextLevel = 'ok' | 'warn' | 'danger';

/** Umbrales de §5.10: más del 80 % avisa, más del 95 % es peligro. */
export function contextLevel(ratio: number): ContextLevel {
  if (ratio > 0.95) return 'danger';
  return ratio > 0.8 ? 'warn' : 'ok';
}

export const TRANSCRIPT_UNAVAILABLE = 'Transcript no disponible: el modelo, los tokens y el contexto salen de él (ADR-0003).';

/** Tarjeta de ventana de contexto (spec/design.md §5.10). */
@Component({
  selector: 'app-context-card',
  imports: [ModelBadge],
  template: `
    <article class="kpi context" data-testid="context-card" [attr.data-level]="level()">
      <h3 class="overline">Ventana de contexto</h3>
      @if (context(); as c) {
        <p class="kpi__value">
          {{ used() }} / {{ limit() }} <span class="context__ratio">({{ percent() }})</span>
          <app-model-badge [model]="c.model" />
        </p>
        <div class="context__bar" role="meter" aria-label="Contexto ocupado" aria-valuemin="0" [attr.aria-valuemax]="c.limit" [attr.aria-valuenow]="c.used">
          <span class="context__fill" [style.width.%]="ratio() * 100"></span>
        </div>
        <p class="kpi__detail">Estimado a partir del Transcript</p>
      } @else if (!transcriptAvailable()) {
        <lucia--info data-testid="transcript-unavailable" [infoMessage]="unavailable"></lucia--info>
      } @else {
        <p class="kpi__detail">El Transcript aún no tiene respuestas del modelo.</p>
      }
    </article>
  `,
  styleUrl: './context-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ContextCard {
  readonly context = input.required<SessionDetail['context']>();
  readonly transcriptAvailable = input.required<boolean>();
  protected readonly unavailable = TRANSCRIPT_UNAVAILABLE;

  protected readonly ratio = computed(() => {
    const c = this.context();
    return c ? Math.min(1, c.used / c.limit) : 0;
  });
  protected readonly level = computed(() => contextLevel(this.ratio()));
  protected readonly used = computed(() => formatCompact(this.context()?.used ?? 0));
  protected readonly limit = computed(() => formatCompact(this.context()?.limit ?? 0));
  protected readonly percent = computed(() => formatPercent(this.ratio()));
}
