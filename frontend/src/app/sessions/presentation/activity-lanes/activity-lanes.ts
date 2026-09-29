import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ObservedEvent } from '../../../events/models/observed-event';
import { SessionSubagent, SessionTurn } from '../../models/session';
import { buildLanes } from './lanes';

/** Carriles de actividad de una Sesión (spec/design.md §5.9). */
@Component({
  selector: 'app-activity-lanes',
  templateUrl: './activity-lanes.html',
  styleUrl: './activity-lanes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityLanes {
  readonly events = input.required<ObservedEvent[]>();
  readonly turns = input.required<SessionTurn[]>();
  readonly subagents = input.required<SessionSubagent[]>();
  /** Borde derecho: "ahora" en una Sesión viva, el último Evento en una terminada. */
  readonly end = input.required<Date>();
  readonly tall = input(false);

  protected readonly view = computed(() => buildLanes(this.events(), this.turns(), this.subagents(), this.end()));
  protected readonly label = computed(() => {
    const lanes = this.view().lanes;
    const marks = lanes.reduce((sum, lane) => sum + lane.marks.length + lane.bars.length, 0);
    return `Actividad: ${lanes.length} carriles, ${marks} marcas. La lista de Eventos tiene el mismo detalle.`;
  });
}
