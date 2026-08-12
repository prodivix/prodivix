import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentHostedRetrievalRuntimeResourceAuthoritySet,
  isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  isAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  isAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  isAgentHostedRetrievalRuntimeResourceRegistrationResult,
  isAgentHostedRetrievalRuntimeResourceSetCommitment,
  matchAgentHostedRetrievalRuntimeResourceSetCommitment,
  type AgentHostedRetrievalRuntimeResourceAuthoritySet,
  type AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  type AgentHostedRetrievalRuntimeResourceRecoveryCursor,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';

export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PREPARED_ARTIFACT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-prepared-artifact' as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARTIFACT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-artifact' as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_ARTIFACT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-artifact' as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARTIFACT_VERSION =
  1 as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARTIFACT_MAXIMUM_BYTES =
  16_777_216 as const;

type Common = Readonly<{
  version: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARTIFACT_VERSION;
  namespaceId: string;
  repositoryCommit: string;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  lifecycleOwnerInstanceId: string;
  completedAt: Instant;
  resultDigest: CanonicalDigest;
}>;

export type ProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact =
  Common &
    Readonly<{
      format: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PREPARED_ARTIFACT_FORMAT;
      role: 'prepare';
      registrationResults: readonly AgentHostedRetrievalRuntimeResourceRegistrationResult[];
      authoritySet: AgentHostedRetrievalRuntimeResourceAuthoritySet;
      resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment;
      journalArchiveRecords: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[];
      budgetClosureProjections: readonly AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection[];
    }>;

type CleanTerminus = Readonly<{
  terminalHealthReceipt: AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt;
  closureStatus: 'zeroed';
}>;

export type ProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact =
  Common &
    CleanTerminus &
    Readonly<{
      format: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARTIFACT_FORMAT;
      role: 'cleanup';
      cleanupResults: readonly unknown[];
      cleanupArchiveRecords: readonly AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord[];
      journalArchiveRecords: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[];
      lifecycleArchiveFamily: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily;
    }>;

export type ProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact =
  Common &
    CleanTerminus &
    Readonly<{
      format: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_ARTIFACT_FORMAT;
      role: 'recovery';
      recoveredCleanupResults: readonly unknown[];
      recoveredCleanupArchiveRecords: readonly AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord[];
      journalArchiveRecords: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[];
      lifecycleArchiveFamily: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily | null;
      nextCursor: AgentHostedRetrievalRuntimeResourceRecoveryCursor | null;
    }>;

export type ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleArtifact =
  | ProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact
  | ProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact
  | ProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact;

const commitPattern = /^[0-9a-f]{40}$/u;
const commonKeys = Object.freeze([
  'format',
  'version',
  'role',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'lifecycleOwnerInstanceId',
  'completedAt',
  'resultDigest',
] as const);
const preparedKeys = Object.freeze([
  ...commonKeys,
  'registrationResults',
  'authoritySet',
  'resourceSetCommitment',
  'journalArchiveRecords',
  'budgetClosureProjections',
] as const);
const cleanupKeys = Object.freeze([
  ...commonKeys,
  'cleanupResults',
  'cleanupArchiveRecords',
  'journalArchiveRecords',
  'lifecycleArchiveFamily',
  'terminalHealthReceipt',
  'closureStatus',
] as const);
const recoveryKeys = Object.freeze([
  ...commonKeys,
  'recoveredCleanupResults',
  'recoveredCleanupArchiveRecords',
  'journalArchiveRecords',
  'lifecycleArchiveFamily',
  'terminalHealthReceipt',
  'closureStatus',
  'nextCursor',
] as const);

