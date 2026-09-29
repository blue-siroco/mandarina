import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatInteger } from '../../../shared/format';

/** Uso de herramientas en barras horizontales ordenadas (spec/design.md §6.3). */
@Component({
  selector: 'app-tool-bars',
  template: `
    <article class="kpi tools" data-testid="tool-bars">
      <h3 class="overline">Uso de herramientas</h3>
      @if (bars().length === 0) {
        <p class="kpi__detail">Sin herramientas todavía.</p>
      } @else {
        <ul class="tools__list">
          @for (bar of bars(); track bar.name) {
            <li class="tools__row" data-testid="tool-bar">
              <span class="tools__name mono" [title]="bar.name">{{ bar.name }}</span>
              <span class="tools__track"><span class="tools__fill" [style.width.%]="bar.width"></span></span>
              <span class="tools__count num">{{ bar.count }}</span>
            </li>
          }
        </ul>
      }
    </article>
  `,
  styleUrl: './tool-bars.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolBars {
  readonly tools = input.required<Array<{ name: string; count: number }>>();
  /** Las más usadas: el resto alarga la tarjeta sin aportar. */
  readonly limit = input(8);

  protected readonly bars = computed(() => {
    const tools = this.tools().slice(0, this.limit());
    const max = Math.max(1, ...tools.map((t) => t.count));
    return tools.map((t) => ({ name: t.name, count: formatInteger(t.count), width: (t.count / max) * 100 }));
  });
}
