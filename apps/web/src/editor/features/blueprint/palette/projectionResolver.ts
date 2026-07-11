import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  validatePaletteContribution,
  type PaletteContributionV1,
  type PaletteGroupDescriptor,
  type PaletteItemDescriptor,
  type PluginDiagnostic,
} from '@prodivix/plugin-contracts';
import type { OfficialPalettePreviewItem } from '@prodivix/plugin-react-host';
import {
  asNonEmptyDiagnostics,
  createContributionIdentity,
  defineContributionContract,
  isSameContributionIdentity,
  pluginHostFailure,
  pluginHostSuccess,
  type ContributionIdentity,
  type PluginHostResult,
  type PluginOwnerRef,
  type RegisteredContributionContract,
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
  OfficialHostImplementationBinding,
  OfficialHostImplementationRegistry,
} from '@/plugins/platform/officialHostImplementations';
import type { WebContributionPointMap } from '@/plugins/platform/types';
import {
  scopeOfficialPluginNode,
  type OfficialSurfaceLeaseRegistry,
} from '@/plugins/platform/officialSurfaceHost';

type ProjectionBinding = Readonly<{
  token: symbol;
  projection: PaletteRuntimeProjection;
}>;

type PaletteClaim = {
  identity: ContributionIdentity;
  leaseCount: number;
};

export type PaletteProjectionResolver = Readonly<{
  contract: RegisteredContributionContract<WebContributionPointMap>;
  bindProjection(
    input: Readonly<{
      packageSourceId: string;
      packageDigest: string;
      pluginId: string;
      contributionId: string;
      projection: PaletteRuntimeProjection;
    }>
  ): Readonly<{ dispose(): void }>;
}>;

const projectionKey = (
  packageSourceId: string,
  packageDigest: string,
  pluginId: string,
  contributionId: string
): string =>
  JSON.stringify([packageSourceId, packageDigest, pluginId, contributionId]);

const claimKey = (kind: 'group' | 'item', id: string): string =>
  JSON.stringify([kind, id]);

const resolverFailure = (
  message: string,
  identity: ContributionIdentity,
  meta: Record<string, string> = {}
): PluginHostResult<never> =>
  pluginHostFailure([
    createPluginDiagnostic(
      PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOLVER_FAILED,
      message,
      {
        pluginId: identity.pluginId,
        contributionId: identity.contributionId,
        contributionPoint: 'paletteContribution',
        contractVersion: '1.0',
        ...meta,
      }
    ),
  ]);

const conflictFailure = (
  kind: 'group' | 'item',
  id: string,
  identity: ContributionIdentity,
  conflicting: ContributionIdentity
): PluginHostResult<never> =>
  pluginHostFailure([
    createPluginDiagnostic(
      PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_IDENTITY_CONFLICT,
      `Palette ${kind} id ${JSON.stringify(id)} is already owned by another contribution.`,
      {
        pluginId: identity.pluginId,
        contributionId: identity.contributionId,
        contributionPoint: 'paletteContribution',
        contractVersion: '1.0',
        paletteEntryKind: kind,
        paletteEntryId: id,
        conflictingPluginId: conflicting.pluginId,
        conflictingContributionId: conflicting.contributionId,
      }
    ),
  ]);

