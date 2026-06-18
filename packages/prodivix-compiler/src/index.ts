export {
  generateReactBundle,
  generateReactCode,
  type ReactExportBundle,
} from '#src/pirToReact';
export { compilePirToReactComponent } from '#src/react/compileComponent';
export type {
  ExportResourceType,
  ReactComponentCompileResult,
  ReactCompileOptions,
  ReactExportFile,
  ReactGeneratorCodeArtifact,
  ReactGeneratorOptions,
} from '#src/react/types';
export type { TargetAdapter } from '#src/core/adapter';
export type { CompileDiagnostic } from '#src/core/diagnostics';
export type { PIRDocument } from '@prodivix/shared/types/pir';
