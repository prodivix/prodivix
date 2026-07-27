import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  VerificationBaselineEntry,
  VerificationBaselineSet,
  VerificationDecodeIssue,
  VerificationDecodeResult,
  VerificationDocumentByKind,
  VerificationDocumentKind,
  VerificationMatrix,
  VerificationMatrixProfile,
  VerificationPolicy,
  VerificationPolicyRule,
  VerificationRetryPolicy,
  VerificationWireDocument,
} from './verification.types';
import {
  verificationBaselineSetWireSchema,
  verificationPolicyWireSchema,
} from './wire';

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
});

const validators: Readonly<Record<VerificationDocumentKind, ValidateFunction>> =
  {
    'verification-policy': ajv.compile(verificationPolicyWireSchema),
    'verification-baseline-set': ajv.compile(verificationBaselineSetWireSchema),
  };

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const issueCode = (
  kind: VerificationDocumentKind
): VerificationDecodeIssue['code'] =>
  kind === 'verification-policy' ? 'VER-2001' : 'VER-5004';

const issuePath = (error: ErrorObject): string =>
  error.instancePath ||
  (error.params && 'missingProperty' in error.params
    ? `/${String(error.params.missingProperty)}`
    : '/');

const schemaIssues = (
  kind: VerificationDocumentKind,
  errors: ErrorObject[] | null | undefined
): VerificationDecodeIssue[] =>
  (errors ?? []).map((error) => ({
    code: issueCode(kind),
    path: issuePath(error),
    message: error.message
      ? `Verification document ${error.message}.`
      : 'Verification document does not match its wire schema.',
  }));

const customIssue = (
  kind: VerificationDocumentKind,
  path: string,
  message: string
): VerificationDecodeIssue => ({
  code: issueCode(kind),
  path,
  message,
});

const sortedStrings = <T extends string>(values: readonly T[]): T[] =>
  [...values].sort(compareUnicodeCodePoints);

const normalizeMatrix = (matrix: VerificationMatrix): VerificationMatrix => ({
  frameworkTargets: sortedStrings(matrix.frameworkTargets),
  surfaces: sortedStrings(matrix.surfaces),
  browserEngines: sortedStrings(matrix.browserEngines),
  viewports: [...matrix.viewports]
    .map(cloneJson)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id)),
  colorSchemes: sortedStrings(matrix.colorSchemes),
  motions: sortedStrings(matrix.motions),
  locales: sortedStrings(matrix.locales),
});

const normalizeRule = (
  rule: VerificationPolicyRule
): VerificationPolicyRule => ({
  ...cloneJson(rule),
  checkKinds: sortedStrings(rule.checkKinds),
  scenarioIds: sortedStrings(rule.scenarioIds),
  scenarioTags: sortedStrings(rule.scenarioTags),
  criticalities: sortedStrings(rule.criticalities),
  impactedDomains: sortedStrings(rule.impactedDomains),
  riskFlags: sortedStrings(rule.riskFlags),
});

const normalizeMatrixProfile = (
  profile: VerificationMatrixProfile
): VerificationMatrixProfile => ({
  ...cloneJson(profile),
  matrix: normalizeMatrix(profile.matrix),
});

const normalizeRetryPolicy = (
  policy: VerificationRetryPolicy
): VerificationRetryPolicy => ({
  ...cloneJson(policy),
  retryableOutcomes: sortedStrings(policy.retryableOutcomes),
});

export const normalizeVerificationPolicy = (
  policy: VerificationPolicy
): VerificationPolicy => ({
  ...cloneJson(policy),
  rules: [...policy.rules]
    .map(normalizeRule)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id)),
  matrixProfiles: [...policy.matrixProfiles]
    .map(normalizeMatrixProfile)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id)),
  retryPolicies: [...policy.retryPolicies]
    .map(normalizeRetryPolicy)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id)),
  exemptions: [...policy.exemptions]
    .map(cloneJson)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id)),
  evidenceRequirements: {
    ...cloneJson(policy.evidenceRequirements),
    acceptedTrust: sortedStrings(policy.evidenceRequirements.acceptedTrust),
    requiredArtifactKinds: sortedStrings(
      policy.evidenceRequirements.requiredArtifactKinds
    ),
  },
});

export const normalizeVerificationBaselineSet = (
  baselineSet: VerificationBaselineSet
): VerificationBaselineSet => ({
  ...cloneJson(baselineSet),
  entries: [...baselineSet.entries]
    .map(cloneJson)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id)),
});

const normalizeByKind = <K extends VerificationDocumentKind>(
  kind: K,
  value: VerificationDocumentByKind[K]
): VerificationDocumentByKind[K] =>
  (kind === 'verification-policy'
    ? normalizeVerificationPolicy(value as VerificationPolicy)
    : normalizeVerificationBaselineSet(
        value as VerificationBaselineSet
      )) as VerificationDocumentByKind[K];

