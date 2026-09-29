import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { evaluationKey } from '../models/evaluation';
import { EvaluationSource } from '../ports/evaluation-source';
import { evaluationList } from '../testing/evaluation-fixtures';
import { EvaluationsOfSession, SessionEvaluations } from './evaluations-of-session';

describe('AC-57: EvaluationsOfSession', () => {
  function run(list: unknown) {
    TestBed.configureTestingModule({ providers: [{ provide: EvaluationSource, useValue: { list } }] });
    const states: SessionEvaluations[] = [];
    TestBed.inject(EvaluationsOfSession)
      .execute('s1')
      .subscribe((s) => states.push(s));
    return states;
  }

  it('pide las Evaluaciones de la Sesión y las indexa por tipo e id', () => {
    const list = vi.fn(() => of(evaluationList()));
    const states = run(list);
    expect(list).toHaveBeenCalledExactlyOnceWith({ sessionId: 's1' });
    expect(states[0]).toMatchObject({ loaded: false, failed: false });
    const done = states.at(-1)!;
    expect(done).toMatchObject({ loaded: true, failed: false });
    expect([...done.byKey.keys()]).toStrictEqual([evaluationKey('turn', 'p1'), evaluationKey('subagent', 'agent-a1'), evaluationKey('session', 's1')]);
    expect(done.byKey.get('turn:p1')?.score).toBe(-1);
  });

  it('si falla sigue cargada y vacía para que se pueda evaluar igualmente', () => {
    const states = run(() => throwError(() => new Error('caído')));
    expect(states.at(-1)).toMatchObject({ loaded: true, failed: true });
    expect(states.at(-1)?.byKey.size).toBe(0);
  });
});
