import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS,
  isAgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
  isAgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord,
  isAgentEvaluationCapabilityEffectProviderJournalResultRecord,
  isAgentEvaluationCapabilityEffectProviderJournalStageRecord,
  type AgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
  type AgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord,
  type AgentEvaluationCapabilityEffectProviderJournalExecutionWrite,
  type AgentEvaluationCapabilityEffectProviderJournalResultRecord,
  type AgentEvaluationCapabilityEffectProviderJournalStageRecord,
} from './agentEvaluationCapabilityEffectProviderJournal';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
  createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority,
  isAgentEvaluationCapabilityEffectProviderSpoolAad,
} from './agentEvaluationCapabilityEffectProviderJournalSpool';
import { isAgentEvaluationProviderResultSpoolEnvelope } from './agentEvaluationEvidenceAuthenticity';
import type { AgentEvaluationProviderResultSpoolEnvelope } from './agentEvaluationEvidenceAuthenticity.types';

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE_HEADER =
  'X-Prodivix-Capability-Effect-Provider-Journal-Purpose' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE =
  'capability-effect-provider-journal-owner' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ROUTE_SEGMENT =
  'capability-effect-provider-runtime-journal' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_HEALTH_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-journal-health' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SNAPSHOT_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-journal-snapshot' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_RESUMABLE_SPOOL_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-journal-resumable-spool' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_CLEANUP_REQUEST_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-journal-cleanup-request' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_CLEANUP_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-journal-cleanup-receipt' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ZERO_RESIDUAL_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-journal-zero-residual-receipt' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-journal-authority' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY_ID =
  'authority.g4-model-eval.capability-effect-provider-runtime-journal.v1' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION =
  1 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_HEALTH_MAXIMUM_LIFETIME_MS =
  125_000 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS =
  Object.freeze({
    maximumHealthBytes: 16_384,
    maximumSnapshotBytes: 2_621_440,
    maximumCleanupBytes: 131_072,
    maximumZeroResidualBytes: 16_384,
  } as const);

const providerJournalAuthorityPreimage = Object.freeze({
  format: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY_FORMAT,
  version:
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION,
  authorityId: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY_ID,
  purpose: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE,
  routeSegment:
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ROUTE_SEGMENT,
  maximumOwnerRequests:
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumOwnerRequestsPerArchive,
  maximumExecutionsPerOwnerRequest:
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionsPerOwnerRequest,
  retentionPolicyDigest:
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
});
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY =
  Object.freeze({
    ...providerJournalAuthorityPreimage,
    authorityDigest: digestAgentCanonicalValue(
      providerJournalAuthorityPreimage
    ),
  });

export type AgentEvaluationCapabilityEffectProviderJournalHealth = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_HEALTH_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION;
  authorityId: string;
  authorityDigest: CanonicalDigest;
  ownerInstanceId: string;
  retentionPolicyDigest: CanonicalDigest;
  status: 'healthy' | 'unavailable';
  residualEncryptedSpoolCount: number;
  expiredEncryptedSpoolCount: number;
  unfinishedOwnerCount: number;
  overdueUnfinishedOwnerCount: number;
  abandonedOwnerCount: number;
  checkedAt: Instant;
  expiresAt: Instant;
  healthDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityEffectProviderJournalResumableSpool =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_RESUMABLE_SPOOL_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION;
    executionSequence: number;
    executionRecordDigest: CanonicalDigest;
    spoolAadDigest: CanonicalDigest;
    spoolEnvelope: AgentEvaluationProviderResultSpoolEnvelope;
    spoolDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityEffectProviderJournalSnapshot = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SNAPSHOT_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION;
  ownerRequestDigest: CanonicalDigest;
  stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord;
  executionRecords: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[];
  resultRecord: AgentEvaluationCapabilityEffectProviderJournalResultRecord | null;
  abandonmentRecord: AgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord | null;
  resumableSpools: readonly AgentEvaluationCapabilityEffectProviderJournalResumableSpool[];
  readAt: Instant;
  snapshotDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityEffectProviderJournalCleanupRequest =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_CLEANUP_REQUEST_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION;
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    attemptId: string;
    reason: 'attempt-terminal' | 'cleanup-requested' | 'stage-expired';
    requestedAt: Instant;
    requestDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityEffectProviderJournalCleanupReceipt =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_CLEANUP_RECEIPT_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION;
    requestDigest: CanonicalDigest;
    destroyedEncryptedSpoolCount: number;
    abandonmentDispositionReceiptDigests: readonly CanonicalDigest[];
    abandonmentRecordDigests: readonly CanonicalDigest[];
    residualEncryptedSpoolCount: 0;
    unfinishedOwnerCount: 0;
    completedAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ZERO_RESIDUAL_RECEIPT_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION;
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    attemptId: string;
    journalAuthorityDigest: CanonicalDigest;
    residualEncryptedSpoolCount: 0;
    unfinishedOwnerCount: 0;
    abandonedSpoolCount: number;
    abandonedOwnerCount: number;
    checkedAt: Instant;
    expiresAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

