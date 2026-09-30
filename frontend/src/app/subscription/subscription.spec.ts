import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { LiveEvents } from '../events/application/live-events';
import { LiveSignal } from '../events/models/observed-event';
import { EventFeed } from '../events/ports/event-feed';
import {
  INITIAL_SUBSCRIPTION_STATE,
  SUBSCRIPTION_REFRESH_MS,
  SubscriptionUsageState,
  WatchSubscriptionUsage,
  reduceSubscription,
} from './application/watch-subscription-usage';
import { HttpSubscriptionUsageSource } from './infrastructure/http-subscription-usage-source';
import { toSubscriptionUsage } from './mappers/subscription-usage.mapper';
import { SubscriptionUsage } from './models/subscription-usage';
import { SubscriptionUsageSource } from './ports/subscription-usage-source';
import { subscriptionUsage, subscriptionUsageDto, windowDto } from './testing/subscription-fixtures';

describe('AC-136: toSubscriptionUsage', () => {
  it('traduce las dos ventanas con sus fechas', () => {
    const usage = toSubscriptionUsage(subscriptionUsageDto())!;
    expect(usage.fiveHour).toStrictEqual({
      usedPercent: 38,
      remainingPercent: 62,
      resetsAt: new Date(windowDto().resets_at),
      status: 'comfortable',
    });
    expect(usage.sevenDay?.remainingPercent).toBe(40);
    expect(usage.updatedAt).toStrictEqual(new Date(subscriptionUsageDto().updated_at));
  });

  it('sin lectura (null) o sin cuerpo no hay suscripción', () => {
    expect(toSubscriptionUsage(null)).toBeNull();
    expect(toSubscriptionUsage(undefined)).toBeNull();
  });

  it('cada ventana puede faltar por separado, como null o ausente', () => {
    expect(toSubscriptionUsage(subscriptionUsageDto({ five_hour: null }))).toMatchObject({ fiveHour: null });
    const withoutWeekly = subscriptionUsageDto();
    delete withoutWeekly.seven_day;
    expect(toSubscriptionUsage(withoutWeekly)).toMatchObject({ sevenDay: null });
    expect(toSubscriptionUsage(withoutWeekly)?.fiveHour).not.toBeNull();
  });
});

describe('AC-136: HttpSubscriptionUsageSource', () => {
  let signals: Subject<LiveSignal>;
  let source: HttpSubscriptionUsageSource;
  let http: HttpTestingController;

  beforeEach(() => {
    signals = new Subject<LiveSignal>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        HttpSubscriptionUsageSource,
        { provide: EventFeed, useValue: { search: () => of([]), live: () => signals } },
      ],
    });
    source = TestBed.inject(HttpSubscriptionUsageSource);
    http = TestBed.inject(HttpTestingController);
  });

  it('pide GET /api/v1/subscription-usage y traduce la lectura', () => {
    let result: SubscriptionUsage | null | undefined;
    source.current().subscribe((u) => (result = u));
    const request = http.expectOne('/api/v1/subscription-usage');
    expect(request.request.method).toBe('GET');
    request.flush({ usage: subscriptionUsageDto() });
    expect(result?.fiveHour?.remainingPercent).toBe(62);
  });

  it('con usage null (sin suscripción) devuelve null', () => {
    let result: SubscriptionUsage | null | undefined;
    source.current().subscribe((u) => (result = u));
    http.expectOne('/api/v1/subscription-usage').flush({ usage: null });
    expect(result).toBeNull();
  });

  it('escucha subscription.usage del socket compartido, sin abrir otro', () => {
    const received: Array<SubscriptionUsage | null> = [];
    source.changes().subscribe((u) => received.push(u));
    signals.next({ kind: 'connection', connection: 'live' });
    signals.next({ kind: 'subscription', usage: subscriptionUsage() });
    signals.next({ kind: 'subscription', usage: null });
    expect(received).toHaveLength(2);
    expect(received[0]?.sevenDay?.remainingPercent).toBe(40);
    expect(received[1]).toBeNull();
  });
});

