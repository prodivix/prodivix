import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import type { VerificationArtifactKind } from './verification.types';
import { digestVerificationValue } from './verificationCanonical';
import { VERIFICATION_ARTIFACT_POLICY_DEFAULTS } from './verificationArtifactPolicyConfig';
import { verificationArtifactEnvelopeWireSchema } from './verificationArtifactEnvelopeSchema';
import {
  VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
  VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
  VERIFICATION_STRUCTURED_ARTIFACT_KINDS,
  VERIFICATION_STRUCTURED_ARTIFACT_LIMITS,
  type VerificationAccessibilityReportArtifactEnvelope,
  type VerificationArtifactConsoleEvent,
  type VerificationArtifactEnvelopeDecodeContext,
  type VerificationArtifactEnvelopeDecodeResult,
  type VerificationArtifactEnvelopeIssue,
  type VerificationArtifactSecurityFinding,
  type VerificationArtifactTraceEvent,
  type VerificationConsoleSummaryArtifactEnvelope,
  type VerificationCoverageSummaryArtifactEnvelope,
  type VerificationNetworkSummaryArtifactEnvelope,
  type VerificationReplayRecordArtifactEnvelope,
  type VerificationSecurityReportArtifactEnvelope,
  type VerificationStructuredArtifactEnvelope,
  type VerificationStructuredArtifactEnvelopeForKind,
  type VerificationStructuredArtifactKind,
  type VerificationTraceArtifactEnvelope,
} from './verificationArtifactEnvelope.types';

export {
  VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
  VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
  VERIFICATION_STRUCTURED_ARTIFACT_KINDS,
  VERIFICATION_STRUCTURED_ARTIFACT_LIMITS,
  verificationArtifactEnvelopeWireSchema,
};
export type {
  VerificationAccessibilityReportArtifactEnvelope,
  VerificationArtifactAccessibilityViolation,
  VerificationArtifactConsoleEvent,
  VerificationArtifactCoverageMetric,
  VerificationArtifactDiagnosticCodes,
  VerificationArtifactEnvelopeBase,
  VerificationArtifactEnvelopeDecodeContext,
  VerificationArtifactEnvelopeDecodeResult,
  VerificationArtifactEnvelopeIssue,
  VerificationArtifactNetworkMethod,
  VerificationArtifactNetworkOperation,
  VerificationArtifactSecurityFinding,
  VerificationArtifactTraceEvent,
  VerificationConsoleSummaryArtifactEnvelope,
  VerificationCoverageSummaryArtifactEnvelope,
  VerificationNetworkSummaryArtifactEnvelope,
  VerificationPerformanceProfileArtifactEnvelope,
  VerificationReplayRecordArtifactEnvelope,
  VerificationSecurityReportArtifactEnvelope,
  VerificationStructuredArtifactEnvelope,
  VerificationStructuredArtifactEnvelopeForKind,
  VerificationStructuredArtifactKind,
  VerificationTraceArtifactEnvelope,
} from './verificationArtifactEnvelope.types';

export const VERIFICATION_ARTIFACT_ENVELOPE_SCHEMA_DIGEST =
  digestVerificationValue(verificationArtifactEnvelopeWireSchema);

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const STRUCTURED_KIND_SET = new Set<VerificationStructuredArtifactKind>(
  VERIFICATION_STRUCTURED_ARTIFACT_KINDS
);

export const isVerificationStructuredArtifactKind = (
  value: VerificationArtifactKind | string
): value is VerificationStructuredArtifactKind =>
  STRUCTURED_KIND_SET.has(value as VerificationStructuredArtifactKind);

const issue = (
  path: string,
  message: string
): VerificationArtifactEnvelopeDecodeResult<never> =>
  Object.freeze({
    ok: false,
    issues: Object.freeze([
      Object.freeze({
        code: 'VER-5005' as const,
        path,
        message,
      }),
    ]),
  });

const isUnicodeScalarText = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const trailing = value.charCodeAt(index + 1);
      if (
        !Number.isInteger(trailing) ||
        trailing < 0xdc00 ||
        trailing > 0xdfff
      ) {
        return false;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
};

type InspectionState = {
  nodes: number;
  seen: WeakSet<object>;
};

