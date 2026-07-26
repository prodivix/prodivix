import type { RenderPolicyContributionV1 } from '#contracts/generated/renderPolicyContribution.generated';
import { RENDER_POLICY_CONTRIBUTION_V1_SCHEMA } from '#contracts/generated/renderPolicyContributionSchema.generated';
import type { PluginDiagnostic } from '#contracts/diagnostics';
import {
  compileContributionSchema,
  contributionContractDiagnostic,
  validateContributionStructure,
  validatePropsTransform,
  type ContributionDescriptorValidationResult,
} from '#contracts/contributionValidation';
import type { JsonValueValidationOptions } from '#contracts/jsonValue';

export type ValidateRenderPolicyContributionV1Options =
  JsonValueValidationOptions;
export type ValidateRenderPolicyContributionV1Result =
  ContributionDescriptorValidationResult<RenderPolicyContributionV1>;

const POINT = 'renderPolicy';
const validateStructure = compileContributionSchema<RenderPolicyContributionV1>(
  RENDER_POLICY_CONTRIBUTION_V1_SCHEMA
);

const validateSemantics = (
  descriptor: RenderPolicyContributionV1
): PluginDiagnostic[] => {
  const diagnostics: PluginDiagnostic[] = [];
  const ruleIds = new Set<string>();
  const runtimeTypes = new Set<string>();
  descriptor.rules.forEach((rule, index) => {
    const path = `/rules/${index}`;
    if (ruleIds.has(rule.id)) {
      diagnostics.push(
        contributionContractDiagnostic(
          POINT,
          `Render rule id ${JSON.stringify(rule.id)} is declared more than once.`,
          `${path}/id`
        )
      );
    }
    if (runtimeTypes.has(rule.runtimeType)) {
      diagnostics.push(
        contributionContractDiagnostic(
          POINT,
          `Runtime type ${JSON.stringify(rule.runtimeType)} has more than one render rule.`,
          `${path}/runtimeType`
        )
      );
    }
    ruleIds.add(rule.id);
    runtimeTypes.add(rule.runtimeType);
    diagnostics.push(
      ...validatePropsTransform(POINT, rule.props, `${path}/props`)
    );
    if (rule.portal.mode === 'disabled' && rule.portal.canvasOpen) {
      diagnostics.push(
        contributionContractDiagnostic(
          POINT,
          'A disabled portal cannot declare canvas-controlled open state.',
          `${path}/portal/canvasOpen`
        )
      );
    }
    if (rule.portal.mode === 'host-overlay' && !rule.hostImplementationId) {
      diagnostics.push(
        contributionContractDiagnostic(
          POINT,
          'host-overlay portal mode requires a build-attested host implementation.',
          `${path}/hostImplementationId`
        )
      );
    }
    if (rule.fallback.behavior !== 'omit' && !rule.fallback.message) {
      diagnostics.push(
        contributionContractDiagnostic(
          POINT,
          `${rule.fallback.behavior} fallback behavior requires a user-facing message.`,
          `${path}/fallback/message`
        )
      );
    }
  });
  return diagnostics;
};

export const validateRenderPolicyContributionV1 = (
  input: unknown,
  options: ValidateRenderPolicyContributionV1Options = {}
): ValidateRenderPolicyContributionV1Result => {
  const result = validateContributionStructure(input, {
    point: POINT,
    label: 'Render Policy contribution',
    validate: validateStructure,
    json: options,
  });
  if (!result.ok) return result;
  const diagnostics = validateSemantics(result.descriptor);
  return diagnostics.length > 0 ? { ok: false, diagnostics } : result;
};
