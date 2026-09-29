import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const WIDTH = 120;
const HEIGHT = 24;
const GAP = 2;

/** Sparkline de barras de la actividad de la última hora (spec/design.md §6.1). */
@Component({
  selector: 'app-sparkline',
  template: `
    <svg [attr.viewBox]="viewBox" [attr.width]="width" [attr.height]="height" role="img" [attr.aria-label]="label()">
      @for (bar of bars(); track $index) {
        <rect [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.width" [attr.height]="bar.height" rx="1" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      color: var(--brand);
    }
    rect {
      fill: currentColor;
      opacity: 0.8;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sparkline {
  readonly values = input.required<number[]>();
  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;

  protected readonly bars = computed(() => {
    const values = this.values();
    const max = Math.max(1, ...values);
    const barWidth = (WIDTH - GAP * (values.length - 1)) / Math.max(1, values.length);
    return values.map((value, i) => {
      // Un intervalo sin Eventos deja una línea base, para que se lea como "cero" y no como hueco.
      const height = value === 0 ? 1 : Math.max(2, (value / max) * HEIGHT);
      return { x: i * (barWidth + GAP), y: HEIGHT - height, width: barWidth, height };
    });
  });

  protected readonly label = computed(() => {
    const total = this.values().reduce((a, b) => a + b, 0);
    return `${total} Eventos en la última hora`;
  });
}
