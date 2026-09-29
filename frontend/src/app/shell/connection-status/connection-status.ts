import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { LiveEvents } from '../../events/application/live-events';
import { LiveConnection } from '../../events/models/observed-event';

export const CONNECTION_LABELS: Record<LiveConnection, string> = {
  connecting: 'Conectando…',
  live: 'En vivo',
  offline: 'Sin conexión, reintentando…',
};

/** Indicador de conexión del WebSocket en el pie de la barra lateral (spec/design.md §4.1). */
@Component({
  selector: 'app-connection-status',
  template: `
    <span class="connection" [attr.data-connection]="connection()" role="status" aria-live="polite">
      <span class="connection__dot" aria-hidden="true"></span>
      <span class="connection__label">{{ labels[connection()] }}</span>
    </span>
  `,
  styleUrl: './connection-status.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionStatus {
  protected readonly connection = toSignal(inject(LiveEvents).connection$, { initialValue: 'connecting' as const });
  protected readonly labels = CONNECTION_LABELS;
}
