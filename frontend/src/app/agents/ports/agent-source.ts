import { Observable } from 'rxjs';
import { AgentProfile, AgentTypeList } from '../models/agent';

export interface AgentFilter {
  since: Date;
  project?: string;
}

/** Origen de la comparativa y los perfiles de los Tipos de Subagente. */
export abstract class AgentSource {
  abstract list(filter: AgentFilter): Observable<AgentTypeList>;
  /** `type: null` pide los Lanzamientos sin Tipo conocido. */
  abstract profile(type: string | null, filter: AgentFilter): Observable<AgentProfile>;
}
