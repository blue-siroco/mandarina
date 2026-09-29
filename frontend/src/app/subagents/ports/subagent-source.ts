import { Observable } from 'rxjs';
import { SubagentList } from '../models/subagent';

export interface SubagentFilter {
  since: Date;
  project?: string;
  type?: string;
  includeInternal?: boolean;
}

/** Origen de los Subagentes de todas las Sesiones. */
export abstract class SubagentSource {
  abstract fetch(filter: SubagentFilter): Observable<SubagentList>;
}
