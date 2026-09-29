import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { RANGES } from '../../../shared/periods';
import { ToggleGroup } from '../../../shared/ui/toggle-group/toggle-group';
import { InjectionWarningsTab } from '../injection-warnings-tab/injection-warnings-tab';
import { MaskingTab } from '../masking-tab/masking-tab';

export const TABS = [
  { key: 'avisos', label: 'Avisos de inyección' },
  { key: 'enmascarado', label: 'Enmascarado' },
] as const;
export type TabKey = (typeof TABS)[number]['key'];

/** Los avisos y los marcadores son esporádicos: por defecto, la última semana (AC-66, AC-67). */
export const DEFAULT_RANGE = '7d';

/** Pantalla Seguridad: Avisos de inyección y Enmascarado, con un mismo periodo (AC-66, AC-67). */
@Component({
  selector: 'app-security-page',
  imports: [ToggleGroup, InjectionWarningsTab, MaskingTab],
  templateUrl: './security-page.html',
  styleUrl: './security-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: convertToParamMap({}) });

  protected readonly tab = computed<TabKey>(() => TABS.find((t) => t.key === this.params().get('pestana'))?.key ?? 'avisos');
  protected readonly range = computed(() => RANGES.find((r) => r.key === this.params().get('periodo')) ?? RANGES.find((r) => r.key === DEFAULT_RANGE)!);

  protected readonly tabLabels = TABS.map((t) => t.label);
  protected readonly tabIndex = computed(() => TABS.findIndex((t) => t.key === this.tab()));
  protected readonly rangeLabels = RANGES.map((r) => r.label);
  protected readonly rangeIndex = computed(() => RANGES.findIndex((r) => r.key === this.range().key));

  protected onTabChange(index: number): void {
    const key = TABS[index]?.key ?? 'avisos';
    // Los filtros de una pestaña no significan nada en la otra.
    this.navigate({
      pestana: key === 'avisos' ? null : key,
      severidad: null,
      patron: null,
      proyecto: null,
      descartados: null,
      sesion: null,
    });
  }

  protected onRangeChange(index: number): void {
    const key = RANGES[index]?.key ?? DEFAULT_RANGE;
    this.navigate({ periodo: key === DEFAULT_RANGE ? null : key });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
