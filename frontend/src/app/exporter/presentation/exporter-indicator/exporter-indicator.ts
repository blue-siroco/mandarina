import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { plural } from '../../../shared/format';
import { INITIAL_EXPORTER_STATE, WatchExporterStatus } from '../../application/watch-exporter-status';
import { ExporterModal } from '../exporter-modal/exporter-modal';

/**
 * Indicador de la Exportación OTLP en la barra lateral (AC-53). Solo aparece si el
 * exportador está activo: la exportación es opt-in y debe verse cuando lo está (§7).
 */
@Component({
  selector: 'app-exporter-indicator',
  imports: [ExporterModal],
  templateUrl: './exporter-indicator.html',
  styleUrl: './exporter-indicator.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExporterIndicator {
  protected readonly state = toSignal(inject(WatchExporterStatus).execute(), { initialValue: INITIAL_EXPORTER_STATE });
  protected readonly isOpen = signal(false);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  protected readonly plural = plural;

  protected open(): void {
    this.isOpen.set(true);
  }

  protected close(): void {
    this.isOpen.set(false);
    // El foco vuelve al indicador que abrió el modal.
    queueMicrotask(() => this.trigger()?.nativeElement.focus());
  }
}
