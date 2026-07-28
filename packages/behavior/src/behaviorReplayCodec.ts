import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import {
  digestBehaviorValue,
  readBehaviorJsonValue,
} from './behaviorCanonical';
import {
  DEFAULT_REPLAY_MAXIMUM_EVENTS,
  DEFAULT_REPLAY_MAXIMUM_UTF8_BYTES,
  HARD_REPLAY_MAXIMUM_EVENTS,
  HARD_REPLAY_MAXIMUM_UTF8_BYTES,
  calculateBehaviorReplaySemanticDigest,
  readBehaviorReplayBudget,
  type BehaviorReplayEvent,
  type BehaviorReplayRecord,
  type BehaviorReplayRecordBudget,
  type BehaviorReplayRecordWire,
} from './behaviorReplay';
import type { BehaviorJsonValue } from './behavior.types';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const REPLAY_EVENT_KINDS: ReadonlySet<string> = new Set([
  'control-applied',
  'scheduler-task',
  'instruction-started',
  'instruction-completed',
  'instruction-failed',
  'instruction-cancelled',
  'fixture-matched',
  'fixture-fault',
  'fixture-blocked',
  'cleanup-completed',
  'cleanup-failed',
]);
const REPLAY_OUTCOMES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'blocked',
  'cancelled',
  'infrastructure-error',
]);
const REPLAY_SURFACES: ReadonlySet<string> = new Set([
  'browser',
  'remote',
  'export',
  'ci',
]);

const isReplayJsonRecord = (
  value: BehaviorJsonValue | undefined
): value is Readonly<Record<string, BehaviorJsonValue>> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasOnlyReplayKeys = (
  value: Readonly<Record<string, BehaviorJsonValue>>,
  allowedKeys: readonly string[]
): boolean => {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
};

const isBoundedReplayText = (value: BehaviorJsonValue | undefined): boolean =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 512 &&
  value === value.trim() &&
  !value.includes('\u0000');

const isReplayDigest = (value: BehaviorJsonValue | undefined): boolean =>
  typeof value === 'string' && DIGEST_PATTERN.test(value);

const isReplaySource = (value: BehaviorJsonValue | undefined): boolean => {
  if (
    !isReplayJsonRecord(value) ||
    !hasOnlyReplayKeys(value, ['workspaceDocumentId', 'path'])
  ) {
    return false;
  }
  return (
    isBoundedReplayText(value.workspaceDocumentId) &&
    isBoundedReplayText(value.path)
  );
};

const isReplayEvent = (value: BehaviorJsonValue, index: number): boolean => {
  if (
    !isReplayJsonRecord(value) ||
    !hasOnlyReplayKeys(value, [
      'sequence',
      'kind',
      'logicalTime',
      'lane',
      'instructionId',
      'stepId',
      'capabilityId',
      'source',
      'valueDigest',
      'errorCode',
      'fixtureId',
      'detailDigest',
    ]) ||
    value.sequence !== index + 1 ||
    typeof value.kind !== 'string' ||
    !REPLAY_EVENT_KINDS.has(value.kind) ||
    typeof value.logicalTime !== 'number' ||
    !Number.isSafeInteger(value.logicalTime) ||
    value.logicalTime < 0
  ) {
    return false;
  }
  for (const key of [
    'lane',
    'instructionId',
    'stepId',
    'capabilityId',
    'errorCode',
    'fixtureId',
  ] as const) {
    if (Object.hasOwn(value, key) && !isBoundedReplayText(value[key])) {
      return false;
    }
  }
  for (const key of ['valueDigest', 'detailDigest'] as const) {
    if (Object.hasOwn(value, key) && !isReplayDigest(value[key])) {
      return false;
    }
  }
  return !Object.hasOwn(value, 'source') || isReplaySource(value.source);
};

const isReplayProvider = (value: BehaviorJsonValue | undefined): boolean => {
  if (
    !isReplayJsonRecord(value) ||
    !hasOnlyReplayKeys(value, ['id', 'version', 'surface'])
  ) {
    return false;
  }
  return (
    isBoundedReplayText(value.id) &&
    isBoundedReplayText(value.version) &&
    typeof value.surface === 'string' &&
    REPLAY_SURFACES.has(value.surface)
  );
};

const isReplayIdentity = (value: BehaviorJsonValue | undefined): boolean => {
  if (
    !isReplayJsonRecord(value) ||
    !hasOnlyReplayKeys(value, [
      'scenarioId',
      'scenarioDigest',
      'programDigest',
      'controlProfileDigest',
      'appliedControlDigest',
      'capabilitySnapshotDigest',
      'fixtureSetDigests',
      'executableSnapshotDigest',
      'compilerDigest',
      'registryDigest',
      'toolchainDigest',
      'cellId',
    ]) ||
    !isBoundedReplayText(value.scenarioId) ||
    !isBoundedReplayText(value.cellId) ||
    !Array.isArray(value.fixtureSetDigests)
  ) {
    return false;
  }
  for (const key of [
    'scenarioDigest',
    'programDigest',
    'controlProfileDigest',
    'appliedControlDigest',
    'capabilitySnapshotDigest',
    'executableSnapshotDigest',
    'compilerDigest',
    'registryDigest',
    'toolchainDigest',
  ] as const) {
    if (!isReplayDigest(value[key])) return false;
  }
  return (
    value.fixtureSetDigests.every(isReplayDigest) &&
    new Set(value.fixtureSetDigests).size === value.fixtureSetDigests.length
  );
};

