import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import '@lucia/button';
import { formatInteger } from '../../../shared/format';
import { ExportState, ExporterStatus } from '../../models/exporter';

export const STATE_LABELS: Record<ExportState, string> = {
  pending: 'Pendiente',
  exported: 'Exportado',
  failed: 'Fallido',
};

/** Estado de la Exportación OTLP y sus últimos Turnos, en una pantalla modal (AC-53). */
@Component({
  selector: 'app-exporter-modal',
  imports: [DatePipe, RouterLink],
  templateUrl: './exporter-modal.html',
  styleUrl: './exporter-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ExporterModal {
  readonly isOpen = input(false);
  readonly status = input.required<ExporterStatus>();
  readonly closed = output<void>();

  /** Botón de cerrar solo-icono: la fuente `ico_TTech` no viene en el tarball, así que el aspa va como texto. */
  protected readonly closeButton = { text: '✕', typeButton: 'secondary', icon: '', position: 'after', disabled: false };
  protected readonly stateLabels = STATE_LABELS;
  protected readonly formatInteger = formatInteger;
  private readonly window = viewChild<ElementRef<HTMLElement>>('window');

  constructor() {
    // Al abrir, el foco entra en el modal para que `Esc` y el tabulador funcionen dentro.
    effect(() => {
      if (this.isOpen()) queueMicrotask(() => this.window()?.nativeElement.focus());
    });
  }

  close(): void {
    this.closed.emit();
  }

  protected onCloseButtonClick(): void {
    this.close();
  }

  /** Solo cierra un clic en la capa, no uno dentro de la ventana. */
  protected onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