/** POST /stages accepts this raw exact record. */
export type AgentEvaluationCapabilityEffectProviderJournalStageIngress =
  AgentEvaluationCapabilityEffectProviderJournalStageRecord;
/** POST /executions accepts this raw exact write, including the opaque ciphertext sidecar. */
export type AgentEvaluationCapabilityEffectProviderJournalExecutionIngress =
  AgentEvaluationCapabilityEffectProviderJournalExecutionWrite;
/** POST /results accepts this raw exact record and atomically destroys its spools. */
export type AgentEvaluationCapabilityEffectProviderJournalResultIngress =
  AgentEvaluationCapabilityEffectProviderJournalResultRecord;
/** Successful stage POSTs return the persisted exact record. */
export type AgentEvaluationCapabilityEffectProviderJournalStageIngressReceipt =
  AgentEvaluationCapabilityEffectProviderJournalStageRecord;
/** Successful execution POSTs return the durable record without echoing ciphertext. */
export type AgentEvaluationCapabilityEffectProviderJournalExecutionIngressReceipt =
  AgentEvaluationCapabilityEffectProviderJournalExecutionRecord;
/** Successful result POSTs return the persisted terminal exact record. */
export type AgentEvaluationCapabilityEffectProviderJournalResultIngressReceipt =
  AgentEvaluationCapabilityEffectProviderJournalResultRecord;

export type AgentEvaluationCapabilityEffectProviderJournalPartitionScope =
  Readonly<{
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
  }>;

export type AgentEvaluationCapabilityEffectProviderJournalRoutes = Readonly<{
  health: string;
  stages: string;
  executions: string;
  results: string;
  ownerRequest: (ownerRequestDigest: CanonicalDigest) => string;
  cleanup: string;
  zeroResidual: (attemptId: string) => string;
}>;

/** Canonical 8790 paths; callers prepend the configured loopback authority. */
export const createAgentEvaluationCapabilityEffectProviderJournalRoutes = (
  scope: AgentEvaluationCapabilityEffectProviderJournalPartitionScope
): AgentEvaluationCapabilityEffectProviderJournalRoutes => {
  if (
    !isAgentControlIdentity(scope.namespaceId) ||
    !isAgentCanonicalDigest(scope.planDigest) ||
    !commitPattern.test(scope.repositoryCommit)
  ) {
    throw new TypeError(
      'Capability effect Provider journal route scope is invalid.'
    );
  }
  const namespaceSegment = encodeURIComponent(scope.namespaceId);
  const health = `/v1/evaluations/${namespaceSegment}/${AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ROUTE_SEGMENT}/health`;
  const partition = `/v1/evaluations/${namespaceSegment}/${encodeURIComponent(scope.planDigest)}/${scope.repositoryCommit}/${AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ROUTE_SEGMENT}`;
  return Object.freeze({
    health,
    stages: `${partition}/stages`,
    executions: `${partition}/executions`,
    results: `${partition}/results`,
    ownerRequest: (ownerRequestDigest: CanonicalDigest): string => {
      if (!isAgentCanonicalDigest(ownerRequestDigest)) {
        throw new TypeError(
          'Capability effect Provider journal owner request route is invalid.'
        );
      }
      return `${partition}/owner-requests/${encodeURIComponent(ownerRequestDigest)}`;
    },
    cleanup: `${partition}/cleanup`,
    zeroResidual: (attemptId: string): string => {
      if (!isAgentControlIdentity(attemptId)) {
        throw new TypeError(
          'Capability effect Provider journal zero-residual route is invalid.'
        );
      }
      return `${partition}/attempts/${encodeURIComponent(attemptId)}/zero-residual`;
    },
  });
};

