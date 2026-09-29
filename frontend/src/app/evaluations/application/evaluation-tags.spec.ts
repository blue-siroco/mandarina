import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { EvaluationSource } from '../ports/evaluation-source';
import { EvaluationTags } from './evaluation-tags';

describe('AC-57: EvaluationTags', () => {
  function setup(tags: unknown) {
    TestBed.configureTestingModule({ providers: [{ provide: EvaluationSource, useValue: { tags } }] });
    return TestBed.inject(EvaluationTags);
  }

  it('antes de cargar ofrece las sugeridas', () => {
    expect(setup(() => of([])).options()).toStrictEqual(['bug-fix', 'hallucination', 'prompt-breakdown', 'refactor']);
  });

  it('las usadas van primero y sin repetir las sugeridas', () => {
    const tags = vi.fn(() => of([{ tag: 'zeta', count: 3 }, { tag: 'refactor', count: 1 }]));
    const service = setup(tags);
    service.ensureLoaded();
    service.ensureLoaded();
    expect(tags).toHaveBeenCalledTimes(1);
    expect(service.options()).toStrictEqual(['zeta', 'refactor', 'bug-fix', 'hallucination', 'prompt-breakdown']);
  });

  it('recuerda lo que se acaba de guardar', () => {
    const service = setup(() => of([]));
    service.remember(['nueva', 'bug-fix']);
    expect(service.options()[0]).toBe('nueva');
    expect(service.options().filter((t) => t === 'bug-fix')).toHaveLength(1);
  });

  it('si falla la carga siguen las sugeridas', () => {
    const service = setup(() => throwError(() => new Error('caído')));
    service.ensureLoaded();
    expect(service.options()).toHaveLength(4);
  });
});
