import type { WebSocket } from 'ws';
import type { StoredEvent } from '../domain/event.js';
import type { Broadcaster, EventPublisher } from '../application/ports.js';

export interface LiveMessage {
  type: 'event.ingested';
  event: StoredEvent;
}

export class WebSocketPublisher implements EventPublisher, Broadcaster {
  private readonly clients = new Set<WebSocket>();

  add(socket: WebSocket): void {
    this.clients.add(socket);
    socket.on('close', () => this.clients.delete(socket));
  }

  publish(event: StoredEvent): void {
    const message: LiveMessage = { type: 'event.ingested', event };
    this.broadcast(message);
  }

  /** Cualquier otro mensaje del WebSocket, p. ej. `budget.state` (AC-81). */
  broadcast(message: unknown): void {
    const data = JSON.stringify(message);
    for (const socket of this.clients) {
      if (socket.readyState === socket.OPEN) socket.send(data);
    }
  }
}
