import { DatePipe } from '@angular/common';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import '@lucia/info';
import { map, switchMap, timer } from 'rxjs';
import { DownloadDialog } from '../../../downloads/presentation/download-dialog/download-dialog';
import { EventRows } from '../../../events/presentation/event-rows/event-rows';
import {
  formatCompact,
  formatCost,
  formatDuration,
  formatInteger,
  formatPercent,
  plural,
  shortId,
  tailPath,
} from '../../../shared/format';
import { toolLabel } from '../../../shared/tool-summary';
import { ToggleGroup } from '../../../shared/ui/toggle-group/toggle-group';
import { ModelBadge } from '../../../shared/ui/model-badge/model-badge';
import { StateDot } from '../../../shared/ui/state-dot/state-dot';
import {
  EvaluationsOfSession,
  INITIAL_SESSION_EVALUATIONS,
} from '../../../evaluations/application/evaluations-of-session';
import {
  Evaluation,
  EvaluationObjectType,
  evaluationKey,
} from '../../../evaluations/models/evaluation';
import { EvaluationControls } from '../../../evaluations/presentation/evaluation-controls/evaluation-controls';
import {
  INITIAL_SKILL_INVOCATIONS,
  WatchSkillInvocations,
} from '../../../skills/application/watch-skill-invocations';
import { SessionSkills } from '../../../skills/presentation/session-skills/session-skills';
import { INITIAL_MCP, WatchMcpInvocations } from '../../../mcp/application/watch-mcp-invocations';
import { SessionMcp } from '../../../mcp/presentation/session-mcp/session-mcp';
import { INITIAL_DETAIL, WatchSessionDetail } from '../../application/watch-session-detail';
import { CacheEfficiency } from '../../../usage/models/usage-metrics';
import { CacheRewriteCause, SessionDetail } from '../../models/session';
import { ActivityLanes } from '../activity-lanes/activity-lanes';
import { ContextCard, TRANSCRIPT_UNAVAILABLE } from '../context-card/context-card';
import { stateReason } from '../session-card/session-card';
import { SubagentList } from '../subagent-list/subagent-list';
import { WaitingBadge } from '../waiting-badge/waiting-badge';
import { ToolBars } from '../tool-bars/tool-bars';

export const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'linea', label: 'Línea de tiempo' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'subagentes', label: 'Subagentes' },
  { key: 'skills', label: 'Skills' },
  { key: 'mcp', label: 'MCP' },
  { key: 'bloqueos', label: 'Bloqueos' },
] as const;
export type TabKey = (typeof TABS)[number]['key'];

export interface TokenCard {
  key: string;
  label: string;
  value: string;
  detail: string;
  accent?: 'ok' | 'brand';
}

/** Causa de una Reescritura de caché, en texto (AC-75). */
export const REWRITE_CAUSE_LABELS: Record<CacheRewriteCause, string> = {
  expired: 'Caducada',
  model_change: 'Cambio de modelo',
  compaction: 'Compactación',
  other: 'Otra',
};

/** Detalle de la ficha Caché: el ahorro neto o, si es negativo, el sobrecoste dicho con esa palabra (AC-75). */
function cacheDetail(cache: CacheEfficiency): string {
  const money = formatCost(Math.abs(cache.savingsNetUsd));
  return cache.savingsNetUsd < 0 ? `Sobrecoste ${money}` : `Ahorro ${money}`;
}

/**
 * Fichas de tokens del detalle (design §6.3): entrada, salida, caché, peticiones y coste.
 * Con `cache` (AC-72) la ficha Caché da la tasa de acierto y el ahorro neto; sin él, el % leído.
 */
export function tokenCards(
  usage: NonNullable<SessionDetail['usage']>,
  cache: CacheEfficiency | null = null,
): TokenCard[] {
  const { tokens } = usage;
  const input = tokens.input + tokens.cacheRead + tokens.cacheCreation;
  // Con la eficiencia del servidor manda su tasa; sin ella, el % leído de los tokens de la Sesión.
  const readShare = input > 0 ? tokens.cacheRead / input : null;
  const cacheRate = cache ? cache.hitRate : readShare;
  return [
    {
      key: 'input',
      label: 'Entrada',
      value: formatCompact(input),
      detail: `${formatCompact(tokens.cacheCreation)} escritos en caché`,
    },
    {
      key: 'output',
      label: 'Salida',
      value: formatCompact(tokens.output),
      detail: usage.models.join(', '),
    },
    {
      key: 'cache',
      label: 'Caché',
      value: cacheRate === null ? '—' : formatPercent(cacheRate),
      detail: cache ? cacheDetail(cache) : `${formatCompact(tokens.cacheRead)} tokens leídos`,
      accent: cache && cache.savingsNetUsd < 0 ? undefined : 'ok',
    },
    {
      key: 'requests',
      label: 'Peticiones',
      value: formatInteger(usage.requests),
      detail: 'Respuestas del modelo',
    },
    {
      key: 'cost',
      label: 'Coste estimado',
      value: usage.estimatedCostUsd === null ? '—' : formatCost(usage.estimatedCostUsd),
      detail:
        usage.estimatedCostUsd === null
          ? 'Algún modelo no tiene Tarifa'
          : 'Según las Tarifas públicas',
      accent: 'brand',
    },
  ];
}

