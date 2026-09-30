import { DownloadPreview } from '../models/download';

/** `DownloadPreview` de `specs/api-spec.yaml`. */
export interface DownloadPreviewDto {
  total: number;
  exported: number;
  truncated: boolean;
  omitted: number;
  fields: string[];
}

export const toDownloadPreview = (dto: DownloadPreviewDto): DownloadPreview => ({
  total: dto.total,
  exported: dto.exported,
  truncated: dto.truncated,
  omitted: dto.omitted,
  fields: [...dto.fields],
});
