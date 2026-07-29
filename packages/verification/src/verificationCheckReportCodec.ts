import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  VerificationAdapterIdentity,
  VerificationAdapterToolIdentity,
  VerificationCheckKind,
} from './verification.types';
import type {
  VerificationCheckReportCandidate,
  VerificationCheckReportDecodeResult,
  VerificationCheckReportPayload,
  VerificationCheckReportTerminal,
} from './verificationCheckReport.types';
import { readBrowserVerificationReportPayload } from './verificationCheckReportCodec.browser';
import {
  addVerificationReportIssue,
  encodedVerificationReportBytes,
  inspectVerificationReportShape,
  readVerificationReportArray,
  sortUniqueVerificationReportValues,
  VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
  VERIFICATION_CHECK_KINDS,
  VERIFICATION_CHECK_REPORT_FORMAT,
  VERIFICATION_CHECK_REPORT_LIMITS,
  VERIFICATION_CHECK_REPORT_VERSION,
  VERIFICATION_REPORT_ARTIFACT_KINDS,
  VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
  verificationReportDigest,
  verificationReportInteger,
  verificationReportOneOf,
  verificationReportRecord,
  verificationReportText,
  verificationReportToken,
  verificationReportTokenArray,
  type VerificationReportDecodeState,
} from './verificationCheckReportCodec.common';
import { readFunctionalVerificationReportPayload } from './verificationCheckReportCodec.functional';

const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,127}$/u;
const TOOL_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;

const readAdapterIdentity = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationAdapterIdentity | undefined => {
  const data = verificationReportRecord(
    value,
    ['adapterId', 'descriptorDigest', 'toolchainDigest', 'capabilityDigest'],
    [],
    path,
    state
  );
  if (!data) return undefined;
  const adapterId = verificationReportToken(
    data.adapterId,
    `${path}/adapterId`,
    state
  );
  const descriptorDigest = verificationReportDigest(
    data.descriptorDigest,
    `${path}/descriptorDigest`,
    state
  );
  const toolchainDigest = verificationReportDigest(
    data.toolchainDigest,
    `${path}/toolchainDigest`,
    state
  );
  const capabilityDigest = verificationReportDigest(
    data.capabilityDigest,
    `${path}/capabilityDigest`,
    state
  );
  return adapterId && descriptorDigest && toolchainDigest && capabilityDigest
    ? Object.freeze({
        adapterId,
        descriptorDigest,
        toolchainDigest,
        capabilityDigest,
      })
    : undefined;
};

const readToolIdentity = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationAdapterToolIdentity | undefined => {
  const data = verificationReportRecord(
    value,
    ['name', 'version', 'schemaVersion', 'schemaDigest'],
    [],
    path,
    state
  );
  if (!data) return undefined;
  const name = verificationReportText(data.name, `${path}/name`, state, 256);
  if (name && !TOOL_NAME_PATTERN.test(name)) {
    addVerificationReportIssue(
      state,
      `${path}/name`,
      'Tool name is not canonical.'
    );
    return undefined;
  }
  const version = verificationReportText(
    data.version,
    `${path}/version`,
    state,
    128
  );
  if (version && !VERSION_PATTERN.test(version)) {
    addVerificationReportIssue(
      state,
      `${path}/version`,
      'Tool version is not canonical.'
    );
    return undefined;
  }
  const schemaVersion = verificationReportInteger(
    data.schemaVersion,
    `${path}/schemaVersion`,
    state,
    1_000_000,
    1
  );
  const schemaDigest = verificationReportDigest(
    data.schemaDigest,
    `${path}/schemaDigest`,
    state
  );
  return name && version && schemaVersion !== undefined && schemaDigest
    ? Object.freeze({ name, version, schemaVersion, schemaDigest })
    : undefined;
};

