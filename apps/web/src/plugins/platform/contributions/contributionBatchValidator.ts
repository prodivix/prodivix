import {
  type BlueprintTemplateContributionV1,
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type CodegenPolicyContributionV1,
  type ExternalLibraryContributionV1,
  type IconProviderContributionV1,
  type PaletteContributionV1,
  type PluginDiagnostic,
  type RenderPolicyContributionV1,
} from '@prodivix/plugin-contracts';
import {
  asNonEmptyDiagnostics,
  pluginHostFailure,
  pluginHostSuccess,
  type ContributionBatchValidator,
  type ValidatedContributionDescriptor,
} from '@prodivix/plugin-host';
import type { WebContributionPointMap } from '@/plugins/platform/types';

type DescriptorEntry<TDescriptor> = Readonly<{
  declaration: ValidatedContributionDescriptor<WebContributionPointMap>['declaration'];
  descriptor: TDescriptor;
}>;

const entriesForPoint = <TDescriptor>(
  descriptors: readonly ValidatedContributionDescriptor<WebContributionPointMap>[],
  point: keyof WebContributionPointMap
): readonly DescriptorEntry<TDescriptor>[] =>
  descriptors
    .filter((entry) => entry.declaration.point === point)
    .map((entry) => ({
      declaration: entry.declaration,
      descriptor: entry.descriptor as TDescriptor,
    }));

const diagnostic = (
  code:
    | typeof PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE
    | typeof PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_OWNERSHIP_MISMATCH,
  message: string,
  entry: DescriptorEntry<unknown>,
  documentPath: string,
  pluginId: string,
  extra: Record<string, string | number | undefined> = {}
) =>
  createPluginDiagnostic(code, message, {
    pluginId,
    contributionId: entry.declaration.id,
    contributionPoint: entry.declaration.point,
    contractVersion: entry.declaration.contractVersion,
    documentPath,
    ...extra,
  });

type LibraryIndexEntry = DescriptorEntry<ExternalLibraryContributionV1> &
  Readonly<{
    componentsByRuntimeType: ReadonlyMap<
      string,
      ExternalLibraryContributionV1['components'][number]
    >;
    dependenciesByName: ReadonlyMap<
      string,
      ExternalLibraryContributionV1['dependencies'][number]
    >;
  }>;

const registerImplementationReference = (
  references: Map<string, string>,
  implementationId: string,
  kind: string,
  entry: DescriptorEntry<unknown>,
  path: string,
  pluginId: string,
  diagnostics: PluginDiagnostic[]
) => {
  const current = references.get(implementationId);
  if (current && current !== kind) {
    diagnostics.push(
      diagnostic(
        PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
        `Host implementation ${JSON.stringify(implementationId)} is referenced as both ${JSON.stringify(current)} and ${JSON.stringify(kind)}.`,
        entry,
        path,
        pluginId,
        { implementationId }
      )
    );
    return;
  }
  references.set(implementationId, kind);
};

export const validateWebContributionBatch: ContributionBatchValidator<
  WebContributionPointMap