/** Detalle de Sesión (AC-19). */
@Component({
  selector: 'app-session-detail',
  imports: [
    WaitingBadge,
    DatePipe,
    RouterLink,
    EventRows,
    StateDot,
    ModelBadge,
    ActivityLanes,
    ContextCard,
    ToolBars,
    ToggleGroup,
    SubagentList,
    SessionSkills,
    SessionMcp,
    EvaluationControls,
    DownloadDialog,
  ],
  templateUrl: './session-detail.html',
  styleUrl: './session-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SessionDetailPage {
  /** Parámetro `:id` de la ruta (`withComponentInputBinding`). */
  readonly id = input.required<string>();

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly watch = inject(WatchSessionDetail);
  private readonly watchSkills = inject(WatchSkillInvocations);
  private readonly watchMcp = inject(WatchMcpInvocations);
  private readonly evaluationsOfSession = inject(EvaluationsOfSession);
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: convertToParamMap({}),
  });

  protected readonly state = toSignal(
    toObservable(this.id).pipe(switchMap((id) => this.watch.execute(id))),
    {
      initialValue: INITIAL_DETAIL,
    },
  );
  protected readonly skills = toSignal(
    toObservable(this.id).pipe(switchMap((sessionId) => this.watchSkills.execute({ sessionId }))),
    { initialValue: INITIAL_SKILL_INVOCATIONS },
  );
  protected readonly mcp = toSignal(
    toObservable(this.id).pipe(switchMap((sessionId) => this.watchMcp.execute({ sessionId }))),
    {
      initialValue: INITIAL_MCP,
    },
  );
  /** Evaluaciones de la Sesión, de sus Turnos y de sus Subagentes; se cargan una vez (AC-57). */
  protected readonly evaluations = toSignal(
    toObservable(this.id).pipe(
      switchMap((sessionId) => this.evaluationsOfSession.execute(sessionId)),
    ),
    { initialValue: INITIAL_SESSION_EVALUATIONS },
  );
  protected readonly now = toSignal(timer(0, 5000).pipe(map(() => new Date())), {
    initialValue: new Date(),
  });

  protected readonly tab = computed<TabKey>(
    () => TABS.find((t) => t.key === this.params().get('pestana'))?.key ?? 'resumen',
  );
  protected readonly tabLabels = computed(() => {
    const counts: Partial<Record<TabKey, number>> = {
      skills: this.skills().invocations.length,
      mcp: this.mcp().invocations.length,
      bloqueos: this.state().detail?.blockCount ?? 0,
    };
    return TABS.map((t) => (counts[t.key] ? `${t.label} (${counts[t.key]})` : t.label));
  });
  /** Subagente desplegado al llegar desde la pantalla Subagentes (AC-36). */
  protected readonly expandedSubagent = computed(() => this.params().get('subagente'));
  /** Turno resaltado en la Línea de tiempo al llegar desde una Invocación de skill (AC-31). */
  protected readonly selectedTurn = computed(() => Number(this.params().get('turno')) || null);
  protected readonly rewriteCauses = REWRITE_CAUSE_LABELS;
  protected readonly tabIndex = computed(() => TABS.findIndex((t) => t.key === this.tab()));

  protected readonly shortId = computed(() => shortId(this.id()));
  protected readonly directory = computed(() => tailPath(this.state().detail?.directory ?? ''));
  protected readonly reason = computed(() => {
    const detail = this.state().detail;
    return detail ? stateReason(detail, this.now()) : null;
  });
  protected readonly durations = computed(() => {
    const detail = this.state().detail;
    return detail
      ? {
          active: formatDuration(detail.activeDurationMs),
          clock: formatDuration(detail.clockDurationMs),
        }
      : null;
  });
  protected readonly tokenCards = computed(() => {
    const detail = this.state().detail;
    return detail?.usage ? tokenCards(detail.usage, detail.cache) : [];
  });
  /** Una Sesión viva se pinta hasta "ahora"; una terminada, hasta su último Evento. */
  protected readonly lanesEnd = computed(() => {
    const detail = this.state().detail;
    if (!detail) return this.now();
    const live = detail.state === 'active' || detail.state === 'idle';
    return live ? this.now() : detail.lastEventAt;
  });

  protected readonly copied = signal(false);
  protected readonly downloadOpen = signal(false);
  protected readonly transcriptUnavailable = TRANSCRIPT_UNAVAILABLE;
  protected readonly formatDuration = formatDuration;
  protected readonly formatCompact = formatCompact;
  protected readonly formatCost = formatCost;
  protected readonly plural = plural;
  protected readonly short = shortId;
  protected readonly toolLabel = toolLabel;

  protected onTabChange(index: number): void {
    const key = TABS[index]?.key ?? 'resumen';
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pestana: key === 'resumen' ? null : key, turno: null, subagente: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** `undefined` mientras se cargan las Evaluaciones; `null` si el objeto no tiene (AC-57). */
  protected evaluationOf(type: EvaluationObjectType, id: string): Evaluation | null | undefined {
    const loaded = this.evaluations();
    return loaded.loaded ? (loaded.byKey.get(evaluationKey(type, id)) ?? null) : undefined;
  }

  protected closeDownload(): void {
    this.downloadOpen.set(false);
  }

  protected async copyId(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.id());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Sin permiso de portapapeles el id sigue visible en el `title`.
    }
  }
}
