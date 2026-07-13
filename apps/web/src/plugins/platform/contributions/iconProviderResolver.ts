import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  validateIconProviderContribution,
  type IconProviderContributionV1,
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
import {
  isIconPolicyExportIdentifier,
  normalizeIconPolicyExport,
} from '@prodivix/shared';
import { createElement } from 'react';
import type { IconComponent } from '@prodivix/pir-react-renderer';
import type { LibraryArtifactResolver } from '@/plugins/platform/officialHostImplementations';
import type {
  ResolvedIconProviderContribution,
  WebContributionPointMap,
} from '@/plugins/platform/types';
import {
  cloneAndFreezeJson,
  toHostDescriptorValidationResult,
} from '@/plugins/platform/contributions/resolverUtils';
import {
  scopeOfficialPluginComponent,
  type OfficialSurfaceLeaseRegistry,
} from '@/plugins/platform/officialSurfaceHost';

type ProviderClaim = {
  identity: ContributionIdentity;
  leaseCount: number;
};

const isIconComponent = (value: unknown): value is IconComponent =>
  typeof value === 'function' ||
  (typeof value === 'object' && value !== null && '$$typeof' in value);

const createPolicyIconComponent = (
  component: IconComponent,
  render: IconProviderContributionV1['render']
): IconComponent => {
  const PolicyIcon = (inputProps: Record<string, unknown>) => {
    const props = { ...inputProps };
    const size = props.size;
    if (size !== undefined) {
      delete props.size;
      delete props.width;
      delete props.height;
      if (render.size.mode === 'prop') {
        if (!Object.prototype.hasOwnProperty.call(props, render.size.prop)) {
          props[render.size.prop] = size;
        }
      } else {
        const style =
          props.style &&
          typeof props.style === 'object' &&
          !Array.isArray(props.style)
            ? { ...(props.style as Record<string, unknown>) }
            : {};
        if (render.size.mode === 'style-box') {
          style.width = size;
          style.height = size;
        } else {
          style.fontSize = size;
        }
        props.style = style;
      }
    }
    if (
      render.colorProp &&
      render.colorProp !== 'color' &&
      Object.prototype.hasOwnProperty.call(props, 'color')
    ) {
      if (!Object.prototype.hasOwnProperty.call(props, render.colorProp)) {
        props[render.colorProp] = props.color;
      }
      delete props.color;
    }
    return createElement(component, props);
  };
  PolicyIcon.displayName = `PolicyIcon(${component.displayName ?? component.name ?? 'Anonymous'})`;
  return PolicyIcon;
};

const providerConflict = (
  descriptor: IconProviderContributionV1,
  owner: Readonly<{ pluginId: string }>,
  declaration: Readonly<{ id: string }>,
  conflicting: ContributionIdentity
) =>
  pluginHostFailure([
    createPluginDiagnostic(
      PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_IDENTITY_CONFLICT,
      `Icon provider ${JSON.stringify(descriptor.providerId)} is already owned by another contribution.`,
      {
        pluginId: owner.pluginId,
        contributionId: declaration.id,
        contributionPoint: 'iconProvider',
        contractVersion: '1.0',
        providerId: descriptor.providerId,
        conflictingPluginId: conflicting.pluginId,
        conflictingContributionId: conflicting.contributionId,
      }
    ),
  ]);