describe('AC-136: LiveEvents.subscriptionUsage$', () => {
  it('emite solo las lecturas de la suscripción', () => {
    const signals = new Subject<LiveSignal>();
    TestBed.configureTestingModule({ providers: [{ provide: EventFeed, useValue: { search: () => of([]), live: () => signals } }] });
    const live = TestBed.inject(LiveEvents);
    const received: Array<SubscriptionUsage | null> = [];
    live.subscriptionUsage$.subscribe((u) => received.push(u));

    signals.next({ kind: 'connection', connection: 'live' });
    signals.next({ kind: 'subscription', usage: subscriptionUsage() });

    expect(received).toStrictEqual([subscriptionUsage()]);
  });
});

describe('AC-136: WatchSubscriptionUsage', () => {
  let changes: Subject<SubscriptionUsage | null>;
  let reads: number;
  let current: () => Observable<SubscriptionUsage | null>;

  function setup() {
    reads = 0;
    changes = new Subject();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SubscriptionUsageSource,
          useValue: {
            current: () => {
              reads += 1;
              return current();
            },
            changes: () => changes,
          },
        },
      ],
    });
    const states: SubscriptionUsageState[] = [];
    const subscription = TestBed.inject(WatchSubscriptionUsage).state$.subscribe((s) => states.push(s));
    return { states, subscription };
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reduceSubscription guarda la lectura o, si falla, conserva la anterior', () => {
    const usage = subscriptionUsage();
    const loaded = reduceSubscription(INITIAL_SUBSCRIPTION_STATE, { ok: true, usage });
    expect(loaded).toStrictEqual({ usage, loaded: true, failed: false });
    expect(reduceSubscription(loaded, { ok: false })).toStrictEqual({ usage, loaded: true, failed: true });
  });

  it('carga la lectura inicial y la refresca cada minuto', async () => {
    current = () => of(subscriptionUsage());
    const { states, subscription } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: false });
    expect(states.at(-1)?.usage?.fiveHour?.remainingPercent).toBe(62);

    await vi.advanceTimersByTimeAsync(SUBSCRIPTION_REFRESH_MS);
    expect(reads).toBe(2);
    subscription.unsubscribe();
  });

  it('un mensaje del WebSocket actualiza la lectura', async () => {
    current = () => of(subscriptionUsage());
    const { states, subscription } = setup();
    await vi.advanceTimersByTimeAsync(0);

    changes.next(subscriptionUsage({ five_hour: windowDto({ used_percent: 90, remaining_percent: 10, status: 'near' }) }));

    expect(states.at(-1)?.usage?.fiveHour).toMatchObject({ remainingPercent: 10, status: 'near' });
    subscription.unsubscribe();
  });

  it('sin suscripción (null) no hay lectura, y un null posterior la oculta', async () => {
    current = () => of(null);
    const { states, subscription } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toStrictEqual({ usage: null, loaded: true, failed: false });

    changes.next(subscriptionUsage());
    expect(states.at(-1)?.usage).not.toBeNull();
    changes.next(null);
    expect(states.at(-1)?.usage).toBeNull();
    subscription.unsubscribe();
  });

  it('un fallo de red conserva el último valor y lo marca', async () => {
    let fail = false;
    current = () => (fail ? throwError(() => new Error('red')) : of(subscriptionUsage()));
    const { states, subscription } = setup();
    await vi.advanceTimersByTimeAsync(0);

    fail = true;
    await vi.advanceTimersByTimeAsync(SUBSCRIPTION_REFRESH_MS);

    expect(states.at(-1)?.failed).toBe(true);
    expect(states.at(-1)?.usage?.fiveHour?.remainingPercent).toBe(62);
    subscription.unsubscribe();
  });
});
