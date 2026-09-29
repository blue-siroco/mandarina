import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * Filtro desplegable nativo. `@lucia/select` 0.3.1 depende de una fuente de
 * iconos que no viene en su tarball y fija el fondo de sus opciones en blanco
 * dentro del shadow DOM, sin forma de aplicar el tema oscuro (spec/design.md §9).
 */
@Component({
  selector: 'app-select-filter',
  template: `
    <label class="field">
      <span class="field__label">{{ label() }}</span>
      <select class="field__select" (change)="onChange($event)">
        <option value="" [selected]="value() === null">{{ allLabel() }}</option>
        @for (option of optionList(); track option) {
          <option [value]="option" [selected]="option === value()">{{ option }}</option>
        }
      </select>
    </label>
  `,
  styles: `
    :host {
      display: inline-block;
      max-width: 100%;
    }
    .field {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      max-width: 100%;
    }
    .field__label {
      color: var(--text-muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .field__select {
      min-width: 0;
      max-width: 22rem;
      height: 40px;
      padding: 0 var(--space-3);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface-1);
      color: var(--text);
      font: inherit;
      text-overflow: ellipsis;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectFilter {
  readonly label = input.required<string>();
  readonly allLabel = input.required<string>();
  readonly options = input.required<readonly string[]>();
  readonly value = input<string | null>(null);
  readonly changed = output<string | null>();

  /** Un valor elegido que ya no está entre las opciones sigue visible para poder quitarlo. */
  protected readonly optionList = computed(() => {
    const value = this.value();
    return value !== null && !this.options().includes(value) ? [...this.options(), value] : this.options();
  });

  protected onChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.changed.emit(value === '' ? null : value);
  }
}
