import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  compareVerificationText,
  digestVerificationValue,
  parseVerificationInstant,
} from './verificationCanonical';
import {
  cloneCanonicalVerificationEvidenceWire,
  compileVerificationEvidenceWireSchema,
  verificationEvidenceWireSchemaFailure,
} from './verificationEvidenceWireCodec.shared';
import { normalizeVerificationCiIdentity } from './verificationCiIdentity';
import { createVerificationRunEvent } from './verificationRun';
import {
  VERIFICATION_RUN_EVENT_WIRE_VERSION,
  VERIFICATION_RUN_SNAPSHOT_WIRE_VERSION,
  verificationRunEventWireSchema,
  verificationRunSnapshotWireSchema,
} from './verificationRunSchema';
import type {
  VerificationRunCellState,
  VerificationRunEvent,
  VerificationRunEventInput,
  VerificationRunSnapshot,
} from './verificationRun.types';

export type VerificationRunSnapshotWire = VerificationRunSnapshot &
  Readonly<{ wireVersion: typeof VERIFICATION_RUN_SNAPSHOT_WIRE_VERSION }>;

export type VerificationRunEventWire = VerificationRunEvent &
  Readonly<{ wireVersion: typeof VERIFICATION_RUN_EVENT_WIRE_VERSION }>;

export type VerificationRunWireIssue = Readonly<{
  code: 'VER-5001';
  path: string;
  message: string;
}>;

export type VerificationRunSnapshotDecodeResult =
  | Readonly<{ ok: true; value: VerificationRunSnapshot }>
  | Readonly<{ ok: false; issues: readonly VerificationRunWireIssue[] }>;

export type VerificationRunEventDecodeResult =
  | Readonly<{ ok: true; value: VerificationRunEvent }>
  | Readonly<{ ok: false; issues: readonly VerificationRunWireIssue[] }>;

const validateSnapshotWire = compileVerificationEvidenceWireSchema(
  verificationRunSnapshotWireSchema
);
const validateEventWire = compileVerificationEvidenceWireSchema(
  verificationRunEventWireSchema
);

const invalid = (
  path: string,
  message: string
): Readonly<{ ok: false; issues: readonly VerificationRunWireIssue[] }> =>
  Object.freeze({
    ok: false,
    issues: Object.freeze([
      Object.freeze({ code: 'VER-5001' as const, path, message }),
    ]),
  });

const normalizeCell = (
  cell: VerificationRunCellState
): VerificationRunCellState => Object.freeze({ ...cell });

const normalizeSnapshot = (
  snapshot: VerificationRunSnapshot
): VerificationRunSnapshot =>
  Object.freeze({
    ...snapshot,
    ...(snapshot.ci ? { ci: Object.freeze({ ...snapshot.ci }) } : {}),
    selectedCellIds: Object.freeze([...snapshot.selectedCellIds]),
    cells: Object.freeze(snapshot.cells.map(normalizeCell)),
  }) as VerificationRunSnapshot;

const snapshotSemanticValidation = (
  snapshot: VerificationRunSnapshot
): VerificationRunSnapshotDecodeResult => {
  const selectedIds = snapshot.selectedCellIds;
  const cellIds = snapshot.cells.map(({ cellId }) => cellId);
  const attemptIds = snapshot.cells.map(({ attemptId }) => attemptId);
  const ci =
    snapshot.origin === 'ci'
      ? normalizeVerificationCiIdentity(snapshot.ci)
      : undefined;
  if (
    parseVerificationInstant(snapshot.createdAt) === undefined ||
    parseVerificationInstant(snapshot.updatedAt) === undefined ||
    parseVerificationInstant(snapshot.updatedAt)! <
      parseVerificationInstant(snapshot.createdAt)! ||
    snapshot.cells.some(
      ({
        lastEventCursor,
        startedAt,
        completedAt,
        candidateDigest,
        evidenceId,
      }) =>
        lastEventCursor > snapshot.cursor ||
        (startedAt !== undefined &&
          parseVerificationInstant(startedAt) === undefined) ||
        (completedAt !== undefined &&
          parseVerificationInstant(completedAt) === undefined) ||
        (evidenceId !== undefined && candidateDigest === undefined)
    ) ||
    !sameCanonicalJson(
      selectedIds,
      [...selectedIds].sort(compareVerificationText)
    ) ||
    !sameCanonicalJson(cellIds, [...cellIds].sort(compareVerificationText)) ||
    !sameCanonicalJson(selectedIds, cellIds) ||
    new Set(attemptIds).size !== attemptIds.length ||
    (snapshot.origin === 'ci') !== Boolean(ci) ||
    (snapshot.closureDigest === undefined) !==
      (snapshot.closureVerdict === undefined)
  ) {
    return invalid(
      '/',
      'Verification run snapshot semantic identity is invalid.'
    );
  }
  const { snapshotDigest, ...withoutDigest } = snapshot;
  if (digestVerificationValue(withoutDigest) !== snapshotDigest) {
    return invalid(
      '/snapshotDigest',
      'Verification run snapshot digest does not match.'
    );
  }
  return Object.freeze({ ok: true, value: normalizeSnapshot(snapshot) });
};

