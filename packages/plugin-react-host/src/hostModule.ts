import type { ElementType, ReactNode } from 'react';

export type HostPackageCoordinate = Readonly<{
  name: string;
  version: string;
}>;

export type OfficialComponentLibraryImplementation = Readonly<{
  kind: 'component-library';
  package: HostPackageCoordinate;
  components: Readonly<Record<string, ElementType>>;
}>;

export type OfficialReactSurfaceKind = 'palette-preview' | 'blueprint-canvas';

export type OfficialRenderPolicyContext = Readonly<{
  nodeId: string;
  runtimeType: string;
  resolvedProps: Readonly<Record<string, unknown>>;
  resolvedStyle: Readonly<Record<string, unknown>>;
  resolvedText: ReactNode;
  isSelected: boolean;
  hasSelectedDescendant: boolean;
  surface: OfficialReactSurfaceKind;
}>;

export type OfficialRenderPolicyResult = Readonly<{
  props?: Record<string, unknown>;
  children?: ReactNode;
  supportsChildren?: boolean;
  isVoid?: boolean;
  renderNodeChildren?: boolean;
}>;

export type OfficialRenderPolicyImplementation = Readonly<{
  kind: 'render-policy';
  mapProps?: (
    context: OfficialRenderPolicyContext
  ) => OfficialRenderPolicyResult;
  wrapComponent?: (component: ElementType) => ElementType;
}>;

export type OfficialIconExportContext = Readonly<{
  providerId: string;
  requestedName: string;
  variantId?: string;
  subpath?: string;
}>;

export type OfficialIconProviderImplementation = Readonly<{
  kind: 'icon-provider';
  package: HostPackageCoordinate;
  resolveExport(
    exportName: string,
    context: OfficialIconExportContext
  ): ElementType | null;
  listExports(): readonly string[];
  ensureReady?: () => Promise<void>;
}>;

export type OfficialPalettePreviewVariant = Readonly<{
  id: string;
  label: string;
  element: ReactNode;
  scale?: number;
  renderElement?: (options: Readonly<{ size?: string }>) => ReactNode;
  props?: Readonly<Record<string, unknown>>;
}>;

export type OfficialPalettePreviewStatus = Readonly<{
  id: string;
  label: string;
  value: string;
  icon?: ReactNode;
}>;

export type OfficialPalettePreviewItem = Readonly<{
  id: string;
  name: string;
  libraryId?: string;
  preview: ReactNode;
  runtimeType?: string;
  defaultProps?: Readonly<Record<string, unknown>>;
  propOptions?: Readonly<Record<string, readonly string[]>>;
  scale?: number;
  variants?: readonly OfficialPalettePreviewVariant[];
  sizeOptions?: readonly Readonly<{
    id: string;
    label: string;
    value: string;
  }>[];
  statusOptions?: readonly OfficialPalettePreviewStatus[];
  statusProp?: string;
  statusLabel?: string;
  renderPreview?: (
    options: Readonly<{ size?: string; status?: string }>
  ) => ReactNode;
  defaultStatus?: string;
}>;

export type OfficialPalettePreviewGroup = Readonly<{
  id: string;
  title: string;
  source?: 'builtIn' | 'external';
  items: readonly OfficialPalettePreviewItem[];
}>;

export type OfficialPaletteRuntimeProjection = Readonly<{
  groups: readonly OfficialPalettePreviewGroup[];
}>;

export type OfficialPaletteProjectionImplementation =
  OfficialPaletteRuntimeProjection &
    Readonly<{
      kind: 'palette-projection';
    }>;

export type OfficialHostImplementation =
  | OfficialComponentLibraryImplementation
  | OfficialPaletteProjectionImplementation
  | OfficialRenderPolicyImplementation
  | OfficialIconProviderImplementation;

export type OfficialHostImplementationKind = OfficialHostImplementation['kind'];

export type OfficialHostModule = Readonly<{
  implementations: Readonly<Record<string, OfficialHostImplementation>>;
}>;

export type OfficialHostModuleCatalogEntry = Readonly<{
  pluginId: string;
  packageDigest: string;
  load(): Promise<OfficialHostModule>;
}>;
