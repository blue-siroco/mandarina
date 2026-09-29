import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  InjectionWarningListDto,
  MaskingStatsDto,
  toInjectionWarningList,
  toMaskingStats,
} from '../mappers/security.mapper';
import { InjectionFilter, InjectionWarningList, MaskingStats } from '../models/security';
import { SecuritySource } from '../ports/security-source';

const WARNINGS = '/api/v1/injection-warnings';
const dismissal = (id: string) => `${WARNINGS}/${encodeURIComponent(id)}/dismissal`;

@Injectable()
export class HttpSecuritySource extends SecuritySource {
  private readonly http = inject(HttpClient);

  warnings({ since, project, sessionId, severities, pattern, dismissed }: InjectionFilter): Observable<InjectionWarningList> {
    let params = new HttpParams().set('since', since.toISOString());
    if (project !== undefined) params = params.set('project', project);
    if (sessionId !== undefined) params = params.set('session_id', sessionId);
    for (const severity of severities ?? []) params = params.append('severity', severity);
    if (pattern !== undefined) params = params.set('pattern', pattern);
    if (dismissed !== undefined) params = params.set('dismissed', dismissed);
    return this.http.get<InjectionWarningListDto>(WARNINGS, { params }).pipe(map(toInjectionWarningList));
  }

  dismiss(id: string): Observable<void> {
    return this.http.put<void>(dismissal(id), null).pipe(map(() => undefined));
  }

  restore(id: string): Observable<void> {
    return this.http.delete<void>(dismissal(id)).pipe(map(() => undefined));
  }

  maskingStats(since: Date): Observable<MaskingStats> {
    const params = new HttpParams().set('since', since.toISOString());
    return this.http.get<MaskingStatsDto>('/api/v1/masking-stats', { params }).pipe(map(toMaskingStats));
  }
}
