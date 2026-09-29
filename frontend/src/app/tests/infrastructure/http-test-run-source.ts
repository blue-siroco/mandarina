import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { TestRunListDto, toTestRunList } from '../mappers/test-run.mapper';
import { TestRunList } from '../models/test-run';
import { TestRunSource } from '../ports/test-run-source';

@Injectable()
export class HttpTestRunSource extends TestRunSource {
  private readonly http = inject(HttpClient);

  fetch(since: Date): Observable<TestRunList> {
    const params = new HttpParams().set('since', since.toISOString());
    return this.http.get<TestRunListDto>('/api/v1/test-runs', { params }).pipe(map(toTestRunList));
  }
}
