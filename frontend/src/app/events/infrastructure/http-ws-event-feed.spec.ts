import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LiveSignal } from '../models/observed-event';
import { eventDto } from '../testing/event-fixtures';
import { HttpWsEventFeed, LIVE_URL, RECONNECT_DELAY_MS, WEBSOCKET_FACTORY } from './http-ws-event-feed';

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {}
  close() {
    this.closed = true;
  }
}

const signalLabel = (s: LiveSignal) => (s.kind === 'event' ? s.event.id : s.connection);

describe('HttpWsEventFeed', () => {
  let feed: HttpWsEventFeed;
  let http: HttpTestingController;
  let sockets: FakeSocket[];

  beforeEach(() => {
    sockets = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        HttpWsEventFeed,
        { provide: LIVE_URL, useValue: 'wss://test/ws' },
        {
          provide: WEBSOCKET_FACTORY,
          useValue: (url: string) => {
            const socket = new FakeSocket(url);
            sockets.push(socket);
            return socket as unknown as WebSocket;
          },
        },
      ],
    });
    feed = TestBed.inject(HttpWsEventFeed);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  describe('AC-09: search', () => {
    it('pide GET /api/v1/events solo con limit y mapea los items', () => {
      let result: string[] = [];
      feed.search({ limit: 50 }).subscribe((events) => (result = events.map((e) => e.id)));

      const request = http.expectOne('/api/v1/events?limit=50');
      expect(request.request.method).toBe('GET');
      request.flush({ items: [eventDto({ id: 'x' }), eventDto({ id: 'y' })] });

      expect(result).toStrictEqual(['x', 'y']);
    });
  });

  describe('AC-110: search por Proyecto', () => {
    it('envía project junto a session_id y since, y nada si no se filtra', () => {
      const since = new Date('2026-09-30T09:00:00.000Z');
      feed.search({ limit: 200, project: 'mandarina', sessionId: 's-1', since }).subscribe();
      const filtered = http.expectOne((r) => r.url === '/api/v1/events');
      expect(filtered.request.params.get('project')).toBe('mandarina');
      expect(filtered.request.params.get('session_id')).toBe('s-1');
      expect(filtered.request.params.get('since')).toBe('2026-09-30T09:00:00.000Z');
      filtered.flush({ items: [] });

      feed.search({ limit: 200 }).subscribe();
      http.expectOne('/api/v1/events?limit=200').flush({ items: [] });
    });
  });

  describe('AC-17: search con filtros', () => {
    it('envía session_id, event_type repetido y since en ISO', () => {
      const since = new Date('2026-09-20T00:00:00.000Z');
      feed
        .search({ limit: 10, sessionId: 's-1', eventTypes: ['tool.pre', 'tool.blocked'], since })
        .subscribe();

      const request = http.expectOne((r) => r.url === '/api/v1/events');
      const params = request.request.params;
      expect(params.get('limit')).toBe('10');
      expect(params.get('session_id')).toBe('s-1');
      expect(params.getAll('event_type')).toStrictEqual(['tool.pre', 'tool.blocked']);
      expect(params.get('since')).toBe('2026-09-20T00:00:00.000Z');
      request.flush({ items: [] });
    });
  });

  describe('AC-09: live', () => {
    it('informa de la conexión y emite los Eventos recibidos', () => {
      const signals: LiveSignal[] = [];
      feed.live().subscribe((s) => signals.push(s));
      const [socket] = sockets;

      socket?.onopen?.();
      socket?.onmessage?.({ data: JSON.stringify({ type: 'event.ingested', event: eventDto({ id: 'z' }) }) });

      expect(socket?.url).toBe('wss://test/ws');
      expect(signals.map(signalLabel)).toStrictEqual(['connecting', 'live', 'z']);
    });

    it('AC-81: traduce el budget.state del WebSocket a un cambio de estado', () => {
      const signals: LiveSignal[] = [];
      feed.live().subscribe((s) => signals.push(s));
      sockets[0]?.onmessage?.({
        data: JSON.stringify({
          type: 'budget.state',
          budget_id: 'b1',
          scope: 'session',
          project: 'demo',
          session_id: 's1',
          action: 'stop',
          state: 'exceeded',
          previous_state: 'near',
          spent_usd: 9.5,
          limit_usd: 5,
        }),
      });
      expect(signals.at(-1)).toStrictEqual({
        kind: 'budget',
        change: { budgetId: 'b1', scope: 'session', project: 'demo', sessionId: 's1', action: 'stop', state: 'exceeded', previousState: 'near', spentUsd: 9.5, limitUsd: 5 },
      });
    });

    it('ignora mensajes de otro tipo', () => {
      const signals: LiveSignal[] = [];
      feed.live().subscribe((s) => signals.push(s));
      sockets[0]?.onmessage?.({ data: JSON.stringify({ type: 'otro' }) });
      expect(signals).toHaveLength(1);
    });

    it('reconecta tras perder la conexión', () => {
      vi.useFakeTimers();
      const signals: LiveSignal[] = [];
      feed.live().subscribe((s) => signals.push(s));

      sockets[0]?.onclose?.();
      expect(signals.at(-1)).toStrictEqual({ kind: 'connection', connection: 'offline' });

      vi.advanceTimersByTime(RECONNECT_DELAY_MS);
      expect(sockets).toHaveLength(2);
      expect(signals.at(-1)).toStrictEqual({ kind: 'connection', connection: 'connecting' });
    });

    it('al desuscribirse cierra el socket y no reconecta', () => {
      vi.useFakeTimers();
      const subscription = feed.live().subscribe();
      subscription.unsubscribe();
      sockets[0]?.onclose?.();
      vi.advanceTimersByTime(RECONNECT_DELAY_MS);

      expect(sockets[0]?.closed).toBe(true);
      expect(sockets).toHaveLength(1);
    });
  });
});
