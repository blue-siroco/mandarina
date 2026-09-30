import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { downloadPreview, stubDownloadSource } from '../testing/download-fixtures';
import { PreviewDownload, PreviewState } from './preview-download';

describe('AC-147: PreviewDownload', () => {
  const target = { kind: 'session', sessionId: 's1' } as const;

  function run(respond: Parameters<typeof stubDownloadSource>[0]) {
    const stub = stubDownloadSource(respond);
    TestBed.configureTestingModule({ providers: [stub.provider] });
    const states: PreviewState[] = [];
    TestBed.inject(PreviewDownload)
      .execute(target, true)
      .subscribe((s) => states.push(s));
    return { states, stub };
  }

  it('emite «cargando» y luego la vista previa, pidiéndola con el content indicado', () => {
    const { states, stub } = run(() => of(downloadPreview({ total: 3, exported: 3 })));
    expect(states.map((s) => s.status)).toStrictEqual(['loading', 'ready']);
    expect(stub.calls).toStrictEqual([{ target, content: true }]);
  });

  it('un fallo de la vista previa es un estado, no un error', () => {
    const { states } = run(() => throwError(() => new Error('500')));
    expect(states.map((s) => s.status)).toStrictEqual(['loading', 'failed']);
  });

  it('el enlace sale del puerto', () => {
    const stub = stubDownloadSource();
    TestBed.configureTestingModule({ providers: [stub.provider] });
    expect(TestBed.inject(PreviewDownload).link(target, false)).toBe('/api/v1/test/export?content=false');
  });
});