const healthKeys = Object.freeze([
  'format',
  'version',
  'authorityId',
  'authorityDigest',
  'ownerInstanceId',
  'retentionPolicyDigest',
  'status',
  'residualEncryptedSpoolCount',
  'expiredEncryptedSpoolCount',
  'unfinishedOwnerCount',
  'overdueUnfinishedOwnerCount',
  'abandonedOwnerCount',
  'checkedAt',
  'expiresAt',
  'healthDigest',
] as const);
const resumableSpoolKeys = Object.freeze([
  'format',
  'version',
  'executionSequence',
  'executionRecordDigest',
  'spoolAadDigest',
  'spoolEnvelope',
  'spoolDigest',
] as const);
const snapshotKeys = Object.freeze([
  'format',
  'version',
  'ownerRequestDigest',
  'stageRecord',
  'executionRecords',
  'resultRecord',
  'abandonmentRecord',
  'resumableSpools',
  'readAt',
  'snapshotDigest',
] as const);
const cleanupRequestKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'reason',
  'requestedAt',
  'requestDigest',
] as const);
const cleanupReceiptKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'destroyedEncryptedSpoolCount',
  'abandonmentDispositionReceiptDigests',
  'abandonmentRecordDigests',
  'residualEncryptedSpoolCount',
  'unfinishedOwnerCount',
  'completedAt',
  'receiptDigest',
] as const);
const zeroResidualKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'journalAuthorityDigest',
  'residualEncryptedSpoolCount',
  'unfinishedOwnerCount',
  'abandonedSpoolCount',
  'abandonedOwnerCount',
  'checkedAt',
  'expiresAt',
  'receiptDigest',
] as const);

const commitPattern = /^[0-9a-f]{40}$/u;

const safe = (value: unknown, maximumBytes: number): boolean => {
  try {
    return (
      inspectAgentControlJson(value, maximumBytes).length === 0 &&
      !containsAgentControlCredentialLikeText(canonicalJsonText(value))
    );
  } catch {
    return false;
  }
};

const count = (value: unknown, maximum = 23_520): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= maximum;

const selfDigest = (
  value: Readonly<Record<string, unknown>>,
  key: 'healthDigest' | 'requestDigest' | 'receiptDigest' | 'snapshotDigest'
): boolean => {
  const digest = value[key];
  if (!isAgentCanonicalDigest(digest)) return false;
  const base = { ...value };
  delete base[key];
  return digest === digestAgentCanonicalValue(base);
};

const validFreshWindow = (checkedAt: unknown, expiresAt: unknown): boolean =>
  isAgentControlInstant(checkedAt) &&
  isAgentControlInstant(expiresAt) &&
  Date.parse(expiresAt) > Date.parse(checkedAt) &&
  Date.parse(expiresAt) - Date.parse(checkedAt) <=
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_HEALTH_MAXIMUM_LIFETIME_MS;

export type CreateAgentEvaluationCapabilityEffectProviderJournalHealthInput =
  Omit<
    AgentEvaluationCapabilityEffectProviderJournalHealth,
    'format' | 'version' | 'healthDigest'
  >;

