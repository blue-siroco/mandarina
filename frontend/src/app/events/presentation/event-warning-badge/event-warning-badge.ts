import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EventWarning, InjectionSeverity } from '../../models/observed-event';

export const SEVERITY_LABELS: Record<InjectionSeverity, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };
const RANK: Record<InjectionSeverity, number> = { low: 0, medium: 1, high: 2 };

/** La mayor severidad entre los avisos vigentes (sin descartar); `null` si no hay ninguno. */
export function highestSeverity(warnings: readonly EventWarning[]): InjectionSeverity | null {
  return warnings.filter((w) => !w.dismissed).reduce<InjectionSeverity | null>((top, w) => (top === null || RANK[w.severity] > RANK[top] ? w.severity : top), null);
}

/**
 * Marca de un Evento con Avisos de inyección vigentes (AC-68). Dice "Aviso de
 * inyección" y la severidad con texto: el color solo no basta (design §2.5).
 */
@Component({
  selector: 'app-event-warning-badge',
  templateUrl: './event-warning-badge.html',
  styleUrl: './event-warning-badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventWarningBadge {
  readonly warnings = input.required<readonly EventWarning[]>();

  protected readonly severity = computed(() => highestSeverity(this.warnings()));
  protected readonly labels = SEVERITY_LABELS;
}
