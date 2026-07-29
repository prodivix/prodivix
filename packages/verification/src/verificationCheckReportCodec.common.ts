import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  VerificationArtifactKind,
  VerificationCheckKind,
} from './verification.types';
import type {
  VerificationCheckReportIssue,
  VerificationFailureClass,
} from './verificationCheckReport.types';

export const VERIFICATION_CHECK_REPORT_FORMAT =
  'prodivix.verification-check-report-candidate' as const;
export const VERIFICATION_CHECK_REPORT_VERSION = 1 as const;
export const VERIFICATION_NORMALIZED_CHECK_REPORT_SCHEMA =
  'prodivix.verification-normalized-check-report.v1' as const;

export const VERIFICATION_CHECK_REPORT_LIMITS = Object.freeze({
  maximumEncodedBytes: 512 * 1024,
  maximumArtifacts: 128,
  maximumArtifactBytes: 512 * 1024 * 1024,
  maximumEntries: 4_096,
  maximumDiagnosticCodes: 256,
  maximumTextBytes: 1_024,
  maximumDepth: 24,
  maximumNodes: 32_768,
});

const hasControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

export const VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS = Object.freeze([
  'security.artifact-digest-drift',
  'security.cleanup-residual',
  'security.csp-policy',
  'security.output-artifact-uninspectable',
  'security.permissions-policy',
  'security.production-probe-leak',
  'security.sandbox-isolation',
  'security.secret-canary',
  'security.unexpected-network',
] as const);

export const VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS = Object.freeze(
  VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS.filter(
    (ruleId) =>
      ruleId !== 'security.artifact-digest-drift' &&
      ruleId !== 'security.cleanup-residual'
  )
);

export const VERIFICATION_CHECK_KINDS = Object.freeze([
  'diagnostics',
  'build',
  'unit',
  'integration',
  'e2e',
  'visual',
  'accessibility',
  'performance',
  'security',
] as const satisfies readonly VerificationCheckKind[]);

export const VERIFICATION_REPORT_ARTIFACT_KINDS = Object.freeze([
  'screenshot',
  'visual-diff',
  'accessibility-report',
  'trace',
  'network-summary',
  'console-summary',
  'coverage-summary',
  'performance-profile',
  'security-report',
  'build-log',
  'replay-record',
] as const satisfies readonly VerificationArtifactKind[]);

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

export type VerificationReportDecodeState = {
  issues: VerificationCheckReportIssue[];
  nodes: number;
};

export const addVerificationReportIssue = (
  state: VerificationReportDecodeState,
  path: string,
  message: string,
  failureClass: VerificationFailureClass = 'malformed-unsafe-candidate',
  code: VerificationCheckReportIssue['code'] = 'VER-4002'
): void => {
  state.issues.push(Object.freeze({ code, path, message, failureClass }));
};

export const inspectVerificationReportShape = (
  value: unknown,
  path: string,
  depth: number,
  state: VerificationReportDecodeState
): boolean => {
  state.nodes += 1;
  if (
    depth > VERIFICATION_CHECK_REPORT_LIMITS.maximumDepth ||
    state.nodes > VERIFICATION_CHECK_REPORT_LIMITS.maximumNodes
  ) {
    addVerificationReportIssue(
      state,
      path,
      'Check report candidate exceeds its shape budget.'
    );
    return false;
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return true;
  }
  if (typeof value === 'number') {
    if (
      !Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value)) ||
      Object.is(value, -0)
    ) {
      addVerificationReportIssue(
        state,
        path,
        'Check report candidate contains a non-canonical number.'
      );
      return false;
    }
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((entry, index) =>
      inspectVerificationReportShape(
        entry,
        `${path}/${index}`,
        depth + 1,
        state
      )
    );
  }
  if (!isPlainObject(value)) {
    addVerificationReportIssue(
      state,
      path,
      'Check report candidate contains a tool-private or non-plain value.'
    );
    return false;
  }
  let valid = true;
  for (const key of Object.keys(value)) {
    if (
      isUnsafeObjectKey(key) ||
      key !== key.normalize('NFC') ||
      utf8ToBytes(key).byteLength >
        VERIFICATION_CHECK_REPORT_LIMITS.maximumTextBytes
    ) {
      addVerificationReportIssue(
        state,
        `${path}/${key}`,
        'Check report candidate contains an unsafe object key.'
      );
      valid = false;
      continue;
    }
    valid =
      inspectVerificationReportShape(
        value[key],
        `${path}/${key}`,
        depth + 1,
        state
      ) && valid;
  }
  return valid;
};

export const encodedVerificationReportBytes = (
  value: unknown,
  state: VerificationReportDecodeState
): number | undefined => {
  try {
    return utf8ToBytes(canonicalJsonText(value)).byteLength;
  } catch {
    addVerificationReportIssue(
      state,
      '',
      'Check report candidate is not canonical JSON.'
    );
    return undefined;
  }
};

