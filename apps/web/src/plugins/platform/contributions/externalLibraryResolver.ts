import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  validateExternalLibraryContribution,
  type ExternalLibraryContributionV1,
} from '@prodivix/plugin-contracts';
import {
  createContributionIdentity,
  defineContributionContract,
  isSameContributionIdentity,
  pluginHostFailure,
  pluginHostSuccess,
  type ContributionIdentity,
  type RegisteredContributionContract,
} from '@prodivix/plugin-host';
import type { ElementType } from 'react';
import type { LibraryArtifactResolver } from '@/plugins/platform/officialHostImplementations';
import type {
  ResolvedExternalLibraryContribution,
  WebContributionPointMap,
} from '@/plugins/platform/types';
import {
  cloneAndFreezeJson,
  resolverFailure,
  toHostDescriptorValidationResult,
} from '@/plugins/platform/contributions/resolverUtils';

type IdentityClaim = {
  identity: ContributionIdentity;
  leaseCount: number;
};

const isElementType = (value: unknown): value is ElementType =>
  typeof value === 'string' ||
  typeof value === 'function' ||
  (typeof value === 'object' && value !== null && '$$typeof' in value);

const claimConflict = (
  kind: 'library' | 'runtime type',
  id: string,
  identity: ContributionIdentity,
  conflicting: ContributionIdentity
) =>
  pluginHostFailure([
    createPluginDiagnostic(
      PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_IDENTITY_CONFLICT,
      `External ${kind} ${JSON.stringify(id)} is already owned by another contribution.`,
      {
        pluginId: identity.pluginId,
        contributionId: identity.contributionId,
        contributionPoint: 'externalLibrary',
        contractVersion: '1.0',
        externalIdentityKind: kind,
        externalIdentity: id,
        conflictingPluginId: conflicting.pluginId,
        conflictingContributionId: conflicting.contributionId,
      }
    ),
  ]);

export const createExternalLibraryContributionResolver = (
  artifacts: LibraryArtifactResolver
): RegisteredContributionContract<WebContributionPointMap> => {
  const libraryClaims = new Map<string, IdentityClaim>();
  const runtimeTypeClaims = new Map<string, IdentityClaim>();

  return defineContributionContract<
    WebContributionPointMap,
    'externalLibrary',
    ExternalLibraryContributionV1
  >({
    point: 'externalLibrary',
    contractVersion: '1.0',
    validateDescriptor: (input) =>
      toHostDescriptorValidationResult(
        validateExternalLibraryContribution(input),
        'externalLibrary'
      ),
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
      const implementation = descriptor.hostImplementationId
        ? await artifacts.resolveComponentLibrary({
            owner,
            attestation,
            implementationId: descriptor.hostImplementationId,
            package: {
              name: descriptor.package.name,
              version: descriptor.package.version,
            },
            signal,
          })
        : undefined;
      if (implementation?.ok === false) {
        return pluginHostFailure(implementation.diagnostics);
      }

      const components: ResolvedExternalLibraryContribution['components'][number][] =
        [];
      for (const component of descriptor.components) {
        const resolved = implementation?.ok
          ? implementation.value.value.components[component.exportName]
          : undefined;
        if (implementation?.ok && !isElementType(resolved)) {
          implementation.value.dispose();
          return resolverFailure(
            'externalLibrary',
            `Official component library implementation does not expose renderable export ${JSON.stringify(component.exportName)}.`,
            {
              pluginId: owner.pluginId,
              contributionId: declaration.id,
              libraryId: descriptor.libraryId,
              runtimeType: component.runtimeType,
              componentExport: component.exportName,
              implementationId: descriptor.hostImplementationId,
            }
          );
        }
        components.push(
          Object.freeze({
            exportName: component.exportName,
            componentName: component.componentName,
            runtimeType: component.runtimeType,
            ...(resolved === undefined ? {} : { component: resolved }),
          })
        );
      }

      const claims = [
        {
          kind: 'library' as const,
          id: descriptor.libraryId,
          store: libraryClaims,
        },
        ...descriptor.components.map((component) => ({
          kind: 'runtime type' as const,
          id: component.runtimeType,
          store: runtimeTypeClaims,
        })),
      ];
      for (const claim of claims) {
        const current = claim.store.get(claim.id);
        if (
          current &&
          !isSameContributionIdentity(current.identity, identity)
        ) {
          if (implementation?.ok) implementation.value.dispose();
          return claimConflict(
            claim.kind,
            claim.id,
            identity,
            current.identity
          );
        }
      }
      claims.forEach((claim) => {
        const current = claim.store.get(claim.id);
        claim.store.set(claim.id, {
          identity,
          leaseCount: (current?.leaseCount ?? 0) + 1,
        });
      });

      const frozenDescriptor = cloneAndFreezeJson(descriptor);
      let disposed = false;
      return pluginHostSuccess({
        value: Object.freeze({
          descriptor: frozenDescriptor,
          libraryId: frozenDescriptor.libraryId,
          package: Object.freeze({ ...frozenDescriptor.package }),
          components: Object.freeze(components),
        }) satisfies ResolvedExternalLibraryContribution,
        lifetime: 'installation',
        dependsOnCapabilities: [],
        dispose: () => {
          if (disposed) return;
          disposed = true;
          [...claims].reverse().forEach((claim) => {
            const current = claim.store.get(claim.id);
            if (
              !current ||
              !isSameContributionIdentity(current.identity, identity)
            ) {
              return;
            }
            if (current.leaseCount <= 1) {
              claim.store.delete(claim.id);
            } else {
              current.leaseCount -= 1;
            }
          });
          if (implementation?.ok) implementation.value.dispose();
        },
      });
    },
  });
};
