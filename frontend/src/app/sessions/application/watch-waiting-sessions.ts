import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import {
  Observable,
  asyncScheduler,
  catchError,
  defer,
  exhaustMap,
  finalize,
  map,
  merge,
  of,
  scan,
  shareReplay,
  startWith,
  tap,
  throttleTime,
  timer,
} from 'rxjs';
import { AlertSound } from '../../budgets/application/alert-sound';
import { LiveEvents } from '../../events/application/live-events';
import { SessionList, SessionSummary } from '../models/session';
import { SessionSource } from '../ports/session-source';
import { BOARD_REFRESH_MS, LIVE_THROTTLE_MS } from './watch-session-board';

/** Una Sesión que sigue Esperando vuelve a sonar como mucho una vez en este plazo (AC-96). */
export const WAITING_RESOUND_MS = 5 * 60_000;
/** Título de la pestaña sin esperas (AC-95). */
export const BASE_TITLE = 'Mandarina';
/** Variante de aviso del favicon (AC-95); el asset vive en `public/assets/images`. */
export const WAITING_FAVICON = 'assets/images/logo-waiting.svg';

/** Lo que muestra el aviso de la cabecera: cuántas esperan y la que lleva más tiempo. */
export interface WaitingState {
  count: number;
  /** La Sesión con menor `waiting.since`; `null` sin esperas. */
  oldest: SessionSummary | null;
  loaded: boolean;
  /** El último `GET /sessions` falló; `count` y `oldest` son el último valor conocido. */
  failed: boolean;
}

export const INITIAL_WAITING: WaitingState = {
  count: 0,
  oldest: null,
  loaded: false,
  failed: false,
};

type Result = { ok: true; list: SessionList } | { ok: false };

/** Sesiones Esperando de todas las que se pasen y la más antigua por inicio de espera. */
export function oldestWaiting(items: SessionSummary[]): Pick<WaitingState, 'count' | 'oldest'> {
  const waiting = items.filter((s) => s.activity === 'waiting' && s.waiting);
  const oldest = waiting.reduce<SessionSummary | null>(
    (best, s) => (best === null || s.waiting!.since < best.waiting!.since ? s : best),
    null,
  );
  return { count: waiting.length, oldest };
}

/** Una espera se identifica por Sesión e inicio: una espera nueva en la misma Sesión es otra transición. */
const waitKey = (s: SessionSummary) => `${s.sessionId}@${s.waiting!.since.getTime()}`;

interface Tracker {
  state: WaitingState;
  /** Esperas del último refresco correcto; `null` antes de la primera carga. */
  keys: ReadonlySet<string> | null;
  lastSoundAt: number | null;
  sound: boolean;
}

const INITIAL_TRACKER: Tracker = {
  state: INITIAL_WAITING,
  keys: null,
  lastSoundAt: null,
  sound: false,
};

/**
 * Suena si hay una espera nueva respecto al refresco anterior (nunca en la primera carga) o si,
 * habiendo sonado ya, sigue habiendo esperas pasado el plazo; y siempre respetando el plazo (AC-96).
 */
export function trackWaiting(prev: Tracker, result: Result, now: number): Tracker {
  if (!result.ok) return { ...prev, sound: false, state: { ...prev.state, loaded: true, failed: true } };
  const waiting = result.list.items.filter((s) => s.activity === 'waiting' && s.waiting);
  const keys = new Set(waiting.map(waitKey));
  const isNew = prev.keys !== null && waiting.some((s) => !prev.keys!.has(waitKey(s)));
  const due = prev.lastSoundAt === null || now - prev.lastSoundAt >= WAITING_RESOUND_MS;
  const sound = keys.size > 0 && due && (isNew || prev.lastSoundAt !== null);
  return {
    state: { ...oldestWaiting(result.list.items), loaded: true, failed: false },
    keys,
    lastSoundAt: sound ? now : prev.lastSoundAt,
    sound,
  };
}

/**
 * Caso de uso: vigila las Sesiones Esperando de todos los Proyectos y las avisa fuera del board:
 * título `(N) Mandarina`, favicon de aviso y sonido al pasar a Esperando (AC-95, AC-96).
 * Suscribirse activa los efectos; al dejar de estar suscrito se restauran título y favicon.
 */
@Injectable({ providedIn: 'root' })
export class WatchWaitingSessions {
  private readonly source = inject(SessionSource);
  private readonly live = inject(LiveEvents);
  private readonly sound = inject(AlertSound);
  private readonly title = inject(Title);
  private readonly document = inject(DOCUMENT);
  private waitingCount = 0;
  /** Último título de ruta: el Router lo reescribe en cada navegación y hay que poder devolverlo cuando ya no hay esperas. */
  private routeTitle = BASE_TITLE;

  /** Compartido: varios suscriptores (cabecera, pruebas) no duplican peticiones ni sonidos. */
  readonly state$: Observable<WaitingState> = defer(() => this.watch()).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  private watch(): Observable<WaitingState> {
    const originals = new Map<HTMLLinkElement, { href: string; type: string }>();
    const liveTrigger$ = this.live.events$.pipe(throttleTime(LIVE_THROTTLE_MS, asyncScheduler, { leading: true, trailing: true }));
    return merge(timer(0, BOARD_REFRESH_MS), liveTrigger$).pipe(
      // Sin filtros: cuentan Sesiones de todos los Proyectos, no las del board.
      exhaustMap(() =>
        this.source.list({}).pipe(
          map((list): Result => ({ ok: true, list })),
          catchError(() => of<Result>({ ok: false })),
        ),
      ),
      scan((tracker, result) => trackWaiting(tracker, result, Date.now()), INITIAL_TRACKER),
      tap((tracker) => {
        if (tracker.sound) this.sound.play('waiting');
        this.decorate(tracker.state.count, originals);
      }),
      map((tracker) => tracker.state),
      startWith(INITIAL_WAITING),
      finalize(() => this.decorate(0, originals)),
    );
  }

  /** Título de la pestaña para un título de ruta: con esperas manda `(N) Mandarina`, si no el de la ruta. */
  titleFor(routeTitle: string): string {
    this.routeTitle = routeTitle;
    return this.waitingCount > 0 ? `(${this.waitingCount}) ${BASE_TITLE}` : routeTitle;
  }

  /** Título y favicon reflejan N; con 0 se devuelve todo a como estaba. */
  private decorate(count: number, originals: Map<HTMLLinkElement, { href: string; type: string }>): void {
    this.waitingCount = count;
    this.title.setTitle(this.titleFor(this.routeTitle));
    const links = this.document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
    for (const link of Array.from(links)) {
      if (count > 0) {
        if (!originals.has(link)) originals.set(link, { href: link.getAttribute('href') ?? '', type: link.type });
        link.setAttribute('href', WAITING_FAVICON);
        link.type = 'image/svg+xml';
      } else if (originals.has(link)) {
        const { href, type } = originals.get(link)!;
        link.setAttribute('href', href);
        link.type = type;
        originals.delete(link);
      }
    }
  }
}