const readTerminal = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationCheckReportTerminal | undefined => {
  if (!isPlainObject(value)) {
    addVerificationReportIssue(
      state,
      path,
      'Expected a terminal result object.'
    );
    return undefined;
  }
  const status = verificationReportOneOf(
    value.status,
    ['completed', 'failed', 'cancelled', 'timed-out'] as const,
    `${path}/status`,
    state
  );
  if (!status) return undefined;

  if (status === 'completed') {
    const data = verificationReportRecord(
      value,
      ['status', 'complete', 'exitCode'],
      [],
      path,
      state
    );
    const exitCode = data
      ? verificationReportInteger(data.exitCode, `${path}/exitCode`, state, 255)
      : undefined;
    if (!data || data.complete !== true) {
      addVerificationReportIssue(
        state,
        `${path}/complete`,
        'Terminal reports must be complete.'
      );
      return undefined;
    }
    return exitCode === undefined
      ? undefined
      : Object.freeze({ status, complete: true as const, exitCode });
  }

  if (status === 'failed') {
    const data = verificationReportRecord(
      value,
      ['status', 'complete', 'failureClass', 'reasonCode'],
      ['exitCode'],
      path,
      state
    );
    if (!data || data.complete !== true) {
      addVerificationReportIssue(
        state,
        `${path}/complete`,
        'Terminal reports must be complete.'
      );
      return undefined;
    }
    const failureClass = verificationReportOneOf(
      data.failureClass,
      [
        'fixture-control',
        'environment',
        'adapter-infrastructure',
        'contract-mismatch',
        'security-denial',
      ] as const,
      `${path}/failureClass`,
      state
    );
    const reasonCode = verificationReportToken(
      data.reasonCode,
      `${path}/reasonCode`,
      state
    );
    const exitCode =
      data.exitCode === undefined
        ? undefined
        : verificationReportInteger(
            data.exitCode,
            `${path}/exitCode`,
            state,
            255
          );
    return failureClass &&
      reasonCode &&
      (data.exitCode === undefined || exitCode !== undefined)
      ? Object.freeze({
          status,
          complete: true as const,
          failureClass,
          reasonCode,
          ...(exitCode === undefined ? {} : { exitCode }),
        })
      : undefined;
  }

  if (status === 'cancelled') {
    const data = verificationReportRecord(
      value,
      ['status', 'complete', 'reasonCode'],
      [],
      path,
      state
    );
    if (!data || data.complete !== true) {
      addVerificationReportIssue(
        state,
        `${path}/complete`,
        'Terminal reports must be complete.'
      );
      return undefined;
    }
    const reasonCode = verificationReportToken(
      data.reasonCode,
      `${path}/reasonCode`,
      state
    );
    return reasonCode
      ? Object.freeze({ status, complete: true as const, reasonCode })
      : undefined;
  }

  const data = verificationReportRecord(
    value,
    ['status', 'complete', 'timeoutMs'],
    [],
    path,
    state
  );
  if (!data || data.complete !== true) {
    addVerificationReportIssue(
      state,
      `${path}/complete`,
      'Terminal reports must be complete.'
    );
    return undefined;
  }
  const timeoutMs = verificationReportInteger(
    data.timeoutMs,
    `${path}/timeoutMs`,
    state,
    86_400_000,
    1
  );
  return timeoutMs
    ? Object.freeze({ status, complete: true as const, timeoutMs })
    : undefined;
};

const readPayload = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState,
  securityObservationRuleIds: readonly string[]
): VerificationCheckReportPayload | undefined => {
  if (!isPlainObject(value)) {
    addVerificationReportIssue(state, path, 'Expected a report payload.');
    return undefined;
  }
  const kind = verificationReportOneOf(
    value.kind,
    VERIFICATION_CHECK_KINDS,
    `${path}/kind`,
    state
  );
  if (!kind) return undefined;
  return (
    ['diagnostics', 'build', 'unit', 'integration', 'e2e'] as const
  ).includes(kind as 'diagnostics' | 'build' | 'unit' | 'integration' | 'e2e')
    ? readFunctionalVerificationReportPayload(
        value,
        kind as Extract<
          VerificationCheckKind,
          'diagnostics' | 'build' | 'unit' | 'integration' | 'e2e'
        >,
        path,
        state
      )
    : readBrowserVerificationReportPayload(
        value,
        kind as Extract<
          VerificationCheckKind,
          'visual' | 'accessibility' | 'performance' | 'security'
        >,
        path,
        state,
        securityObservationRuleIds
      );
};