> = (context) => {
  const diagnostics: PluginDiagnostic[] = [];
  const externalEntries = entriesForPoint<ExternalLibraryContributionV1>(
    context.descriptors,
    'externalLibrary'
  );
  const renderEntries = entriesForPoint<RenderPolicyContributionV1>(
    context.descriptors,
    'renderPolicy'
  );
  const codegenEntries = entriesForPoint<CodegenPolicyContributionV1>(
    context.descriptors,
    'codegenPolicy'
  );
  const iconEntries = entriesForPoint<IconProviderContributionV1>(
    context.descriptors,
    'iconProvider'
  );
  const paletteEntries = entriesForPoint<PaletteContributionV1>(
    context.descriptors,
    'paletteContribution'
  );
  const templateEntries = entriesForPoint<BlueprintTemplateContributionV1>(
    context.descriptors,
    'blueprintTemplate'
  );
  const libraries = new Map<string, LibraryIndexEntry>();
  const implementationReferences = new Map<string, string>();

  externalEntries.forEach((entry) => {
    const libraryId = entry.descriptor.libraryId;
    if (libraries.has(libraryId)) {
      diagnostics.push(
        diagnostic(
          PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_OWNERSHIP_MISMATCH,
          `External library ${JSON.stringify(libraryId)} is declared more than once by the same plugin owner.`,
          entry,
          '/libraryId',
          context.owner.pluginId,
          { libraryId }
        )
      );
      return;
    }
    libraries.set(libraryId, {
      ...entry,
      componentsByRuntimeType: new Map(
        entry.descriptor.components.map((component) => [
          component.runtimeType,
          component,
        ])
      ),
      dependenciesByName: new Map(
        entry.descriptor.dependencies.map((dependency) => [
          dependency.name,
          dependency,
        ])
      ),
    });
    if (entry.descriptor.hostImplementationId) {
      registerImplementationReference(
        implementationReferences,
        entry.descriptor.hostImplementationId,
        'component-library',
        entry,
        '/hostImplementationId',
        context.owner.pluginId,
        diagnostics
      );
    }
  });

  const renderRuntimeTypes = new Set<string>();
  renderEntries.forEach((entry) => {
    const library = libraries.get(entry.descriptor.libraryId);
    if (!library) {
      diagnostics.push(
        diagnostic(
          PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_OWNERSHIP_MISMATCH,
          `Render Policy references external library ${JSON.stringify(entry.descriptor.libraryId)} that is not declared by this plugin owner.`,
          entry,
          '/libraryId',
          context.owner.pluginId,
          { libraryId: entry.descriptor.libraryId }
        )
      );
      return;
    }
    if (!library.descriptor.hostImplementationId) {
      diagnostics.push(
        diagnostic(
          PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
          'Render Policy requires its external library to declare a framework Host implementation.',
          entry,
          '/libraryId',
          context.owner.pluginId,
          { libraryId: entry.descriptor.libraryId }
        )
      );
    }
    entry.descriptor.rules.forEach((rule, index) => {
      const path = `/rules/${index}`;
      const component = library.componentsByRuntimeType.get(rule.runtimeType);
      if (!component || component.exportName !== rule.componentExport) {
        diagnostics.push(
          diagnostic(
            PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
            `Render rule runtime type ${JSON.stringify(rule.runtimeType)} and export ${JSON.stringify(rule.componentExport)} do not identify one declared library component.`,
            entry,
            `${path}/componentExport`,
            context.owner.pluginId,
            {
              libraryId: entry.descriptor.libraryId,
              runtimeType: rule.runtimeType,
            }
          )
        );
      }
      const runtimeKey = `${entry.descriptor.libraryId}/${rule.runtimeType}`;
      if (renderRuntimeTypes.has(runtimeKey)) {
        diagnostics.push(
          diagnostic(
            PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
            `Runtime type ${JSON.stringify(rule.runtimeType)} has multiple Render Policy mappings.`,
            entry,
            `${path}/runtimeType`,
            context.owner.pluginId,
            {
              libraryId: entry.descriptor.libraryId,
              runtimeType: rule.runtimeType,
            }
          )
        );
      }
      renderRuntimeTypes.add(runtimeKey);
      if (rule.hostImplementationId) {
        registerImplementationReference(
          implementationReferences,
          rule.hostImplementationId,
          'render-policy',
          entry,
          `${path}/hostImplementationId`,
          context.owner.pluginId,
          diagnostics
        );
      }
    });
  });

  const codegenRuntimeTypes = new Set<string>();
  codegenEntries.forEach((entry) => {
    const library = libraries.get(entry.descriptor.libraryId);
    if (!library) {
      diagnostics.push(
        diagnostic(
          PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_OWNERSHIP_MISMATCH,
          `Codegen Policy references external library ${JSON.stringify(entry.descriptor.libraryId)} that is not declared by this plugin owner.`,
          entry,
          '/libraryId',
          context.owner.pluginId,
          { libraryId: entry.descriptor.libraryId }
        )
      );
      return;
    }
    const codegenDependencies = new Map(
      entry.descriptor.dependencies.map((dependency) => [
        dependency.name,
        dependency,
      ])
    );
    const rootDependency = entry.descriptor.dependencies.find(
      (dependency) => dependency.name === library.descriptor.package.name
    );
    if (
      !rootDependency ||
      rootDependency.version !== library.descriptor.package.version ||
      rootDependency.license !== library.descriptor.package.license
    ) {
      diagnostics.push(
        diagnostic(
          PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
          'Codegen Policy must include the exact external library package coordinate and license.',
          entry,
          '/dependencies',
          context.owner.pluginId,
          { libraryId: entry.descriptor.libraryId }
        )
      );
    }
    entry.descriptor.dependencies.forEach((dependency, index) => {
      if (dependency.name === library.descriptor.package.name) return;
      const libraryDependency = library.dependenciesByName.get(dependency.name);
      if (
        libraryDependency &&
        libraryDependency.version === dependency.version &&
        libraryDependency.license === dependency.license &&
        libraryDependency.kind === dependency.kind
      ) {
        return;
      }
      diagnostics.push(
        diagnostic(
          PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
          `Codegen dependency ${JSON.stringify(dependency.name)} must match an exact dependency declared by the external library.`,
          entry,
          `/dependencies/${index}`,
          context.owner.pluginId,
          {
            libraryId: entry.descriptor.libraryId,
            packageName: dependency.name,
          }
        )
      );
    });
    entry.descriptor.rules.forEach((rule, index) => {
      const path = `/rules/${index}/runtimeType`;
      if (!library.componentsByRuntimeType.has(rule.runtimeType)) {
        diagnostics.push(
          diagnostic(
            PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
            `Codegen rule references undeclared runtime type ${JSON.stringify(rule.runtimeType)}.`,
            entry,
            path,
            context.owner.pluginId,
            {
              libraryId: entry.descriptor.libraryId,
              runtimeType: rule.runtimeType,
            }
          )
        );
      }
      const runtimeKey = `${entry.descriptor.libraryId}/${rule.runtimeType}`;
      if (codegenRuntimeTypes.has(runtimeKey)) {
        diagnostics.push(
          diagnostic(
            PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
            `Runtime type ${JSON.stringify(rule.runtimeType)} has multiple Codegen Policy mappings.`,
            entry,
            path,
            context.owner.pluginId,
            {
              libraryId: entry.descriptor.libraryId,
              runtimeType: rule.runtimeType,
            }
          )
        );
      }
      codegenRuntimeTypes.add(runtimeKey);
      if (!codegenDependencies.has(rule.import.packageName)) {
        diagnostics.push(
          diagnostic(
            PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
            `Codegen rule import ${JSON.stringify(rule.import.packageName)} has no exact dependency declaration.`,
            entry,
            `/rules/${index}/import/packageName`,
            context.owner.pluginId,
            {
              libraryId: entry.descriptor.libraryId,
              runtimeType: rule.runtimeType,
              packageName: rule.import.packageName,
            }
          )
        );
      }
    });
  });

  const providerIds = new Set<string>();
  iconEntries.forEach((entry) => {
    const library = libraries.get(entry.descriptor.libraryId);
    if (!library) {
      diagnostics.push(
        diagnostic(
          PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_OWNERSHIP_MISMATCH,
          `Icon Provider references external library ${JSON.stringify(entry.descriptor.libraryId)} that is not declared by this plugin owner.`,
          entry,
          '/libraryId',
          context.owner.pluginId,
          { libraryId: entry.descriptor.libraryId }
        )
      );
      return;
    }
    const packageMatch =
      (entry.descriptor.package.name === library.descriptor.package.name &&
        entry.descriptor.package.version ===
          library.descriptor.package.version &&
        entry.descriptor.package.license ===
          library.descriptor.package.license) ||
      (() => {
        const dependency = library.dependenciesByName.get(
          entry.descriptor.package.name
        );
        return Boolean(
          dependency &&
          dependency.version === entry.descriptor.package.version &&
          dependency.license === entry.descriptor.package.license
        );
      })();
    if (!packageMatch) {
      diagnostics.push(
        diagnostic(
          PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
          'Icon Provider package must match the external library package or one exact declared dependency.',
          entry,
          '/package',
          context.owner.pluginId,
          { libraryId: entry.descriptor.libraryId }
        )
      );
    }
    if (providerIds.has(entry.descriptor.providerId)) {
      diagnostics.push(
        diagnostic(
          PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
          `Icon provider id ${JSON.stringify(entry.descriptor.providerId)} is declared more than once.`,
          entry,
          '/providerId',
          context.owner.pluginId,
          { providerId: entry.descriptor.providerId }
        )
      );
    }
    providerIds.add(entry.descriptor.providerId);
    registerImplementationReference(
      implementationReferences,
      entry.descriptor.hostImplementationId,
      'icon-provider',
      entry,
      '/hostImplementationId',
      context.owner.pluginId,
      diagnostics
    );
  });

  if (libraries.size > 0) {
    paletteEntries.forEach((entry) => {
      entry.descriptor.groups.forEach((group, groupIndex) => {
        if (group.placement.section !== 'external') return;
        const libraryId = group.placement.libraryId;
        const library = libraries.get(libraryId);
        if (!library) {
          diagnostics.push(
            diagnostic(
              PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_OWNERSHIP_MISMATCH,
              `Palette group references external library ${JSON.stringify(libraryId)} that is not declared by this plugin owner.`,
              entry,
              `/groups/${groupIndex}/placement/libraryId`,
              context.owner.pluginId,
              { libraryId }
            )
          );
          return;
        }
        group.items.forEach((item, itemIndex) => {
          if (
            item.runtimeType &&
            !library.componentsByRuntimeType.has(item.runtimeType)
          ) {
            diagnostics.push(
              diagnostic(
                PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
                `Palette item runtime type must be declared by external library ${JSON.stringify(libraryId)}.`,
                entry,
                `/groups/${groupIndex}/items/${itemIndex}/runtimeType`,
                context.owner.pluginId,
                {
                  libraryId,
                  runtimeType: item.runtimeType,
                }
              )
            );
          }
        });
      });
    });
  }

  const paletteByContributionId = new Map(
    paletteEntries.map((entry) => [entry.declaration.id, entry] as const)
  );
  const templateBindings = new Map<
    string,
    DescriptorEntry<BlueprintTemplateContributionV1>
  >();
  templateEntries.forEach((entry) => {
    entry.descriptor.templates.forEach((template, templateIndex) => {
      const palette = paletteByContributionId.get(
        template.palette.contributionId
      );
      if (!palette) {
        diagnostics.push(
          diagnostic(
            PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_OWNERSHIP_MISMATCH,
            `Blueprint template references Palette contribution ${JSON.stringify(template.palette.contributionId)} that is not declared by this plugin owner.`,
            entry,
            `/templates/${templateIndex}/palette/contributionId`,
            context.owner.pluginId
          )
        );
        return;
      }
      const group = palette.descriptor.groups.find((candidate) =>
        candidate.items.some((item) => item.id === template.palette.itemId)
      );
      const item = group?.items.find(
        (candidate) => candidate.id === template.palette.itemId
      );
      if (!group || !item) {
        diagnostics.push(
          diagnostic(
            PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
            `Blueprint template references Palette item ${JSON.stringify(template.palette.itemId)} that is not declared by its Palette contribution.`,
            entry,
            `/templates/${templateIndex}/palette/itemId`,
            context.owner.pluginId
          )
        );
        return;
      }
      if (group.placement.section !== 'external') {
        diagnostics.push(
          diagnostic(
            PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
            'Blueprint plugin templates must bind an external Palette item.',
            entry,
            `/templates/${templateIndex}/palette/itemId`,
            context.owner.pluginId
          )
        );
        return;
      }
      const library = libraries.get(group.placement.libraryId);
      if (!library) return;
      Object.entries(template.fragment.nodesByLocalId).forEach(
        ([localId, node]) => {
          const runtimeKey = `${library.descriptor.libraryId}/${node.type}`;
          if (!library.componentsByRuntimeType.has(node.type)) {
            diagnostics.push(
              diagnostic(
                PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
                `Blueprint template node type ${JSON.stringify(node.type)} is not declared by its external library.`,
                entry,
                `/templates/${templateIndex}/fragment/nodesByLocalId/${localId}/type`,
                context.owner.pluginId,
                {
                  libraryId: library.descriptor.libraryId,
                  runtimeType: node.type,
                }
              )
            );
          }
          if (!renderRuntimeTypes.has(runtimeKey)) {
            diagnostics.push(
              diagnostic(
                PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
                `Blueprint template node type ${JSON.stringify(node.type)} has no Render Policy rule.`,
                entry,
                `/templates/${templateIndex}/fragment/nodesByLocalId/${localId}/type`,
                context.owner.pluginId,
                {
                  libraryId: library.descriptor.libraryId,
                  runtimeType: node.type,
                }
              )
            );
          }
          if (!codegenRuntimeTypes.has(runtimeKey)) {
            diagnostics.push(
              diagnostic(
                PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
                `Blueprint template node type ${JSON.stringify(node.type)} has no Codegen Policy rule.`,
                entry,
                `/templates/${templateIndex}/fragment/nodesByLocalId/${localId}/type`,
                context.owner.pluginId,
                {
                  libraryId: library.descriptor.libraryId,
                  runtimeType: node.type,
                }
              )
            );
          }
        }
      );
      const bindingKey = JSON.stringify([
        template.palette.contributionId,
        template.palette.itemId,
      ]);
      templateBindings.set(bindingKey, entry);
    });

    (entry.descriptor.compositionRules ?? []).forEach((rule, ruleIndex) => {
      const referencedRuntimeTypes = [
        rule.runtimeType,
        ...(rule.parent.mode === 'listed' ? rule.parent.runtimeTypes : []),
        ...rule.slots.flatMap((slot) =>
          slot.sequence.flatMap((segment) =>
            segment.match === 'runtime-types' ? segment.runtimeTypes : []
          )
        ),
      ];
      referencedRuntimeTypes.forEach((runtimeType) => {
        if (
          ![...libraries.values()].some((library) =>
            library.componentsByRuntimeType.has(runtimeType)
          )
        ) {
          diagnostics.push(
            diagnostic(
              PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
              `Composition rule references undeclared runtime type ${JSON.stringify(runtimeType)}.`,
              entry,
              `/compositionRules/${ruleIndex}`,
              context.owner.pluginId,
              { runtimeType }
            )
          );
        }
      });
    });
  });

  if (context.attestation.trustLevel !== 'core') {
    paletteEntries.forEach((entry) => {
      registerImplementationReference(
        implementationReferences,
        entry.declaration.id,
        'palette-projection',
        entry,
        '/id',
        context.owner.pluginId,
        diagnostics
      );
      entry.descriptor.groups.forEach((group, groupIndex) => {
        if (group.placement.section !== 'external') return;
        group.items.forEach((item, itemIndex) => {
          const template = templateBindings.get(
            JSON.stringify([entry.declaration.id, item.id])
          );
          const hasDirectRecipe = item.runtimeType !== undefined;
          if (hasDirectRecipe === Boolean(template)) {
            diagnostics.push(
              diagnostic(
                PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
                hasDirectRecipe
                  ? 'External Palette item cannot declare both direct runtime creation and a Blueprint template.'
                  : 'External Palette item must declare direct runtime creation or bind one Blueprint template.',
                entry,
                `/groups/${groupIndex}/items/${itemIndex}`,
                context.owner.pluginId,
                { paletteItemId: item.id }
              )
            );
          }
        });
      });
    });
  }

  const failure = asNonEmptyDiagnostics(diagnostics);
  return failure ? pluginHostFailure(failure) : pluginHostSuccess(undefined);
};
