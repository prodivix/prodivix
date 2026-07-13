import type {
  BlueprintTemplateContributionV1,
  BlueprintCompositionRule,
  BlueprintTemplateDescriptor,
  CodegenPolicyContributionV1,
  ExternalLibraryContributionV1,
  IconProviderContributionV1,
  JsonValue,
  PaletteContributionV1,
  PluginManifestV1,
  RenderPolicyContributionV1,
} from '@prodivix/plugin-contracts';
import type { CodegenPolicySnapshot } from '@prodivix/prodivix-compiler';
import type { ElementType } from 'react';
import type {
  ContributionRegistryReader,
  Disposable,
  PluginAuditEvent,
  PluginHostResult,
  PluginHostSnapshot,
  PluginPackageSource,
  PluginOwnerRef,
  PluginTrustLevel,
} from '@prodivix/plugin-host';
import type {
  ComponentGroup,
  ComponentPreviewItem,
} from '@/editor/features/blueprint/editor/model/types';
import type {
  PaletteRuntimeProjection,
  ResolvedPaletteContribution,
} from '@/editor/features/blueprint/palette/types';
import type {
  ComponentAdapter,
  IconProviderRegistration,
} from '@prodivix/pir-react-renderer';
import type { OfficialHostImplementationBindingSnapshot } from '@/plugins/platform/officialHostImplementations';
import type {
  BundledPluginArtifactV1,
  BundledPluginInstallationState,
} from '@prodivix/plugin-package';
import type { OfficialSurfaceLeaseRegistry } from '@/plugins/platform/officialSurfaceHost';

export type ResolvedExternalLibraryContribution = Readonly<{
  descriptor: ExternalLibraryContributionV1;
  libraryId: string;
  package: Readonly<{ name: string; version: string; license: string }>;
  components: readonly Readonly<{
    exportName: string;
    componentName: string;
    runtimeType: string;
    component?: ElementType;
  }>[];
}>;

export type ExternalComponentPropMetadata = Readonly<
  NonNullable<
    ExternalLibraryContributionV1['components'][number]['props']
  >[number]
>;

export type ExternalComponentMetadataProjection = Readonly<{
  owner: PluginOwnerRef;
  contributionId: string;
  libraryId: string;
  componentName: string;
  runtimeType: string;
  props: readonly ExternalComponentPropMetadata[];
}>;

export type ResolvedRenderPolicyContribution = Readonly<{
  descriptor: RenderPolicyContributionV1;
  libraryId: string;
  rules: readonly Readonly<{
    id: string;
    runtimeType: string;
    componentExport: string;
    portalMode: 'inline' | 'host-overlay' | 'disabled';
    adapter: ComponentAdapter;
    wrapComponent?: (component: ElementType) => ElementType;
    fallback: Readonly<{
      behavior: 'placeholder' | 'omit' | 'error';
      message?: string;
    }>;
  }>[];
}>;

export type ResolvedCodegenPolicyContribution = Readonly<{
  descriptor: CodegenPolicyContributionV1;
  libraryId: string;
}>;

export type ResolvedIconProviderContribution = Readonly<{
  descriptor: IconProviderContributionV1;
  libraryId: string;
  providerId: string;
  runtime: IconProviderRegistration;
}>;

export type ResolvedBlueprintTemplateContribution = Readonly<{
  descriptor: BlueprintTemplateContributionV1;
}>;

export type WebContributionPointMap = {
  paletteContribution: ResolvedPaletteContribution;
  externalLibrary: ResolvedExternalLibraryContribution;
  renderPolicy: ResolvedRenderPolicyContribution;
  codegenPolicy: ResolvedCodegenPolicyContribution;
  iconProvider: ResolvedIconProviderContribution;
  blueprintTemplate: ResolvedBlueprintTemplateContribution;
};

export type PaletteRegistrySnapshot = Readonly<{
  revision: number;
  groups: readonly ComponentGroup[];
  itemsById: ReadonlyMap<string, ComponentPreviewItem>;
  itemsByRuntimeType: ReadonlyMap<string, ComponentPreviewItem>;
  creationRecipesByItemId: ReadonlyMap<string, PaletteItemCreationRecipe>;
  compositionRulesByRuntimeType: ReadonlyMap<
    string,
    ResolvedBlueprintCompositionRule
  >;
}>;

type PaletteItemCreationRecipeBase = Readonly<{
  owner: PluginOwnerRef;
  paletteContributionId: string;
  itemId: string;
}>;

export type PaletteItemCreationRecipe =
  | (PaletteItemCreationRecipeBase & Readonly<{ kind: 'native' }>)
  | (PaletteItemCreationRecipeBase &
      Readonly<{ kind: 'direct'; runtimeType: string }>)
  | (PaletteItemCreationRecipeBase &
      Readonly<{
        kind: 'template';
        templateContributionId: string;
        template: BlueprintTemplateDescriptor;
      }>);

export type ResolvedBlueprintCompositionRule = Readonly<{
  owner: PluginOwnerRef;
  contributionId: string;
  rule: BlueprintCompositionRule;
}>;

