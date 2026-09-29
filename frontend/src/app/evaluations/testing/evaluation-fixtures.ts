import { of } from 'rxjs';
import { Evaluation, EvaluationFilter, EvaluationInput, EvaluationList, EvaluationObjectType } from '../models/evaluation';
import { EvaluationSource } from '../ports/evaluation-source';
import { EvaluationDto, EvaluationListDto, toEvaluation, toEvaluationList } from '../mappers/evaluation.mapper';

export const evaluationDto = (overrides: Partial<EvaluationDto> = {}): EvaluationDto => ({
  object_type: 'session',
  object_id: 's1',
  session_id: 's1',
  project: 'mandarina',
  score: 1,
  tags: ['bug-fix'],
  note: 'Bien',
  summary: null,
  agent_type: null,
  created_at: '2026-09-25T12:00:00.000Z',
  updated_at: '2026-09-25T12:05:00.000Z',
  ...overrides,
});

export const evaluation = (overrides: Partial<EvaluationDto> = {}): Evaluation => toEvaluation(evaluationDto(overrides));

export const evaluationListDto = (overrides: Partial<EvaluationListDto> = {}): EvaluationListDto => ({
  items: [
    evaluationDto({ object_type: 'turn', object_id: 'p1', summary: 'arregla el test', score: -1, tags: ['hallucination', 'bug-fix'], note: null }),
    evaluationDto({ object_type: 'subagent', object_id: 'agent-a1', summary: 'buscar el test', agent_type: 'Explore', score: 1, tags: [], note: 'Lo encontró' }),
    evaluationDto(),
  ],
  tags: [
    { tag: 'bug-fix', count: 2 },
    { tag: 'hallucination', count: 1 },
  ],
  facets: { projects: ['lucia', 'mandarina'] },
  ...overrides,
});

export const evaluationList = (overrides: Partial<EvaluationListDto> = {}): EvaluationList => toEvaluationList(evaluationListDto(overrides));

/** Doble del puerto para las pruebas de otras features que alojan `EvaluationControls`. */
export function stubEvaluationSource(overrides: Partial<Record<keyof EvaluationSource, unknown>> = {}) {
  const calls = { list: [] as EvaluationFilter[], put: [] as Array<[EvaluationObjectType, string, EvaluationInput]>, remove: [] as Array<[EvaluationObjectType, string]> };
  const source = {
    list: (filter: EvaluationFilter) => (calls.list.push(filter), of(evaluationList({ items: [], tags: [] }))),
    tags: () => of([]),
    put: (type: EvaluationObjectType, id: string, input: EvaluationInput) => (calls.put.push([type, id, input]), of(evaluation({ object_type: type, object_id: id }))),
    remove: (type: EvaluationObjectType, id: string) => (calls.remove.push([type, id]), of(undefined)),
    exportUrl: () => '/api/v1/evaluations/export',
    ...overrides,
  };
  return { provider: { provide: EvaluationSource, useValue: source }, calls };
}
