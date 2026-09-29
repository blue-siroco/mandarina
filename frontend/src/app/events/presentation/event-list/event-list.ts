import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { formatInteger } from '../../../shared/format';
import { CheckFilter } from '../../../shared/ui/check-filter/check-filter';
import { ToggleGroup } from '../../../shared/ui/toggle-group/toggle-group';
import { INITIAL_STATE, WatchRecentEvents } from '../../application/watch-recent-events';
import { ObservedEvent } from '../../models/observed-event';
import { EVENT_CATEGORIES, EventCategory, inCategory } from '../event-labels';
import { EventRows } from '../event-rows/event-rows';

export { EVENT_TYPE_LABELS } from '../event-labels';

export const HOOK_SETUP_EXAMPLE = `"hooks": {
  "PreToolUse": [{ "hooks": [{ "type": "command",
    "command": "node <ruta>/adapters/claude-code/send_event.mjs" }] }]
}`;

/** Herramientas que se ofrecen como filtro (§5.5): las más frecuentes. */
export const TOP_TOOLS = 10;

export function topTools(events: ObservedEvent[], limit = TOP_TOOLS): string[] {
  const counts = new Map<string, number>();
  for (const e of events) if (e.toolName) counts.set(e.toolName, (counts.get(e.toolName) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}

function parseCategory(value: string | null): EventCategory {
  return EVENT_CATEGORIES.find((c) => c.key === value)?.key ?? 'all';
}

/** Página de Eventos con filtros en la URL (AC-09, AC-17). */
@Component({
  selector: 'app-event-list',
  imports: [CheckFilter, EventRows, ToggleGroup],
  templateUrl: './event-list.html',
  styleUrl: './event-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventList {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: convertToParamMap({}) });

  protected readonly state = toSignal(inject(WatchRecentEvents).execute(), { initialValue: INITIAL_STATE });
  protected readonly hookSetupExample = HOOK_SETUP_EXAMPLE;
  protected readonly skeletonRows = [1, 2, 3, 4, 5, 6];
  protected readonly formatInteger = formatInteger;

  protected readonly category = computed(() => parseCategory(this.params().get('categoria')));
  protected readonly selectedTools = computed(() => this.params().getAll('herramienta'));
  protected readonly toolOptions = computed(() => {
    // Una herramienta elegida sigue visible aunque salga del top: si no, no se podría quitar.
    const top = topTools(this.state().events);
    return [...top, ...this.selectedTools().filter((t) => !top.includes(t))];
  });
  protected readonly categoryLabels = EVENT_CATEGORIES.map((c) => c.label);
  protected readonly categoryIndex = computed(() => EVENT_CATEGORIES.findIndex((c) => c.key === this.category()));
  /** Los Subagentes internos del Harness son ruido salvo que se pidan (AC-36). */
  protected readonly showInternal = computed(() => this.params().get('internos') === '1');
  protected readonly filtered = computed(() => {
    const tools = this.selectedTools();
    const showInternal = this.showInternal();
    return this.state().events.filter(
      (e) =>
        (showInternal || !e.subagent?.internal) &&
        inCategory(e, this.category()) &&
        (tools.length === 0 || (e.toolName !== null && tools.includes(e.toolName))),
    );
  });
  protected readonly filtering = computed(() => this.category() !== 'all' || this.selectedTools().length > 0);

  protected onCategoryChange(index: number): void {
    const key = EVENT_CATEGORIES[index]?.key ?? 'all';
    this.navigate({ categoria: key === 'all' ? null : key });
  }

  protected toggleTool(tool: string): void {
    const current = this.selectedTools();
    const next = current.includes(tool) ? current.filter((t) => t !== tool) : [...current, tool];
    this.navigate({ herramienta: next.length > 0 ? next : null });
  }

  protected setShowInternal(show: boolean): void {
    this.navigate({ internos: show ? '1' : null });
  }

  protected clearFilters(): void {
    this.navigate({ categoria: null, herramienta: null });
  }

  private navigate(queryParams: Record<string, string | string[] | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
