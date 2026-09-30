import { Observable } from 'rxjs';
import { DownloadPreview, DownloadTarget } from '../models/download';

/** Origen de las Descargas de Sesión y de Eventos (ADR-0013). */
export abstract class DownloadSource {
  abstract preview(target: DownloadTarget, content: boolean): Observable<DownloadPreview>;
  /** URL del fichero; la sirve el backend, el navegador solo la sigue. */
  abstract url(target: DownloadTarget, content: boolean): string;
}