export const decodeVerificationRunSnapshot = (
  value: unknown
): VerificationRunSnapshotDecodeResult => {
  const cloned = cloneCanonicalVerificationEvidenceWire(value);
  if (!cloned.ok) return cloned;
  if (!validateSnapshotWire(cloned.value)) {
    return verificationEvidenceWireSchemaFailure(
      validateSnapshotWire.errors
    ) as VerificationRunSnapshotDecodeResult;
  }
  const { wireVersion: _wireVersion, ...current } = cloned.value;
  return snapshotSemanticValidation(
    current as unknown as VerificationRunSnapshot
  );
};

export const validateVerificationRunSnapshot = (
  value: unknown
): VerificationRunSnapshotDecodeResult => {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.hasOwn(value, 'wireVersion') ||
    Object.hasOwn(value, 'version')
  ) {
    return invalid(
      '/',
      'Verification run current model exposes a wire version or is invalid.'
    );
  }
  try {
    const current = JSON.parse(canonicalJsonText(value)) as Readonly<
      Record<string, unknown>
    >;
    return decodeVerificationRunSnapshot({
      ...current,
      wireVersion: VERIFICATION_RUN_SNAPSHOT_WIRE_VERSION,
    });
  } catch {
    return invalid('/', 'Verification run snapshot cannot be encoded.');
  }
};

export const encodeVerificationRunSnapshot = (
  snapshot: VerificationRunSnapshot
): VerificationRunSnapshotWire => {
  const validated = validateVerificationRunSnapshot(snapshot);
  if (!validated.ok) {
    throw new TypeError(
      validated.issues.map(({ message }) => message).join('; ')
    );
  }
  return Object.freeze({
    ...validated.value,
    wireVersion: VERIFICATION_RUN_SNAPSHOT_WIRE_VERSION,
  });
};

export const decodeVerificationRunEvent = (
  value: unknown
): VerificationRunEventDecodeResult => {
  const cloned = cloneCanonicalVerificationEvidenceWire(value);
  if (!cloned.ok) return cloned;
  if (!validateEventWire(cloned.value)) {
    return verificationEvidenceWireSchemaFailure(
      validateEventWire.errors
    ) as VerificationRunEventDecodeResult;
  }
  const { wireVersion: _wireVersion, ...current } = cloned.value;
  const event = current as unknown as VerificationRunEvent;
  const { eventDigest, ...input } = event;
  try {
    const normalized = createVerificationRunEvent(
      input as VerificationRunEventInput
    );
    if (
      normalized.eventDigest !== eventDigest ||
      !sameCanonicalJson(normalized, event)
    ) {
      return invalid(
        '/eventDigest',
        'Verification run event digest does not match.'
      );
    }
    return Object.freeze({ ok: true, value: normalized });
  } catch {
    return invalid('/', 'Verification run event semantic identity is invalid.');
  }
};

export const validateVerificationRunEvent = (
  value: unknown
): VerificationRunEventDecodeResult => {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.hasOwn(value, 'wireVersion') ||
    Object.hasOwn(value, 'version')
  ) {
    return invalid(
      '/',
      'Verification run event current model exposes a wire version or is invalid.'
    );
  }
  try {
    const current = JSON.parse(canonicalJsonText(value)) as Readonly<
      Record<string, unknown>
    >;
    return decodeVerificationRunEvent({
      ...current,
      wireVersion: VERIFICATION_RUN_EVENT_WIRE_VERSION,
    });
  } catch {
    return invalid('/', 'Verification run event cannot be encoded.');
  }
};

export const encodeVerificationRunEvent = (
  event: VerificationRunEvent
): VerificationRunEventWire => {
  const validated = validateVerificationRunEvent(event);
  if (!validated.ok) {
    throw new TypeError(
      validated.issues.map(({ message }) => message).join('; ')
    );
  }
  return Object.freeze({
    ...validated.value,
    wireVersion: VERIFICATION_RUN_EVENT_WIRE_VERSION,
  });
};
