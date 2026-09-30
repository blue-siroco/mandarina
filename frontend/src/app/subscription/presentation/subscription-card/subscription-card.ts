import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { INITIAL_SUBSCRIPTION_STATE, WatchSubscriptionUsage } from '../../application/watch-subscription-usage';
import { UsageWindow, UsageWindowStatus } from '../../models/subscription-usage';
import { RESET_PENDING_TEXT, STATUS_LABELS, effectiveStatus, resetLabel } from '../subscription-format';

/** La cuenta atrás del reinicio se refresca con este periodo. */
export const SUBSCRIPTION_TICK_MS = 30_000;

/** Explica el dato y por qué a veces no está: sin ella la ausencia parecería un fallo (AC-139). */
export const HELP_TEXT =
  'Dato de la cuenta, compartido entre todas las Sesiones. Solo aparece con una suscripción de Claude (Pro o Max): con API key, Bedrock o Vertex Claude Code no lo envía.';

/**
 * Sin suscripción y con suscripción sin la `statusLine` del Adaptador llegan los mismos datos
 * (`null`), así que la explicación cubre los dos casos (AC-140).
 */
export const EMPTY_HELP = [
  'Con API key, Bedrock o Vertex no hay cuota que mostrar: es normal.',
  'Con una suscripción Pro o Max, registra statusline.mjs del Adaptador como statusLine (ver el README del Adaptador) y espera a la primera respuesta de una Sesión.',
];

interface Meter {
  key: 'five-hour' | 'seven-day';
  title: string;
  window: UsageWindow;
  status: UsageWindowStatus;
  statusLabel: string;
  reset: string;
  resetPendingText: string;
}

/**
 * Ficha del board con lo consumido de la cuota de la suscripción, en dos medidores (AC-137, AC-138).
 * Sin suscripción no se pinta nada. Vive en la rejilla de fichas (`display: contents`).
 */
@Component({
  selector: 'app-subscription-card',
  templateUrl: './subscription-card.html',
  styleUrl: './subscription-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionCard {
  protected readonly helpText = HELP_TEXT;
  protected readonly emptyHelp = EMPTY_HELP;
  protected readonly state = toSignal(inject(WatchSubscriptionUsage).state$, { initialValue: INITIAL_SUBSCRIPTION_STATE });
  private readonly now = signal(new Date());

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), SUBSCRIPTION_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** Una ventana ausente no se pinta; sin ninguna, tampoco la ficha. */
  protected readonly meters = computed((): Meter[] => {
    const usage = this.state().usage;
    if (!usage) return [];
    const now = this.now();
    const meter = (key: Meter['key'], title: string, window: UsageWindow | null): Meter[] => {
      if (!window) return [];
      const status = effectiveStatus(window, now);
      return [
        {
          key,
          title,
          window,
          status,
          statusLabel: status === 'reset_pending' ? '' : STATUS_LABELS[status],
          reset: resetLabel(window.resetsAt, now),
          resetPendingText: RESET_PENDING_TEXT,
        },
      ];
    };
    return [...meter('five-hour', 'Sesión (5 h)', usage.fiveHour), ...meter('seven-day', 'Semanal (7 d)', usage.sevenDay)];
  });

  /** Solo tras la primera respuesta, para no parpadear; un fallo de red no cuenta como "sin datos". */
  protected readonly showEmpty = computed(() => {
    const { loaded, failed } = this.state();
    return loaded && !failed && this.meters().length === 0;
  });
}