const collectDuplicateIds = (
  values: readonly Readonly<{ id: string }>[],
  path: string,
  kind: VerificationDocumentKind
): VerificationDecodeIssue[] => {
  const seen = new Set<string>();
  const issues: VerificationDecodeIssue[] = [];
  values.forEach(({ id }, index) => {
    if (seen.has(id)) {
      issues.push(
        customIssue(kind, `${path}/${index}/id`, `Duplicate id: ${id}.`)
      );
    }
    seen.add(id);
  });
  return issues;
};

const policySelectorIdentity = (rule: VerificationPolicyRule): string =>
  canonicalJsonText({
    checkKinds: rule.checkKinds,
    scenarioIds: rule.scenarioIds,
    scenarioTags: rule.scenarioTags,
    criticalities: rule.criticalities,
    impactedDomains: rule.impactedDomains,
    riskFlags: rule.riskFlags,
  });

const collectPolicyIssues = (
  policy: VerificationPolicy
): VerificationDecodeIssue[] => {
  const kind = 'verification-policy' as const;
  const issues = [
    ...collectDuplicateIds(policy.rules, '/rules', kind),
    ...collectDuplicateIds(policy.matrixProfiles, '/matrixProfiles', kind),
    ...collectDuplicateIds(policy.retryPolicies, '/retryPolicies', kind),
    ...collectDuplicateIds(policy.exemptions, '/exemptions', kind),
  ];
  const ruleIds = new Set(policy.rules.map((rule) => rule.id));
  const matrixProfileIds = new Set(
    policy.matrixProfiles.map((profile) => profile.id)
  );
  const retryPolicyIds = new Set(
    policy.retryPolicies.map((retryPolicy) => retryPolicy.id)
  );
  const selectorRequirements = new Map<string, VerificationPolicyRule>();
  policy.rules.forEach((rule, index) => {
    if (!matrixProfileIds.has(rule.matrixProfileId)) {
      issues.push(
        customIssue(
          kind,
          `/rules/${index}/matrixProfileId`,
          `Rule references an unknown matrix profile: ${rule.matrixProfileId}.`
        )
      );
    }
    if (!retryPolicyIds.has(rule.retryPolicyId)) {
      issues.push(
        customIssue(
          kind,
          `/rules/${index}/retryPolicyId`,
          `Rule references an unknown retry policy: ${rule.retryPolicyId}.`
        )
      );
    }
    const selector = policySelectorIdentity(rule);
    const previous = selectorRequirements.get(selector);
    if (previous && previous.requirement !== rule.requirement) {
      issues.push(
        customIssue(
          kind,
          `/rules/${index}/requirement`,
          `Rules ${previous.id} and ${rule.id} have the same selector but conflicting requirements.`
        )
      );
    }
    selectorRequirements.set(selector, rule);
  });
  policy.matrixProfiles.forEach((profile, profileIndex) => {
    const viewportIds = new Set<string>();
    profile.matrix.viewports.forEach((viewport, viewportIndex) => {
      if (viewportIds.has(viewport.id)) {
        issues.push(
          customIssue(
            kind,
            `/matrixProfiles/${profileIndex}/matrix/viewports/${viewportIndex}/id`,
            `Duplicate viewport id in matrix profile: ${viewport.id}.`
          )
        );
      }
      viewportIds.add(viewport.id);
    });
  });
  policy.exemptions.forEach((exemption, index) => {
    if (!ruleIds.has(exemption.ruleId)) {
      issues.push(
        customIssue(
          kind,
          `/exemptions/${index}/ruleId`,
          `Exemption references an unknown policy rule: ${exemption.ruleId}.`
        )
      );
    }
    const created = Date.parse(exemption.createdAt);
    const expires = Date.parse(exemption.expiresAt);
    if (
      !Number.isFinite(created) ||
      !Number.isFinite(expires) ||
      created >= expires
    ) {
      issues.push(
        customIssue(
          kind,
          `/exemptions/${index}/expiresAt`,
          'Exemption expiry must be a valid instant after createdAt.'
        )
      );
    }
  });
  return issues;
};

const baselineCompatibilityIdentity = (
  entry: VerificationBaselineEntry
): string =>
  canonicalJsonText({
    scenarioId: entry.scenarioId,
    stepId: entry.stepId,
    targetId: entry.targetId,
    frameworkTarget: entry.frameworkTarget,
    surface: entry.surface,
    browserEngine: entry.browserEngine ?? null,
    viewport: entry.viewport,
    colorScheme: entry.colorScheme,
    motion: entry.motion,
    locale: entry.locale,
    devicePixelRatio: entry.devicePixelRatio,
    normalizerDigest: entry.normalizerDigest,
  });