const readArtifacts = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationCheckReportCandidate['artifacts'] | undefined => {
  const artifacts = readVerificationReportArray(
    value,
    path,
    state,
    (entry, entryPath, nextState) => {
      const data = verificationReportRecord(
        entry,
        ['id', 'kind', 'digest', 'size', 'mediaType'],
        [],
        entryPath,
        nextState
      );
      if (!data) return undefined;
      const id = verificationReportToken(data.id, `${entryPath}/id`, nextState);
      const kind = verificationReportOneOf(
        data.kind,
        VERIFICATION_REPORT_ARTIFACT_KINDS,
        `${entryPath}/kind`,
        nextState
      );
      const digest = verificationReportDigest(
        data.digest,
        `${entryPath}/digest`,
        nextState
      );
      const size = verificationReportInteger(
        data.size,
        `${entryPath}/size`,
        nextState,
        VERIFICATION_CHECK_REPORT_LIMITS.maximumArtifactBytes
      );
      const mediaType = verificationReportText(
        data.mediaType,
        `${entryPath}/mediaType`,
        nextState,
        127
      );
      if (mediaType && !MEDIA_TYPE_PATTERN.test(mediaType)) {
        addVerificationReportIssue(
          nextState,
          `${entryPath}/mediaType`,
          'Artifact media type is invalid.'
        );
        return undefined;
      }
      return id && kind && digest && size !== undefined && mediaType
        ? Object.freeze({ id, kind, digest, size, mediaType })
        : undefined;
    }
  );
  if (!artifacts) return undefined;
  if (artifacts.length > VERIFICATION_CHECK_REPORT_LIMITS.maximumArtifacts) {
    addVerificationReportIssue(
      state,
      path,
      'Artifact descriptors exceed their count budget.'
    );
    return undefined;
  }
  const totalSize = artifacts.reduce((total, artifact) => {
    const next = total + artifact.size;
    return Number.isSafeInteger(next)
      ? next
      : VERIFICATION_CHECK_REPORT_LIMITS.maximumArtifactBytes + 1;
  }, 0);
  if (totalSize > VERIFICATION_CHECK_REPORT_LIMITS.maximumArtifactBytes) {
    addVerificationReportIssue(
      state,
      path,
      'Artifact descriptors exceed their aggregate byte budget.'
    );
    return undefined;
  }
  return sortUniqueVerificationReportValues(
    artifacts,
    ({ id }) => id,
    path,
    state
  );
};