const resolveItem = (
  descriptor: PaletteItemDescriptor,
  projection: OfficialPalettePreviewItem,
  group: PaletteGroupDescriptor,
  identity: ContributionIdentity
): PluginHostResult<ComponentPreviewItem> => {
  const runtimeVariants = new Map(
    projection.variants?.map((variant) => [variant.id, variant]) ?? []
  );
  const variants = descriptor.presentation?.variants?.map((variant) => {
    const runtimeVariant = runtimeVariants.get(variant.id);
    if (!runtimeVariant) return undefined;
    return Object.freeze({
      id: variant.id,
      label: variant.label,
      element: runtimeVariant.element,
      ...(variant.scale === undefined ? {} : { scale: variant.scale }),
      ...(runtimeVariant.renderElement === undefined
        ? {}
        : { renderElement: runtimeVariant.renderElement }),
      ...(variant.props === undefined ? {} : { props: variant.props }),
    });
  });
  if (variants?.some((variant) => variant === undefined)) {
    return resolverFailure(
      `Palette item ${JSON.stringify(descriptor.id)} is missing a runtime variant projection.`,
      identity,
      { paletteItemId: descriptor.id }
    );
  }

  const runtimeStatuses = new Map(
    projection.statusOptions?.map((option) => [option.id, option]) ?? []
  );
  const status = descriptor.presentation?.status;
  const statusOptions = status?.options.map((option) => {
    const runtimeStatus = runtimeStatuses.get(option.id);
    return Object.freeze({
      id: option.id,
      label: option.label,
      value: option.value,
      ...(runtimeStatus?.icon === undefined
        ? {}
        : { icon: runtimeStatus.icon }),
    });
  });
  const externalLibraryId =
    group.placement.section === 'external'
      ? group.placement.libraryId
      : undefined;

  return pluginHostSuccess(
    Object.freeze({
      id: descriptor.id,
      name: descriptor.label,
      ...(externalLibraryId === undefined
        ? {}
        : { libraryId: externalLibraryId }),
      preview: projection.preview,
      ...(descriptor.runtimeType === undefined
        ? {}
        : { runtimeType: descriptor.runtimeType }),
      ...(descriptor.defaultProps === undefined
        ? {}
        : { defaultProps: descriptor.defaultProps }),
      ...(descriptor.propOptions === undefined
        ? {}
        : { propOptions: descriptor.propOptions }),
      ...(descriptor.presentation?.scale === undefined
        ? {}
        : { scale: descriptor.presentation.scale }),
      ...(descriptor.presentation?.sizes === undefined
        ? {}
        : {
            sizeOptions: Object.freeze(
              descriptor.presentation.sizes.map((option) =>
                Object.freeze({ ...option })
              )
            ),
          }),
      ...(variants === undefined
        ? {}
        : {
            variants: Object.freeze(
              variants as NonNullable<ComponentPreviewItem['variants']>
            ),
          }),
      ...(status === undefined
        ? {}
        : {
            statusProp: status.prop,
            statusLabel: status.label,
            statusOptions: Object.freeze(statusOptions ?? []),
            ...(status.defaultValue === undefined
              ? {}
              : { defaultStatus: status.defaultValue }),
          }),
      ...(projection.renderPreview === undefined
        ? {}
        : { renderPreview: projection.renderPreview }),
    })
  );
};

const resolveGroups = (
  descriptor: PaletteContributionV1,
  projection: PaletteRuntimeProjection,
  identity: ContributionIdentity
): PluginHostResult<readonly ComponentGroup[]> => {
  if (descriptor.groups.length !== projection.groups.length) {
    return resolverFailure(
      'Palette descriptor and runtime projection contain different group counts.',
      identity
    );
  }
  const runtimeGroups = new Map(
    projection.groups.map((group) => [group.id, group])
  );
  if (runtimeGroups.size !== projection.groups.length) {
    return resolverFailure(
      'Palette runtime projection contains duplicate group ids.',
      identity
    );
  }

  const resolvedGroups: ComponentGroup[] = [];
  for (const group of descriptor.groups) {
    const runtimeGroup = runtimeGroups.get(group.id);
    if (!runtimeGroup || runtimeGroup.items.length !== group.items.length) {
      return resolverFailure(
        `Palette group ${JSON.stringify(group.id)} does not match its runtime projection.`,
        identity,
        { paletteGroupId: group.id }
      );
    }
    const runtimeItems = new Map(
      runtimeGroup.items.map((item) => [item.id, item])
    );
    if (runtimeItems.size !== runtimeGroup.items.length) {
      return resolverFailure(
        `Palette group ${JSON.stringify(group.id)} runtime projection contains duplicate item ids.`,
        identity,
        { paletteGroupId: group.id }
      );
    }
    const items: ComponentPreviewItem[] = [];
    for (const item of group.items) {
      const runtimeItem = runtimeItems.get(item.id);
      if (!runtimeItem) {
        return resolverFailure(
          `Palette item ${JSON.stringify(item.id)} has no runtime projection.`,
          identity,
          { paletteGroupId: group.id, paletteItemId: item.id }
        );
      }
      if (
        group.placement.section === 'external' &&
        runtimeItem.libraryId !== group.placement.libraryId
      ) {
        return resolverFailure(
          `Palette item ${JSON.stringify(item.id)} is bound to a different external library.`,
          identity,
          { paletteGroupId: group.id, paletteItemId: item.id }
        );
      }
      const resolved = resolveItem(item, runtimeItem, group, identity);
      if (!resolved.ok) {
        const diagnostics = asNonEmptyDiagnostics(resolved.diagnostics);
        return diagnostics
          ? pluginHostFailure(diagnostics)
          : resolverFailure(
              `Palette item ${JSON.stringify(item.id)} failed without a diagnostic.`,
              identity,
              { paletteGroupId: group.id, paletteItemId: item.id }
            );
      }
      items.push(resolved.value);
    }
    resolvedGroups.push(
      Object.freeze({
        id: group.id,
        title: group.label,
        source: group.placement.section,
        items: Object.freeze(items) as ComponentPreviewItem[],
      })
    );
  }
  return pluginHostSuccess(Object.freeze(resolvedGroups));
};

