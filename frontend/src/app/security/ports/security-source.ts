import { Observable } from 'rxjs';
import { InjectionFilter, InjectionWarningList, MaskingStats } from '../models/security';

/** Origen de los Avisos de inyección y de las estadísticas de Enmascarado. */
export abstract class SecuritySource {
  abstract warnings(filter: InjectionFilter): Observable<InjectionWarningList>;
  /** Descarta un aviso como falso positivo; si ya lo estaba, no cambia nada. */
  abstract dismiss(id: string): Observable<void>;
  abstract restore(id: string): Observable<void>;
  abstract maskingStats(since: Date): Observable<MaskingStats>;
}
