import { Observable } from 'rxjs';
import { EventQuery, LiveSignal, ObservedEvent } from '../models/observed-event';

/** Origen de Eventos: consultas (REST) y flujo en vivo (WebSocket). */
export abstract class EventFeed {
  /** Eventos más recientes primero. */
  abstract search(query: EventQuery): Observable<ObservedEvent[]>;
  /** Estado de la conexión en vivo y Eventos nuevos; reconecta solo. */
  abstract live(): Observable<LiveSignal>;
}
