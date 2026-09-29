import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { map, switchMap, timer } from 'rxjs';
import { relativeTime, shortId } from '../../../shared/format';
import { SelectFilter } from '../../../shared/ui/select-filter/select-filter';
import { ToggleGroup } from '../../../shared/ui/toggle-group/toggle-group';
import { RANGES } from '../../../shared/periods';
import { INITIAL_SKILL_INVOCATIONS, WatchSkillInvocations } from '../../application/watch-skill-invocations';
import { SkillUsage } from '../../models/skill-invocation';
import { STATUS_LABELS, invokerLabel } from '../skill-labels';

export const ALL_PROJECTS = 'Todos los Proyectos';
/** Las skills se cargan menos que se lanzan herramientas: 7 días dan más contexto que las 24 h del board. */
export const DEFAULT_SKILLS_RANGE = '7d';

const usageKey = (usage: Pick<SkillUsage, 'project' | 'skill'>) => `${usage.project}\u0000${usage.skill}`;

/** Pantalla de uso de skills por Proyecto (AC-32). */
@Component({
  selector: 'app-skills-page',
  imports: [DatePipe, RouterLink, SelectFilter, ToggleGroup],
  templateUrl: './skills-page.html',
  styleUrl: './skills-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkillsPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly watch = inject(WatchSkillInvocations);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: convertToParamMap({}) });

  protected readonly range = computed(
    () => RANGES.find((r) => r.key === this.params().get('periodo')) ?? RANGES.find((r) => r.key === DEFAULT_SKILLS_RANGE)!,
  );
  protected readonly state = toSignal(
    toObservable(computed(() => this.range().ms)).pipe(switchMap((windowMs) => this.watch.execute({ windowMs }))),
    { initialValue: INITIAL_SKILL_INVOCATIONS },
  );
  /** Refresca los "hace N min" sin esperar a una invocación nueva. */
  protected readonly now = toSignal(timer(0, 30_000).pipe(map(() => new Date())), { initialValue: new Date() });

  protected readonly project = computed(() => this.params().get('proyecto'));
  protected readonly stats = computed(() => {
    const project = this.project();
    return this.state().stats.filter((s) => project === null || s.project === project);
  });

  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly rangeLabels = RANGES.map((r) => r.label);
  protected readonly rangeIndex = computed(() => RANGES.findIndex((r) => r.key === this.range().key));
  protected readonly allProjects = ALL_PROJECTS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly invokerLabel = invokerLabel;
  protected readonly relativeTime = relativeTime;
  protected readonly shortId = shortId;
  protected readonly key = usageKey;

  protected isExpanded(usage: SkillUsage): boolean {
    return this.expanded().has(usageKey(usage));
  }

  protected toggle(usage: SkillUsage): void {
    const key = usageKey(usage);
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  protected invocationsOf(usage: SkillUsage) {
    return this.state().invocations.filter((i) => i.project === usage.project && i.skill === usage.skill);
  }

  protected onRangeChange(index: number): void {
    const key = RANGES[index]?.key ?? DEFAULT_SKILLS_RANGE;
    this.navigate({ periodo: key === DEFAULT_SKILLS_RANGE ? null : key });
  }

  protected selectProject(project: string | null): void {
    this.navigate({ proyecto: project });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