export const createAgentEvaluationCapabilityEffectProviderJournalHealth = (
  input: CreateAgentEvaluationCapabilityEffectProviderJournalHealthInput
): AgentEvaluationCapabilityEffectProviderJournalHealth => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_HEALTH_FORMAT,
    version:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION,
    ...input,
  });
  const health = Object.freeze({
    ...base,
    healthDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationCapabilityEffectProviderJournalHealth(health)) {
    throw new TypeError(
      'Capability effect Provider journal health is invalid.'
    );
  }
  return health;
};

export const isAgentEvaluationCapabilityEffectProviderJournalHealth = (
  value: unknown
): value is AgentEvaluationCapabilityEffectProviderJournalHealth => {
  if (!hasExactAgentControlKeys(value, healthKeys)) return false;
  const health = value as AgentEvaluationCapabilityEffectProviderJournalHealth;
  return (
    health.format ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_HEALTH_FORMAT &&
    health.version ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION &&
    health.authorityId ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityId &&
    health.authorityDigest ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityDigest &&
    isAgentControlIdentity(health.ownerInstanceId) &&
    health.retentionPolicyDigest ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST &&
    ['healthy', 'unavailable'].includes(health.status) &&
    count(health.residualEncryptedSpoolCount) &&
    count(health.expiredEncryptedSpoolCount) &&
    count(health.unfinishedOwnerCount, 5_880) &&
    count(health.overdueUnfinishedOwnerCount, 5_880) &&
    count(health.abandonedOwnerCount, 5_880) &&
    health.expiredEncryptedSpoolCount <= health.residualEncryptedSpoolCount &&
    health.overdueUnfinishedOwnerCount <= health.unfinishedOwnerCount &&
    (health.status === 'healthy') ===
      (health.expiredEncryptedSpoolCount === 0 &&
        health.overdueUnfinishedOwnerCount === 0) &&
    validFreshWindow(health.checkedAt, health.expiresAt) &&
    selfDigest(health, 'healthDigest') &&
    safe(
      health,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS.maximumHealthBytes
    )
  );
};

