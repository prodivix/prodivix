import type {
  ExportFile,
  ExportFileContribution,
  ExportPlannerPreset,
  ReserveExportPath,
} from '#src/export/types';
import { joinExportPath } from '#src/export/pathPlanner';

const getFileContributionDesiredPath = (
  file: ExportFileContribution,
  preset: ExportPlannerPreset
) => {
  if (file.baseDirectory === 'source-root') {
    return joinExportPath(preset.sourceRoot, file.desiredPath);
  }
  if (file.baseDirectory === 'public-root') {
    return joinExportPath('public', file.desiredPath);
  }
  return file.desiredPath;
};

export const planExportFileContributions = (
  files: ExportFileContribution[],
  preset: ExportPlannerPreset,
  reservePath: ReserveExportPath
): ExportFile[] =>
  files.map((file) => ({
    id: file.id,
    path: reservePath(getFileContributionDesiredPath(file, preset), {
      id: file.id,
      kind: file.kind,
    }),
    kind: file.kind,
    language: file.language,
    mimeType: file.mimeType,
    importMode: file.importMode,
    contents: file.contents,
    sourceTrace: file.sourceTrace,
    origin: file.origin,
  }));
