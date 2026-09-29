import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import '@lucia/smallchip';
import { SmallChip } from '../../lucia';

/** Serie de color por familia de modelo (spec/design.md §3.4): un modelo tiene siempre el mismo color. */
export function modelSeries(model: string): string {
  if (model.includes('opus')) return 'var(--series-1)';
  if (model.includes('sonnet')) return 'var(--series-2)';
  if (model.includes('haiku')) return 'var(--series-3)';
  if (model.includes('fable') || model.includes('mythos')) return 'var(--series-4)';
  return 'var(--series-other)';
}

/** `claude-haiku-4-5-20251001` → `haiku-4.5`: la familia y la versión es lo que se lee de un vistazo. */
export function shortModel(model: string): string {
  const withoutVendor = model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
  return withoutVendor.replace(/-(\d+)-(\d+)$/, '-$1.$2');
}

/** Badge de modelo (§5.4) sobre `@lucia/smallchip`. */
@Component({
  selector: 'app-model-badge',
  template: `<lucia--smallchip [smallChip]="chip()" [attr.title]="model()"></lucia--smallchip>`,
  styles: `
    :host {
      display: inline-flex;
      font-family: var(--font-mono);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ModelBadge {
  readonly model = input.required<string>();
  protected readonly chip = computed<SmallChip>(() => ({
    text: shortModel(this.model()),
    background: modelSeries(this.model()),
  }));
}
