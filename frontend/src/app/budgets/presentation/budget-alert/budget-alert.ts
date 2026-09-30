import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LiveEvents } from '../../../events/application/live-events';
import { formatCost } from '../../../shared/format';
import { AlertSound } from '../../application/alert-sound';
import { alertMessage, allowTargetOf, raiseProposal, worstAlert } from '../../application/budget-alerts';
import { ManageBudgets } from '../../application/manage-budgets';
import { INITIAL_BUDGETS, WatchBudgets } from '../../application/watch-budgets';
import { AllowanceTarget, STATE_LABELS } from '../../models/budget';
import { parseAmount } from '../budget-form';

const RANK = { within: 0, near: 1, exceeded: 2 } as const;

/** Cuánto se mantiene la confirmación de una acción antes de retirarse sola. */
export const CONFIRMATION_MS = 6000;

export interface AlertNotice {
  kind: 'ok' | 'error';
  text: string;
}

/**
 * Aviso de la cabecera de todas las pantallas: el peor Presupuesto activo Cerca o Superado,
 * sin excepción vigente, con su sonido al llegar una transición (AC-83) y las acciones
 * "Ampliar límite" y "Permitir" sobre él, que reutilizan los casos de uso de Presupuestos (AC-124).
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
  private readonly manage = inject(ManageBudgets);
  private readonly state = toSignal(inject(WatchBudgets).state$, { initialValue: INITIAL_BUDGETS });
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly worst = computed(() => worstAlert(this.state().items));
  protected readonly message = computed(() => {
    const worst = this.worst();
    return worst ? alertMessage(worst) : '';
  });
  protected readonly stateLabel = computed(() => STATE_LABELS[this.worst()?.subject.state ?? 'near']);
  protected readonly muted = this.sound.muted;

  /** A quién dejaría seguir "Permitir"; `null` si no procede desde el aviso. */
  protected readonly allowTarget = computed((): AllowanceTarget | null => {
    const worst = this.worst();
    return worst ? allowTargetOf(worst) : null;
  });
  protected readonly allowLabel = computed(() => {
    const target = this.allowTarget();
    return target && 'sessionId' in target ? 'Permitir esta Sesión' : 'Permitir este Proyecto hoy';
  });

  /** Ampliación en curso: el límite propuesto, editable. `null` con el formulario cerrado. */
  protected readonly raising = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** Última acción: vive fuera del aviso, que desaparece en cuanto el Presupuesto deja de estar Cerca o Superado. */
  protected readonly notice = signal<AlertNotice | null>(null);
  protected readonly raiseError = computed(() => {
    const value = parseAmount(this.raising() ?? '');
    return value === null || value <= 0 ? 'El límite debe ser un número mayor que 0' : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.noticeTimer));
    // Solo suena lo que llega en vivo y empeora: nunca al cargar la página ni por lo que ya estaba así.
    inject(LiveEvents)
      .budgetChanges$.pipe(takeUntilDestroyed())
      .subscribe((change) => {
        if (change.state !== 'within' && RANK[change.state] > RANK[change.previousState]) this.sound.play(change.state);
      });
  }

  protected startRaise(): void {
    const worst = this.worst();
    if (worst) this.raising.set(String(raiseProposal(worst.budget, worst.subject)));
  }

  protected cancelRaise(): void {
    this.raising.set(null);
  }

  protected applyRaise(): void {
    const worst = this.worst();
    const value = parseAmount(this.raising() ?? '');
    if (!worst || value === null || value <= 0) return;
    this.raising.set(null);
    this.perform(this.manage.raiseLimit(worst.budget, value), `Límite ampliado a ${formatCost(value)}`);
  }

  protected allow(): void {
    const worst = this.worst();
    const target = this.allowTarget();
    if (!worst || !target) return;
    const done = 'sessionId' in target ? 'Excepción creada: la Sesión puede seguir' : `Excepción creada: ${target.project} puede seguir hoy`;
    this.perform(this.manage.allow(worst.budget, target), done);
  }

  protected dismissNotice(): void {
    clearTimeout(this.noticeTimer);
    this.notice.set(null);
  }

  protected onMute(event: Event): void {
    this.sound.setMuted((event.target as HTMLInputElement).checked);
  }

  private perform(outcome$: ReturnType<ManageBudgets['allow']>, confirmation: string): void {
    this.busy.set(true);
    outcome$.subscribe((outcome) => {
      this.busy.set(false);
      this.showNotice(outcome.ok ? { kind: 'ok', text: confirmation } : { kind: 'error', text: outcome.message });
    });
  }

  private showNotice(notice: AlertNotice): void {
    clearTimeout(this.noticeTimer);
    this.notice.set(notice);
    // Un error se queda hasta que se cierre; la confirmación se retira sola.
    if (notice.kind === 'ok') this.noticeTimer = setTimeout(() => this.notice.set(null), CONFIRMATION_MS);
  }
}
