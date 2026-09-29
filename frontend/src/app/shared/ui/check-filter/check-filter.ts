import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Casilla de filtro nativa, como `app-select-filter`: `@lucia/checkbox` pinta
 * un grupo de opciones con su propio título, no una casilla suelta dentro de
 * una barra de filtros.
 */
@Component({
  selector: 'app-check-filter',
  template: `
    <label class="field">
      <input type="checkbox" class="field__box" [checked]="checked()" (change)="onChange($event)" />
      <span>{{ label() }}</span>
    </label>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    .field {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      height: 40px;
      color: var(--text-muted);
      font-size: 13px;
      white-space: nowrap;
      cursor: pointer;
    }
    .field__box {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: var(--brand);
      cursor: pointer;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckFilter {
  readonly label = input.required<string>();
  readonly checked = input(false);
  readonly changed = output<boolean>();

  protected onChange(event: Event): void {
    this.changed.emit((event.target as HTMLInputElement).checked);
  }
}