export const createIconProviderContributionResolver = (
  artifacts: LibraryArtifactResolver,
  surfaceLeases: OfficialSurfaceLeaseRegistry
): RegisteredContributionContract<WebContributionPointMap> => {
  const claims = new Map<string, ProviderClaim>();

  return defineContributionContract<
    WebContributionPointMap,
    'iconProvider',
    IconProviderContributionV1
  >({
    point: 'iconProvider',
    contractVersion: '1.0',
    validateDescriptor: (input) =>
      toHostDescriptorValidationResult(
        validateIconProviderContribution(input),
        'iconProvider'
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
      const current = claims.get(descriptor.providerId);
      if (current && !isSameContributionIdentity(current.identity, identity)) {
        return providerConflict(
          descriptor,
          owner,
          declaration,
          current.identity
        );
      }
      const implementation = await artifacts.resolveIconProvider({
        owner,
        attestation,
        implementationId: descriptor.hostImplementationId,
        package: {
          name: descriptor.package.name,
          version: descriptor.package.version,
        },
        signal,
      });
      if (implementation.ok === false) {
        return pluginHostFailure(implementation.diagnostics);
      }
      const claimed = claims.get(descriptor.providerId);
      if (claimed && !isSameContributionIdentity(claimed.identity, identity)) {
        implementation.value.dispose();
        return providerConflict(
          descriptor,
          owner,
          declaration,
          claimed.identity
        );
      }
      claims.set(descriptor.providerId, {
        identity,
        leaseCount: (claimed?.leaseCount ?? 0) + 1,
      });

      const frozenDescriptor = cloneAndFreezeJson(descriptor);
      const cache = new Map<string, IconComponent>();
      const runtime = Object.freeze({
        label: frozenDescriptor.displayName,
        configurable: true,
        resolve: (name: string, iconRef?: Readonly<{ variant?: string }>) => {
          const normalizedName = name.trim();
          if (
            !normalizedName ||
            normalizedName.length > frozenDescriptor.limits.maxNameLength
          ) {
            return null;
          }
          const { symbol, variant } = normalizeIconPolicyExport({
            name: normalizedName,
            variant: iconRef?.variant,
            normalization: frozenDescriptor.normalization,
            exports: frozenDescriptor.exports,
          });
          if (
            !isIconPolicyExportIdentifier(symbol) ||
            (iconRef?.variant !== undefined && variant === undefined)
          ) {
            return null;
          }
          const cacheKey = JSON.stringify([symbol, variant?.id ?? null]);
          const cached = cache.get(cacheKey);
          if (cached) return cached;
          const resolved = implementation.value.value.resolveExport(symbol, {
            providerId: frozenDescriptor.providerId,
            requestedName: normalizedName,
            ...(variant
              ? {
                  variantId: variant.id,
                  ...(variant.subpath ? { subpath: variant.subpath } : {}),
                }
              : {}),
          });
          if (!isIconComponent(resolved)) return null;
          const policyComponent = scopeOfficialPluginComponent(
            owner,
            createPolicyIconComponent(resolved, frozenDescriptor.render)
          ) as IconComponent;
          cache.set(cacheKey, policyComponent);
          while (cache.size > frozenDescriptor.limits.maxCacheEntries) {
            const oldest = cache.keys().next().value;
            if (typeof oldest !== 'string') break;
            cache.delete(oldest);
          }
          return policyComponent;
        },
        listIcons: () => {
          const names = implementation.value.value
            .listExports()
            .filter(
              (name) =>
                typeof name === 'string' &&
                name.length > 0 &&
                name.length <= frozenDescriptor.limits.maxNameLength
            )
            .slice(0, frozenDescriptor.limits.maxIcons);
          return new TextEncoder().encode(JSON.stringify(names)).byteLength <=
            frozenDescriptor.limits.maxResponseBytes
            ? [...names]
            : [];
        },
        ...(implementation.value.value.ensureReady
          ? { ensureReady: implementation.value.value.ensureReady }
          : {}),
      });
      let disposePromise: Promise<void> | undefined;
      return pluginHostSuccess({
        value: Object.freeze({
          descriptor: frozenDescriptor,
          libraryId: frozenDescriptor.libraryId,
          providerId: frozenDescriptor.providerId,
          runtime,
        }) satisfies ResolvedIconProviderContribution,
        lifetime: 'installation',
        dependsOnCapabilities: [],
        dispose: () => {
          if (disposePromise) return disposePromise;
          disposePromise = (async () => {
            cache.clear();
            const claim = claims.get(frozenDescriptor.providerId);
            if (claim && isSameContributionIdentity(claim.identity, identity)) {
              if (claim.leaseCount <= 1) {
                claims.delete(frozenDescriptor.providerId);
              } else {
                claim.leaseCount -= 1;
              }
            }
            try {
              await surfaceLeases.releaseOwner(owner);
            } finally {
              implementation.value.dispose();
            }
          })();
          return disposePromise;
        },
      });
    },
  });
};
