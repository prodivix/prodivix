import type { ElementType, ReactNode } from 'react';
import type { ComponentAdapter } from '@/pir/renderer/registry';

export type ExternalLibraryDiagnosticLevel = 'info' | 'warning' | 'error';
export type ExternalLibraryDiagnosticStage =
  'load' | 'scan' | 'register' | 'render' | 'codegen';

export type ExternalLibraryDiagnostic = {
  code: string;
  level: ExternalLibraryDiagnosticLevel;
  stage: ExternalLibraryDiagnosticStage;
  message: string;
  hint?: string;
  retryable?: boolean;
  libraryId?: string;
};

export type ExternalLibraryDescriptor = {
  libraryId: string;
  packageName: string;
  version: string;
  source: 'esm.sh';
  entryCandidates: string[];
};

export type CanonicalExternalComponent = {
  libraryId: string;
  componentName: string;
  component: ElementType;
  runtimeType: string;
  itemId: string;
  path: string;
  adapter: ComponentAdapter;
  preview: ReactNode;
  renderPreview?: (options: { size?: string; status?: string }) => ReactNode;
  sizeOptions?: { id: string; label: string; value: string }[];
  defaultProps?: Record<string, unknown>;
  propOptions?: Record<string, string[]>;
  propsSchema?: Record<string, unknown>;
  slots?: string[];
  behaviorTags?: string[];
  codegenHints?: Record<string, unknown>;
};

export type ExternalCanonicalGroup = {
  id: string;
  title: string;
  source: 'external';
  items: CanonicalExternalComponent[];
};

export type ExternalComponentManifestOverride = {
  displayName?: string;
  defaultProps?: Record<string, unknown>;
  sizeOptions?: { id: string; label: string; value: string }[];
  propOptions?: Record<string, string[]>;
  behaviorTags?: string[];
  codegenHints?: Record<string, unknown>;
  groupId?: string;
  groupTitle?: string;
};

export type ExternalGroupManifestOverride = {
  title?: string;
};

export type ExternalLibraryManifest = {
  componentOverrides?: Record<string, ExternalComponentManifestOverride>;
  groupOverrides?: Record<string, ExternalGroupManifestOverride>;
};

export type ExternalLibraryProfile = {
  descriptor: () => ExternalLibraryDescriptor;
  includePaths?: string[];
  excludeExports?: Set<string>;
  scanMode?: 'discover' | 'include-only';
  manifest?: ExternalLibraryManifest;
  toCanonicalComponents: (
    module: Record<string, unknown>,
    paths: string[]
  ) => CanonicalExternalComponent[];
  toGroups: (
    components: CanonicalExternalComponent[]
  ) => ExternalCanonicalGroup[];
};
