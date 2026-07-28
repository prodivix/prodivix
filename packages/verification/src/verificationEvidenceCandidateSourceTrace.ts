import type { DiagnosticTargetRef, SourceSpan } from '@prodivix/diagnostics';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  addVerificationEvidenceCodecIssue as addIssue,
  readExactVerificationEvidenceRecord as exactRecord,
  verificationEvidenceOwnDataValue as ownDataValue,
  verificationEvidenceUtf8Length as utf8Length,
  VERIFICATION_EVIDENCE_CODEC_LIMITS,
} from './verificationEvidenceCodec.primitives';
import {
  canonicalText,
  digest,
  exactArray,
  identifier,
  safeInteger,
} from './verificationEvidenceCandidateFields';
import type {
  VerificationEvidenceCandidateIssue,
  VerificationEvidenceSourceTrace,
} from './verification.types';

type SourceRefFieldKind = 'digest' | 'identifier' | 'positiveInteger' | 'text';
type SourceRefShape = Readonly<{
  required: Readonly<Record<string, SourceRefFieldKind>>;
  optional?: Readonly<Record<string, SourceRefFieldKind>>;
}>;

const SOURCE_REF_SHAPES = {
  workspace: {
    required: { workspaceId: 'identifier' },
  },
  'workspace-node': {
    required: { workspaceId: 'identifier', nodeId: 'identifier' },
  },
  document: {
    required: { documentId: 'identifier' },
    optional: { workspaceId: 'identifier' },
  },
  'pir-node': {
    required: { documentId: 'identifier', nodeId: 'identifier' },
  },
  'inspector-field': {
    required: {
      documentId: 'identifier',
      nodeId: 'identifier',
      fieldPath: 'text',
    },
  },
  route: {
    required: { routeId: 'identifier' },
  },
  'nodegraph-node': {
    required: { documentId: 'identifier', nodeId: 'identifier' },
  },
  'nodegraph-port': {
    required: {
      documentId: 'identifier',
      nodeId: 'identifier',
      portId: 'identifier',
    },
  },
  'animation-timeline': {
    required: { documentId: 'identifier', timelineId: 'identifier' },
  },
  'animation-track': {
    required: {
      documentId: 'identifier',
      timelineId: 'identifier',
      bindingId: 'identifier',
      trackId: 'identifier',
    },
  },
  'data-source': {
    required: { documentId: 'identifier' },
  },
  'data-operation': {
    required: { documentId: 'identifier', operationId: 'identifier' },
  },
  'code-artifact': {
    required: { artifactId: 'identifier' },
  },
  'behavior-scenario': {
    required: { documentId: 'identifier' },
  },
  'behavior-step': {
    required: { documentId: 'identifier', stepId: 'identifier' },
    optional: { assertionId: 'identifier' },
  },
  'behavior-replay-record': {
    required: {
      planDigest: 'digest',
      cellId: 'identifier',
      attemptId: 'identifier',
    },
  },
  'verification-policy': {
    required: { documentId: 'identifier' },
  },
  'verification-plan-cell': {
    required: { planDigest: 'digest', cellId: 'identifier' },
  },
  'verification-evidence': {
    required: {
      planDigest: 'digest',
      cellId: 'identifier',
      attemptId: 'identifier',
    },
  },
  'verification-closure': {
    required: { planDigest: 'digest' },
  },
  operation: {
    required: { operation: 'text' },
  },
  'theme-token': {
    required: { themeId: 'identifier', tokenPath: 'text' },
  },
  viewport: {
    required: { width: 'positiveInteger', height: 'positiveInteger' },
    optional: { routeId: 'identifier' },
  },
  'runtime-dom': {
    required: { stablePath: 'text' },
    optional: { routeId: 'identifier' },
  },
  'component-slot': {
    required: {
      documentId: 'identifier',
      nodeId: 'identifier',
      slotName: 'identifier',
    },
  },
} as const satisfies Readonly<
  Record<DiagnosticTargetRef['kind'], SourceRefShape>
>;

const sourceRefField = (
  value: unknown,
  fieldKind: SourceRefFieldKind,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): number | string | undefined => {
  switch (fieldKind) {
    case 'digest':
      return digest(value, path, issues);
    case 'identifier':
      return identifier(value, path, issues);
    case 'text':
      return canonicalText(
        value,
        path,
        issues,
        VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumTextBytes
      );
    case 'positiveInteger': {
      const normalized = safeInteger(value, path, issues);
      if (normalized === 0) {
        addIssue(issues, 'VER-4002', path, 'Expected a positive safe integer.');
        return undefined;
      }
      return normalized;
    }
  }
};

const sourceRef = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): DiagnosticTargetRef | undefined => {
  const initialIssueCount = issues.length;
  if (!isPlainObject(value)) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'Expected a plain EvidenceCandidate source reference.'
    );
    return undefined;
  }
  const kindDescriptor = Object.getOwnPropertyDescriptor(value, 'kind');
  if (
    !kindDescriptor?.enumerable ||
    !('value' in kindDescriptor) ||
    typeof kindDescriptor.value !== 'string'
  ) {
    addIssue(
      issues,
      'VER-4002',
      `${path}/kind`,
      'Expected a supported EvidenceCandidate source reference kind.'
    );
    return undefined;
  }
  const kind = kindDescriptor.value;
  const shape = Object.hasOwn(SOURCE_REF_SHAPES, kind)
    ? SOURCE_REF_SHAPES[kind as keyof typeof SOURCE_REF_SHAPES]
    : undefined;
  if (!shape) {
    addIssue(
      issues,
      'VER-4002',
      `${path}/kind`,
      'EvidenceCandidate contains an unsupported source reference kind.'
    );
    return undefined;
  }

  const requiredEntries = Object.entries(shape.required);
  const optionalEntries = Object.entries(
    'optional' in shape ? (shape.optional ?? {}) : {}
  );
  const record = exactRecord(
    value,
    path,
    ['kind', ...requiredEntries.map(([key]) => key)],
    optionalEntries.map(([key]) => key),
    issues
  );
  if (!record) return undefined;

  const output: Record<string, number | string> = { kind };
  for (const [key, fieldKind] of [...requiredEntries, ...optionalEntries]) {
    if (!Object.hasOwn(record, key)) continue;
    const normalized = sourceRefField(
      ownDataValue(record, key),
      fieldKind,
      `${path}/${key}`,
      issues
    );
    if (normalized !== undefined) output[key] = normalized;
  }
  return issues.length === initialIssueCount
    ? (Object.freeze(output) as unknown as DiagnosticTargetRef)
    : undefined;
};

