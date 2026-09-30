import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { BASE_TITLE, WatchWaitingSessions } from './watch-waiting-sessions';

/**
 * Sustituye a la estrategia por defecto: el Router escribe el título de la ruta al terminar cada
 * navegación y pisaría el contador `(N) Mandarina` de las Sesiones Esperando (AC-95).
 */
@Injectable({ providedIn: 'root' })
export class WaitingTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly waiting = inject(WatchWaitingSessions);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.title.setTitle(this.waiting.titleFor(this.buildTitle(snapshot) ?? BASE_TITLE));
  }
}
