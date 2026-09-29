// Wrapper de @lucia/element-bars (skill `ui-lucia-module-bars`). No es un web
// component: es una función de D3 que dibuja dentro de un contenedor, y este es
// el único sitio de la app donde vive ese código imperativo.
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { D3Element } from '@lucia/core-d3element';
import { verticalBars } from '@lucia/element-bars';
import { Observable, ReplaySubject, Subject, switchMap, takeUntil } from 'rxjs';

export interface BarDatum {
  /** Etiqueta de la barra; alimenta el dominio de la escala de banda. */
  readonly label: string;
  readonly value: number;
  readonly tooltip?: string;
}

export interface BarStyles {
  /** Separación entre barras (paddingInner de scaleBand). */
  padding?: number;
  maxValue?: number;
  /** Un color por barra. Sin esto usa la paleta de @lucia/core-pallete, ajena al design system. */
  colorPallete?: readonly string[];
}

export interface ChartAnimation {
  readonly delay?: number;
  readonly duration?: number;
}

export interface ChartMargins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const DEFAULT_MARGINS: ChartMargins = { top: 20, right: 20, bottom: 32, left: 44 };

/** Color de marca resuelto del tema actual: la paleta de Lucia no lee las custom properties. */
function brandColor(host: HTMLElement): string {
  return getComputedStyle(host).getPropertyValue('--brand').trim() || '#ea580c';
}

@Component({
  selector: 'app-bars-chart',
  imports: [],
  templateUrl: './bars-chart.html',
  styleUrl: './bars-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarsChart implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true })
  private readonly host!: ElementRef<HTMLDivElement>;

  /** Fuente de datos: el wrapper redibuja en cada emisión. */
  @Input({ required: true })
  set data$(source: Observable<readonly BarDatum[]>) {
    this.source$.next(source);
  }

  @Input() styles: BarStyles = {};
  @Input() margins: ChartMargins = DEFAULT_MARGINS;
  /** Descripción accesible: el SVG no es legible por un lector de pantalla. */
  @Input() ariaLabel = 'Gráfico de barras verticales';
  @Input() animation: ChartAnimation = { delay: 0, duration: 400 };

  private readonly source$ = new ReplaySubject<Observable<readonly BarDatum[]>>(1);
  private readonly destroy$ = new Subject<void>();

  ngAfterViewInit(): void {
    this.source$
      .pipe(
        switchMap((source) => source),
        takeUntil(this.destroy$),
      )
      .subscribe((data) => this.draw(data));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private draw(data: readonly BarDatum[]): void {
    const host = this.host.nativeElement;
    // D3Element añade un <svg> nuevo en cada construcción: sin limpiar se acumularían.
    host.replaceChildren();
    // D3Element lee offsetWidth/offsetHeight: sin tamaño real (jsdom) no dibuja.
    if (!host.offsetWidth || !host.offsetHeight || !data.length) return;

    const graph = new D3Element(host, this.margins);
    const styles = { colorPallete: data.map(() => brandColor(host)), ...this.styles };
    // Copias: varias funciones del catálogo mutan lo que reciben.
    verticalBars(graph, [...data], { ...styles }, { ...this.animation });
  }
}
