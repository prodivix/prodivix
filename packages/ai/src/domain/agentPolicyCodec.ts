import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  AgentCapabilityRule,
  AgentPolicy,
  AgentPrivacyPolicy,
  AgentTargetRef,
} from './agent.types';
import {
  agentPolicyWireSchema,
  agentPolicyWireSchemaV0,
} from '../wire/agentPolicyWire';

export type AgentPolicyWire = AgentPolicy & Readonly<{ wireVersion: 1 }>;
export type AgentPolicyWireV0 = Omit<AgentPolicy, 'privacy'> &
  Readonly<{ wireVersion: 0 }>;

export type AgentPolicyDecodeIssue = Readonly<{
  code: 'AI-9001';
  path: string;
  message: string;
}>;

export type AgentPolicyDecodeResult<T = AgentPolicy> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly AgentPolicyDecodeIssue[] }>;

const MAXIMUM_POLICY_BYTES = 1_048_576;
const MAXIMUM_POLICY_DEPTH = 32;
const MAXIMUM_POLICY_NODES = 50_000;

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
});

const validateWire = ajv.compile(agentPolicyWireSchema);
const validateWireV0 = ajv.compile(agentPolicyWireSchemaV0);

const issue = (path: string, message: string): AgentPolicyDecodeIssue => ({
  code: 'AI-9001',
  path,
  message,
});

const issuePath = (error: ErrorObject): string =>
  error.instancePath ||
  (error.params && 'missingProperty' in error.params
    ? `/${String(error.params.missingProperty)}`
    : '/');

const schemaIssues = (
  errors: ErrorObject[] | null | undefined
): AgentPolicyDecodeIssue[] =>
  (errors ?? []).map((error) =>
    issue(
      issuePath(error),
      error.message
        ? `AgentPolicy ${error.message}.`
        : 'AgentPolicy does not match its wire schema.'
    )
  );

