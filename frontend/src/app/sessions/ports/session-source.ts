import { Observable } from 'rxjs';
import { SessionDetail, SessionFilter, SessionList } from '../models/session';

/** Origen de las Sesiones del board y de su detalle. */
export abstract class SessionSource {
  abstract list(filter: SessionFilter): Observable<SessionList>;
  /** `null` si la Sesión no existe. */
  abstract detail(sessionId: string): Observable<SessionDetail | null>;
}