const inspectCanonicalJson = (
  value: unknown,
  depth: number,
  state: InspectionState
): boolean => {
  state.nodes += 1;
  if (
    depth > VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumJsonDepth ||
    state.nodes > VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumJsonNodes
  ) {
    return false;
  }
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') {
    return (
      Number.isFinite(value) &&
      !Object.is(value, -0) &&
      (!Number.isInteger(value) || Number.isSafeInteger(value))
    );
  }
  if (typeof value === 'string') {
    return (
      isUnicodeScalarText(value) &&
      value === value.normalize('NFC') &&
      utf8ToBytes(value).byteLength <=
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumJsonStringBytes
    );
  }
  if (typeof value !== 'object' || state.seen.has(value)) return false;
  state.seen.add(value);

  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || !keys.includes('length')) {
        return false;
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index)
        );
        if (
          !descriptor ||
          !descriptor.enumerable ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          !inspectCanonicalJson(descriptor.value, depth + 1, state)
        ) {
          return false;
        }
      }
      return true;
    }
    if (!isPlainObject(value)) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (
        typeof key !== 'string' ||
        isUnsafeObjectKey(key) ||
        !isUnicodeScalarText(key) ||
        key !== key.normalize('NFC') ||
        utf8ToBytes(key).byteLength >
          VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumJsonStringBytes
      ) {
        return false;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        !inspectCanonicalJson(descriptor.value, depth + 1, state)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
};

const cloneCanonicalEnvelope = (
  value: unknown
): Readonly<Record<string, unknown>> | undefined => {
  try {
    if (
      !inspectCanonicalJson(value, 0, {
        nodes: 0,
        seen: new WeakSet<object>(),
      })
    ) {
      return undefined;
    }
    const text = canonicalJsonText(value);
    if (
      utf8ToBytes(text).byteLength >
      VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumJsonBytes
    ) {
      return undefined;
    }
    const cloned = JSON.parse(text) as unknown;
    return isPlainObject(cloned) ? cloned : undefined;
  } catch {
    return undefined;
  }
};

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
});
const validateEnvelopeSchema = ajv.compile(
  verificationArtifactEnvelopeWireSchema
);

const schemaIssuePath = (error: ErrorObject): string =>
  error.instancePath ||
  (error.params && 'missingProperty' in error.params
    ? `/${String(error.params.missingProperty)}`
    : '/');

const schemaIssues = (
  errors: readonly ErrorObject[] | null | undefined
): VerificationArtifactEnvelopeDecodeResult<never> =>
  Object.freeze({
    ok: false,
    issues: Object.freeze(
      (errors?.length ? errors : [undefined]).slice(0, 128).map((error) =>
        Object.freeze({
          code: 'VER-5005' as const,
          path: error ? schemaIssuePath(error) : '/',
          message: error?.message
            ? `Artifact envelope schema ${error.message}.`
            : 'Artifact envelope schema validation failed.',
        })
      )
    ),
  });

const sortedUnique = (values: readonly string[]): boolean =>
  values.every(
    (value, index) =>
      index === 0 ||
      compareUnicodeCodePoints(values[index - 1] as string, value) < 0
  );

type SemanticState = {
  diagnosticRefs: number;
  expectedSourceTraceDigest?: string;
  issues: VerificationArtifactEnvelopeIssue[];
};

const addSemanticIssue = (
  state: SemanticState,
  path: string,
  message: string
): false => {
  if (state.issues.length < 128) {
    state.issues.push(Object.freeze({ code: 'VER-5005', path, message }));
  }
  return false;
};

const validateDiagnosticCodes = (
  values: readonly string[],
  path: string,
  state: SemanticState
): boolean => {
  state.diagnosticRefs += values.length;
  if (!sortedUnique(values)) {
    return addSemanticIssue(
      state,
      path,
      'Artifact diagnostic codes must be canonically sorted and unique.'
    );
  }
  if (
    state.diagnosticRefs >
    VERIFICATION_STRUCTURED_ARTIFACT_LIMITS.maximumDiagnosticRefs
  ) {
    return addSemanticIssue(
      state,
      path,
      'Artifact diagnostic references exceed the aggregate budget.'
    );
  }
  return true;
};

const validateSourceTraceDigest = (
  value: string,
  path: string,
  state: SemanticState
): boolean =>
  !state.expectedSourceTraceDigest ||
  value === state.expectedSourceTraceDigest ||
  addSemanticIssue(
    state,
    path,
    'Artifact source trace does not match the expected candidate trace.'
  );

