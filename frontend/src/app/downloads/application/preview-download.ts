import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, startWith } from 'rxjs';
import { DownloadPreview, DownloadTarget } from '../models/download';
import { DownloadSource } from '../ports/download-source';

export type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; preview: DownloadPreview }
  | { status: 'failed' };

export const LOADING_PREVIEW: PreviewState = { status: 'loading' };

/** Caso de uso: qué contendrá la descarga, y a qué URL apunta el enlace (AC-147). */
@Injectable({ providedIn: 'root' })
export class PreviewDownload {
  private readonly source = inject(DownloadSource);

  execute(target: DownloadTarget, content: boolean): Observable<PreviewState> {
    return this.source.preview(target, content).pipe(
      map((preview): PreviewState => ({ status: 'ready', preview })),
      catchError(() => of<PreviewState>({ status: 'failed' })),
      startWith(LOADING_PREVIEW),
    );
  }

  link(target: DownloadTarget, content: boolean): string {
    return this.source.url(target, content);
  }
}
