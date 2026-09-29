// Contratos de los web components `@lucia/*` usados en la app (ver skills `ui-lucia-*`).

/** Evento `callback` de un web component de Lucia. */
export type LuciaCustomEvent<T> = CustomEvent<T>;

/**
 * Índice elegido en un `callback` de togglebuttons o select. Angular tipa el
 * $event de un custom element como `Event`, así que se lee con cuidado.
 */
export function luciaIndex(event: Event): number {
  const value = (event as Partial<LuciaCustomEvent<{ value: unknown }>>).detail?.value;
  return typeof value === 'number' ? value : 0;
}

/** Propiedad `toogleOptions` de `<lucia--togglebuttons>` (sí, con doble o). */
export interface ToggleOptions {
  defaultSelectedOption: number;
  options: Array<{ icon: string; text: string }>;
}

export function toggleOptions(labels: readonly string[], selected: number): ToggleOptions {
  return { defaultSelectedOption: Math.max(0, selected), options: labels.map((text) => ({ icon: '', text })) };
}

/** Propiedad `smallChip` de `<lucia--smallchip>`. */
export interface SmallChip {
  text: string;
  background: string;
}
