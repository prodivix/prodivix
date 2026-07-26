import type {
  RenderPolicyContributionV2,
  Rule as RenderPolicyRuleV2,
  SurfaceRequirements,
} from '#contracts/generated/renderPolicyContributionV2.generated';
import { RENDER_POLICY_CONTRIBUTION_V2_SCHEMA } from '#contracts/generated/renderPolicyContributionV2Schema.generated';
import type { PluginDiagnostic } from '#contracts/diagnostics';
import {
  compileContributionSchema,
  contributionContractDiagnostic,
  validateContributionStructure,
  validatePropsTransform,
  type ContributionDescriptorValidationResult,
} from '#contracts/contributionValidation';
import type { JsonValueValidationOptions } from '#contracts/jsonValue';
import {
  decodeRenderPolicyContributionV2,
  type RenderPolicyContribution,
} from '#contracts/renderPolicy';

export type ValidateRenderPolicyContributionOptions =
  JsonValueValidationOptions;
export type ValidateRenderPolicyContributionResult =
  ContributionDescriptorValidationResult<RenderPolicyContribution>;

const POINT = 'renderPolicy';
const CONTRACT_VERSION = '2.0';
const validateStructure = compileContributionSchema<RenderPolicyContributionV2>(
  RENDER_POLICY_CONTRIBUTION_V2_SCHEMA
);

const diagnostic = (message: string, documentPath: string): PluginDiagnostic =>
  contributionContractDiagnostic(
    POINT,
    message,
    documentPath,
    undefined,
    CONTRACT_VERSION
  );

const validateSurfaceRequirements = (
  surface: SurfaceRequirements,
  path: string,
  hasAttestedAdapter = false
): PluginDiagnostic[] => {
  const diagnostics: PluginDiagnostic[] = [];
  const requireValue = <T extends string>(
    field: keyof SurfaceRequirements,
    actual: T,
    expected: readonly T[],
    compatibility: SurfaceRequirements['compatibility']
  ) => {
    if (expected.includes(actual)) return;
    diagnostics.push(
      diagnostic(
        `${compatibility} surface compatibility requires ${String(field)} to be ${expected.map((value) => JSON.stringify(value)).join(' or ')}.`,
        `${path}/${String(field)}`
      )
    );
  };

  if (surface.compatibility === 'container-native') {
    requireValue(
      'viewport',
      surface.viewport,
      ['container'],
      surface.compatibility
    );
    requireValue(
      'browserMetrics',
      surface.browserMetrics,
      ['none'],
      surface.compatibility
    );
    requireValue(
      'styles',
      surface.styles,
      ['inherited'],
      surface.compatibility
    );
    requireValue(
      'focusKeyboard',
      surface.focusKeyboard,
      ['host-native'],
      surface.compatibility
    );
    requireValue(
      'intrinsicSize',
      surface.intrinsicSize,
      ['parent-constrained', 'explicit'],
      surface.compatibility
    );
    return diagnostics;
  }

  if (surface.compatibility === 'host-adapted') {
    requireValue(
      'viewport',
      surface.viewport,
      ['container', 'container-projected'],
      surface.compatibility
    );
    requireValue(
      'browserMetrics',
      surface.browserMetrics,
      ['none', 'surface-environment'],
      surface.compatibility
    );
    requireValue(
      'styles',
      surface.styles,
      ['inherited', 'owner-scoped', 'verified-transform'],
      surface.compatibility
    );
    requireValue(
      'focusKeyboard',
      surface.focusKeyboard,
      ['host-native', 'host-bridge'],
      surface.compatibility
    );
    requireValue(
      'intrinsicSize',
      surface.intrinsicSize,
      ['parent-constrained', 'surface-measured', 'explicit'],
      surface.compatibility
    );
    const declaresAdaptation =
      surface.viewport === 'container-projected' ||
      surface.browserMetrics === 'surface-environment' ||
      surface.styles === 'owner-scoped' ||
      surface.styles === 'verified-transform' ||
      surface.focusKeyboard === 'host-bridge' ||
      surface.intrinsicSize === 'surface-measured' ||
      hasAttestedAdapter;
    if (!declaresAdaptation) {
      diagnostics.push(
        diagnostic(
          'host-adapted surface compatibility must declare at least one bounded Host adaptation requirement.',
          path
        )
      );
    }
    return diagnostics;
  }

  requireValue(
    'viewport',
    surface.viewport,
    ['browser-native'],
    surface.compatibility
  );
  requireValue(
    'browserMetrics',
    surface.browserMetrics,
    ['none', 'browser-native'],
    surface.compatibility
  );
  requireValue(
    'styles',
    surface.styles,
    ['document-isolated'],
    surface.compatibility
  );
  requireValue(
    'focusKeyboard',
    surface.focusKeyboard,
    ['isolated-bridge', 'design-proxy'],
    surface.compatibility
  );
  requireValue(
    'intrinsicSize',
    surface.intrinsicSize,
    ['explicit', 'isolation-handshake'],
    surface.compatibility
  );
  return diagnostics;
};

