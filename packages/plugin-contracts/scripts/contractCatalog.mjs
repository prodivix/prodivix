export const CONTRACT_CATALOG = Object.freeze(
  [
    {
      schemaFile: 'plugin-manifest-v1.schema.json',
      rootType: 'PluginManifestV1',
      typesFile: 'pluginManifest.generated.ts',
      schemaModuleFile: 'pluginManifestSchema.generated.ts',
      schemaConstant: 'PLUGIN_MANIFEST_V1_SCHEMA',
    },
    {
      schemaFile: 'palette-contribution-v1.schema.json',
      rootType: 'PaletteContributionV1',
      typesFile: 'paletteContribution.generated.ts',
      schemaModuleFile: 'paletteContributionSchema.generated.ts',
      schemaConstant: 'PALETTE_CONTRIBUTION_V1_SCHEMA',
    },
    {
      schemaFile: 'external-library-contribution-v1.schema.json',
      rootType: 'ExternalLibraryContributionV1',
      typesFile: 'externalLibraryContribution.generated.ts',
      schemaModuleFile: 'externalLibraryContributionSchema.generated.ts',
      schemaConstant: 'EXTERNAL_LIBRARY_CONTRIBUTION_V1_SCHEMA',
    },
    {
      schemaFile: 'render-policy-contribution-v1.schema.json',
      rootType: 'RenderPolicyContributionV1',
      typesFile: 'renderPolicyContribution.generated.ts',
      schemaModuleFile: 'renderPolicyContributionSchema.generated.ts',
      schemaConstant: 'RENDER_POLICY_CONTRIBUTION_V1_SCHEMA',
    },
    {
      schemaFile: 'codegen-policy-contribution-v1.schema.json',
      rootType: 'CodegenPolicyContributionV1',
      typesFile: 'codegenPolicyContribution.generated.ts',
      schemaModuleFile: 'codegenPolicyContributionSchema.generated.ts',
      schemaConstant: 'CODEGEN_POLICY_CONTRIBUTION_V1_SCHEMA',
    },
    {
      schemaFile: 'icon-provider-contribution-v1.schema.json',
      rootType: 'IconProviderContributionV1',
      typesFile: 'iconProviderContribution.generated.ts',
      schemaModuleFile: 'iconProviderContributionSchema.generated.ts',
      schemaConstant: 'ICON_PROVIDER_CONTRIBUTION_V1_SCHEMA',
    },
    {
      schemaFile: 'blueprint-template-contribution-v1.schema.json',
      rootType: 'BlueprintTemplateContributionV1',
      typesFile: 'blueprintTemplateContribution.generated.ts',
      schemaModuleFile: 'blueprintTemplateContributionSchema.generated.ts',
      schemaConstant: 'BLUEPRINT_TEMPLATE_CONTRIBUTION_V1_SCHEMA',
    },
  ].map((contract) => Object.freeze(contract))
);