export type PaletteQueryService = Readonly<{
  getSnapshot(): PaletteRegistrySnapshot;
  getItemById(itemId: string): ComponentPreviewItem | undefined;
  getItemByRuntimeType(runtimeType: string): ComponentPreviewItem | undefined;
  getCreationRecipe(itemId: string): PaletteItemCreationRecipe | undefined;
  getCompositionRule(
    runtimeType: string
  ): ResolvedBlueprintCompositionRule | undefined;
  subscribe(listener: () => void): () => void;
}>;

export type RendererComponentProjection = Readonly<{
  owner: PluginOwnerRef;
  contributionId: string;
  libraryId: string;
  runtimeType: string;
  component: ElementType;
  adapter: ComponentAdapter;
}>;

export type WebExtensionRegistrySnapshot = Readonly<{
  revision: number;
  externalLibraries: readonly ResolvedExternalLibraryContribution[];
  externalComponentsByRuntimeType: ReadonlyMap<
    string,
    ExternalComponentMetadataProjection
  >;
  rendererComponents: readonly RendererComponentProjection[];
  iconProviders: readonly ResolvedIconProviderContribution[];
  codegenPolicy: CodegenPolicySnapshot;
}>;

export type WebExtensionQueryService = Readonly<{
  getSnapshot(): WebExtensionRegistrySnapshot;
  subscribe(listener: () => void): () => void;
}>;

export type WebPluginQueryServices = Readonly<{
  workspaceId: string;
  palette: PaletteQueryService;
  extensions: WebExtensionQueryService;
}>;

type TrustedWebContributionDescriptorMap = {
  paletteContribution: PaletteContributionV1;
  externalLibrary: ExternalLibraryContributionV1;
  renderPolicy: RenderPolicyContributionV1;
  codegenPolicy: CodegenPolicyContributionV1;
  iconProvider: IconProviderContributionV1;
  blueprintTemplate: BlueprintTemplateContributionV1;
};

export type TrustedWebContributionInput = {
  [Point in keyof TrustedWebContributionDescriptorMap]: Readonly<{
    id: string;
    point: Point;
    contractVersion: string;
    descriptor: TrustedWebContributionDescriptorMap[Point];
    metadata?: Readonly<Record<string, JsonValue>>;
    paletteProjection?: PaletteRuntimeProjection;
  }>;
}[keyof TrustedWebContributionDescriptorMap];

export type TrustedWebPluginInput = Readonly<{
  pluginId: string;
  displayName: string;
  version: string;
  publisher: string;
  installationId: string;
  trustLevel: Extract<PluginTrustLevel, 'core' | 'official' | 'development'>;
  publisherVerified: boolean;
  contributions: readonly TrustedWebContributionInput[];
}>;

export type TrustedPaletteContributionInput = Readonly<{
  pluginId: string;
  displayName: string;
  version: string;
  publisher?: string;
  installationId: string;
  trustLevel?: Extract<PluginTrustLevel, 'core' | 'official' | 'development'>;
  publisherVerified?: boolean;
  contributionId: string;
  descriptor: PaletteContributionV1;
  groups: readonly ComponentGroup[];
  order?: number;
}>;

export type WebPluginPackageService = Readonly<{
  install(
    input: TrustedWebPluginInput,
    signal?: AbortSignal
  ): Promise<PluginHostResult<PluginHostSnapshot>>;
  discover(
    source: PluginPackageSource,
    signal?: AbortSignal
  ): Promise<PluginHostResult<PluginHostSnapshot>>;
  installBundled(
    artifact: BundledPluginArtifactV1,
    options: Readonly<{
      installationId: string;
      sourceId: string;
      trustLevel: Extract<
        PluginTrustLevel,
        'core' | 'official' | 'development'
      >;
      publisherVerified: boolean;
      signatureKeyId?: string;
      signal?: AbortSignal;
    }>
  ): Promise<PluginHostResult<PluginHostSnapshot>>;
  disable(pluginId: string): Promise<PluginHostResult<void>>;
  getSnapshot(pluginId: string): PluginHostSnapshot | undefined;
  listSnapshots(): readonly PluginHostSnapshot[];
  listBundledInstallations(): readonly BundledPluginInstallationState[];
  subscribe(listener: (snapshot: PluginHostSnapshot) => void): Disposable;
  contributions: ContributionRegistryReader<WebContributionPointMap>;
}>;

export type PaletteContributionService = Readonly<{
  workspaceId: string;
  install(
    input: TrustedPaletteContributionInput,
    signal?: AbortSignal
  ): Promise<PluginHostResult<PluginHostSnapshot>>;
  disable(pluginId: string): Promise<PluginHostResult<void>>;
}>;

export type WebPluginRuntimeServices = Readonly<{
  workspaceId: string;
  packages: WebPluginPackageService;
  paletteContributions: PaletteContributionService;
  surfaceLeases: OfficialSurfaceLeaseRegistry;
  registerCleanup(
    cleanup: () => void | Promise<void>
  ): Disposable & Readonly<{ run(): Promise<void> }>;
}>;

export type WebPluginPlatform = Readonly<{
  workspaceId: string;
  queries: WebPluginQueryServices;
  runtime: WebPluginRuntimeServices;
  getAuditEvents(): readonly PluginAuditEvent[];
  listOfficialImplementationBindings(): readonly OfficialHostImplementationBindingSnapshot[];
  shutdown(): Promise<PluginHostResult<void>>;
}>;

export type TrustedPackageBuildResult = Readonly<{
  manifest: PluginManifestV1;
  source: PluginPackageSource;
}>;