// The envelope-level digest binds the aggregate trace. Nested entries retain
// their own schema-validated SourceTrace digest for exact source navigation.
const validateOptionalSourceTraceDigest = (
  _value: string | undefined,
  _path: string,
  _state: SemanticState
): boolean => true;

const validateOrderedEvents = (
  events: readonly (
    VerificationArtifactTraceEvent | VerificationArtifactConsoleEvent
  )[],
  path: string,
  state: SemanticState
): boolean => {
  let previousSequence = -1;
  const eventIds = new Set<string>();
  let valid = true;
  events.forEach((event, index) => {
    if (event.sequence <= previousSequence) {
      valid = addSemanticIssue(
        state,
        `${path}/${index}/sequence`,
        'Artifact event sequences must be strictly increasing.'
      );
    }
    previousSequence = event.sequence;
    if (eventIds.has(event.eventId)) {
      valid = addSemanticIssue(
        state,
        `${path}/${index}/eventId`,
        'Artifact event ids must be unique.'
      );
    }
    eventIds.add(event.eventId);
    if (
      !validateDiagnosticCodes(
        event.diagnosticCodes,
        `${path}/${index}/diagnosticCodes`,
        state
      )
    ) {
      valid = false;
    }
    if (
      !validateOptionalSourceTraceDigest(
        event.sourceTraceDigest,
        `${path}/${index}/sourceTraceDigest`,
        state
      )
    ) {
      valid = false;
    }
  });
  return valid;
};

const validateAccessibility = (
  envelope: VerificationAccessibilityReportArtifactEnvelope,
  state: SemanticState
): boolean => {
  let valid = true;
  envelope.summary.violations.forEach((violation, index) => {
    if (
      !validateDiagnosticCodes(
        violation.diagnosticCodes,
        `/summary/violations/${index}/diagnosticCodes`,
        state
      )
    ) {
      valid = false;
    }
    if (
      !validateOptionalSourceTraceDigest(
        violation.sourceTraceDigest,
        `/summary/violations/${index}/sourceTraceDigest`,
        state
      )
    ) {
      valid = false;
    }
  });
  return valid;
};

const validateTrace = (
  envelope: VerificationTraceArtifactEnvelope,
  state: SemanticState
): boolean =>
  validateSourceTraceDigest(
    envelope.sourceTraceDigest,
    '/sourceTraceDigest',
    state
  ) && validateOrderedEvents(envelope.events, '/events', state);

const validateNetwork = (
  envelope: VerificationNetworkSummaryArtifactEnvelope,
  state: SemanticState
): boolean => {
  const operationIds = new Set<string>();
  let valid = true;
  envelope.operations.forEach((operation, index) => {
    if (
      operation.pathTemplate.includes('://') ||
      utf8ToBytes(operation.pathTemplate).byteLength >
        VERIFICATION_STRUCTURED_ARTIFACT_LIMITS.maximumPathTemplateBytes
    ) {
      valid = addSemanticIssue(
        state,
        `/operations/${index}/pathTemplate`,
        'Artifact network path templates must be bounded and cannot contain an origin.'
      );
    }
    if (operationIds.has(operation.operationId)) {
      valid = addSemanticIssue(
        state,
        `/operations/${index}/operationId`,
        'Artifact network operation ids must be unique.'
      );
    }
    operationIds.add(operation.operationId);
  });
  return valid;
};

const validateConsole = (
  envelope: VerificationConsoleSummaryArtifactEnvelope,
  state: SemanticState
): boolean =>
  validateSourceTraceDigest(
    envelope.sourceTraceDigest,
    '/sourceTraceDigest',
    state
  ) && validateOrderedEvents(envelope.events, '/events', state);

const validateCoverage = (
  envelope: VerificationCoverageSummaryArtifactEnvelope,
  state: SemanticState
): boolean => {
  let valid = true;
  for (const field of [
    'lines',
    'functions',
    'branches',
    'statements',
  ] as const) {
    const metric = envelope.summary[field];
    if (metric.covered > metric.total) {
      valid = addSemanticIssue(
        state,
        `/summary/${field}/covered`,
        'Artifact coverage cannot exceed its total.'
      );
    }
  }
  return valid;
};

