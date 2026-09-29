import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AgentProfileDto, AgentTypeListDto, toAgentProfile, toAgentTypeList } from '../mappers/agent.mapper';
import { AgentProfile, AgentTypeList } from '../models/agent';
import { AgentFilter, AgentSource } from '../ports/agent-source';

/** Segmento de la URL para los Lanzamientos sin Tipo conocido (AC-46). */
export const NO_TYPE = 'sin-tipo';

const paramsOf = ({ since, project }: AgentFilter) => {
  const params = new HttpParams().set('since', since.toISOString());
  return project === undefined ? params : params.set('project', project);
};

@Injectable()
export class HttpAgentSource extends AgentSource {
  private readonly http = inject(HttpClient);

  list(filter: AgentFilter): Observable<AgentTypeList> {
    return this.http.get<AgentTypeListDto>('/api/v1/agents', { params: paramsOf(filter) }).pipe(map(toAgentTypeList));
  }

  profile(type: string | null, filter: AgentFilter): Observable<AgentProfile> {
    const segment = encodeURIComponent(type ?? NO_TYPE);
    return this.http.get<AgentProfileDto>(`/api/v1/agents/${segment}`, { params: paramsOf(filter) }).pipe(map(toAgentProfile));
  }
}
