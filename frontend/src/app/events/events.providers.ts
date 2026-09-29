import { Provider } from '@angular/core';
import { HttpWsEventFeed } from './infrastructure/http-ws-event-feed';
import { EventFeed } from './ports/event-feed';

/** Composition root del feature de Eventos. */
export function provideEvents(): Provider[] {
  return [{ provide: EventFeed, useClass: HttpWsEventFeed }];
}
