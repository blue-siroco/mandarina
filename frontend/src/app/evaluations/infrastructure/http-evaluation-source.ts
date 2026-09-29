import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { EvaluationDto, EvaluationListDto, toEvaluation, toEvaluationList } from '../mappers/evaluation.mapper';
import {
  Evaluation,
  EvaluationFilter,
  EvaluationInput,
  EvaluationList,
  EvaluationObjectType,
  EvaluationTagCount,
} from '../models/evaluation';
import { EvaluationSource } from '../ports/evaluation-source';

const BASE = '/api/v1/evaluations';

/** Los mismos parámetros para el listado y para la exportación (AC-55, AC-56). */
function paramsOf({ objectTypes, score, tag, project, since, sessionId }: EvaluationFilter): HttpParams {
  let params = new HttpParams();
  for (const type of objectTypes ?? []) params = params.append('object_type', type);
  if (score !== undefined) params = params.set('score', score);
  if (tag !== undefined) params = params.set('tag', tag);
  if (project !== undefined) params = params.set('project', project);
  if (since !== undefined) params = params.set('since', since.toISOString());
  if (sessionId !== undefined) params = params.set('session_id', sessionId);
  return params;
}

const path = (objectType: EvaluationObjectType, objectId: string) => `${BASE}/${objectType}/${encodeURIComponent(objectId)}`;

@Injectable()
export class HttpEvaluationSource extends EvaluationSource {
  private readonly http = inject(HttpClient);

  list(filter: EvaluationFilter): Observable<EvaluationList> {
    return this.http.get<EvaluationListDto>(BASE, { params: paramsOf(filter) }).pipe(map(toEvaluationList));
  }

  tags(): Observable<EvaluationTagCount[]> {
    return this.http.get<{ items: EvaluationTagCount[] }>(`${BASE}/tags`).pipe(map((body) => body.items));
  }

  put(objectType: EvaluationObjectType, objectId: string, input: EvaluationInput): Observable<Evaluation> {
    return this.http.put<EvaluationDto>(path(objectType, objectId), input).pipe(map(toEvaluation));
  }

  remove(objectType: EvaluationObjectType, objectId: string): Observable<void> {
    return this.http.delete<void>(path(objectType, objectId)).pipe(map(() => undefined));
  }

  exportUrl(filter: EvaluationFilter): string {
    const query = paramsOf(filter).toString();
    return query === '' ? `${BASE}/export` : `${BASE}/export?${query}`;
  }
}
