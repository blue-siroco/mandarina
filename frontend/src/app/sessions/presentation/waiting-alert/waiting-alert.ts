import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AlertSound } from '../../../budgets/application/alert-sound';
import { plural } from '../../../shared/format';
import { INITIAL_WAITING, WatchWaitingSessions } from '../../application/watch-waiting-sessions';
import { WaitingBadge } from '../waiting-badge/waiting-badge';

/**
 * Aviso de la cabecera de todas las pantallas: cuántas Sesiones esperan y un enlace a la que más
 * tiempo lleva (AC-95). Es el único suscriptor de `state$`: suscribirse activa título, favicon y sonido.
 */
@Component({
  selector: 'app-waiting-alert',
  imports: [RouterLink, WaitingBadge],
  templateUrl: './waiting-alert.html',
  styleUrl: './waiting-alert.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaitingAlert {
  private readonly sound = inject(AlertSound);
  private readonly state = toSignal(inject(WatchWaitingSessions).state$, {
    initialValue: INITIAL_WAITING,
  });

  protected readonly count = computed(() => this.state().count);
  protected readonly oldest = computed(() => this.state().oldest);
  protected readonly countLabel = computed(
    () => `${plural(this.count(), 'Sesión', 'Sesiones')} esperando`,
  );
  protected readonly muted = this.sound.muted;

  protected onMute(event: Event): void {
    this.sound.setMuted((event.target as HTMLInputElement).checked);
  }
}
