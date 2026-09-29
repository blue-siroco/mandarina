// Los paquetes `@lucia/*` son custom elements sin tipos: su import solo registra el elemento.
declare module '@lucia/togglebuttons';
declare module '@lucia/smallchip';
declare module '@lucia/info';
declare module '@lucia/button';

// Paquetes D3 de Lucia (skills `ui-lucia-module-*`): funciones de dibujo, no custom elements.
declare module '@lucia/core-d3element' {
  export class D3Element {
    constructor(host: HTMLElement, margins: { top: number; right: number; bottom: number; left: number });
  }
}
declare module '@lucia/element-bars' {
  import type { D3Element } from '@lucia/core-d3element';
  type Datum = { label: string; value: number; tooltip?: string };
  type Styles = { padding?: number; maxValue?: number; colorPallete?: readonly string[] };
  type Animation = { delay?: number; duration?: number };
  export function verticalBars(graph: D3Element, data: Datum[], styles: Styles, animation: Animation): void;
  export function horizontalBars(graph: D3Element, data: Datum[], styles: Styles, animation: Animation): void;
}
