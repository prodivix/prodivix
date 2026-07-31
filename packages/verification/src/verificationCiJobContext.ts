import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  cloneCanonicalVerificationEvidenceWire,
  type VerificationEvidenceWireDecodeResult,
} from './verificationEvidenceWireCodec.shared';
import {
  digestVerificationValue,
  parseVerificationInstant,
} from './verificationCanonical';
import {
  normalizeVerificationCiIdentity,
  type VerificationCiIdentity,
} from './verificationCiIdentity';

export const VERIFICATION_CI_JOB_CONTEXT_FORMAT =
  'prodivix.verification-ci-job-context' as const;
export const VERIFICATION_CI_JOB_CONTEXT_WIRE_VERSION = 1 as const;

export type VerificationCiJobEvent =
  'push' | 'workflow_dispatch' | 'pull_request' | 'pull_request_target';

export type VerificationCiJobContext = Readonly<{
  format: typeof VERIFICATION_CI_JOB_CONTEXT_FORMAT;
  provider: 'github-actions';
  identity: VerificationCiIdentity;
  event: VerificationCiJobEvent;
  sourceRepository: string;
  runId: string;
  runAttempt: number;
  jobId: string;
  workflowRef: string;
  oidc: Readonly<{
    issuer: string;
    audience: string;
    subject: string;
    workflowRef: string;
    claimsDigest: string;
    proofDigest: string;
    verifiedAt: string;
  }>;
  contextDigest: string;
}>;

export type VerificationCiJobContextWire = VerificationCiJobContext &
  Readonly<{ wireVersion: typeof VERIFICATION_CI_JOB_CONTEXT_WIRE_VERSION }>;

export type VerificationCiPromotionAdmission =
  | Readonly<{
      status: 'allowed';
      contextDigest: string;
    }>
  | Readonly<{
      status: 'forbidden';
      reason:
        | 'untrusted-event'
        | 'fork'
        | 'source-identity-mismatch'
        | 'oidc-identity-mismatch';
      reasonCode: 'VER-5003';
    }>;

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const EXPECTED_KEYS = Object.freeze([
  'wireVersion',
  'format',
  'provider',
  'identity',
  'event',
  'sourceRepository',
  'runId',
  'runAttempt',
  'jobId',
  'workflowRef',
  'oidc',
  'contextDigest',
] as const);
const EXPECTED_OIDC_KEYS = Object.freeze([
  'issuer',
  'audience',
  'subject',
  'workflowRef',
  'claimsDigest',
  'proofDigest',
  'verifiedAt',
] as const);

const exactKeys = (
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean => {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
};

const text = (value: unknown, maximum = 1_024): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.trim() ||
    value !== value.normalize('NFC')
  ) {
    return undefined;
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint < 32 || codePoint === 127) return undefined;
  }
  return value;
};

const invalid = (
  path: string,
  message: string
): VerificationEvidenceWireDecodeResult<never> =>
  Object.freeze({
    ok: false,
    issues: Object.freeze([
      Object.freeze({
        code: 'VER-5001' as const,
        path,
        message,
      }),
    ]),
  });

const normalizeCurrent = (
  value: Readonly<Record<string, unknown>>
): VerificationCiJobContext | undefined => {
  const identity = normalizeVerificationCiIdentity(value.identity);
  const oidc =
    value.oidc !== null &&
    typeof value.oidc === 'object' &&
    !Array.isArray(value.oidc)
      ? (value.oidc as Readonly<Record<string, unknown>>)
      : undefined;
  if (
    value.format !== VERIFICATION_CI_JOB_CONTEXT_FORMAT ||
    value.provider !== 'github-actions' ||
    !identity ||
    !oidc ||
    !exactKeys(oidc, EXPECTED_OIDC_KEYS) ||
    !(
      [
        'push',
        'workflow_dispatch',
        'pull_request',
        'pull_request_target',
      ] as const
    ).includes(value.event as VerificationCiJobEvent) ||
    !text(value.sourceRepository, 512) ||
    !text(value.runId, 256) ||
    !IDENTIFIER_PATTERN.test(value.runId as string) ||
    !Number.isSafeInteger(value.runAttempt) ||
    (value.runAttempt as number) < 1 ||
    !text(value.jobId, 256) ||
    !IDENTIFIER_PATTERN.test(value.jobId as string) ||
    !text(value.workflowRef, 1_024) ||
    !text(oidc.issuer, 512) ||
    !text(oidc.audience, 512) ||
    !text(oidc.subject, 1_024) ||
    !text(oidc.workflowRef, 1_024) ||
    !DIGEST_PATTERN.test(oidc.claimsDigest as string) ||
    !DIGEST_PATTERN.test(oidc.proofDigest as string) ||
    parseVerificationInstant(oidc.verifiedAt as string) === undefined ||
    !DIGEST_PATTERN.test(value.contextDigest as string)
  ) {
    return undefined;
  }
  return Object.freeze({
    format: VERIFICATION_CI_JOB_CONTEXT_FORMAT,
    provider: 'github-actions',
    identity,
    event: value.event as VerificationCiJobEvent,
    sourceRepository: value.sourceRepository as string,
    runId: value.runId as string,
    runAttempt: value.runAttempt as number,
    jobId: value.jobId as string,
    workflowRef: value.workflowRef as string,
    oidc: Object.freeze({
      issuer: oidc.issuer as string,
      audience: oidc.audience as string,
      subject: oidc.subject as string,
      workflowRef: oidc.workflowRef as string,
      claimsDigest: oidc.claimsDigest as string,
      proofDigest: oidc.proofDigest as string,
      verifiedAt: oidc.verifiedAt as string,
    }),
    contextDigest: value.contextDigest as string,
  });
};

