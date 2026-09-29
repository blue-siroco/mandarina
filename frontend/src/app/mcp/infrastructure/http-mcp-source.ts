import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { McpInvocationListDto, toMcpInvocationList } from '../mappers/mcp.mapper';
import { McpInvocationList } from '../models/mcp';
import { McpFilter, McpSource } from '../ports/mcp-source';

@Injectable()
export class HttpMcpSource extends McpSource {
  private readonly http = inject(HttpClient);

  fetch({ since, project, server, sessionId }: McpFilter): Observable<McpInvocationList> {
    let params = new HttpParams().set('since', since.toISOString());
    if (project !== undefined) params = params.set('project', project);
    if (server !== undefined) params = params.set('server', server);
    if (sessionId !== undefined) params = params.set('session_id', sessionId);
    return this.http.get<McpInvocationListDto>('/api/v1/mcp-invocations', { params }).pipe(map(toMcpInvocationList));
  }
}