const isReplayCleanup = (value: BehaviorJsonValue | undefined): boolean => {
  if (
    !isReplayJsonRecord(value) ||
    !hasOnlyReplayKeys(value, ['status', 'residualDigest'])
  ) {
    return false;
  }
  return (
    (value.status === 'clean' || value.status === 'residual') &&
    isReplayDigest(value.residualDigest)
  );
};

export const encodeBehaviorReplayRecord = (
  record: BehaviorReplayRecord
): BehaviorReplayRecordWire => Object.freeze({ ...record, wireVersion: 1 });

export const decodeBehaviorReplayRecord = (
  wire: unknown,
  budget: BehaviorReplayRecordBudget = {}
): BehaviorReplayRecord | null => {
  let maximumEvents: number;
  let maximumUtf8Bytes: number;
  try {
    maximumEvents = readBehaviorReplayBudget(
      budget.maximumEvents,
      DEFAULT_REPLAY_MAXIMUM_EVENTS,
      HARD_REPLAY_MAXIMUM_EVENTS,
      'ReplayRecord event budget'
    );
    maximumUtf8Bytes = readBehaviorReplayBudget(
      budget.maximumUtf8Bytes,
      DEFAULT_REPLAY_MAXIMUM_UTF8_BYTES,
      HARD_REPLAY_MAXIMUM_UTF8_BYTES,
      'ReplayRecord byte budget'
    );
  } catch {
    return null;
  }
  const projected = readBehaviorJsonValue(wire, {
    maximumDepth: 32,
    maximumNodes: Math.max(100, maximumEvents * 20),
    maximumStringLength: 16_384,
    maximumUtf8Bytes,
  });
  if (
    !isReplayJsonRecord(projected) ||
    !hasOnlyReplayKeys(projected, [
      'wireVersion',
      'attemptId',
      'provider',
      'identity',
      'initialStateManifestDigest',
      'events',
      'outcome',
      'issueCode',
      'cleanup',
      'nonDeterminismFlags',
      'truncatedEventCount',
      'semanticDigest',
      'recordDigest',
    ])
  ) {
    return null;
  }
  if (
    projected.wireVersion !== 1 ||
    !isBoundedReplayText(projected.attemptId) ||
    !isReplayProvider(projected.provider) ||
    !isReplayIdentity(projected.identity) ||
    !isReplayDigest(projected.initialStateManifestDigest) ||
    !Array.isArray(projected.events) ||
    projected.events.length > maximumEvents ||
    projected.events.some((event, index) => !isReplayEvent(event, index)) ||
    typeof projected.outcome !== 'string' ||
    !REPLAY_OUTCOMES.has(projected.outcome) ||
    (Object.hasOwn(projected, 'issueCode') &&
      !isBoundedReplayText(projected.issueCode)) ||
    !isReplayCleanup(projected.cleanup) ||
    !Array.isArray(projected.nonDeterminismFlags) ||
    !projected.nonDeterminismFlags.every(isBoundedReplayText) ||
    new Set(projected.nonDeterminismFlags).size !==
      projected.nonDeterminismFlags.length ||
    typeof projected.truncatedEventCount !== 'number' ||
    !Number.isSafeInteger(projected.truncatedEventCount) ||
    projected.truncatedEventCount < 0 ||
    projected.nonDeterminismFlags.includes('record-truncated') !==
      projected.truncatedEventCount > 0 ||
    !isReplayDigest(projected.semanticDigest) ||
    !isReplayDigest(projected.recordDigest)
  ) {
    return null;
  }
  const validatedEvents =
    projected.events as unknown as readonly BehaviorReplayEvent[];
  if (
    projected.truncatedEventCount === 0 &&
    (validatedEvents[0]?.kind !== 'control-applied' ||
      !['cleanup-completed', 'cleanup-failed'].includes(
        validatedEvents.at(-1)?.kind ?? ''
      ))
  ) {
    return null;
  }
  if (utf8ToBytes(canonicalJsonText(projected)).byteLength > maximumUtf8Bytes) {
    return null;
  }
  const { wireVersion: _wireVersion, ...recordCandidate } = projected;
  const record = recordCandidate as unknown as BehaviorReplayRecord;
  if (calculateBehaviorReplaySemanticDigest(record) !== record.semanticDigest) {
    return null;
  }
  const { recordDigest, ...withoutDigest } = record;
  if (digestBehaviorValue(withoutDigest) !== recordDigest) {
    return null;
  }
  return Object.freeze(record);
};

export const sortBehaviorReplayRecords = (
  records: readonly BehaviorReplayRecord[]
): readonly BehaviorReplayRecord[] =>
  Object.freeze(
    [...records].sort((left, right) =>
      compareUnicodeCodePoints(left.attemptId, right.attemptId)
    )
  );
