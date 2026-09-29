import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { map, switchMap, timer } from 'rxjs';
import { formatInteger, relativeTime } from '../../../shared/format';
import { RANGES } from '../../../shared/periods';
import { SelectFilter } from '../../../shared/ui/select-filter/select-filter';
import { ToggleGroup } from '../../../shared/ui/toggle-group/toggle-group';
import { INITIAL_MCP, WatchMcpInvocations } from '../../application/watch-mcp-invocations';
import { McpQuery, McpServerUsage } from '../../models/mcp';
import { formatBytes, formatLatency, formatRate } from '../mcp-labels';

export const ALL_PROJECTS = 'Todos los Proyectos';
export const ALL_SERVERS = 'Todos los servidores';
/** El uso de MCP es esporádico: con 24 h la pantalla suele salir vacía. */
export const DEFAULT_MCP_RANGE = '7d';

/** Pantalla de uso, fallos y latencia de cada Servidor MCP (AC-44). */
@Component({
  selector: 'app-mcp-page',
  imports: [RouterLink, SelectFilter, ToggleGroup],
  templateUrl: './mcp-page.html',
  styleUrl: './mcp-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McpPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly watch = inject(WatchMcpInvocations);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: convertToParamMap({}) });

  protected readonly range = computed(
    () => RANGES.find((r) => r.key === this.params().get('periodo')) ?? RANGES.find((r) => r.key === DEFAULT_MCP_RANGE)!,
  );
  protected readonly project = computed(() => this.params().get('proyecto'));
  protected readonly server = computed(() => this.params().get('servidor'));
  private readonly query = computed(
    (): McpQuery => ({ windowMs: this.range().ms, project: this.project() ?? undefined, server: this.server() ?? undefined }),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );
  protected readonly state = toSignal(toObservable(this.query).pipe(switchMap((q) => this.watch.execute(q))), {
    initialValue: INITIAL_MCP,
  });
  /** Refresca los "hace N min" sin esperar a una invocación nueva. */
  protected readonly now = toSignal(timer(0, 30_000).pipe(map(() => new Date())), { initialValue: new Date() });

  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly rangeLabels = RANGES.map((r) => r.label);
  protected readonly rangeIndex = computed(() => RANGES.findIndex((r) => r.key === this.range().key));
  protected readonly allProjects = ALL_PROJECTS;
  protected readonly allServers = ALL_SERVERS;
  protected readonly formatBytes = formatBytes;
  protected readonly formatLatency = formatLatency;
  protected readonly formatRate = formatRate;
  protected readonly formatInteger = formatInteger;
  protected readonly relativeTime = relativeTime;

  protected isExpanded(server: McpServerUsage): boolean {
    return this.expanded().has(server.server);
  }

  protected toggle(server: McpServerUsage): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(server.server)) next.add(server.server);
      return next;
    });
  }

  protected onRangeChange(index: number): void {
    const key = RANGES[index]?.key ?? DEFAULT_MCP_RANGE;
    this.navigate({ periodo: key === DEFAULT_MCP_RANGE ? null : key });
  }

  protected selectProject(project: string | null): void {
    this.navigate({ proyecto: project });
  }

  protected selectServer(server: string | null): void {
    this.navigate({ servidor: server });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
