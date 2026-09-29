import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Evaluation, EvaluationList } from '../models/evaluation';
import { evaluation, evaluationDto, evaluationList, evaluationListDto } from '../testing/evaluation-fixtures';
import { HttpEvaluationSource } from './http-evaluation-source';

describe('AC-55: HttpEvaluationSource', () => {
  let source: HttpEvaluationSource;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), HttpEvaluationSource] });
    source = TestBed.inject(HttpEvaluationSource);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista sin filtros y traduce las Evaluaciones, las Etiquetas y los Proyectos', () => {
    let received: EvaluationList | undefined;
    source.list({}).subscribe((l) => (received = l));
    const request = http.expectOne((r) => r.url === '/api/v1/evaluations');
    expect(request.request.params.keys()).toStrictEqual([]);
    request.flush(evaluationListDto());
    expect(received).toStrictEqual(evaluationList());
    expect(received?.items[0]?.updatedAt).toStrictEqual(new Date('2026-09-25T12:05:00.000Z'));
  });

  it('envía cada filtro con el nombre del contrato', () => {
    source
      .list({ objectTypes: ['turn', 'subagent'], score: 'down', tag: 'bug-fix', project: 'demo', since: new Date('2026-09-24T00:00:00.000Z'), sessionId: 's1' })
      .subscribe();
    const request = http.expectOne((r) => r.url === '/api/v1/evaluations');
    expect(request.request.params.getAll('object_type')).toStrictEqual(['turn', 'subagent']);
    expect(request.request.params.get('score')).toBe('down');
    expect(request.request.params.get('tag')).toBe('bug-fix');
    expect(request.request.params.get('project')).toBe('demo');
    expect(request.request.params.get('since')).toBe('2026-09-24T00:00:00.000Z');
    expect(request.request.params.get('session_id')).toBe('s1');
    request.flush(evaluationListDto());
  });

  it('pide las Etiquetas usadas', () => {
    let received: unknown;
    source.tags().subscribe((t) => (received = t));
    http.expectOne('/api/v1/evaluations/tags').flush({ items: [{ tag: 'bug-fix', count: 2 }] });
    expect(received).toStrictEqual([{ tag: 'bug-fix', count: 2 }]);
  });

  it('guarda con PUT en la ruta del objeto, con el id codificado, y devuelve la Evaluación', () => {
    let received: Evaluation | undefined;
    source.put('subagent', 'agent/a 1', { score: 1, tags: ['x'], note: null }).subscribe((e) => (received = e));
    const request = http.expectOne('/api/v1/evaluations/subagent/agent%2Fa%201');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toStrictEqual({ score: 1, tags: ['x'], note: null });
    request.flush(evaluationDto({ object_type: 'subagent', object_id: 'agent/a 1' }));
    expect(received).toStrictEqual(evaluation({ object_type: 'subagent', object_id: 'agent/a 1' }));
  });

  it('borra con DELETE y completa aunque la respuesta no tenga cuerpo (204)', () => {
    let done = false;
    source.remove('turn', 'p1').subscribe(() => (done = true));
    const request = http.expectOne('/api/v1/evaluations/turn/p1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });

  it('la URL de exportación lleva los mismos filtros que el listado', () => {
    expect(source.exportUrl({})).toBe('/api/v1/evaluations/export');
    const url = source.exportUrl({ objectTypes: ['turn'], score: 'up', tag: 'bug-fix', project: 'demo' });
    expect(url).toBe('/api/v1/evaluations/export?object_type=turn&score=up&tag=bug-fix&project=demo');
  });
});
