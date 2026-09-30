import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { LiveEvents } from '../../events/application/live-events';
import { SubscriptionUsageDto, toSubscriptionUsage } from '../mappers/subscription-usage.mapper';
import { SubscriptionUsage } from '../models/subscription-usage';
import { SubscriptionUsageSource } from '../ports/subscription-usage-source';

@Injectable()
export class HttpSubscriptionUsageSource extends SubscriptionUsageSource {
  private readonly http = inject(HttpClient);
  // El WebSocket es uno solo para toda la app: aquí solo se escucha `subscription.usage`.
  private readonly live = inject(LiveEvents);

  current(): Observable<SubscriptionUsage | null> {
    return this.http
      .get<{ usage: SubscriptionUsageDto | null }>('/api/v1/subscription-usage')
      .pipe(map(({ usage }) => toSubscriptionUsage(usage)));
  }

  changes(): Observable<SubscriptionUsage | null> {
    return this.live.subscriptionUsage$;
  }
}
