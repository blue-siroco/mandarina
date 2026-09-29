import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { SkillInvocationListDto, toSkillInvocationList } from '../mappers/skill-invocation.mapper';
import { SkillInvocationList } from '../models/skill-invocation';
import { SkillInvocationSource } from '../ports/skill-invocation-source';

@Injectable()
export class HttpSkillInvocationSource extends SkillInvocationSource {
  private readonly http = inject(HttpClient);

  fetch(since: Date, sessionId?: string): Observable<SkillInvocationList> {
    let params = new HttpParams().set('since', since.toISOString());
    if (sessionId !== undefined) params = params.set('session_id', sessionId);
    return this.http.get<SkillInvocationListDto>('/api/v1/skill-invocations', { params }).pipe(map(toSkillInvocationList));
  }
}
