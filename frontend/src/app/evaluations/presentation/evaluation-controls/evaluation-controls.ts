import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import '@lucia/filterchip';
import { Subject } from 'rxjs';
import { EvaluationTags } from '../../application/evaluation-tags';
import { EvaluationDraft, SaveEvaluation } from '../../application/save-evaluation';
import { Evaluation, EvaluationInput, EvaluationObjectType, Score, normalizeTag, toInput } from '../../models/evaluation';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const STATUS_LABELS: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'No se pudo guardar',
};

let nextId = 0;

/**
 * Controles para evaluar una Sesión, un Turno o un Subagente (AC-57): Puntuación
 * (pulgar arriba / abajo), Etiquetas con autocompletado y Nota, con guardado
 * automático y sin botón. Es el mismo componente en la cabecera del detalle, en
 * cada Turno y en cada Subagente.
 *
 * Uso:
 * ```html
 * <app-evaluation-controls
 *   objectType="turn"
 *   [objectId]="turn.id"
 *   [evaluation]="evaluations.byKey.get(evaluationKey('turn', turn.id)) ?? null"
 *   label="Evaluación del Turno 2"
 *   (saved)="onSaved($event)"
 * />
 * ```
 * - `evaluation`: `undefined` mientras no se han cargado las Evaluaciones (los
 *   controles esperan, deshabilitados); `null` si el objeto no tiene. Solo cuenta
 *   el primer valor que no sea `undefined`: después el componente lleva su propio
 *   estado y guardar no recarga ni pisa la vista.
 * - `saved`: emite la Evaluación guardada, o `null` si quedó vacía y se borró; sirve
 *   al padre para mantener su mapa al día (p. ej. `EvaluationsOfSession`).
 */
@Component({
  selector: 'app-evaluation-controls',
  templateUrl: './evaluation-controls.html',
  styleUrl: './evaluation-controls.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class EvaluationControls implements OnInit {
  readonly objectType = input.required<EvaluationObjectType>();
  readonly objectId = input.required<string>();
  readonly evaluation = input<Evaluation | null | undefined>(undefined);
  /** Nombre accesible del grupo ("Evaluación del Turno 2"); distingue varias instancias en la misma pantalla. */
  readonly label = input('Evaluación');
  readonly saved = output<Evaluation | null>();

  private readonly saver = inject(SaveEvaluation);
  private readonly tagBook = inject(EvaluationTags);
  private readonly destroyRef = inject(DestroyRef);
  private readonly drafts = new Subject<EvaluationDraft>();
  private readonly uid = nextId++;

  protected readonly score = signal<Score | null>(null);
  protected readonly tags = signal<readonly string[]>([]);
  protected readonly note = signal<string>('');
  protected readonly status = signal<SaveStatus>('idle');
  protected readonly ready = computed(() => this.evaluation() !== undefined);
  protected readonly tagOptions = this.tagBook.options;
  protected readonly datalistId = `evaluation-tags-${this.uid}`;
  protected readonly statusLabels = STATUS_LABELS;
  /** Chips de `@lucia/filterchip`; la X va aparte porque su fuente de iconos no viene en el tarball. */
  protected readonly chips = computed(() => this.tags().map((text) => ({ text, deleteIcon: false, background: '', textColor: '' })));

  private initialized = false;
  /** Lo último que se pidió guardar, para no guardar de nuevo al salir de un campo sin cambios. */
  private lastSent = '';

  constructor() {
    effect(() => {
      const evaluation = this.evaluation();
      if (evaluation === undefined || this.initialized) return;
      untracked(() => {
        this.initialized = true;
        const value = toInput(evaluation);
        this.score.set(value.score);
        this.tags.set(value.tags);
        this.note.set(value.note ?? '');
        this.lastSent = JSON.stringify(this.current());
      });
    });
  }

  ngOnInit(): void {
    this.tagBook.ensureLoaded();
    this.saver
      .autosave(this.objectType(), this.objectId(), this.drafts)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((outcome) => {
        if (outcome.status === 'error') {
          this.status.set('error');
          return;
        }
        this.status.set('saved');
        this.tagBook.remember(this.tags());
        this.saved.emit(outcome.evaluation);
      });
  }

  private current(): EvaluationInput {
    return { score: this.score(), tags: [...this.tags()], note: this.note() === '' ? null : this.note() };
  }

  private push(when: EvaluationDraft['when']): void {
    const input = this.current();
    if (when === 'now') {
      // Salir de un campo sin haber cambiado nada no guarda; tras un fallo sí se reintenta.
      const same = JSON.stringify(input) === this.lastSent;
      if (same && this.status() !== 'error') return;
    }
    if (when === 'now') this.lastSent = JSON.stringify(input);
    this.status.set('saving');
    this.drafts.next({ input, when });
  }

  protected setScore(value: Score): void {
    this.score.update((current) => (current === value ? null : value));
    this.push('now');
  }

  protected addTag(raw: string): boolean {
    const tag = normalizeTag(raw);
    if (tag === null || this.tags().includes(tag)) return false;
    this.tags.update((tags) => [...tags, tag]);
    this.push('now');
    return true;
  }

  protected removeTag(tag: string): void {
    this.tags.update((tags) => tags.filter((t) => t !== tag));
    this.push('now');
  }

  /** Enter o coma añaden la Etiqueta; el campo se vacía aunque ya existiera. */
  protected onTagKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    const field = event.target as HTMLInputElement;
    this.addTag(field.value);
    field.value = '';
  }

  /** Al salir del campo se añade lo que se había escrito y no se confirmó. */
  protected onTagBlur(event: Event): void {
    const field = event.target as HTMLInputElement;
    if (field.value.trim() === '') return;
    this.addTag(field.value);
    field.value = '';
  }

  protected onNoteInput(event: Event): void {
    this.note.set((event.target as HTMLTextAreaElement).value);
    this.push('note');
  }

  protected onNoteBlur(): void {
    this.push('now');
  }
}