const createResumableSpool = (
  execution: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
  spoolEnvelope: AgentEvaluationProviderResultSpoolEnvelope
): AgentEvaluationCapabilityEffectProviderJournalResumableSpool => {
  if (
    execution.spoolAad === null ||
    execution.spoolEnvelopeAuthority === null ||
    !isAgentEvaluationCapabilityEffectProviderSpoolAad(execution.spoolAad) ||
    !isAgentEvaluationProviderResultSpoolEnvelope(spoolEnvelope) ||
    !sameCanonicalJson(
      createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
        spoolEnvelope
      ),
      execution.spoolEnvelopeAuthority
    )
  ) {
    throw new TypeError(
      'Capability effect Provider journal resumable spool is invalid.'
    );
  }
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_RESUMABLE_SPOOL_FORMAT,
    version:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION,
    executionSequence: execution.executionSequence,
    executionRecordDigest: execution.recordDigest,
    spoolAadDigest: digestAgentCanonicalValue(execution.spoolAad),
    spoolEnvelope,
  });
  return Object.freeze({
    ...base,
    spoolDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentEvaluationCapabilityEffectProviderJournalResumableSpool = (
  value: unknown,
  execution: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord
): value is AgentEvaluationCapabilityEffectProviderJournalResumableSpool => {
  if (
    !hasExactAgentControlKeys(value, resumableSpoolKeys) ||
    !isAgentEvaluationProviderResultSpoolEnvelope(value.spoolEnvelope)
  ) {
    return false;
  }
  try {
    return sameCanonicalJson(
      value,
      createResumableSpool(execution, value.spoolEnvelope)
    );
  } catch {
    return false;
  }
};

export const createAgentEvaluationCapabilityEffectProviderJournalSnapshot = (
  input: Readonly<{
    stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord;
    executionRecords: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[];
    resultRecord: AgentEvaluationCapabilityEffectProviderJournalResultRecord | null;
    abandonmentRecord: AgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord | null;
    resumableSpoolEnvelopes: readonly AgentEvaluationProviderResultSpoolEnvelope[];
    readAt: Instant;
  }>
): AgentEvaluationCapabilityEffectProviderJournalSnapshot => {
  if (
    !isAgentEvaluationCapabilityEffectProviderJournalStageRecord(
      input.stageRecord
    )
  ) {
    throw new TypeError(
      'Capability effect Provider journal snapshot stage is invalid.'
    );
  }
  let prior: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord | null =
    null;
  for (const execution of input.executionRecords) {
    if (
      !isAgentEvaluationCapabilityEffectProviderJournalExecutionRecord(
        execution,
        input.stageRecord,
        prior
      )
    ) {
      throw new TypeError(
        'Capability effect Provider journal snapshot execution chain is invalid.'
      );
    }
    prior = execution;
  }
  if (
    (input.resultRecord !== null && input.abandonmentRecord !== null) ||
    (input.resultRecord !== null &&
      !isAgentEvaluationCapabilityEffectProviderJournalResultRecord(
        input.resultRecord,
        input.stageRecord,
        input.executionRecords
      )) ||
    (input.abandonmentRecord !== null &&
      !isAgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord(
        input.abandonmentRecord,
        input.stageRecord,
        input.executionRecords
      )) ||
    !isAgentControlInstant(input.readAt)
  ) {
    throw new TypeError(
      'Capability effect Provider journal snapshot is invalid.'
    );
  }
  const spoolExecutions = input.executionRecords.filter(
    (execution) => execution.spoolAad !== null
  );
  const terminal =
    input.resultRecord !== null || input.abandonmentRecord !== null;
  const latestJournalAt =
    input.abandonmentRecord?.abandonedAt ??
    input.resultRecord?.sealedAt ??
    input.executionRecords.at(-1)?.sealedAt ??
    input.stageRecord.sealedAt;
  if (
    Date.parse(input.readAt) < Date.parse(latestJournalAt) ||
    (!terminal &&
      (Date.parse(input.readAt) >=
        Date.parse(input.stageRecord.stageRequest.expiresAt) ||
        spoolExecutions.some((execution) => {
          const receipt = execution.executionReceipt.resultSpoolReceipt;
          return (
            receipt === null ||
            Date.parse(input.readAt) >= Date.parse(receipt.expiresAt)
          );
        })))
  ) {
    throw new TypeError(
      'Capability effect Provider journal snapshot lifetime drifted.'
    );
  }
  const resumableSpools = !terminal
    ? Object.freeze(
        input.resumableSpoolEnvelopes.map((envelope, index) =>
          createResumableSpool(spoolExecutions[index]!, envelope)
        )
      )
    : Object.freeze([]);
  if (
    (!terminal &&
      input.resumableSpoolEnvelopes.length !== spoolExecutions.length) ||
    (terminal && input.resumableSpoolEnvelopes.length !== 0)
  ) {
    throw new TypeError(
      'Capability effect Provider journal snapshot spool lifecycle drifted.'
    );
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SNAPSHOT_FORMAT,
    version:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION,
    ownerRequestDigest: input.stageRecord.ownerRequestDigest,
    stageRecord: input.stageRecord,
    executionRecords: Object.freeze([...input.executionRecords]),
    resultRecord: input.resultRecord,
    abandonmentRecord: input.abandonmentRecord,
    resumableSpools,
    readAt: input.readAt,
  });
  const snapshot = Object.freeze({
    ...base,
    snapshotDigest: digestAgentCanonicalValue(base),
  });
  if (
    inspectAgentControlJson(
      snapshot,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS.maximumSnapshotBytes
    ).length > 0
  ) {
    throw new TypeError(
      'Capability effect Provider journal snapshot is unbounded.'
    );
  }
  return snapshot;
};

export const isAgentEvaluationCapabilityEffectProviderJournalSnapshot = (
  value: unknown
): value is AgentEvaluationCapabilityEffectProviderJournalSnapshot => {
  if (!hasExactAgentControlKeys(value, snapshotKeys)) return false;
  const snapshot =
    value as AgentEvaluationCapabilityEffectProviderJournalSnapshot;
  try {
    return sameCanonicalJson(
      snapshot,
      createAgentEvaluationCapabilityEffectProviderJournalSnapshot({
        stageRecord: snapshot.stageRecord,
        executionRecords: snapshot.executionRecords,
        resultRecord: snapshot.resultRecord,
        abandonmentRecord: snapshot.abandonmentRecord,
        resumableSpoolEnvelopes: snapshot.resumableSpools.map(
          (spool) => spool.spoolEnvelope
        ),
        readAt: snapshot.readAt,
      })
    );
  } catch {
    return false;
  }
};

export type CreateAgentEvaluationCapabilityEffectProviderJournalCleanupRequestInput =
  Omit<
    AgentEvaluationCapabilityEffectProviderJournalCleanupRequest,
    'format' | 'version' | 'requestDigest'
  >;

export const createAgentEvaluationCapabilityEffectProviderJournalCleanupRequest =
  (
    input: CreateAgentEvaluationCapabilityEffectProviderJournalCleanupRequestInput
  ): AgentEvaluationCapabilityEffectProviderJournalCleanupRequest => {
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_CLEANUP_REQUEST_FORMAT,
      version:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION,
      ...input,
    });
    const request = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentEvaluationCapabilityEffectProviderJournalCleanupRequest(request)
    ) {
      throw new TypeError(
        'Capability effect Provider journal cleanup request is invalid.'
      );
    }
    return request;
  };

