import type { PIRDocument } from '@/core/types/engine.types';
import type { TargetAdapter } from '@/pir/generator/core/adapter';
import type { CompileDiagnostic } from '@/pir/generator/core/diagnostics';
import type { CanonicalIRDocument } from '@/pir/generator/core/canonicalIR';
import type { PackageResolverOptions } from '@/pir/generator/core/packageResolver';

export type ExportResourceType = 'project' | 'component' | 'nodegraph';

export type ReactExportFile = {
  path: string;
  language: 'typescript' | 'json' | 'html' | 'css';
  content: string;
};

export type ReactExportBundle = {
  type: ExportResourceType;
  entryFilePath: string;
  files: ReactExportFile[];
  diagnostics?: CompileDiagnostic[];
};

export type MountedCssFile = {
  path: string;
  content: string;
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
};

export type ReactCompileOptions = Pick<
  ReactGeneratorOptions,
  'componentName' | 'adapter' | 'packageResolver' | 'codeArtifacts'
>;

export type ReactComponentCompileResult = {
  componentName: string;
  code: string;
  diagnostics: CompileDiagnostic[];
  canonicalIR: CanonicalIRDocument;
  dependencies: Record<string, string>;
  mountedCssFiles: MountedCssFile[];
};

export type PirDocLike = PIRDocument;
