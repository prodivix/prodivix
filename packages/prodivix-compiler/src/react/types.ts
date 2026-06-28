import type { PIRDocument } from '@prodivix/shared/types/pir';
import type { TargetAdapter } from '#src/core/adapter';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import type { CanonicalIRDocument } from '#src/core/canonicalIR';
import type { PackageResolverOptions } from '#src/core/packageResolver';
import type {
  ExportBundle,
  ExportArtifactContribution,
  ExportFile,
  ExportModule,
  ExportProgramContribution,
  ExportRuntimeRequirement,
  ExportSourceOrigin,
  ExportSourceTrace,
  ExportStyleContribution,
} from '#src/export/types';

export type ExportResourceType =
  | 'project'
  | 'component'
  | 'page'
  | 'route'
  | 'nodegraph'
  | 'animation';

export type ReactExportFile = ExportFile;

export type ReactExportBundle = Omit<ExportBundle, 'entryFilePath'> & {
  type: ExportResourceType;
  entryFilePath: string;
  files: ReactExportFile[];
};

export type ReactStyleContribution = ExportStyleContribution;

export type ReactComponentCompileModule = ExportModule & {
  kind: 'react-component' | 'react-entry';
};

export type ReactGeneratorCodeArtifact = {
  id: string;
  path: string;
  language: string;
  source: string;
};

export type ReactGeneratorOptions = {
  resourceType?: ExportResourceType;
  componentName?: string;
  adapter?: TargetAdapter;
  packageResolver?: PackageResolverOptions;
  codeArtifacts?: ReactGeneratorCodeArtifact[];
  includeWorkspaceCodeArtifacts?: boolean;
  exportContributions?: ExportProgramContribution[];
};

export type ReactCompileOptions = Pick<
  ReactGeneratorOptions,
  | 'componentName'
  | 'adapter'
  | 'packageResolver'
  | 'codeArtifacts'
  | 'includeWorkspaceCodeArtifacts'
  | 'exportContributions'
>;

export type ReactComponentCompileResult = {
  componentName: string;
  code: string;
  diagnostics: CompileDiagnostic[];
  canonicalIR: CanonicalIRDocument;
  dependencies: Record<string, string>;
  dependencyOrigins: Record<string, ExportSourceOrigin>;
  module: ReactComponentCompileModule;
  styles: ReactStyleContribution[];
  artifacts: ExportArtifactContribution[];
  runtimeRequirements: ExportRuntimeRequirement[];
  exportContributions: ExportProgramContribution[];
  sourceTrace: ExportSourceTrace[];
};

export type PirDocLike = PIRDocument;
