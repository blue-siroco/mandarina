import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LiveEvents } from '../../../events/application/live-events';
import { AlertSound } from '../../application/alert-sound';
import { alertMessage, worstAlert } from '../../application/budget-alerts';
import { INITIAL_BUDGETS, WatchBudgets } from '../../application/watch-budgets';
import { STATE_LABELS } from '../../models/budget';

const RANK = { within: 0, near: 1, exceeded: 2 } as const;

/**
 * Aviso de la cabecera de todas las pantallas: el peor Presupuesto activo Cerca o Superado,
 * sin excepción vigente, con su sonido al llegar una transición (AC-83).
 */
@Component({
  selector: 'app-budget-alert',
  imports: [RouterLink],
  templateUrl: './budget-alert.html',
  styleUrl: './budget-alert.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetAlert {
  private readonly sound = inject(AlertSound);
  private readonly state = toSignal(inject(WatchBudgets).state$, { initialValue: INITIAL_BUDGETS });

  protected readonly worst = computed(() => worstAlert(this.state().items));
  protected readonly message = computed(() => {
    const worst = this.worst();
    return worst ? alertMessage(worst) : '';
  });
  protected readonly stateLabel = computed(() => STATE_LABELS[this.worst()?.subject.state ?? 'near']);
  protected readonly muted = this.sound.muted;

  constructor() {
    // Solo suena lo que llega en vivo y empeora: nunca al cargar la página ni por lo que ya estaba así.
    inject(LiveEvents)
      .budgetChanges$.pipe(takeUntilDestroyed())
      .subscribe((change) => {
        if (change.state !== 'within' && RANK[change.state] > RANK[change.previousState]) this.sound.play(change.state);
      });
  }

  protected onMute(event: Event): void {
    this.sound.setMuted((event.target as HTMLInputElement).checked);
  }
}