const collectBaselineIssues = (
  baselineSet: VerificationBaselineSet
): VerificationDecodeIssue[] => {
  const kind = 'verification-baseline-set' as const;
  const issues = collectDuplicateIds(baselineSet.entries, '/entries', kind);
  const compatibilityKeys = new Map<string, string>();
  baselineSet.entries.forEach((entry, index) => {
    const key = baselineCompatibilityIdentity(entry);
    const previous = compatibilityKeys.get(key);
    if (previous) {
      issues.push(
        customIssue(
          kind,
          `/entries/${index}`,
          `Baseline compatibility identity duplicates entry ${previous}.`
        )
      );
    }
    compatibilityKeys.set(key, entry.id);
    if (!entry.asset.mediaType.startsWith('image/')) {
      issues.push(
        customIssue(
          kind,
          `/entries/${index}/asset/mediaType`,
          'Visual baseline assets must reference image media.'
        )
      );
    }
  });
  return issues;
};

const validateEncoded = <K extends VerificationDocumentKind>(
  kind: K,
  value: unknown
): VerificationDecodeResult<VerificationDocumentByKind[K]> => {
  const validator = validators[kind];
  if (!validator(value)) {
    return { ok: false, issues: schemaIssues(kind, validator.errors) };
  }
  const { wireVersion: _wireVersion, ...current } = cloneJson(
    value as Record<string, unknown>
  );
  const normalized = normalizeByKind(
    kind,
    current as VerificationDocumentByKind[K]
  );
  const semanticIssues =
    kind === 'verification-policy'
      ? collectPolicyIssues(normalized as VerificationPolicy)
      : collectBaselineIssues(normalized as VerificationBaselineSet);
  return semanticIssues.length
    ? { ok: false, issues: semanticIssues }
    : { ok: true, value: normalized };
};

/**
 * Applies the explicit wire migration dispatch. V0 has one immutable wire
 * version, so missing, non-numeric, and future versions all fail closed.
 */
export const migrateVerificationDocumentWire = <
  K extends VerificationDocumentKind,
>(
  kind: K,
  value: unknown
): VerificationDecodeResult<
  VerificationWireDocument<VerificationDocumentByKind[K]>
> => {
  if (!isPlainObject(value) || value.wireVersion !== 1) {
    return {
      ok: false,
      issues: [
        customIssue(
          kind,
          '/wireVersion',
          'Unsupported Verification wire version; expected wireVersion 1.'
        ),
      ],
    };
  }
  const decoded = validateEncoded(kind, value);
  return decoded.ok
    ? {
        ok: true,
        value: {
          ...cloneJson(decoded.value),
          wireVersion: 1,
        } as VerificationWireDocument<VerificationDocumentByKind[K]>,
      }
    : decoded;
};

export const decodeVerificationDocument = <K extends VerificationDocumentKind>(
  kind: K,
  value: unknown
): VerificationDecodeResult<VerificationDocumentByKind[K]> => {
  const migrated = migrateVerificationDocumentWire(kind, value);
  return migrated.ok ? validateEncoded(kind, migrated.value) : migrated;
};

export const validateVerificationDocument = <
  K extends VerificationDocumentKind,
>(
  kind: K,
  value: unknown
): VerificationDecodeResult<VerificationDocumentByKind[K]> => {
  if (
    !isPlainObject(value) ||
    Object.hasOwn(value, 'wireVersion') ||
    Object.hasOwn(value, 'version')
  ) {
    return {
      ok: false,
      issues: [
        customIssue(
          kind,
          '/',
          'Verification current models must not expose numeric wire version fields.'
        ),
      ],
    };
  }
  return validateEncoded(kind, { ...cloneJson(value), wireVersion: 1 });
};

export const encodeVerificationDocument = <K extends VerificationDocumentKind>(
  kind: K,
  value: VerificationDocumentByKind[K]
): VerificationWireDocument<VerificationDocumentByKind[K]> => {
  const validation = validateVerificationDocument(kind, value);
  if (!validation.ok) {
    throw new TypeError(
      validation.issues.map((issue) => issue.message).join('; ')
    );
  }
  return {
    ...cloneJson(validation.value),
    wireVersion: 1,
  } as VerificationWireDocument<VerificationDocumentByKind[K]>;
};

export const decodeVerificationPolicy = (
  value: unknown
): VerificationDecodeResult<VerificationPolicy> =>
  decodeVerificationDocument('verification-policy', value);

export const decodeVerificationBaselineSet = (
  value: unknown
): VerificationDecodeResult<VerificationBaselineSet> =>
  decodeVerificationDocument('verification-baseline-set', value);

export const encodeVerificationPolicy = (
  value: VerificationPolicy
): VerificationWireDocument<VerificationPolicy> =>
  encodeVerificationDocument('verification-policy', value);

export const encodeVerificationBaselineSet = (
  value: VerificationBaselineSet
): VerificationWireDocument<VerificationBaselineSet> =>
  encodeVerificationDocument('verification-baseline-set', value);

export const isVerificationPolicy = (
  value: unknown
): value is VerificationPolicy =>
  validateVerificationDocument('verification-policy', value).ok;

export const isVerificationBaselineSet = (
  value: unknown
): value is VerificationBaselineSet =>
  validateVerificationDocument('verification-baseline-set', value).ok;
