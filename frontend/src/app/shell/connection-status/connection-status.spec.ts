import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { LiveConnection } from '../../events/models/observed-event';
import { ConnectionStatus } from './connection-status';

describe('AC-09, AC-16: ConnectionStatus', () => {
  it.each([
    ['connecting', 'Conectando…'],
    ['live', 'En vivo'],
    ['offline', 'Sin conexión, reintentando…'],
  ] as const)('indica la conexión %s como región viva', async (connection, label) => {
    const connection$ = new BehaviorSubject<LiveConnection>(connection);
    await TestBed.configureTestingModule({
      imports: [ConnectionStatus],
      providers: [{ provide: LiveEvents, useValue: { connection$ } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ConnectionStatus);
    await fixture.whenStable();

    const status = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]') as HTMLElement;
    expect(status.textContent?.trim()).toBe(label);
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.dataset['connection']).toBe(connection);
  });
});
