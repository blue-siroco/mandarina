import { Provider } from '@angular/core';
import { HttpExporterSource } from './infrastructure/http-exporter-source';
import { ExporterSource } from './ports/exporter-source';

/** Composition root del feature de Exportación OTLP. */
export function provideExporter(): Provider[] {
  return [{ provide: ExporterSource, useClass: HttpExporterSource }];
}
