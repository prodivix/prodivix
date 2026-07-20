import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_LIMITS,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
  type RemoteExecutionRegionalRecoveryOperatorEvidence,
} from './remoteExecutionRegionalRecoveryOperator.types';

const maximumEvidenceBytes = 64 * 1_024;
const digestPattern = /^sha256-[0-9a-f]{64}$/u;
const canonicalIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`;
};

const digest = (value: unknown): string =>
  `sha256-${bytesToHex(sha256(utf8ToBytes(stableJson(value))))}`;

const record = (
  value: unknown
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const exactKeys = (
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): boolean =>
  JSON.stringify(Object.keys(value).sort()) ===
  JSON.stringify([...keys].sort());

const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const canonicalIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && canonicalIdentifierPattern.test(value);

const validOutcomes = (value: unknown, executionCount: number): boolean => {
  const outcome = record(value);
  if (
    !outcome ||
    !exactKeys(outcome, [
      'terminal',
      'queuedClaim',
      'sameWorkerContinuation',
      'workerReclaim',
      'workerRecoveryExhausted',
    ]) ||
    !Object.values(outcome).every(integer)
  )
    return false;
  return (
    (outcome.terminal as number) +
      (outcome.queuedClaim as number) +
      (outcome.sameWorkerContinuation as number) +
      (outcome.workerReclaim as number) +
      (outcome.workerRecoveryExhausted as number) ===
    executionCount
  );
};

const validRpo = (value: unknown, cutoverAt: number): boolean => {
  const rpo = record(value);
  if (!rpo || typeof rpo.kind !== 'string') return false;
  if (rpo.kind === 'exact-replicated-checkpoint')
    return exactKeys(rpo, ['kind', 'maximumMs']) && rpo.maximumMs === 0;
  return (
    rpo.kind === 'attested-upper-bound' &&
    exactKeys(rpo, [
      'kind',
      'maximumMs',
      'lastReplicatedAt',
      'fenceDigest',
      'attestationDigest',
    ]) &&
    integer(rpo.maximumMs) &&
    integer(rpo.lastReplicatedAt) &&
    (rpo.lastReplicatedAt as number) <= cutoverAt &&
    rpo.maximumMs === cutoverAt - (rpo.lastReplicatedAt as number) &&
    typeof rpo.fenceDigest === 'string' &&
    digestPattern.test(rpo.fenceDigest) &&
    typeof rpo.attestationDigest === 'string' &&
    digestPattern.test(rpo.attestationDigest)
  );
};

const validTiming = (value: unknown): boolean => {
  const timing = record(value);
  return (
    timing !== undefined &&
    exactKeys(timing, [
      'initiatedAt',
      'cutoverAt',
      'preparedAt',
      'rtoStartedAt',
      'measuredRtoMs',
      'measurementBoundary',
    ]) &&
    integer(timing.initiatedAt) &&
    integer(timing.cutoverAt) &&
    integer(timing.preparedAt) &&
    integer(timing.rtoStartedAt) &&
    integer(timing.measuredRtoMs) &&
    (timing.initiatedAt as number) <= (timing.cutoverAt as number) &&
    (timing.cutoverAt as number) <= (timing.preparedAt as number) &&
    (timing.rtoStartedAt as number) <= (timing.preparedAt as number) &&
    timing.measuredRtoMs ===
      (timing.preparedAt as number) - (timing.rtoStartedAt as number) &&
    timing.measurementBoundary === 'operator-prepared-before-traffic-commit'
  );
};

export const readRemoteExecutionRegionalRecoveryOperatorEvidence = (
  value: unknown
): RemoteExecutionRegionalRecoveryOperatorEvidence => {
  const evidence = record(value);
  if (
    !evidence ||
    !exactKeys(evidence, [
      'format',
      'version',
      'evidenceDigest',
      'operationId',
      'mode',
      'deploymentId',
      'sourceRegionId',
      'targetRegionId',
      'sourceTrafficEpoch',
      'targetTrafficEpoch',
      'executionCount',
      'executionSetDigest',
      'targetCheckpointDigest',
      'cutoverCheckpointDigest',
      'authorizationGrantDigest',
      'principalDigest',
      'outcomes',
      'rpo',
      'timing',
    ]) ||
    evidence.format !== REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT ||
    evidence.version !== REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION ||
    (evidence.mode !== 'planned' && evidence.mode !== 'source-unavailable') ||
    !canonicalIdentifier(evidence.operationId) ||
    !canonicalIdentifier(evidence.deploymentId) ||
    !canonicalIdentifier(evidence.sourceRegionId) ||
    !canonicalIdentifier(evidence.targetRegionId) ||
    evidence.sourceRegionId === evidence.targetRegionId ||
    !integer(evidence.sourceTrafficEpoch) ||
    (evidence.sourceTrafficEpoch as number) < 1 ||
    evidence.targetTrafficEpoch !==
      (evidence.sourceTrafficEpoch as number) + 1 ||
    !integer(evidence.executionCount) ||
    (evidence.executionCount as number) < 1 ||
    (evidence.executionCount as number) >
      REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_LIMITS.maximumBatchSize ||
    ![
      evidence.evidenceDigest,
      evidence.executionSetDigest,
      evidence.targetCheckpointDigest,
      evidence.cutoverCheckpointDigest,
      evidence.authorizationGrantDigest,
      evidence.principalDigest,
    ].every(
      (entry) => typeof entry === 'string' && digestPattern.test(entry)
    ) ||
    !validOutcomes(evidence.outcomes, evidence.executionCount as number) ||
    !validTiming(evidence.timing)
  )
    throw new TypeError('Remote regional recovery evidence is invalid.');
  const timing = evidence.timing as Readonly<Record<string, unknown>>;
  if (
    !validRpo(evidence.rpo, timing.cutoverAt as number) ||
    (evidence.mode === 'planned' &&
      (evidence.rpo as Readonly<Record<string, unknown>>).kind !==
        'exact-replicated-checkpoint') ||
    (evidence.mode === 'source-unavailable' &&
      (evidence.rpo as Readonly<Record<string, unknown>>).kind !==
        'attested-upper-bound')
  )
    throw new TypeError('Remote regional recovery evidence is invalid.');
  const { evidenceDigest, ...unsigned } = evidence;
  if (evidenceDigest !== digest(unsigned))
    throw new TypeError('Remote regional recovery evidence is invalid.');
  return Object.freeze(
    evidence
  ) as RemoteExecutionRegionalRecoveryOperatorEvidence;
};

export const decodeRemoteExecutionRegionalRecoveryOperatorEvidence = (
  serialized: string
): RemoteExecutionRegionalRecoveryOperatorEvidence => {
  if (
    typeof serialized !== 'string' ||
    serialized.length < 2 ||
    utf8ToBytes(serialized).byteLength > maximumEvidenceBytes
  )
    throw new TypeError('Remote regional recovery evidence is invalid.');
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new TypeError('Remote regional recovery evidence is invalid.');
  }
  return readRemoteExecutionRegionalRecoveryOperatorEvidence(value);
};

export const encodeRemoteExecutionRegionalRecoveryOperatorEvidence = (
  evidence: RemoteExecutionRegionalRecoveryOperatorEvidence
): string =>
  `${stableJson(readRemoteExecutionRegionalRecoveryOperatorEvidence(evidence))}\n`;
