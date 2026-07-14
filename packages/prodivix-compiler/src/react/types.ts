import type { ExportBundle, ExportFile } from '#src/export/types';

export type ExportResourceType =
  'project' | 'component' | 'page' | 'route' | 'nodegraph' | 'animation';

export type ReactExportFile = ExportFile;

export type ReactExportBundle = Omit<ExportBundle, 'entryFilePath'> & {
  type: ExportResourceType;
  entryFilePath: string;
  files: ReactExportFile[];
};

export type ReactGeneratorCodeArtifact = Readonly<{
  id: string;
  path: string;
  language: string;
  source: string;
}>;
