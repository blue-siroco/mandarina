import { Observable } from 'rxjs';
import { SkillInvocationList } from '../models/skill-invocation';

/** Origen de las Invocaciones de skill. */
export abstract class SkillInvocationSource {
  abstract fetch(since: Date, sessionId?: string): Observable<SkillInvocationList>;
}
