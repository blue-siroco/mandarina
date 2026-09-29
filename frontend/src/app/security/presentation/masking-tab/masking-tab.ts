import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { formatInteger } from '../../../shared/format';
import { INITIAL_MASKING, WatchMaskingStats } from '../../application/watch-masking-stats';
import { MARKER_TYPES } from '../../models/security';
import { MARKER_LABELS } from '../security-labels';

/** Pestaña Enmascarado: cuántos marcadores hay guardados por Proyecto y tipo (AC-67). */
@Component({
  selector: 'app-masking-tab',
  templateUrl: './masking-tab.html',
  styleUrl: './masking-tab.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaskingTab {
  /** Periodo en milisegundos; sin él, todo el histórico. */
  readonly windowMs = input<number | undefined>(undefined);

  private readonly watch = inject(WatchMaskingStats);

  protected readonly state = toSignal(toObservable(this.windowMs).pipe(switchMap((windowMs) => this.watch.execute(windowMs))), {
    initialValue: INITIAL_MASKING,
  });
  protected readonly columns = MARKER_TYPES.map((type) => ({ type, label: MARKER_LABELS[type] }));
  protected readonly grandTotal = computed(() => this.state().stats?.items.reduce((sum, item) => sum + item.total, 0) ?? 0);
  protected readonly formatInteger = formatInteger;
}
