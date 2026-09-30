import { Provider } from '@angular/core';
import { HttpDownloadSource } from './infrastructure/http-download-source';
import { DownloadSource } from './ports/download-source';

/** Composition root del feature de Descargas de Sesión y de Eventos. */
export function provideDownloads(): Provider[] {
  return [{ provide: DownloadSource, useClass: HttpDownloadSource }];
}