const validatePortalCompatibility = (
  rule: RenderPolicyRuleV2,
  surface: SurfaceRequirements,
  path: string
): PluginDiagnostic[] => {
  if (
    rule.portal.mode === 'host-overlay' &&
    surface.compatibility !== 'host-adapted'
  ) {
    return [
      diagnostic(
        `host-overlay portal mode requires host-adapted surface compatibility, received ${JSON.stringify(surface.compatibility)}.`,
        `${path}/portal/mode`
      ),
    ];
  }
  return [];
};

const validateSemantics = (
  descriptor: RenderPolicyContributionV2
): PluginDiagnostic[] => {
  const diagnostics = validateSurfaceRequirements(
    descriptor.surface,
    '/surface',
    descriptor.rules.some((rule) => rule.hostImplementationId !== undefined)
  );
  const ruleIds = new Set<string>();
  const runtimeTypes = new Set<string>();
  descriptor.rules.forEach((rule, index) => {
    const path = `/rules/${index}`;
    if (ruleIds.has(rule.id)) {
      diagnostics.push(
        diagnostic(
          `Render rule id ${JSON.stringify(rule.id)} is declared more than once.`,
          `${path}/id`
        )
      );
    }
    if (runtimeTypes.has(rule.runtimeType)) {
      diagnostics.push(
        diagnostic(
          `Runtime type ${JSON.stringify(rule.runtimeType)} has more than one render rule.`,
          `${path}/runtimeType`
        )
      );
    }
    ruleIds.add(rule.id);
    runtimeTypes.add(rule.runtimeType);
    diagnostics.push(
      ...validatePropsTransform(
        POINT,
        rule.props,
        `${path}/props`,
        CONTRACT_VERSION
      )
    );
    if (rule.surface) {
      diagnostics.push(
        ...validateSurfaceRequirements(
          rule.surface,
          `${path}/surface`,
          rule.hostImplementationId !== undefined
        )
      );
    }
    diagnostics.push(
      ...validatePortalCompatibility(
        rule,
        rule.surface ?? descriptor.surface,
        path
      )
    );
    if (rule.portal.mode === 'disabled' && rule.portal.canvasOpen) {
      diagnostics.push(
        diagnostic(
          'A disabled portal cannot declare canvas-controlled open state.',
          `${path}/portal/canvasOpen`
        )
      );
    }
    if (rule.portal.mode === 'host-overlay' && !rule.hostImplementationId) {
      diagnostics.push(
        diagnostic(
          'host-overlay portal mode requires a build-attested host implementation.',
          `${path}/hostImplementationId`
        )
      );
    }
    if (rule.fallback.behavior !== 'omit' && !rule.fallback.message) {
      diagnostics.push(
        diagnostic(
          `${rule.fallback.behavior} fallback behavior requires a user-facing message.`,
          `${path}/fallback/message`
        )
      );
    }
  });
  return diagnostics;
};

export const validateRenderPolicyContribution = (
  input: unknown,
  options: ValidateRenderPolicyContributionOptions = {}
): ValidateRenderPolicyContributionResult => {
  const result = validateContributionStructure(input, {
    point: POINT,
    label: 'Render Policy contribution',
    validate: validateStructure,
    json: options,
    contractVersion: CONTRACT_VERSION,
  });
  if (!result.ok) return result;
  const diagnostics = validateSemantics(result.descriptor);
  return diagnostics.length > 0
    ? { ok: false, diagnostics }
    : {
        ok: true,
        descriptor: decodeRenderPolicyContributionV2(result.descriptor),
        diagnostics: [],
      };
};
