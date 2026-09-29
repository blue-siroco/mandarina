import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { SubagentListDto, toSubagentList } from '../mappers/subagent.mapper';
import { SubagentList } from '../models/subagent';
import { SubagentFilter, SubagentSource } from '../ports/subagent-source';

@Injectable()
export class HttpSubagentSource extends SubagentSource {
  private readonly http = inject(HttpClient);

  fetch({ since, project, type, includeInternal }: SubagentFilter): Observable<SubagentList> {
    let params = new HttpParams().set('since', since.toISOString());
    if (project !== undefined) params = params.set('project', project);
    if (type !== undefined) params = params.set('type', type);
    if (includeInternal) params = params.set('include_internal', 'true');
    return this.http.get<SubagentListDto>('/api/v1/subagents', { params }).pipe(map(toSubagentList));
  }
}
