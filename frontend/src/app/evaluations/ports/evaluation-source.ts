import { Observable } from 'rxjs';
import { Evaluation, EvaluationFilter, EvaluationInput, EvaluationList, EvaluationObjectType, EvaluationTagCount } from '../models/evaluation';

/** Origen de las Evaluaciones humanas. */
export abstract class EvaluationSource {
  abstract list(filter: EvaluationFilter): Observable<EvaluationList>;
  /** Todas las Etiquetas usadas, para el autocompletado. */
  abstract tags(): Observable<EvaluationTagCount[]>;
  abstract put(objectType: EvaluationObjectType, objectId: string, input: EvaluationInput): Observable<Evaluation>;
  abstract remove(objectType: EvaluationObjectType, objectId: string): Observable<void>;
  /** URL de descarga del Dataset de evaluación (JSONL) con estos filtros (AC-56). */
  abstract exportUrl(filter: EvaluationFilter): string;
}
