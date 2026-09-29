import { Observable } from 'rxjs';
import { TestRunList } from '../models/test-run';

/** Origen de las Ejecuciones de tests. */
export abstract class TestRunSource {
  abstract fetch(since: Date): Observable<TestRunList>;
}