const scopeOfficialProjection = (
  projection: PaletteRuntimeProjection,
  owner: PluginOwnerRef
): PaletteRuntimeProjection =>
  Object.freeze({
    groups: Object.freeze(
      projection.groups.map((group) =>
        Object.freeze({
          ...group,
          items: Object.freeze(
            group.items.map((item) =>
              Object.freeze({
                ...item,
                preview: scopeOfficialPluginNode(owner, item.preview),
                ...(item.renderPreview
                  ? {
                      renderPreview: (options: {
                        size?: string;
                        status?: string;
                      }) =>
                        scopeOfficialPluginNode(
                          owner,
                          item.renderPreview!(options)
                        ),
                    }
                  : {}),
                ...(item.variants
                  ? {
                      variants: Object.freeze(
                        item.variants.map((variant) =>
                          Object.freeze({
                            ...variant,
                            element: scopeOfficialPluginNode(
                              owner,
                              variant.element
                            ),
                            ...(variant.renderElement
                              ? {
                                  renderElement: (options: { size?: string }) =>
                                    scopeOfficialPluginNode(
                                      owner,
                                      variant.renderElement!(options)
                                    ),
                                }
                              : {}),
                          })
                        )
                      ),
                    }
                  : {}),
                ...(item.statusOptions
                  ? {
                      statusOptions: Object.freeze(
                        item.statusOptions.map((status) =>
                          Object.freeze({
                            ...status,
                            ...(status.icon === undefined
                              ? {}
                              : {
                                  icon: scopeOfficialPluginNode(
                                    owner,
                                    status.icon
                                  ),
                                }),
                          })
                        )
                      ),
                    }
                  : {}),
              })
            )
          ),
        })
      )
    ),
  });

