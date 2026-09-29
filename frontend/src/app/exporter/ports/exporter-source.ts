import { Observable } from 'rxjs';
import { ExporterStatus } from '../models/exporter';

/** Origen del estado de la Exportación OTLP. */
export abstract class ExporterSource {
  abstract fetch(): Observable<ExporterStatus>;
}
