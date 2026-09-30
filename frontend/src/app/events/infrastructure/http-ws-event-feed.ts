import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { EventDto, toObservedEvent } from '../mappers/event.mapper';
import { BudgetLiveState, BudgetStateChange, EventQuery, LiveSignal, ObservedEvent } from '../models/observed-event';
import { EventFeed } from '../ports/event-feed';

export const RECONNECT_DELAY_MS = 3000;

export type WebSocketFactory = (url: string) => WebSocket;

export const WEBSOCKET_FACTORY = new InjectionToken<WebSocketFactory>('WEBSOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => (url) => new WebSocket(url),
});

export const LIVE_URL = new InjectionToken<string>('LIVE_URL', {
  providedIn: 'root',
  factory: () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
});

interface EventMessage {
  type: 'event.ingested';
  event: EventDto;
}

/** `BudgetStateMessage` de `spec/api-spec.yaml` (AC-81). */
interface BudgetMessage {
  type: 'budget.state';
  budget_id: string;
  scope: BudgetStateChange['scope'];
  project: string | null;
  session_id: string | null;
  action: BudgetStateChange['action'];
  state: BudgetLiveState;
  previous_state: BudgetLiveState;
  spent_usd: number;
  limit_usd: number;
}

type LiveMessage = EventMessage | BudgetMessage;

const toBudgetChange = (m: BudgetMessage): BudgetStateChange => ({
  budgetId: m.budget_id,
  scope: m.scope,
  project: m.project,
  sessionId: m.session_id,
  action: m.action,
  state: m.state,
  previousState: m.previous_state,
  spentUsd: m.spent_usd,
  limitUsd: m.limit_usd,
});

@Injectable()
export class HttpWsEventFeed extends EventFeed {
  private readonly http = inject(HttpClient);
  private readonly createSocket = inject(WEBSOCKET_FACTORY);
  private readonly liveUrl = inject(LIVE_URL);

  search({ limit, project, sessionId, eventTypes, since }: EventQuery): Observable<ObservedEvent[]> {
    let params = new HttpParams().set('limit', limit);
    if (project !== undefined) params = params.set('project', project);
    if (sessionId !== undefined) params = params.set('session_id', sessionId);
    for (const type of eventTypes ?? []) params = params.append('event_type', type);
    if (since !== undefined) params = params.set('since', since.toISOString());
    return this.http
      .get<{ items: EventDto[] }>('/api/v1/events', { params })
      .pipe(map(({ items }) => items.map(toObservedEvent)));
  }

  live(): Observable<LiveSignal> {
    return new Observable<LiveSignal>((subscriber) => {
      let socket: WebSocket | undefined;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let closed = false;

      const connect = () => {
        subscriber.next({ kind: 'connection', connection: 'connecting' });
        socket = this.createSocket(this.liveUrl);
        socket.onopen = () => subscriber.next({ kind: 'connection', connection: 'live' });
        socket.onmessage = ({ data }: MessageEvent<string>) => {
          const message = JSON.parse(data) as LiveMessage;
          // Los tipos de mensaje que no se conocen se ignoran.
          if (message.type === 'event.ingested') {
            subscriber.next({ kind: 'event', event: toObservedEvent(message.event) });
          } else if (message.type === 'budget.state') {
            subscriber.next({ kind: 'budget', change: toBudgetChange(message) });
          }
        };
        socket.onclose = () => {
          if (closed) return;
          subscriber.next({ kind: 'connection', connection: 'offline' });
          retry = setTimeout(connect, RECONNECT_DELAY_MS);
        };
      };

      connect();
      return () => {
        closed = true;
        clearTimeout(retry);
        socket?.close();
      };
    });
  }
}