const exactKeys = (value: unknown, keys: readonly string[]): boolean =>
  isPlainObject(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

const selfDigest = (value: Readonly<Record<string, unknown>>): boolean => {
  const { resultDigest, ...base } = value;
  return (
    isAgentCanonicalDigest(resultDigest) &&
    resultDigest === digestAgentCanonicalValue(base)
  );
};

const safe = (value: unknown): boolean => {
  try {
    return (
      Buffer.byteLength(canonicalJsonText(value), 'utf8') <=
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARTIFACT_MAXIMUM_BYTES
    );
  } catch {
    return false;
  }
};

const validCommon = (
  value: Readonly<Record<string, unknown>>,
  role: 'cleanup' | 'prepare' | 'recovery'
): boolean =>
  value.version ===
    AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARTIFACT_VERSION &&
  value.role === role &&
  isAgentControlIdentity(value.namespaceId) &&
  commitPattern.test(value.repositoryCommit as string) &&
  [
    value.planDigest,
    value.frozenRunDigest,
    value.runConfigArtifactBindingDigest,
  ].every(isAgentCanonicalDigest) &&
  isAgentControlIdentity(value.runtimeResourceSetId) &&
  isAgentControlIdentity(value.lifecycleOwnerInstanceId) &&
  isAgentControlInstant(value.completedAt) &&
  selfDigest(value) &&
  safe(value);

const recordScopeMatches = (
  record: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  value: Common
): boolean => {
  const intent = record.journalRecord.dispatchIntentSet.intents[0];
  return (
    intent?.namespaceId === value.namespaceId &&
    intent.repositoryCommit === value.repositoryCommit &&
    intent.planDigest === value.planDigest &&
    intent.frozenRunDigest === value.frozenRunDigest &&
    intent.runConfigArtifactBindingDigest ===
      value.runConfigArtifactBindingDigest &&
    intent.runtimeResourceSetId === value.runtimeResourceSetId
  );
};

const cleanTerminus = (
  value: Readonly<Record<string, unknown>> & Partial<CleanTerminus>
): boolean => {
  if (
    value.closureStatus !== 'zeroed' ||
    !isAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(
      value.terminalHealthReceipt
    )
  ) {
    return false;
  }
  const summary = value.terminalHealthReceipt.storageSummary;
  return (
    value.terminalHealthReceipt.namespaceId === value.namespaceId &&
    summary.activeResourceCount === 0 &&
    summary.activeReadLeaseCount === 0 &&
    summary.unfinishedCleanupCount === 0 &&
    summary.overdueCount === 0
  );
};

export const isProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact =
  (
    value: unknown
  ): value is ProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact => {
    if (!exactKeys(value, preparedKeys)) return false;
    const artifact =
      value as ProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact;
    return (
      artifact.format ===
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PREPARED_ARTIFACT_FORMAT &&
      validCommon(artifact, 'prepare') &&
      artifact.registrationResults.length ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT &&
      artifact.registrationResults.every(
        isAgentHostedRetrievalRuntimeResourceRegistrationResult
      ) &&
      isAgentHostedRetrievalRuntimeResourceAuthoritySet(
        artifact.authoritySet
      ) &&
      isAgentHostedRetrievalRuntimeResourceSetCommitment(
        artifact.resourceSetCommitment
      ) &&
      matchAgentHostedRetrievalRuntimeResourceSetCommitment(
        artifact.resourceSetCommitment,
        artifact.authoritySet
      ) &&
      artifact.registrationResults.every((result, index) =>
        sameCanonicalJson(
          result.authority,
          artifact.authoritySet.authorities[index]
        )
      ) &&
      artifact.journalArchiveRecords.length ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT &&
      artifact.journalArchiveRecords.every(
        (record) =>
          isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord(
            record
          ) &&
          record.journalRecord.operation === 'create' &&
          recordScopeMatches(record, artifact)
      ) &&
      artifact.budgetClosureProjections.length ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT &&
      artifact.budgetClosureProjections.every(
        isAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection
      )
    );
  };

const validClosedArtifact = (
  artifact:
    | ProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact
    | ProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact,
  role: 'cleanup' | 'recovery'
): boolean =>
  validCommon(artifact, role) &&
  cleanTerminus(artifact) &&
  artifact.journalArchiveRecords.every(
    (record) =>
      isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord(
        record
      ) && recordScopeMatches(record, artifact)
  );

const validArchiveFamily = (
  artifact:
    | ProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact
    | ProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact
): boolean =>
  artifact.lifecycleArchiveFamily !== null &&
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
    artifact.lifecycleArchiveFamily
  ) &&
  artifact.lifecycleArchiveFamily.closureStatus === 'zeroed' &&
  artifact.lifecycleArchiveFamily.namespaceId === artifact.namespaceId &&
  artifact.lifecycleArchiveFamily.repositoryCommit ===
    artifact.repositoryCommit &&
  artifact.lifecycleArchiveFamily.planDigest === artifact.planDigest &&
  artifact.lifecycleArchiveFamily.frozenRunDigest ===
    artifact.frozenRunDigest &&
  artifact.lifecycleArchiveFamily.runConfigArtifactBindingDigest ===
    artifact.runConfigArtifactBindingDigest &&
  artifact.lifecycleArchiveFamily.runtimeResourceSetId ===
    artifact.runtimeResourceSetId &&
  sameCanonicalJson(
    artifact.journalArchiveRecords,
    artifact.lifecycleArchiveFamily.records
  );

export const isProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact =
  (
    value: unknown
  ): value is ProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact => {
    if (!exactKeys(value, cleanupKeys)) return false;
    const artifact =
      value as ProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact;
    return (
      artifact.format ===
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARTIFACT_FORMAT &&
      validClosedArtifact(artifact, 'cleanup') &&
      validArchiveFamily(artifact) &&
      artifact.cleanupArchiveRecords.every(
        isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord
      )
    );
  };

export const isProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact =
  (
    value: unknown
  ): value is ProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact => {
    if (!exactKeys(value, recoveryKeys)) return false;
    const artifact =
      value as ProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact;
    return (
      artifact.format ===
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_ARTIFACT_FORMAT &&
      validClosedArtifact(artifact, 'recovery') &&
      (artifact.lifecycleArchiveFamily === null
        ? artifact.journalArchiveRecords.length === 0
        : validArchiveFamily(artifact)) &&
      artifact.recoveredCleanupArchiveRecords.every(
        isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord
      ) &&
      artifact.nextCursor === null
    );
  };

export const createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleArtifact =
  <
    T extends
      ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleArtifact,
  >(
    input: Omit<T, 'resultDigest'>
  ): T => {
    const value = Object.freeze({
      ...input,
      resultDigest: digestAgentCanonicalValue(input),
    }) as T;
    const valid =
      isProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact(
        value
      ) ||
      isProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact(
        value
      ) ||
      isProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact(
        value
      );
    if (!valid) throw new TypeError('Hosted lifecycle artifact is invalid.');
    return value;
  };