export const decodeVerificationCiJobContext = (
  value: unknown
): VerificationEvidenceWireDecodeResult<VerificationCiJobContext> => {
  const cloned = cloneCanonicalVerificationEvidenceWire(value);
  if (!cloned.ok) return cloned;
  if (
    !exactKeys(cloned.value, EXPECTED_KEYS) ||
    cloned.value.wireVersion !== VERIFICATION_CI_JOB_CONTEXT_WIRE_VERSION
  ) {
    return invalid('/', 'CI job context is not strict versioned JSON.');
  }
  const { wireVersion: _wireVersion, ...currentValue } = cloned.value;
  const current = normalizeCurrent(currentValue);
  if (!current) {
    return invalid('/', 'CI job context fields are invalid.');
  }
  const { contextDigest, ...withoutDigest } = current;
  if (digestVerificationValue(withoutDigest) !== contextDigest) {
    return invalid('/contextDigest', 'CI job context digest does not match.');
  }
  return Object.freeze({ ok: true, value: current });
};

export const createVerificationCiJobContext = (
  input: Omit<VerificationCiJobContext, 'format' | 'provider' | 'contextDigest'>
): VerificationCiJobContext => {
  const withoutDigest = Object.freeze({
    format: VERIFICATION_CI_JOB_CONTEXT_FORMAT,
    provider: 'github-actions' as const,
    identity: input.identity,
    event: input.event,
    sourceRepository: input.sourceRepository,
    runId: input.runId,
    runAttempt: input.runAttempt,
    jobId: input.jobId,
    workflowRef: input.workflowRef,
    oidc: input.oidc,
  });
  const candidate = Object.freeze({
    ...withoutDigest,
    contextDigest: digestVerificationValue(withoutDigest),
  });
  const decoded = decodeVerificationCiJobContext({
    ...candidate,
    wireVersion: VERIFICATION_CI_JOB_CONTEXT_WIRE_VERSION,
  });
  if (!decoded.ok) {
    throw new TypeError(
      decoded.issues.map(({ message }) => message).join('; ')
    );
  }
  return decoded.value;
};

export const encodeVerificationCiJobContext = (
  context: VerificationCiJobContext
): VerificationCiJobContextWire => {
  const decoded = decodeVerificationCiJobContext({
    ...context,
    wireVersion: VERIFICATION_CI_JOB_CONTEXT_WIRE_VERSION,
  });
  if (!decoded.ok || !sameCanonicalJson(decoded.value, context)) {
    throw new TypeError('CI job context is invalid or non-canonical.');
  }
  return Object.freeze({
    ...decoded.value,
    wireVersion: VERIFICATION_CI_JOB_CONTEXT_WIRE_VERSION,
  });
};

const repositoryPath = (repository: string): string => {
  const separator = repository.indexOf(':');
  return separator >= 0 ? repository.slice(separator + 1) : repository;
};

const GITHUB_DATABASE_ID_PATTERN = /^[1-9][0-9]*$/u;

const matchesGithubOidcSubject = (
  subject: string,
  repository: string,
  ref: string
): boolean => {
  if (subject === `repo:${repository}:ref:${ref}`) return true;
  const [owner, name, ...extraSegments] = repository.split('/');
  if (!owner || !name || extraSegments.length > 0) return false;
  const prefix = `repo:${owner}@`;
  const repositoryDelimiter = `/${name}@`;
  const suffix = `:ref:${ref}`;
  if (!subject.startsWith(prefix) || !subject.endsWith(suffix)) return false;
  const identity = subject.slice(prefix.length, -suffix.length);
  const delimiterIndex = identity.indexOf(repositoryDelimiter);
  if (
    delimiterIndex < 1 ||
    identity.indexOf(
      repositoryDelimiter,
      delimiterIndex + repositoryDelimiter.length
    ) >= 0
  ) {
    return false;
  }
  const ownerId = identity.slice(0, delimiterIndex);
  const repositoryId = identity.slice(
    delimiterIndex + repositoryDelimiter.length
  );
  return (
    GITHUB_DATABASE_ID_PATTERN.test(ownerId) &&
    GITHUB_DATABASE_ID_PATTERN.test(repositoryId)
  );
};

export const assessVerificationCiPromotion = (
  context: VerificationCiJobContext,
  expectedAudience = 'prodivix-verification'
): VerificationCiPromotionAdmission => {
  if (
    context.event === 'pull_request' ||
    context.event === 'pull_request_target'
  ) {
    return Object.freeze({
      status: 'forbidden',
      reason: 'untrusted-event',
      reasonCode: 'VER-5003',
    });
  }
  if (context.sourceRepository !== context.identity.repository) {
    return Object.freeze({
      status: 'forbidden',
      reason: 'fork',
      reasonCode: 'VER-5003',
    });
  }
  const path = repositoryPath(context.identity.repository);
  if (!context.workflowRef.startsWith(`${path}/.github/workflows/`)) {
    return Object.freeze({
      status: 'forbidden',
      reason: 'source-identity-mismatch',
      reasonCode: 'VER-5003',
    });
  }
  if (
    context.oidc.issuer !== 'https://token.actions.githubusercontent.com' ||
    context.oidc.audience !== expectedAudience ||
    !matchesGithubOidcSubject(
      context.oidc.subject,
      path,
      context.identity.ref
    ) ||
    context.oidc.workflowRef !== context.workflowRef
  ) {
    return Object.freeze({
      status: 'forbidden',
      reason: 'oidc-identity-mismatch',
      reasonCode: 'VER-5003',
    });
  }
  return Object.freeze({
    status: 'allowed',
    contextDigest: context.contextDigest,
  });
};
