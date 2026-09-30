import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { WaitingTitleStrategy } from './waiting-title-strategy';
import { WatchWaitingSessions } from './watch-waiting-sessions';

// AC-95: el título de ruta que escribe el Router no pisa el contador de Sesiones Esperando.
describe('AC-95: WaitingTitleStrategy', () => {
  const snapshot = {} as RouterStateSnapshot;

  function setup(count: number) {
    const waiting = { titleFor: (t: string) => (count > 0 ? `(${count}) Mandarina` : t) };
    TestBed.configureTestingModule({ providers: [{ provide: WatchWaitingSessions, useValue: waiting }] });
    const strategy = TestBed.inject(WaitingTitleStrategy);
    vi.spyOn(strategy, 'buildTitle').mockReturnValue('Board · Mandarina');
    return { strategy, title: TestBed.inject(Title) };
  }

  it('sin esperas deja el título de la ruta', () => {
    const { strategy, title } = setup(0);
    strategy.updateTitle(snapshot);
    expect(title.getTitle()).toBe('Board · Mandarina');
  });

  it('con esperas escribe (N) Mandarina en lugar del título de la ruta', () => {
    const { strategy, title } = setup(2);
    strategy.updateTitle(snapshot);
    expect(title.getTitle()).toBe('(2) Mandarina');
  });
});
