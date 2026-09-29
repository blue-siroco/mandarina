import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, convertToParamMap } from '@angular/router';
import { switchMap } from 'rxjs';
import { formatCompact, formatCost, formatDuration, formatInteger, formatPercent, plural, shortId } from '../../../shared/format';
import { RANGES } from '../../../shared/periods';
import { toolLabel } from '../../../shared/tool-summary';
import { BarDatum, BarsChart } from '../../../shared/ui/bars-chart/bars-chart';
import { ModelBadge } from '../../../shared/ui/model-badge/model-badge';
import { INITIAL_PROFILE, WatchAgents } from '../../application/watch-agents';
import { NO_TYPE } from '../../infrastructure/http-agent-source';
import { AgentQuery } from '../../models/agent';
import { STATUS_LABELS, launchesByDay, typeLabel } from '../agent-labels';
import { DEFAULT_AGENTS_RANGE } from '../agents-page/agents-page';

/** Perfil de un Tipo de Subagente (AC-48). */
@Component({
  selector: 'app-agent-profile-page',
  imports: [BarsChart, DatePipe, ModelBadge, RouterLink],
  templateUrl: './agent-profile-page.html',
  styleUrl: './agent-profile-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentProfilePage {
  /** Parámetro `:tipo` de la ruta (`withComponentInputBinding`); `sin-tipo` son los Lanzamientos sin Tipo. */
  readonly tipo = input.required<string>();

  private readonly route = inject(ActivatedRoute);
  private readonly watch = inject(WatchAgents);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: convertToParamMap({}) });

  protected readonly type = computed(() => (this.tipo() === NO_TYPE ? null : this.tipo()));
  protected readonly range = computed(
    () => RANGES.find((r) => r.key === this.params().get('periodo')) ?? RANGES.find((r) => r.key === DEFAULT_AGENTS_RANGE)!,
  );
  private readonly request = computed(
    (): { type: string | null; query: AgentQuery } => ({
      type: this.type(),
      query: { windowMs: this.range().ms, project: this.params().get('proyecto') ?? undefined },
    }),
    { equal: (a, b) => a.type === b.type && a.query.windowMs === b.query.windowMs && a.query.project === b.query.project },
  );
  protected readonly state = toSignal(toObservable(this.request).pipe(switchMap(({ type, query }) => this.watch.profile(type, query))), {
    initialValue: INITIAL_PROFILE,
  });

  /** Lanzamientos por día local, para `@lucia/element-bars` (AC-48). */
  protected readonly perDay$ = toObservable(
    computed((): readonly BarDatum[] => launchesByDay(this.state().profile?.launches ?? [], new Date(), this.range().ms)),
  );

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly typeLabel = typeLabel;
  protected readonly toolLabel = toolLabel;
  protected readonly formatDuration = formatDuration;
  protected readonly formatCompact = formatCompact;
  protected readonly formatCost = formatCost;
  protected readonly formatInteger = formatInteger;
  protected readonly formatPercent = formatPercent;
  protected readonly abs = Math.abs;
  protected readonly plural = plural;
  protected readonly shortId = shortId;
}