const validateSecurity = (
  envelope: VerificationSecurityReportArtifactEnvelope,
  state: SemanticState
): boolean => {
  let valid = true;
  envelope.summary.findings.forEach(
    (finding: VerificationArtifactSecurityFinding, index) => {
      if (
        !validateDiagnosticCodes(
          finding.diagnosticCodes,
          `/summary/findings/${index}/diagnosticCodes`,
          state
        )
      ) {
        valid = false;
      }
      if (
        !validateOptionalSourceTraceDigest(
          finding.sourceTraceDigest,
          `/summary/findings/${index}/sourceTraceDigest`,
          state
        )
      ) {
        valid = false;
      }
    }
  );
  return valid;
};

const validateReplay = (
  envelope: VerificationReplayRecordArtifactEnvelope,
  state: SemanticState
): boolean =>
  validateSourceTraceDigest(
    envelope.sourceTraceDigest,
    '/sourceTraceDigest',
    state
  ) &&
  validateDiagnosticCodes(
    envelope.summary.diagnosticCodes,
    '/summary/diagnosticCodes',
    state
  );

const validateSemantics = (
  envelope: VerificationStructuredArtifactEnvelope,
  context: VerificationArtifactEnvelopeDecodeContext
): readonly VerificationArtifactEnvelopeIssue[] => {
  const state: SemanticState = {
    diagnosticRefs: 0,
    ...(context.expectedSourceTraceDigest
      ? { expectedSourceTraceDigest: context.expectedSourceTraceDigest }
      : {}),
    issues: [],
  };
  switch (envelope.kind) {
    case 'accessibility-report':
      validateAccessibility(envelope, state);
      break;
    case 'trace':
      validateTrace(envelope, state);
      break;
    case 'network-summary':
      validateNetwork(envelope, state);
      break;
    case 'console-summary':
      validateConsole(envelope, state);
      break;
    case 'coverage-summary':
      validateCoverage(envelope, state);
      break;
    case 'performance-profile':
      break;
    case 'security-report':
      validateSecurity(envelope, state);
      break;
    case 'replay-record':
      validateReplay(envelope, state);
      break;
  }
  return Object.freeze(state.issues);
};

const deepFreezeEnvelope = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) {
      deepFreezeEnvelope(entry);
    }
    Object.freeze(value);
  }
  return value;
};

export const decodeVerificationArtifactEnvelope = <
  K extends VerificationStructuredArtifactKind,
>(
  value: unknown,
  expectedKind: K,
  context: VerificationArtifactEnvelopeDecodeContext = {}
): VerificationArtifactEnvelopeDecodeResult<K> => {
  if (!isVerificationStructuredArtifactKind(expectedKind)) {
    return issue(
      '/kind',
      'Expected a supported structured verification artifact kind.'
    );
  }
  if (
    context.expectedSourceTraceDigest !== undefined &&
    !DIGEST_PATTERN.test(context.expectedSourceTraceDigest)
  ) {
    return issue(
      '/sourceTraceDigest',
      'Expected source trace authority must be a full lowercase sha256 digest.'
    );
  }
  const cloned = cloneCanonicalEnvelope(value);
  if (!cloned) {
    return issue(
      '/',
      'Artifact envelope must be bounded canonical plain JSON.'
    );
  }
  if (cloned.kind !== expectedKind) {
    return issue(
      '/kind',
      'Artifact envelope kind does not match the expected descriptor kind.'
    );
  }
  if (
    cloned.format !== VERIFICATION_ARTIFACT_ENVELOPE_FORMAT ||
    cloned.version !== VERIFICATION_ARTIFACT_ENVELOPE_VERSION
  ) {
    return issue('/', 'Artifact envelope format or version is not supported.');
  }
  if (!validateEnvelopeSchema(cloned)) {
    return schemaIssues(validateEnvelopeSchema.errors);
  }
  const envelope = cloned as VerificationStructuredArtifactEnvelope;
  const semanticIssues = validateSemantics(envelope, context);
  if (semanticIssues.length) {
    return Object.freeze({ ok: false, issues: semanticIssues });
  }
  return Object.freeze({
    ok: true,
    value: deepFreezeEnvelope(
      envelope as VerificationStructuredArtifactEnvelopeForKind<K>
    ),
  });
};
