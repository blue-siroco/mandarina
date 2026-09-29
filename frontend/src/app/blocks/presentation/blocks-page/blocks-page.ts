import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { map, timer } from 'rxjs';
import { summarizeToolInput } from '../../../shared/tool-summary';
import { formatInteger, plural, shortId } from '../../../shared/format';
import { SelectFilter } from '../../../shared/ui/select-filter/select-filter';
import { blockStats, ruleColor } from '../../application/block-stats';
import { INITIAL_BLOCKS, WatchBlocks } from '../../application/watch-blocks';

export const ALL_RULES = 'Todas las Reglas';

/** Pantalla de Bloqueos (AC-22). */
@Component({
  selector: 'app-blocks-page',
  imports: [DatePipe, RouterLink, SelectFilter],
  templateUrl: './blocks-page.html',
  styleUrl: './blocks-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlocksPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: convertToParamMap({}) });

  protected readonly state = toSignal(inject(WatchBlocks).execute(), { initialValue: INITIAL_BLOCKS });
  /** Cambia el día de "hoy" a medianoche sin recargar la página. */
  private readonly now = toSignal(timer(0, 60_000).pipe(map(() => new Date())), { initialValue: new Date() });

  protected readonly stats = computed(() => blockStats(this.state().blocks, this.now()));
  protected readonly rule = computed(() => this.params().get('regla'));
  protected readonly rows = computed(() => {
    const rule = this.rule();
    return this.state()
      .blocks.filter((b) => b.block && (rule === null || b.block.rule === rule))
      .map((b) => ({
        id: b.id,
        occurredAt: b.occurredAt,
        project: b.project,
        sessionId: b.sessionId,
        toolName: b.toolName,
        summary: summarizeToolInput(b.toolName, b.payload),
        rule: b.block!.rule,
        reason: b.block!.reason,
      }));
  });
  protected readonly maxDay = computed(() => Math.max(1, ...this.stats().days.map((d) => d.total)));
  protected readonly allRules = ALL_RULES;

  protected readonly ruleColor = ruleColor;
  protected readonly shortId = shortId;
  protected readonly formatInteger = formatInteger;
  protected readonly plural = plural;

  protected selectRule(rule: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { regla: rule },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