const decodeVerificationCheckReportCandidateForSecurityStage = (
  value: unknown,
  securityObservationRuleIds: readonly string[]
): VerificationCheckReportDecodeResult => {
  const state: VerificationReportDecodeState = { issues: [], nodes: 0 };
  inspectVerificationReportShape(value, '', 0, state);
  const encodedBytes = encodedVerificationReportBytes(value, state);
  if (
    encodedBytes !== undefined &&
    encodedBytes > VERIFICATION_CHECK_REPORT_LIMITS.maximumEncodedBytes
  ) {
    addVerificationReportIssue(
      state,
      '',
      'Check report candidate exceeds its byte budget.'
    );
  }
  const data = verificationReportRecord(
    value,
    [
      'format',
      'version',
      'cellId',
      'attemptId',
      'checkKind',
      'inputDigest',
      'adapter',
      'tool',
      'terminal',
      'payload',
      'artifacts',
      'diagnosticCodes',
    ],
    [],
    '',
    state
  );
  if (!data) {
    return Object.freeze({ ok: false, issues: Object.freeze(state.issues) });
  }
  if (data.format !== VERIFICATION_CHECK_REPORT_FORMAT) {
    addVerificationReportIssue(
      state,
      '/format',
      'Unknown check report format.'
    );
  }
  if (data.version !== VERIFICATION_CHECK_REPORT_VERSION) {
    addVerificationReportIssue(
      state,
      '/version',
      'Unknown check report schema version.',
      'contract-mismatch',
      'VER-4001'
    );
  }
  const cellId = verificationReportToken(data.cellId, '/cellId', state);
  const attemptId = verificationReportToken(
    data.attemptId,
    '/attemptId',
    state
  );
  const checkKind = verificationReportOneOf(
    data.checkKind,
    VERIFICATION_CHECK_KINDS,
    '/checkKind',
    state
  );
  const inputDigest = verificationReportDigest(
    data.inputDigest,
    '/inputDigest',
    state
  );
  const adapter = readAdapterIdentity(data.adapter, '/adapter', state);
  const tool = readToolIdentity(data.tool, '/tool', state);
  const terminal = readTerminal(data.terminal, '/terminal', state);
  const payload = readPayload(
    data.payload,
    '/payload',
    state,
    securityObservationRuleIds
  );
  const artifacts = readArtifacts(data.artifacts, '/artifacts', state);
  const diagnosticCodes = verificationReportTokenArray(
    data.diagnosticCodes,
    '/diagnosticCodes',
    state
  );
  if (checkKind && payload && checkKind !== payload.kind) {
    addVerificationReportIssue(
      state,
      '/payload/kind',
      'Payload family does not match checkKind.',
      'contract-mismatch',
      'VER-4001'
    );
  }
  if (
    cellId &&
    attemptId &&
    payload &&
    'behaviorAssertionReceipt' in payload &&
    (payload.behaviorAssertionReceipt.cellId !== cellId ||
      payload.behaviorAssertionReceipt.attemptId !== attemptId)
  ) {
    addVerificationReportIssue(
      state,
      '/payload/behaviorAssertionReceipt',
      'Behavior assertion receipt drifted from report attempt coordinates.',
      'contract-mismatch',
      'VER-4001'
    );
  }
  if (
    state.issues.length > 0 ||
    !cellId ||
    !attemptId ||
    !checkKind ||
    !inputDigest ||
    !adapter ||
    !tool ||
    !terminal ||
    !payload ||
    !artifacts ||
    !diagnosticCodes
  ) {
    return Object.freeze({ ok: false, issues: Object.freeze(state.issues) });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      format: VERIFICATION_CHECK_REPORT_FORMAT,
      version: VERIFICATION_CHECK_REPORT_VERSION,
      cellId,
      attemptId,
      checkKind,
      inputDigest,
      adapter,
      tool,
      terminal,
      payload,
      artifacts,
      diagnosticCodes: Object.freeze(
        [...diagnosticCodes].sort(compareUnicodeCodePoints)
      ),
    }),
  });
};

export const decodeVerificationCheckReportCandidate = (
  value: unknown
): VerificationCheckReportDecodeResult =>
  decodeVerificationCheckReportCandidateForSecurityStage(
    value,
    VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS
  );

/**
 * Lifecycle-internal decoder. A registered adapter may only attest the seven
 * rules observable before Core artifact validation and cleanup.
 */
export const decodeVerificationAdapterCheckReportCandidate = (
  value: unknown
): VerificationCheckReportDecodeResult =>
  decodeVerificationCheckReportCandidateForSecurityStage(
    value,
    VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS
  );

/**
 * Adds only the two Core-owned post-stage/post-cleanup observations, then
 * re-runs the public nine-rule decoder before a lifecycle report can escape.
 */
export const finalizeVerificationAdapterCheckReportCandidate = (
  candidate: VerificationCheckReportCandidate
): VerificationCheckReportDecodeResult =>
  decodeVerificationCheckReportCandidate(
    candidate.payload.kind === 'security'
      ? {
          ...candidate,
          payload: {
            ...candidate.payload,
            observedRuleIds: VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
          },
        }
      : candidate
  );

export {
  VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
  VERIFICATION_CHECK_REPORT_FORMAT,
  VERIFICATION_CHECK_REPORT_LIMITS,
  VERIFICATION_CHECK_REPORT_VERSION,
  VERIFICATION_NORMALIZED_CHECK_REPORT_SCHEMA,
  VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
} from './verificationCheckReportCodec.common';
