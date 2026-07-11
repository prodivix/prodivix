import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  validateBlueprintTemplateContribution,
  type BlueprintTemplateContributionV1,
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
import type {
  ResolvedBlueprintTemplateContribution,
  WebContributionPointMap,
} from '@/plugins/platform/types';
import {
  cloneAndFreezeJson,
  toHostDescriptorValidationResult,
} from '@/plugins/platform/contributions/resolverUtils';

type IdentityClaim = {
  identity: ContributionIdentity;
  leaseCount: number;
};

type Claim = Readonly<{
  kind: 'template' | 'palette binding' | 'composition runtime type';
  id: string;
  store: Map<string, IdentityClaim>;
}>;

const conflict = (
  claim: Claim,
  identity: ContributionIdentity,
  conflicting: ContributionIdentity
) =>
  pluginHostFailure([
    createPluginDiagnostic(
      PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_IDENTITY_CONFLICT,
      `Blueprint ${claim.kind} ${JSON.stringify(claim.id)} is already owned by another contribution.`,
      {
        pluginId: identity.pluginId,
        contributionId: identity.contributionId,
        contributionPoint: 'blueprintTemplate',
        contractVersion: '1.0',
        blueprintIdentityKind: claim.kind,
        blueprintIdentity: claim.id,
        conflictingPluginId: conflicting.pluginId,
        conflictingContributionId: conflicting.contributionId,
      }
    ),
  ]);

export const createBlueprintTemplateContributionResolver =
  (): RegisteredContributionContract<WebContributionPointMap> => {
    const templateClaims = new Map<string, IdentityClaim>();
    const paletteBindingClaims = new Map<string, IdentityClaim>();
    const compositionRuntimeTypeClaims = new Map<string, IdentityClaim>();

    return defineContributionContract<
      WebContributionPointMap,
      'blueprintTemplate',
      BlueprintTemplateContributionV1
    >({
      point: 'blueprintTemplate',
      contractVersion: '1.0',
      validateDescriptor: (input) =>
        toHostDescriptorValidationResult(
          validateBlueprintTemplateContribution(input),
          'blueprintTemplate'
        ),
      prepare: async ({ owner, declaration, descriptor }) => {
        const identity = createContributionIdentity(
          owner.pluginId,
          declaration.id
        );
        const claims: Claim[] = [
          ...descriptor.templates.map((template) => ({
            kind: 'template' as const,
            id: template.id,
            store: templateClaims,
          })),
          ...descriptor.templates.map((template) => ({
            kind: 'palette binding' as const,
            id: JSON.stringify([
              template.palette.contributionId,
              template.palette.itemId,
            ]),
            store: paletteBindingClaims,
          })),
          ...(descriptor.compositionRules ?? []).map((rule) => ({
            kind: 'composition runtime type' as const,
            id: rule.runtimeType,
            store: compositionRuntimeTypeClaims,
          })),
        ];
        for (const claim of claims) {
          const current = claim.store.get(claim.id);
          if (
            current &&
            !isSameContributionIdentity(current.identity, identity)
          ) {
            return conflict(claim, identity, current.identity);
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
          }) satisfies ResolvedBlueprintTemplateContribution,
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
          },
        });
      },
    });
  };