export const isAgentEvaluationCapabilityEffectProviderJournalCleanupRequest = (
  value: unknown
): value is AgentEvaluationCapabilityEffectProviderJournalCleanupRequest => {
  if (!hasExactAgentControlKeys(value, cleanupRequestKeys)) return false;
  const request =
    value as AgentEvaluationCapabilityEffectProviderJournalCleanupRequest;
  return (
    request.format ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_CLEANUP_REQUEST_FORMAT &&
    request.version ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION &&
    isAgentControlIdentity(request.namespaceId) &&
    isAgentCanonicalDigest(request.planDigest) &&
    commitPattern.test(request.repositoryCommit) &&
    isAgentControlIdentity(request.attemptId) &&
    ['attempt-terminal', 'cleanup-requested', 'stage-expired'].includes(
      request.reason
    ) &&
    isAgentControlInstant(request.requestedAt) &&
    selfDigest(request, 'requestDigest') &&
    safe(
      request,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS.maximumCleanupBytes
    )
  );
};

export const createAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt =
  (
    input: Omit<
      AgentEvaluationCapabilityEffectProviderJournalCleanupReceipt,
      'format' | 'version' | 'receiptDigest'
    >
  ): AgentEvaluationCapabilityEffectProviderJournalCleanupReceipt => {
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_CLEANUP_RECEIPT_FORMAT,
      version:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION,
      ...input,
      abandonmentDispositionReceiptDigests: Object.freeze([
        ...input.abandonmentDispositionReceiptDigests,
      ]),
      abandonmentRecordDigests: Object.freeze([
        ...input.abandonmentRecordDigests,
      ]),
    });
    const receipt = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt(receipt)
    ) {
      throw new TypeError(
        'Capability effect Provider journal cleanup receipt is invalid.'
      );
    }
    return receipt;
  };

