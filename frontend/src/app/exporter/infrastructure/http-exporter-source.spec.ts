import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ExporterStatus } from '../models/exporter';
import { exporterStatus, exporterStatusDto } from '../testing/exporter-fixtures';
import { HttpExporterSource } from './http-exporter-source';

describe('AC-52: HttpExporterSource', () => {
  let source: HttpExporterSource;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), HttpExporterSource] });
    source = TestBed.inject(HttpExporterSource);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide el estado del exportador y lo traduce al modelo de la UI', () => {
    let received: ExporterStatus | undefined;
    source.fetch().subscribe((s) => (received = s));
    http.expectOne('/api/v1/exporter').flush(exporterStatusDto());
    expect(received).toStrictEqual(exporterStatus());
    expect(received?.recent[0]?.updatedAt).toStrictEqual(new Date('2026-09-25T12:00:30.000Z'));
    expect(received?.lastExportedAt).toStrictEqual(new Date('2026-09-25T12:00:30.000Z'));
  });

  it('un exportador desactivado no tiene último envío', () => {
    let received: ExporterStatus | undefined;
    source.fetch().subscribe((s) => (received = s));
    http.expectOne('/api/v1/exporter').flush(exporterStatusDto({ enabled: false, last_exported_at: null, recent: [] }));
    expect(received?.enabled).toBe(false);
    expect(received?.lastExportedAt).toBeNull();
  });
});
