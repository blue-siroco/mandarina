import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDuration, plural, relativeTime, shortId, tailPath } from '../../../shared/format';
import { toolLabel } from '../../../shared/tool-summary';
import { ModelBadge } from '../../../shared/ui/model-badge/model-badge';
import { StateDot } from '../../../shared/ui/state-dot/state-dot';
import { SessionSummary } from '../../models/session';
import { Sparkline } from '../sparkline/sparkline';

/** Motivo del Estado para el tooltip del punto (design §5.6). */
export function stateReason(session: SessionSummary, now: Date): string {
  const since = relativeTime(session.lastActivityAt, now);
  switch (session.state) {
    case 'active':
      return session.activity === 'working' ? `Turno en curso; última actividad ${since}` : `Última actividad ${since}`;
    case 'idle':
      return `Sin actividad ${since.replace('hace', 'desde hace')}`;
    case 'orphaned':
      return `Sin actividad ${since.replace('hace', 'desde hace')} y sin session.ended`;
    case 'closed':
      return `Cerrada ${since}`;
  }
}

/** Tarjeta de Sesión del board (spec/design.md §6.1). */
@Component({
  selector: 'app-session-card',
  imports: [RouterLink, StateDot, ModelBadge, Sparkline],
  templateUrl: './session-card.html',
  styleUrl: './session-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-state]': 'session().state' },
})
export class SessionCard {
  readonly session = input.required<SessionSummary>();
  readonly now = input.required<Date>();
  readonly directorySelected = output<string>();

  protected readonly shortId = computed(() => shortId(this.session().sessionId));
  protected readonly toolLabel = toolLabel;
  protected readonly directoryLabel = computed(() => tailPath(this.session().directory));
  protected readonly lastSeen = computed(() => relativeTime(this.session().lastActivityAt, this.now()));
  protected readonly reason = computed(() => stateReason(this.session(), this.now()));
  protected readonly durations = computed(() => ({
    active: formatDuration(this.session().activeDurationMs),
    clock: formatDuration(this.session().clockDurationMs),
  }));
  protected readonly subagents = computed(() => {
    const { subagentCount, runningSubagents } = this.session();
    const total = plural(subagentCount, 'Subagente', 'Subagentes');
    return runningSubagents > 0 ? `${total} (${runningSubagents} en marcha)` : total;
  });
  protected readonly blocks = computed(() => plural(this.session().blockCount, 'Bloqueo', 'Bloqueos'));
  protected readonly scoreLabel = computed(() =>
    this.session().evaluationScore === 1 ? 'Sesión bien puntuada' : 'Sesión mal puntuada',
  );
  protected readonly alertsLabel = computed(() => plural(this.session().injectionAlerts, 'aviso de inyección', 'avisos de inyección'));
  protected readonly working = computed(() => this.session().activity === 'working');
}