const sourceSpan = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): SourceSpan | undefined => {
  const initialIssueCount = issues.length;
  const record = exactRecord(
    value,
    path,
    ['artifactId', 'startLine', 'startColumn', 'endLine', 'endColumn'],
    [],
    issues
  );
  if (!record) return undefined;
  const artifactId = identifier(
    ownDataValue(record, 'artifactId'),
    `${path}/artifactId`,
    issues
  );
  const positions = Object.fromEntries(
    ['startLine', 'startColumn', 'endLine', 'endColumn'].map((key) => [
      key,
      sourceRefField(
        ownDataValue(record, key),
        'positiveInteger',
        `${path}/${key}`,
        issues
      ),
    ])
  ) as Record<
    'endColumn' | 'endLine' | 'startColumn' | 'startLine',
    number | undefined
  >;
  if (
    positions.startLine !== undefined &&
    positions.startColumn !== undefined &&
    positions.endLine !== undefined &&
    positions.endColumn !== undefined &&
    (positions.endLine < positions.startLine ||
      (positions.endLine === positions.startLine &&
        positions.endColumn < positions.startColumn))
  ) {
    addIssue(
      issues,
      'VER-4002',
      `${path}/endLine`,
      'EvidenceCandidate source span must end at or after its start.'
    );
  }
  return issues.length === initialIssueCount &&
    artifactId &&
    positions.startLine !== undefined &&
    positions.startColumn !== undefined &&
    positions.endLine !== undefined &&
    positions.endColumn !== undefined
    ? Object.freeze({
        artifactId,
        startLine: positions.startLine,
        startColumn: positions.startColumn,
        endLine: positions.endLine,
        endColumn: positions.endColumn,
      })
    : undefined;
};

const sourceTrace = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): VerificationEvidenceSourceTrace | undefined => {
  const initialIssueCount = issues.length;
  const record = exactRecord(
    value,
    path,
    ['sourceRef'],
    ['sourceSpan', 'label'],
    issues
  );
  if (!record) return undefined;
  const normalizedSourceRef = sourceRef(
    ownDataValue(record, 'sourceRef'),
    `${path}/sourceRef`,
    issues
  );
  const normalizedSourceSpan = Object.hasOwn(record, 'sourceSpan')
    ? sourceSpan(
        ownDataValue(record, 'sourceSpan'),
        `${path}/sourceSpan`,
        issues
      )
    : undefined;
  const label = Object.hasOwn(record, 'label')
    ? canonicalText(
        ownDataValue(record, 'label'),
        `${path}/label`,
        issues,
        VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSourceTraceLabelBytes
      )
    : undefined;
  return issues.length === initialIssueCount && normalizedSourceRef
    ? Object.freeze({
        sourceRef: normalizedSourceRef,
        ...(normalizedSourceSpan ? { sourceSpan: normalizedSourceSpan } : {}),
        ...(label ? { label } : {}),
      })
    : undefined;
};

export const sourceTraces = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): readonly VerificationEvidenceSourceTrace[] | undefined => {
  const initialIssueCount = issues.length;
  const values = exactArray(
    value,
    path,
    VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSourceTraces,
    issues
  );
  if (!values) return undefined;
  if (values.length === 0) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate must contain at least one confirmed source trace.'
    );
    return undefined;
  }
  const normalized = values
    .map((entry, index) => sourceTrace(entry, `${path}/${index}`, issues))
    .filter(
      (entry): entry is VerificationEvidenceSourceTrace => entry !== undefined
    )
    .map((entry) => Object.freeze({ key: canonicalJsonText(entry), entry }))
    .sort((left, right) => compareUnicodeCodePoints(left.key, right.key))
    .map(({ entry }) => entry);
  if (
    utf8Length(canonicalJsonText(normalized)) >
    VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSourceTraceBytes
  ) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate source traces exceed their canonical byte budget.'
    );
  }
  return issues.length === initialIssueCount
    ? Object.freeze(normalized)
    : undefined;
};

export type VerificationEvidenceSourceTraceDecodeResult =
  | Readonly<{
      ok: true;
      value: readonly VerificationEvidenceSourceTrace[];
    }>
  | Readonly<{
      ok: false;
      issues: readonly VerificationEvidenceCandidateIssue[];
    }>;

/**
 * Public fragment decoder shared by durable transports and product adapters.
 * Digest correlation remains the enclosing Candidate/Manifest owner's job.
 */
export const decodeVerificationEvidenceSourceTraces = (
  value: unknown
): VerificationEvidenceSourceTraceDecodeResult => {
  const issues: VerificationEvidenceCandidateIssue[] = [];
  const normalized = sourceTraces(value, '/sourceTraces', issues);
  return normalized && issues.length === 0
    ? Object.freeze({ ok: true, value: normalized })
    : Object.freeze({ ok: false, issues: Object.freeze(issues) });
};
