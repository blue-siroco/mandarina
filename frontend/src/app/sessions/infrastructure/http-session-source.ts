import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { SessionDetailDto, SessionListDto, toSessionDetail, toSessionList } from '../mappers/session.mapper';
import { SessionDetail, SessionFilter, SessionList } from '../models/session';
import { SessionSource } from '../ports/session-source';

@Injectable()
export class HttpSessionSource extends SessionSource {
  private readonly http = inject(HttpClient);

  list({ since, states, directory }: SessionFilter): Observable<SessionList> {
    let params = new HttpParams();
    if (since) params = params.set('since', since.toISOString());
    for (const state of states ?? []) params = params.append('state', state);
    if (directory) params = params.set('directory', directory);
    return this.http.get<SessionListDto>('/api/v1/sessions', { params }).pipe(map(toSessionList));
  }

  detail(sessionId: string): Observable<SessionDetail | null> {
    return this.http.get<SessionDetailDto>(`/api/v1/sessions/${encodeURIComponent(sessionId)}`).pipe(
      map(toSessionDetail),
      // Un 404 es un resultado ("no existe"), no un fallo que haya que reintentar.
      catchError((error: unknown) =>
        error instanceof HttpErrorResponse && error.status === 404 ? of(null) : throwError(() => error),
      ),
    );
  }
}
