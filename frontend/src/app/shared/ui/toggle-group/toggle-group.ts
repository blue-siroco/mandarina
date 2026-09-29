import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import '@lucia/togglebuttons';
import { luciaIndex, toggleOptions } from '../../lucia';

/**
 * Grupo de botones de selección única sobre `@lucia/togglebuttons` (design §5.5, §5.12).
 * El web component reparte el ancho de su host entre las opciones, así que el
 * host recibe un ancho acorde a las etiquetas y, si no cabe, hace scroll propio.
 */
@Component({
  selector: 'app-toggle-group',
  template: `
    <div class="scroll" role="group" [attr.aria-label]="label()">
      <lucia--togglebuttons
        [style.width.px]="width()"
        [toogleOptions]="options()"
        (callback)="selected.emit(index($event))"
      ></lucia--togglebuttons>
    </div>
  `,
  styles: `
    :host {
      display: block;
      max-width: 100%;
    }
    .scroll {
      max-width: 100%;
      overflow-x: auto;
    }
    lucia--togglebuttons {
      display: block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ToggleGroup {
  readonly label = input.required<string>();
  readonly labels = input.required<readonly string[]>();
  readonly selectedIndex = input(0);
  /** Ancho de cada opción: el de la etiqueta más larga del grupo a 15 px, con aire. */
  readonly optionWidth = input(96);
  readonly selected = output<number>();

  protected readonly options = computed(() => toggleOptions(this.labels(), this.selectedIndex()));
  protected readonly width = computed(() => this.labels().length * this.optionWidth());
  protected readonly index = luciaIndex;
}
