import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { SessionSource } from '../../../sessions/ports/session-source';
import { formatCost, formatPercent, plural, shortId } from '../../../shared/format';
import { AlertSound } from '../../application/alert-sound';
import { budgetLabel } from '../../application/budget-alerts';
import { BudgetOutcome, ManageBudgets } from '../../application/manage-budgets';
import { INITIAL_BUDGETS, WatchBudgets } from '../../application/watch-budgets';
import {
  ACTION_LABELS,
  AllowanceTarget,
  Budget,
  BudgetAction,
  BudgetAllowance,
  BudgetScope,
  BudgetSubject,
  SCOPE_LABELS,
  STATE_LABELS,
} from '../../models/budget';
import { BudgetDraft, EMPTY_DRAFT, draftOf, parseAmount, toBudgetInput, validateDraft } from '../budget-form';

export const SCOPES: BudgetScope[] = ['global_day', 'project_day', 'session'];
export const ACTIONS: BudgetAction[] = ['stop', 'warn'];

/** Cuánto se propone subir un límite superado: un 25 % por encima de lo gastado, redondeado. */
export const RAISE_MARGIN = 1.25;

/** Pantalla Presupuestos: configurar los límites de Coste estimado y dejar seguir a lo que se supera (AC-82). */
@Component({
  selector: 'app-budgets-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './budgets-page.html',
  styleUrl: './budgets-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetsPage {
  private readonly watch = inject(WatchBudgets);
  private readonly manage = inject(ManageBudgets);
  private readonly sound = inject(AlertSound);

  protected readonly state = toSignal(this.watch.state$, { initialValue: INITIAL_BUDGETS });
  /** Los Proyectos que ya han enviado Eventos, para el formulario. */
  protected readonly knownProjects = toSignal(
    inject(SessionSource)
      .list({})
      .pipe(
        map((list) => list.facets.projects),
        catchError(() => of<string[]>([])),
      ),
    { initialValue: [] as string[] },
  );
  protected readonly muted = this.sound.muted;

  protected readonly scopes = SCOPES;
  protected readonly actions = ACTIONS;
  protected readonly scopeLabels = SCOPE_LABELS;
  protected readonly stateLabels = STATE_LABELS;
  protected readonly actionLabels = ACTION_LABELS;
  protected readonly formatCost = formatCost;
  protected readonly formatPercent = formatPercent;
  protected readonly plural = plural;
  protected readonly shortId = shortId;

  // Formulario: `formOpen` con `editingId` nulo crea, con un id edita.
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly draft = signal<BudgetDraft>(EMPTY_DRAFT);
  protected readonly touched = signal(false);
  protected readonly saving = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly errors = computed(() => validateDraft(this.draft()));
  protected readonly formValid = computed(() => Object.keys(this.errors()).length === 0);
  /** Los errores se enseñan al tocar el campo o al intentar guardar, no antes de escribir nada. */
  protected readonly showErrors = computed(() => this.touched());
  protected readonly projectOptions = computed(() => {
    const current = this.draft().project;
    return current !== '' && !this.knownProjects().includes(current) ? [...this.knownProjects(), current].sort() : this.knownProjects();
  });

  // Filas: ámbitos desplegados, borrado por confirmar y ampliación de límite en curso.
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly confirmingDelete = signal<string | null>(null);
  protected readonly raising = signal<{ key: string; value: string } | null>(null);
  protected readonly allowProject = signal('');
  protected readonly actionError = signal<string | null>(null);


  protected canExpand(budget: Budget): boolean {
    return budget.subjects.some((s) => s.state !== 'within') || budget.allowances.length > 0 || budget.scope !== 'session';
  }

  protected isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  protected toggle(id: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected ratioOf(spent: number, limit: number): number {
    return limit > 0 ? spent / limit : 0;
  }

  protected barWidth(ratio: number): number {
    return Math.min(100, Math.max(0, ratio * 100));
  }

  protected budgetName(budget: Budget): string {
    const project = budget.project ? ` · ${budget.project}` : '';
    return `${SCOPE_LABELS[budget.scope]}${budget.scope === 'global_day' ? '' : project}`;
  }

  protected subjectName(budget: Budget, subject: BudgetSubject): string {
    return subject.sessionId ? `Sesión ${shortId(subject.sessionId)} · ${subject.project ?? ''}` : budgetLabel(budget, subject);
  }

  protected allowanceName(allowance: BudgetAllowance): string {
    if (allowance.sessionId) return `Sesión ${shortId(allowance.sessionId)}, hasta que termine`;
    return `Proyecto ${allowance.project}, hasta el fin del día`;
  }

  // --- Formulario ---------------------------------------------------------------------

  protected openCreate(): void {
    this.editingId.set(null);
    this.draft.set(EMPTY_DRAFT);
    this.resetForm(true);
  }

  protected openEdit(budget: Budget): void {
    this.editingId.set(budget.id);
    this.draft.set(draftOf(budget));
    this.resetForm(true);
  }

  protected closeForm(): void {
    this.resetForm(false);
  }

  private resetForm(open: boolean): void {
    this.formOpen.set(open);
    this.touched.set(false);
    this.serverError.set(null);
  }

  protected setField<K extends keyof BudgetDraft>(field: K, value: BudgetDraft[K]): void {
    this.draft.update((d) => ({ ...d, [field]: value }));
    this.serverError.set(null);
  }

  protected setScope(scope: BudgetScope): void {
    // Un Presupuesto global no lleva Proyecto.
    this.draft.update((d) => ({ ...d, scope, project: scope === 'global_day' ? '' : d.project }));
    this.serverError.set(null);
  }

  protected save(): void {
    this.touched.set(true);
    if (!this.formValid()) return;
    const editing = this.editingId();
    const current = editing === null ? undefined : this.state().items.find((b) => b.id === editing);
    this.saving.set(true);
    this.manage.save(editing, toBudgetInput(this.draft(), current?.enabled ?? true)).subscribe((outcome) => {
      this.saving.set(false);
      // Un error del servidor se queda junto al formulario y lo escrito no se pierde.
      if (outcome.ok) this.closeForm();
      else this.serverError.set(outcome.message);
    });
  }

  // --- Acciones de fila ---------------------------------------------------------------

  protected setEnabled(budget: Budget, enabled: boolean): void {
    this.run(this.manage.setEnabled(budget, enabled));
  }

  protected askDelete(budget: Budget): void {
    this.confirmingDelete.set(budget.id);
  }

  protected cancelDelete(): void {
    this.confirmingDelete.set(null);
  }

  protected confirmDelete(budget: Budget): void {
    this.confirmingDelete.set(null);
    this.run(this.manage.remove(budget));
  }

  protected allow(budget: Budget, target: AllowanceTarget): void {
    this.run(this.manage.allow(budget, target));
  }

  protected removeAllowance(budget: Budget, allowance: BudgetAllowance): void {
    this.run(this.manage.removeAllowance(budget, allowance));
  }

  protected canAllowSession(budget: Budget, subject: BudgetSubject): boolean {
    return this.canAllow(budget, subject) && budget.scope === 'session' && subject.sessionId !== null;
  }

  protected canAllowProject(budget: Budget, subject: BudgetSubject): boolean {
    return this.canAllow(budget, subject) && budget.scope !== 'global_day' && (budget.scope === 'project_day' || subject.project !== null);
  }

  /** En el global del día la excepción es de un Proyecto que se elige aparte (AC-78). */
  protected canAllowChosenProject(budget: Budget, subject: BudgetSubject): boolean {
    return this.canAllow(budget, subject) && budget.scope === 'global_day';
  }

  /** Solo se puede dejar seguir a lo que se detiene: un Superado con la acción *detener* y sin excepción. */
  private canAllow(budget: Budget, subject: BudgetSubject): boolean {
    return budget.enabled && budget.action === 'stop' && subject.state === 'exceeded' && !subject.allowed;
  }

  protected projectOfAllowance(budget: Budget, subject: BudgetSubject): string {
    return budget.scope === 'project_day' ? (budget.project ?? '') : (subject.project ?? '');
  }

  protected subjectKey(budget: Budget, subject: BudgetSubject): string {
    return `${budget.id}|${subject.sessionId ?? ''}`;
  }

  protected startRaise(budget: Budget, subject: BudgetSubject): void {
    const proposal = Math.ceil(subject.spentUsd * RAISE_MARGIN);
    this.raising.set({ key: this.subjectKey(budget, subject), value: String(Math.max(proposal, Math.ceil(budget.limitUsd) + 1)) });
  }

  protected setRaiseValue(value: string): void {
    this.raising.update((r) => (r ? { ...r, value } : r));
  }

  protected cancelRaise(): void {
    this.raising.set(null);
  }

  protected raiseError(): string | null {
    const value = parseAmount(this.raising()?.value ?? '');
    return value === null || value <= 0 ? 'El límite debe ser un número mayor que 0' : null;
  }

  protected applyRaise(budget: Budget): void {
    const value = parseAmount(this.raising()?.value ?? '');
    if (value === null || value <= 0) return;
    this.raising.set(null);
    this.run(this.manage.raiseLimit(budget, value));
  }

  protected onMute(event: Event): void {
    this.sound.setMuted((event.target as HTMLInputElement).checked);
  }

  private run(outcome$: ReturnType<ManageBudgets['remove']>): void {
    this.actionError.set(null);
    outcome$.subscribe((outcome: BudgetOutcome) => {
      if (!outcome.ok) this.actionError.set(outcome.message);
    });
  }
}