const inspectUntrustedPolicyValue = (
  value: unknown
): AgentPolicyDecodeIssue[] => {
  const issues: AgentPolicyDecodeIssue[] = [];
  const ancestors = new Set<object>();
  let nodes = 0;

  const visit = (candidate: unknown, path: string, depth: number): void => {
    nodes += 1;
    if (nodes > MAXIMUM_POLICY_NODES) {
      if (!issues.some((entry) => entry.path === '/')) {
        issues.push(issue('/', 'AgentPolicy exceeds its maximum node count.'));
      }
      return;
    }
    if (depth > MAXIMUM_POLICY_DEPTH) {
      issues.push(
        issue(path, 'AgentPolicy exceeds its maximum nesting depth.')
      );
      return;
    }
    if (
      candidate === null ||
      typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) {
      return;
    }
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) {
        issues.push(issue(path, 'AgentPolicy numbers must be finite.'));
      }
      return;
    }
    if (typeof candidate !== 'object') {
      issues.push(issue(path, 'AgentPolicy must contain JSON data only.'));
      return;
    }
    if (ancestors.has(candidate)) {
      issues.push(issue(path, 'AgentPolicy must not contain cycles.'));
      return;
    }
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        const descriptors = Object.getOwnPropertyDescriptors(candidate);
        const keys = Object.getOwnPropertyNames(candidate).filter(
          (key) => key !== 'length'
        );
        if (
          Object.getOwnPropertySymbols(candidate).length !== 0 ||
          keys.length !== candidate.length ||
          keys.some((key, index) => key !== String(index))
        ) {
          issues.push(
            issue(path, 'AgentPolicy arrays must contain indexed values only.')
          );
          return;
        }
        candidate.forEach((_entry, index) => {
          const descriptor = descriptors[String(index)];
          if (
            !descriptor ||
            !descriptor.enumerable ||
            !('value' in descriptor)
          ) {
            issues.push(
              issue(`${path}/${index}`, 'AgentPolicy accessors are forbidden.')
            );
            return;
          }
          visit(descriptor.value, `${path}/${index}`, depth + 1);
        });
        return;
      }
      if (!isPlainObject(candidate)) {
        issues.push(issue(path, 'AgentPolicy values must be plain objects.'));
        return;
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      if (Object.getOwnPropertySymbols(candidate).length !== 0) {
        issues.push(
          issue(path, 'AgentPolicy objects must contain string keys only.')
        );
      }
      for (const key of Object.getOwnPropertyNames(candidate)) {
        const childPath = `${path === '/' ? '' : path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
        if (isUnsafeObjectKey(key)) {
          issues.push(issue(childPath, 'Unsafe AgentPolicy object key.'));
          continue;
        }
        const descriptor = descriptors[key];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          issues.push(issue(childPath, 'AgentPolicy accessors are forbidden.'));
          continue;
        }
        visit(descriptor.value, childPath, depth + 1);
      }
    } finally {
      ancestors.delete(candidate);
    }
  };

  try {
    visit(value, '/', 0);
    if (
      issues.length === 0 &&
      utf8ToBytes(canonicalJsonText(value)).byteLength > MAXIMUM_POLICY_BYTES
    ) {
      issues.push(
        issue(
          '/',
          `AgentPolicy exceeds the ${MAXIMUM_POLICY_BYTES} byte limit.`
        )
      );
    }
  } catch {
    issues.push(issue('/', 'AgentPolicy cannot be safely inspected.'));
  }
  return issues;
};

const cloneJson = <T>(value: T): T => JSON.parse(canonicalJsonText(value)) as T;

const compareTargetRef = (
  left: AgentTargetRef,
  right: AgentTargetRef
): number =>
  compareUnicodeCodePoints(left.kind, right.kind) ||
  compareUnicodeCodePoints(left.id, right.id);

const targetIdentity = (target: AgentTargetRef): string =>
  `${target.kind}\u0000${target.id}`;

const collectCanonicalStringArrayIssue = (
  values: readonly string[],
  path: string,
  issues: AgentPolicyDecodeIssue[]
): void => {
  const sorted = [...values].sort(compareUnicodeCodePoints);
  if (
    new Set(values).size !== values.length ||
    values.some((value, index) => value !== sorted[index])
  ) {
    issues.push(
      issue(
        path,
        'AgentPolicy set-like arrays must be unique and use Unicode code-point order.'
      )
    );
  }
};

const collectCanonicalRuleArrayIssues = <TRule extends { id: string }>(
  values: readonly TRule[],
  path: string,
  issues: AgentPolicyDecodeIssue[],
  globalRuleIds: Set<string>
): void => {
  const sorted = [...values].sort((left, right) =>
    compareUnicodeCodePoints(left.id, right.id)
  );
  values.forEach((value, index) => {
    if (value.id !== sorted[index]?.id) {
      issues.push(
        issue(path, 'AgentPolicy rules must use Unicode code-point id order.')
      );
    }
    if (globalRuleIds.has(value.id)) {
      issues.push(
        issue(
          `${path}/${index}/id`,
          `Duplicate AgentPolicy rule id: ${value.id}.`
        )
      );
    }
    globalRuleIds.add(value.id);
  });
};

const collectCanonicalTargetScopeIssues = (
  rule: AgentCapabilityRule,
  path: string,
  issues: AgentPolicyDecodeIssue[]
): void => {
  const targets = rule.targetScope.targets;
  const sorted = [...targets].sort(compareTargetRef);
  const identities = targets.map(targetIdentity);
  if (
    new Set(identities).size !== identities.length ||
    targets.some(
      (target, index) =>
        targetIdentity(target) !== targetIdentity(sorted[index]!)
    )
  ) {
    issues.push(
      issue(
        `${path}/targetScope/targets`,
        'Agent target scope must contain unique targets in canonical kind/id order.'
      )
    );
  }
};

const collectSemanticIssues = (
  policy: Omit<AgentPolicy, 'privacy'> &
    Readonly<{ privacy?: AgentPrivacyPolicy }>
): AgentPolicyDecodeIssue[] => {
  const issues: AgentPolicyDecodeIssue[] = [];
  const globalRuleIds = new Set<string>();
  collectCanonicalRuleArrayIssues(
    policy.providerRules,
    '/providerRules',
    issues,
    globalRuleIds
  );
  collectCanonicalRuleArrayIssues(
    policy.modelRules,
    '/modelRules',
    issues,
    globalRuleIds
  );
  collectCanonicalRuleArrayIssues(
    policy.capabilityRules,
    '/capabilityRules',
    issues,
    globalRuleIds
  );
  collectCanonicalRuleArrayIssues(
    policy.approvalRules,
    '/approvalRules',
    issues,
    globalRuleIds
  );
  collectCanonicalRuleArrayIssues(
    policy.networkRules,
    '/networkRules',
    issues,
    globalRuleIds
  );
  collectCanonicalRuleArrayIssues(
    policy.secretRules,
    '/secretRules',
    issues,
    globalRuleIds
  );

  policy.providerRules.forEach((rule, index) => {
    const root = `/providerRules/${index}`;
    collectCanonicalStringArrayIssue(
      rule.providerConfigurationIds,
      `${root}/providerConfigurationIds`,
      issues
    );
    collectCanonicalStringArrayIssue(
      rule.protocolFamilies,
      `${root}/protocolFamilies`,
      issues
    );
    collectCanonicalStringArrayIssue(
      rule.endpointClasses,
      `${root}/endpointClasses`,
      issues
    );
    collectCanonicalStringArrayIssue(rule.regions, `${root}/regions`, issues);
  });
  policy.modelRules.forEach((rule, index) => {
    const root = `/modelRules/${index}`;
    collectCanonicalStringArrayIssue(rule.modelIds, `${root}/modelIds`, issues);
    collectCanonicalStringArrayIssue(
      rule.modelFamilyIds,
      `${root}/modelFamilyIds`,
      issues
    );
    collectCanonicalStringArrayIssue(
      rule.capabilityProfileIds,
      `${root}/capabilityProfileIds`,
      issues
    );
  });
  collectCanonicalStringArrayIssue(
    policy.contextRules.allowedAuthorities,
    '/contextRules/allowedAuthorities',
    issues
  );
  collectCanonicalStringArrayIssue(
    policy.contextRules.allowedItemKinds,
    '/contextRules/allowedItemKinds',
    issues
  );
  policy.capabilityRules.forEach((rule, index) => {
    const root = `/capabilityRules/${index}`;
    collectCanonicalStringArrayIssue(
      rule.capabilities,
      `${root}/capabilities`,
      issues
    );
    collectCanonicalStringArrayIssue(rule.toolIds, `${root}/toolIds`, issues);
    collectCanonicalStringArrayIssue(
      rule.runtimeZones,
      `${root}/runtimeZones`,
      issues
    );
    collectCanonicalTargetScopeIssues(rule, root, issues);
  });
  policy.approvalRules.forEach((rule, index) => {
    const root = `/approvalRules/${index}`;
    collectCanonicalStringArrayIssue(
      rule.riskLevels,
      `${root}/riskLevels`,
      issues
    );
    collectCanonicalStringArrayIssue(
      rule.capabilities,
      `${root}/capabilities`,
      issues
    );
  });
  policy.networkRules.forEach((rule, index) => {
    collectCanonicalStringArrayIssue(
      rule.hosts,
      `/networkRules/${index}/hosts`,
      issues
    );
    collectCanonicalStringArrayIssue(
      rule.methods,
      `/networkRules/${index}/methods`,
      issues
    );
  });
  policy.secretRules.forEach((rule, index) => {
    const root = `/secretRules/${index}`;
    collectCanonicalStringArrayIssue(
      rule.referenceKinds,
      `${root}/referenceKinds`,
      issues
    );
    collectCanonicalStringArrayIssue(rule.purposes, `${root}/purposes`, issues);
    collectCanonicalStringArrayIssue(
      rule.runtimeZones,
      `${root}/runtimeZones`,
      issues
    );
  });
  collectCanonicalStringArrayIssue(
    policy.verificationRules.requiredModes,
    '/verificationRules/requiredModes',
    issues
  );
  collectCanonicalStringArrayIssue(
    policy.verificationRules.requiredCheckKinds,
    '/verificationRules/requiredCheckKinds',
    issues
  );
  if (policy.privacy) {
    collectCanonicalStringArrayIssue(
      policy.privacy.allowedRegions,
      '/privacy/allowedRegions',
      issues
    );
  }

  const usageUnits = policy.budgetCeiling.usageLimits.map(({ unit }) => unit);
  collectCanonicalStringArrayIssue(
    usageUnits,
    '/budgetCeiling/usageLimits',
    issues
  );
  const currencies = policy.budgetCeiling.costLimits.map(
    ({ currency }) => currency
  );
  collectCanonicalStringArrayIssue(
    currencies,
    '/budgetCeiling/costLimits',
    issues
  );
  return issues;
};

const validateEncoded = <T extends AgentPolicyWire | AgentPolicyWireV0>(
  value: unknown,
  validator: ValidateFunction
): AgentPolicyDecodeResult<T> => {
  const inspectionIssues = inspectUntrustedPolicyValue(value);
  if (inspectionIssues.length) return { ok: false, issues: inspectionIssues };
  if (!validator(value)) {
    return { ok: false, issues: schemaIssues(validator.errors) };
  }
  const cloned = cloneJson(value as T);
  const { wireVersion: _wireVersion, ...current } = cloned;
  const semanticIssues = collectSemanticIssues(
    current as unknown as Omit<AgentPolicy, 'privacy'> &
      Readonly<{ privacy?: AgentPrivacyPolicy }>
  );
  return semanticIssues.length
    ? { ok: false, issues: semanticIssues }
    : { ok: true, value: cloned };
};

const MIGRATED_PRIVACY_DEFAULT: AgentPrivacyPolicy = Object.freeze({
  maximumSensitivity: 'public',
  allowedRegions: Object.freeze([]),
  providerTraining: 'deny',
  providerTelemetry: 'deny',
  rawArtifactCapture: 'deny',
});

/** Explicitly migrates the sole admitted legacy wire shape to wire v1. */
export const migrateAgentPolicyWire = (
  value: unknown
): AgentPolicyDecodeResult<AgentPolicyWire> => {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [issue('/', 'AgentPolicy wire value must be a plain object.')],
    };
  }
  const inspectionIssues = inspectUntrustedPolicyValue(value);
  if (inspectionIssues.length > 0) {
    return { ok: false, issues: inspectionIssues };
  }
  const safeValue = cloneJson(value);
  if (safeValue.wireVersion === 1) {
    return validateEncoded<AgentPolicyWire>(safeValue, validateWire);
  }
  if (safeValue.wireVersion !== 0) {
    return {
      ok: false,
      issues: [
        issue(
          '/wireVersion',
          'Unsupported AgentPolicy wire version; expected wireVersion 0 or 1.'
        ),
      ],
    };
  }
  const legacy = validateEncoded<AgentPolicyWireV0>(safeValue, validateWireV0);
  if (!legacy.ok) return legacy;
  const { wireVersion: _legacyVersion, ...current } = legacy.value;
  return validateEncoded<AgentPolicyWire>(
    {
      ...current,
      privacy: MIGRATED_PRIVACY_DEFAULT,
      wireVersion: 1,
    },
    validateWire
  );
};

export const decodeAgentPolicy = (
  value: unknown
): AgentPolicyDecodeResult<AgentPolicy> => {
  const migrated = migrateAgentPolicyWire(value);
  if (!migrated.ok) return migrated;
  const { wireVersion: _wireVersion, ...current } = migrated.value;
  return { ok: true, value: Object.freeze(current) as AgentPolicy };
};

export const validateAgentPolicy = (
  value: unknown
): AgentPolicyDecodeResult<AgentPolicy> => {
  if (
    !isPlainObject(value) ||
    Object.hasOwn(value, 'wireVersion') ||
    Object.hasOwn(value, 'version')
  ) {
    return {
      ok: false,
      issues: [
        issue(
          '/',
          'AgentPolicy current models must not expose numeric wire version fields.'
        ),
      ],
    };
  }
  const inspectionIssues = inspectUntrustedPolicyValue(value);
  if (inspectionIssues.length > 0) {
    return { ok: false, issues: inspectionIssues };
  }
  const safeValue = cloneJson(value);
  const encoded = validateEncoded<AgentPolicyWire>(
    { ...safeValue, wireVersion: 1 },
    validateWire
  );
  if (!encoded.ok) return encoded;
  const { wireVersion: _wireVersion, ...current } = encoded.value;
  return { ok: true, value: Object.freeze(current) as AgentPolicy };
};

export const encodeAgentPolicy = (value: AgentPolicy): AgentPolicyWire => {
  const validation = validateAgentPolicy(value);
  if (!validation.ok) {
    throw new TypeError(
      validation.issues.map((entry) => entry.message).join('; ')
    );
  }
  return Object.freeze({
    ...cloneJson(validation.value),
    wireVersion: 1,
  }) as AgentPolicyWire;
};

export const isAgentPolicy = (value: unknown): value is AgentPolicy =>
  validateAgentPolicy(value).ok;

/** Returns the cross-runtime digest of the canonical current policy model. */
export const digestAgentPolicy = (value: AgentPolicy): string => {
  const validation = validateAgentPolicy(value);
  if (!validation.ok) {
    throw new TypeError(
      validation.issues.map((entry) => entry.message).join('; ')
    );
  }
  return `sha256-${bytesToHex(
    sha256(utf8ToBytes(canonicalJsonText(validation.value)))
  )}`;
};

export const serializeAgentPolicy = (value: AgentPolicy): string =>
  canonicalJsonText(encodeAgentPolicy(value));
