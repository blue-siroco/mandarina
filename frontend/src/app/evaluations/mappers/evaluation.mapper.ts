import { Evaluation, EvaluationList, EvaluationObjectType, EvaluationTagCount, Score } from '../models/evaluation';

/** `Evaluation` de `spec/api-spec.yaml`. */
export interface EvaluationDto {
  object_type: EvaluationObjectType;
  object_id: string;
  session_id: string;
  project: string;
  score: Score | null;
  tags: string[];
  note: string | null;
  summary: string | null;
  agent_type: string | null;
  created_at: string;
  updated_at: string;
}

/** Respuesta de `GET /api/v1/evaluations`. */
export interface EvaluationListDto {
  items: EvaluationDto[];
  tags: EvaluationTagCount[];
  facets: { projects: string[] };
}

export const toEvaluation = (dto: EvaluationDto): Evaluation => ({
  objectType: dto.object_type,
  objectId: dto.object_id,
  sessionId: dto.session_id,
  project: dto.project,
  score: dto.score,
  tags: [...dto.tags],
  note: dto.note,
  summary: dto.summary,
  agentType: dto.agent_type,
  createdAt: new Date(dto.created_at),
  updatedAt: new Date(dto.updated_at),
});

export const toEvaluationList = (dto: EvaluationListDto): EvaluationList => ({
  items: dto.items.map(toEvaluation),
  tags: dto.tags.map((t) => ({ ...t })),
  projects: [...dto.facets.projects],
});