export const isAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt = (
  value: unknown
): value is AgentEvaluationCapabilityEffectProviderJournalCleanupReceipt => {
  if (!hasExactAgentControlKeys(value, cleanupReceiptKeys)) return false;
  const receipt =
    value as AgentEvaluationCapabilityEffectProviderJournalCleanupReceipt;
  return (
    receipt.format ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_CLEANUP_RECEIPT_FORMAT &&
    receipt.version ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION &&
    isAgentCanonicalDigest(receipt.requestDigest) &&
    count(receipt.destroyedEncryptedSpoolCount) &&
    Array.isArray(receipt.abandonmentDispositionReceiptDigests) &&
    receipt.abandonmentDispositionReceiptDigests.length ===
      receipt.destroyedEncryptedSpoolCount &&
    receipt.abandonmentDispositionReceiptDigests.every(
      (digest, index, values) =>
        isAgentCanonicalDigest(digest) &&
        (index === 0 ||
          compareUnicodeCodePoints(values[index - 1]!, digest) < 0)
    ) &&
    Array.isArray(receipt.abandonmentRecordDigests) &&
    count(receipt.abandonmentRecordDigests.length, 5_880) &&
    receipt.abandonmentRecordDigests.every(
      (digest, index, values) =>
        isAgentCanonicalDigest(digest) &&
        (index === 0 ||
          compareUnicodeCodePoints(values[index - 1]!, digest) < 0)
    ) &&
    receipt.destroyedEncryptedSpoolCount <=
      4 * receipt.abandonmentRecordDigests.length &&
    receipt.residualEncryptedSpoolCount === 0 &&
    receipt.unfinishedOwnerCount === 0 &&
    isAgentControlInstant(receipt.completedAt) &&
    selfDigest(receipt, 'receiptDigest') &&
    safe(
      receipt,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS.maximumCleanupBytes
    )
  );
};

export const doesAgentEvaluationCapabilityEffectProviderJournalCleanupReceiptMatchRequest =
  (
    request: AgentEvaluationCapabilityEffectProviderJournalCleanupRequest,
    receipt: AgentEvaluationCapabilityEffectProviderJournalCleanupReceipt
  ): boolean =>
    isAgentEvaluationCapabilityEffectProviderJournalCleanupRequest(request) &&
    isAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt(receipt) &&
    receipt.requestDigest === request.requestDigest &&
    Date.parse(receipt.completedAt) >= Date.parse(request.requestedAt);

export const createAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt =
  (
    input: Omit<
      AgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt,
      'format' | 'version' | 'receiptDigest'
    >
  ): AgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt => {
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ZERO_RESIDUAL_RECEIPT_FORMAT,
      version:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION,
      ...input,
    });
    const receipt = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt(
        receipt
      )
    ) {
      throw new TypeError(
        'Capability effect Provider journal zero-residual receipt is invalid.'
      );
    }
    return receipt;
  };

export const isAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt =
  (
    value: unknown
  ): value is AgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt => {
    if (!hasExactAgentControlKeys(value, zeroResidualKeys)) return false;
    const receipt =
      value as AgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt;
    return (
      receipt.format ===
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ZERO_RESIDUAL_RECEIPT_FORMAT &&
      receipt.version ===
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_VERSION &&
      isAgentControlIdentity(receipt.namespaceId) &&
      isAgentCanonicalDigest(receipt.planDigest) &&
      commitPattern.test(receipt.repositoryCommit) &&
      isAgentControlIdentity(receipt.attemptId) &&
      receipt.journalAuthorityDigest ===
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityDigest &&
      receipt.residualEncryptedSpoolCount === 0 &&
      receipt.unfinishedOwnerCount === 0 &&
      count(receipt.abandonedSpoolCount) &&
      count(receipt.abandonedOwnerCount, 5_880) &&
      receipt.abandonedSpoolCount <= 4 * receipt.abandonedOwnerCount &&
      validFreshWindow(receipt.checkedAt, receipt.expiresAt) &&
      selfDigest(receipt, 'receiptDigest') &&
      safe(
        receipt,
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS.maximumZeroResidualBytes
      )
    );
  };
