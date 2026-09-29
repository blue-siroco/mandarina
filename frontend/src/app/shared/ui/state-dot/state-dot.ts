import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SessionStateName = 'active' | 'idle' | 'orphaned' | 'closed';

export const STATE_LABELS: Record<SessionStateName, string> = {
  active: 'Activa',
  idle: 'Inactiva',
  orphaned: 'Huérfana',
  closed: 'Cerrada',
};

/** Punto de Estado de la Sesión con su etiqueta: nunca solo color (spec/design.md §5.6). */
@Component({
  selector: 'app-state-dot',
  template: `<span class="dot" aria-hidden="true"></span><span class="label">{{ label() }}</span>`,
  styleUrl: './state-dot.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-state]': 'state()', '[attr.title]': 'reason() ?? null' },
})
export class StateDot {
  readonly state = input.required<SessionStateName>();
  /** Motivo del Estado para el tooltip ("Sin actividad desde hace 42 min…"). */
  readonly reason = input<string | null>(null);
  protected readonly label = computed(() => STATE_LABELS[this.state()]);
}