export const verificationReportRecord = (
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  path: string,
  state: VerificationReportDecodeState
): Record<string, unknown> | undefined => {
  if (!isPlainObject(value)) {
    addVerificationReportIssue(state, path, 'Expected a plain object.');
    return undefined;
  }
  const keys = Object.keys(value);
  if (
    requiredKeys.some((key) => !keys.includes(key)) ||
    keys.some(
      (key) =>
        isUnsafeObjectKey(key) ||
        (!requiredKeys.includes(key) && !optionalKeys.includes(key))
    )
  ) {
    addVerificationReportIssue(
      state,
      path,
      'Object has unknown, missing, or unsafe fields.'
    );
    return undefined;
  }
  return value;
};

export const verificationReportText = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState,
  maximumBytes: number = VERIFICATION_CHECK_REPORT_LIMITS.maximumTextBytes
): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    hasControlCharacter(value) ||
    utf8ToBytes(value).byteLength > maximumBytes
  ) {
    addVerificationReportIssue(state, path, 'Expected bounded canonical text.');
    return undefined;
  }
  return value;
};

export const verificationReportToken = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): string | undefined => {
  const normalized = verificationReportText(value, path, state, 256);
  if (normalized !== undefined && !TOKEN_PATTERN.test(normalized)) {
    addVerificationReportIssue(
      state,
      path,
      'Expected a canonical identifier without a path or URL.'
    );
    return undefined;
  }
  return normalized;
};

export const verificationReportDigest = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): string | undefined => {
  const normalized = verificationReportText(value, path, state, 71);
  if (normalized !== undefined && !DIGEST_PATTERN.test(normalized)) {
    addVerificationReportIssue(state, path, 'Expected a SHA-256 digest.');
    return undefined;
  }
  return normalized;
};

export const verificationReportOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  state: VerificationReportDecodeState
): T | undefined => {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    addVerificationReportIssue(
      state,
      path,
      `Expected one of: ${allowed.join(', ')}.`
    );
    return undefined;
  }
  return value as T;
};

export const verificationReportInteger = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState,
  maximum: number = Number.MAX_SAFE_INTEGER,
  minimum = 0
): number | undefined => {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    addVerificationReportIssue(state, path, 'Expected a bounded safe integer.');
    return undefined;
  }
  return value as number;
};

export const verificationReportNumber = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState,
  minimum = 0
): number | undefined => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Object.is(value, -0) ||
    value < minimum
  ) {
    addVerificationReportIssue(
      state,
      path,
      'Expected a bounded finite number.'
    );
    return undefined;
  }
  return value;
};

export const verificationReportBoolean = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): boolean | undefined => {
  if (typeof value !== 'boolean') {
    addVerificationReportIssue(state, path, 'Expected a boolean.');
    return undefined;
  }
  return value;
};

export const verificationReportTokenArray = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState,
  maximum: number = VERIFICATION_CHECK_REPORT_LIMITS.maximumDiagnosticCodes
): readonly string[] | undefined => {
  if (!Array.isArray(value) || value.length > maximum) {
    addVerificationReportIssue(
      state,
      path,
      'Expected a bounded identifier array.'
    );
    return undefined;
  }
  const normalized = value
    .map((entry, index) =>
      verificationReportToken(entry, `${path}/${index}`, state)
    )
    .filter((entry): entry is string => entry !== undefined);
  if (
    normalized.length !== value.length ||
    new Set(normalized).size !== normalized.length
  ) {
    addVerificationReportIssue(
      state,
      path,
      'Identifier arrays must be unique and valid.'
    );
    return undefined;
  }
  return Object.freeze([...normalized].sort(compareUnicodeCodePoints));
};

export const readVerificationReportArray = <T>(
  value: unknown,
  path: string,
  state: VerificationReportDecodeState,
  reader: (
    entry: unknown,
    entryPath: string,
    state: VerificationReportDecodeState
  ) => T | undefined,
  minimum = 0
): readonly T[] | undefined => {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > VERIFICATION_CHECK_REPORT_LIMITS.maximumEntries
  ) {
    addVerificationReportIssue(state, path, 'Expected a bounded array.');
    return undefined;
  }
  const normalized = value
    .map((entry, index) => reader(entry, `${path}/${index}`, state))
    .filter((entry): entry is T => entry !== undefined);
  return normalized.length === value.length
    ? Object.freeze(normalized)
    : undefined;
};

export const sortUniqueVerificationReportValues = <T>(
  values: readonly T[],
  identity: (value: T) => string,
  path: string,
  state: VerificationReportDecodeState
): readonly T[] | undefined => {
  const normalized = [...values].sort((left, right) =>
    compareUnicodeCodePoints(identity(left), identity(right))
  );
  const identities = normalized.map(identity);
  if (new Set(identities).size !== identities.length) {
    addVerificationReportIssue(state, path, 'Array identities must be unique.');
    return undefined;
  }
  return Object.freeze(normalized);
};
