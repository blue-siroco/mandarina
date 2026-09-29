import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ExporterStatusDto, toExporterStatus } from '../mappers/exporter.mapper';
import { ExporterStatus } from '../models/exporter';
import { ExporterSource } from '../ports/exporter-source';

@Injectable()
export class HttpExporterSource extends ExporterSource {
  private readonly http = inject(HttpClient);

  fetch(): Observable<ExporterStatus> {
    return this.http.get<ExporterStatusDto>('/api/v1/exporter').pipe(map(toExporterStatus));
  }
}
