export {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  PLUGIN_DIAGNOSTIC_DEFINITIONS,
  type PluginDiagnostic,
  type PluginDiagnosticCode,
  type PluginDiagnosticDefinition,
  type PluginDiagnosticMeta,
  type PluginDiagnosticSeverity,
  type PluginDiagnosticStage,
} from '#contracts/diagnostics';
export type {
  ActivationEvent,
  Artifact,
  CapabilityRequest,
  ContributionDeclaration,
  ContributionMetadata,
  ContributionPoint,
  ContractVersion,
  Entrypoints,
  InlineContributionSource,
  Integrity,
  JsonValue,
  LocalId,
  PackageRelativePath,
  PluginId,
  PluginManifestV1,
  PublisherId,
  QualifiedId,
  ResourceContributionSource,
  UiEntrypoint,
} from '#contracts/generated/pluginManifest.generated';
export {
  BUILT_IN_CONTRIBUTION_POINTS,
  isBuiltInContributionPoint,
  type BuiltInContributionPoint,
} from '#contracts/contributionPoints';
export type {
  Group as PaletteGroupDescriptor,
  Item as PaletteItemDescriptor,
  JsonObject as PaletteJsonObject,
  Option as PaletteOptionDescriptor,
  PaletteContributionV1,
  Placement as PalettePlacement,
  Presentation as PalettePresentation,
  Status as PaletteStatusDescriptor,
  Variant as PaletteVariantDescriptor,
} from '#contracts/generated/paletteContribution.generated';
export type {
  Component as ExternalLibraryComponentDescriptor,
  Dependency as ExternalLibraryDependencyDescriptor,
  ExternalLibraryContributionV1,
  ExportDiscovery as ExternalLibraryExportDiscovery,
  PackageCoordinate as ExternalLibraryPackageCoordinate,
} from '#contracts/generated/externalLibraryContribution.generated';
export type {
  RenderPolicyContributionV1,
  Rule as RenderPolicyRuleDescriptor,
} from '#contracts/generated/renderPolicyContribution.generated';
export type {
  CodegenPolicyContributionV1,
  Dependency as CodegenPolicyDependencyDescriptor,
  Rule as CodegenPolicyRuleDescriptor,
} from '#contracts/generated/codegenPolicyContribution.generated';
export type {
  IconProviderContributionV1,
  Variant as IconProviderVariantDescriptor,
} from '#contracts/generated/iconProviderContribution.generated';
export type {
  BlueprintTemplateContributionV1,
  CompositionRule as BlueprintCompositionRule,
  Fragment as BlueprintTemplateFragment,
  Node as BlueprintTemplateNode,
  Template as BlueprintTemplateDescriptor,
} from '#contracts/generated/blueprintTemplateContribution.generated';
export {
  PLUGIN_MANIFEST_V1_SCHEMA,
  PLUGIN_MANIFEST_V1_SCHEMA_ID,
  PLUGIN_MANIFEST_V1_SCHEMA_VERSION,
} from '#contracts/generated/pluginManifestSchema.generated';
export {
  PALETTE_CONTRIBUTION_V1_SCHEMA,
  PALETTE_CONTRIBUTION_V1_SCHEMA_ID,
  PALETTE_CONTRIBUTION_V1_SCHEMA_VERSION,
} from '#contracts/generated/paletteContributionSchema.generated';
export {
  EXTERNAL_LIBRARY_CONTRIBUTION_V1_SCHEMA,
  EXTERNAL_LIBRARY_CONTRIBUTION_V1_SCHEMA_ID,
  EXTERNAL_LIBRARY_CONTRIBUTION_V1_SCHEMA_VERSION,
} from '#contracts/generated/externalLibraryContributionSchema.generated';
export {
  RENDER_POLICY_CONTRIBUTION_V1_SCHEMA,
  RENDER_POLICY_CONTRIBUTION_V1_SCHEMA_ID,
  RENDER_POLICY_CONTRIBUTION_V1_SCHEMA_VERSION,
} from '#contracts/generated/renderPolicyContributionSchema.generated';
export {
  CODEGEN_POLICY_CONTRIBUTION_V1_SCHEMA,
  CODEGEN_POLICY_CONTRIBUTION_V1_SCHEMA_ID,
  CODEGEN_POLICY_CONTRIBUTION_V1_SCHEMA_VERSION,
} from '#contracts/generated/codegenPolicyContributionSchema.generated';
export {
  ICON_PROVIDER_CONTRIBUTION_V1_SCHEMA,
  ICON_PROVIDER_CONTRIBUTION_V1_SCHEMA_ID,
  ICON_PROVIDER_CONTRIBUTION_V1_SCHEMA_VERSION,
} from '#contracts/generated/iconProviderContributionSchema.generated';
export {
  BLUEPRINT_TEMPLATE_CONTRIBUTION_V1_SCHEMA,
  BLUEPRINT_TEMPLATE_CONTRIBUTION_V1_SCHEMA_ID,
  BLUEPRINT_TEMPLATE_CONTRIBUTION_V1_SCHEMA_VERSION,
} from '#contracts/generated/blueprintTemplateContributionSchema.generated';
export {
  DEFAULT_JSON_VALUE_MAX_DEPTH,
  DEFAULT_JSON_VALUE_MAX_NODES,
  validateJsonValue,
  type JsonValueValidationOptions,
  type JsonValueValidationResult,
} from '#contracts/jsonValue';
export {
  DEFAULT_PLUGIN_MANIFEST_MAX_BYTES,
  parsePluginManifest,
  type ParsePluginManifestOptions,
  type ParsePluginManifestResult,
} from '#contracts/parsePluginManifest';
export {
  DEFAULT_STRICT_JSON_MAX_BYTES,
  parseStrictJsonDocument,
  type ParseStrictJsonDocumentOptions,
  type ParseStrictJsonDocumentResult,
  type StrictJsonDocumentKind,
} from '#contracts/parseStrictJsonDocument';
export {
  parseAndValidatePluginManifest,
  type ParseAndValidatePluginManifestOptions,
  type ParseAndValidatePluginManifestResult,
} from '#contracts/parseAndValidatePluginManifest';
export {
  validatePluginManifest,
  type ValidatePluginManifestOptions,
  type ValidatePluginManifestResult,
} from '#contracts/validatePluginManifest';
export {
  validatePaletteContribution,
  type ValidatePaletteContributionOptions,
  type ValidatePaletteContributionResult,
} from '#contracts/validatePaletteContribution';
export {
  validateExternalLibraryContribution,
  type ValidateExternalLibraryContributionOptions,
  type ValidateExternalLibraryContributionResult,
} from '#contracts/validateExternalLibraryContribution';
export {
  validateRenderPolicyContribution,
  type ValidateRenderPolicyContributionOptions,
  type ValidateRenderPolicyContributionResult,
} from '#contracts/validateRenderPolicyContribution';
export {
  validateCodegenPolicyContribution,
  type ValidateCodegenPolicyContributionOptions,
  type ValidateCodegenPolicyContributionResult,
} from '#contracts/validateCodegenPolicyContribution';
export {
  validateIconProviderContribution,
  type ValidateIconProviderContributionOptions,
  type ValidateIconProviderContributionResult,
} from '#contracts/validateIconProviderContribution';
export {
  matchesBlueprintCompositionSequence,
  validateBlueprintTemplateContribution,
  type ValidateBlueprintTemplateContributionOptions,
  type ValidateBlueprintTemplateContributionResult,
} from '#contracts/validateBlueprintTemplateContribution';
