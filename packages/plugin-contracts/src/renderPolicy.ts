import type {
  RenderPolicyContributionV2,
  Rule as RenderPolicyRuleV2,
  SurfaceRequirements,
} from '#contracts/generated/renderPolicyContributionV2.generated';

export type RenderSurfaceRequirements = Readonly<SurfaceRequirements>;

export type RenderPolicyRule = Readonly<
  Omit<RenderPolicyRuleV2, 'surface'> & {
    surface: RenderSurfaceRequirements;
  }
>;

/**
 * Version-free current model used after the v2 wire descriptor passes strict
 * structure and semantic validation.
 */
export type RenderPolicyContribution = Readonly<{
  libraryId: string;
  surface: RenderSurfaceRequirements;
  rules: readonly RenderPolicyRule[];
}>;

export const decodeRenderPolicyContributionV2 = (
  descriptor: RenderPolicyContributionV2
): RenderPolicyContribution => ({
  libraryId: descriptor.libraryId,
  surface: descriptor.surface,
  rules: descriptor.rules.map((rule) => ({
    ...rule,
    surface: rule.surface ?? descriptor.surface,
  })),
});