export const createPaletteProjectionResolver = (
  implementations: OfficialHostImplementationRegistry,
  surfaceLeases: OfficialSurfaceLeaseRegistry
): PaletteProjectionResolver => {
  const bindings = new Map<string, ProjectionBinding>();
  const claims = new Map<string, PaletteClaim>();

  const contract = defineContributionContract<
    WebContributionPointMap,
    'paletteContribution',
    PaletteContributionV1
  >({
    point: 'paletteContribution',
    contractVersion: '1.0',
    validateDescriptor: (input) => {
      const result = validatePaletteContribution(input);
      if (result.ok) return pluginHostSuccess(result.descriptor);
      const diagnostics = asNonEmptyDiagnostics(result.diagnostics);
      return pluginHostFailure(
        diagnostics ??
          ([
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_SCHEMA_VIOLATION,
              'Palette descriptor validation failed without a diagnostic.',
              {
                contributionPoint: 'paletteContribution',
                contractVersion: '1.0',
              }
            ),
          ] satisfies [PluginDiagnostic])
      );
    },
    prepare: async ({
      owner,
      attestation,
      declaration,
      descriptor,
      signal,
    }) => {
      const identity = createContributionIdentity(
        owner.pluginId,
        declaration.id
      );
      const trustedBinding = bindings.get(
        projectionKey(
          attestation.sourceId,
          attestation.packageDigest,
          owner.pluginId,
          declaration.id
        )
      );
      let officialBinding:
        OfficialHostImplementationBinding<'palette-projection'> | undefined;
      if (!trustedBinding) {
        const result = await implementations.bind({
          owner,
          attestation,
          implementationId: declaration.id,
          expectedKind: 'palette-projection',
          signal,
        });
        if (result.ok === false) {
          return pluginHostFailure(result.diagnostics);
        }
        officialBinding = result.value;
      }
      const projection = trustedBinding?.projection ?? officialBinding?.value;
      if (!projection) {
        officialBinding?.dispose();
        return resolverFailure(
          'Palette contribution has no trusted runtime projection binding.',
          identity
        );
      }
      const resolvedProjection =
        attestation.trustLevel === 'core'
          ? projection
          : scopeOfficialProjection(projection, owner);
      const groups = resolveGroups(descriptor, resolvedProjection, identity);
      if (!groups.ok) {
        officialBinding?.dispose();
        const diagnostics = asNonEmptyDiagnostics(groups.diagnostics);
        return diagnostics
          ? pluginHostFailure(diagnostics)
          : resolverFailure(
              'Palette group resolution failed without a diagnostic.',
              identity
            );
      }

      const contributionClaims = [
        ...descriptor.groups.map((group) => ({
          kind: 'group' as const,
          id: group.id,
        })),
        ...descriptor.groups.flatMap((group) =>
          group.items.map((item) => ({
            kind: 'item' as const,
            id: item.id,
          }))
        ),
      ];
      for (const claim of contributionClaims) {
        const current = claims.get(claimKey(claim.kind, claim.id));
        if (
          current &&
          !isSameContributionIdentity(current.identity, identity)
        ) {
          officialBinding?.dispose();
          return conflictFailure(
            claim.kind,
            claim.id,
            identity,
            current.identity
          );
        }
      }
      contributionClaims.forEach((claim) => {
        const key = claimKey(claim.kind, claim.id);
        const current = claims.get(key);
        claims.set(key, {
          identity,
          leaseCount: (current?.leaseCount ?? 0) + 1,
        });
      });
      let disposePromise: Promise<void> | undefined;
      return pluginHostSuccess({
        value: Object.freeze({
          descriptor,
          groups: groups.value,
          creationMode:
            attestation.trustLevel === 'core' ? 'native' : 'contract',
        }) satisfies ResolvedPaletteContribution,
        lifetime: 'installation' as const,
        dependsOnCapabilities: [],
        dispose: () => {
          if (disposePromise) return disposePromise;
          disposePromise = (async () => {
            contributionClaims.forEach((claim) => {
              const key = claimKey(claim.kind, claim.id);
              const current = claims.get(key);
              if (
                !current ||
                !isSameContributionIdentity(current.identity, identity)
              ) {
                return;
              }
              if (current.leaseCount <= 1) {
                claims.delete(key);
                return;
              }
              current.leaseCount -= 1;
            });
            try {
              await surfaceLeases.releaseOwner(owner);
            } finally {
              officialBinding?.dispose();
            }
          })();
          return disposePromise;
        },
      });
    },
  });

  return Object.freeze({
    contract,
    bindProjection: ({
      packageSourceId,
      packageDigest,
      pluginId,
      contributionId,
      projection,
    }) => {
      const key = projectionKey(
        packageSourceId,
        packageDigest,
        pluginId,
        contributionId
      );
      const token = Symbol(key);
      bindings.set(key, { token, projection });
      let disposed = false;
      return Object.freeze({
        dispose: () => {
          if (disposed) return;
          disposed = true;
          if (bindings.get(key)?.token === token) bindings.delete(key);
        },
      });
    },
  });
};
