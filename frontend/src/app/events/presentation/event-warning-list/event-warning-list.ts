import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventWarning } from '../../models/observed-event';
import { SEVERITY_LABELS } from '../event-warning-badge/event-warning-badge';

/** Avisos de inyección de un Evento, en su detalle expandido, con enlace a la pantalla Seguridad (AC-68). */
@Component({
  selector: 'app-event-warning-list',
  imports: [RouterLink],
  templateUrl: './event-warning-list.html',
  styleUrl: './event-warning-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventWarningList {
  readonly warnings = input.required<readonly EventWarning[]>();
  readonly sessionId = input.required<string>();

  protected readonly labels = SEVERITY_LABELS;
}
