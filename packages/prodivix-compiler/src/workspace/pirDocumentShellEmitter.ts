import type { ExportModule } from '#src/export/types';
import type { PirImportRegistry } from '#src/workspace/pirImportRegistry';

/**
 * Everything a compiled PIR document module needs, already compiled to
 * target-neutral TypeScript expressions.
 *
 * Component prop/variant defaults, state initialisers, Data lifecycle bindings
 * and runtime-value maps are PIR semantics — they are identical in every
 * target. Only the component shell that hosts them differs.
 */
export type PirDocumentShellInput = Readonly<{
  imports: PirImportRegistry;
  prelude: string;
  moduleName: string;
  documentIdJson: string;
  rootInstancePath: string;
  stateValues: string;
  componentProps: string;
  componentVariants: string;
  baseDataRuntimeValues: string;
  dataRuntimeValues: string;
  scopeDataRuntimeValues: string;
  dataOperationBindings: string;
  rootExpression: string;
}>;

export type PirDocumentShellEmitter = Readonly<{
  moduleKind: ExportModule['kind'];
  language: NonNullable<ExportModule['language']>;
  /** Packages whose versions the import registry must be able to resolve. */
  packageVersions(): Readonly<Record<string, string>>;
  /**
   * The Collection issue reporter component. It is the one piece of the shared
   * prelude that must be an actual component, so each target emits its own
   * against the neutral `__PdxCollectionIssueReporterProps`.
   */
  createCollectionIssueReporterSource(imports: PirImportRegistry): string;
  createModuleBody(input: PirDocumentShellInput): string;
}>;
