import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  createAgentCapabilityProbeProgram,
  type AgentCapabilityProbeProfileId,
  type AgentCapabilityProbeProgram,
} from '../providers/agentCapabilityProbeProgram';
import {
  isAgentNativeProviderStateVaultRetirementReceipt,
  isAgentNativeProviderStateVaultRetireRequest,
  isAgentNativeProviderStateVaultSealReceipt,
  isAgentNativeProviderStateVaultSealRequest,
  type AgentNativeProviderStateVaultRetirementReceipt,
  type AgentNativeProviderStateVaultRetireRequest,
  type AgentNativeProviderStateVaultSealReceipt,
  type AgentNativeProviderStateVaultSealRequestProjection,
} from '../providers/agentNativeProviderStateVault';
import {
  isAgentEvaluationCapabilityPreEffectIntent,
  type AgentEvaluationCapabilityPreEffectIntent,
} from './agentEvaluationCapabilityEffectAuthority';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_BUSINESS_RESULT_MAXIMUM_BYTES,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_RECEIPT_MAXIMUM_BYTES,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_ACK_DELAY_MS,
  isAgentEvaluationCapabilityEffectProviderExecutionReceipt,
  doesAgentEvaluationCapabilityEffectProviderFactMatchContext,
  isAgentEvaluationCapabilityEffectProviderResultSealReceipt,
  isAgentEvaluationCapabilityEffectProviderStageRequest,
  type AgentEvaluationCapabilityEffectProviderBusinessResult,
  type AgentEvaluationCapabilityEffectProviderExecutionReceipt,
  type AgentEvaluationCapabilityEffectProviderResultSealReceipt,
  type AgentEvaluationCapabilityEffectProviderStageRequest,
} from './agentEvaluationCapabilityEffectProviderRuntime';
import {
  createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority,
  doesAgentEvaluationCapabilityEffectProviderSpoolDispositionMatch,
  doesAgentEvaluationCapabilityEffectProviderSpoolReceiptMatch,
  isAgentEvaluationCapabilityEffectProviderSpoolAad,
  isAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt,
  isAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority,
  type AgentEvaluationCapabilityEffectProviderSpoolAad,
  type AgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt,
  type AgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority,
} from './agentEvaluationCapabilityEffectProviderJournalSpool';
import {
  isAgentEvaluationProviderCapabilityObservedFact,
  type AgentEvaluationProviderCapabilitySharedObservedFact,
} from './agentEvaluationProviderCapabilityObservation';
import { isAgentEvaluationProviderResultSpoolEnvelope } from './agentEvaluationEvidenceAuthenticity';
import type { AgentEvaluationProviderResultSpoolEnvelope } from './agentEvaluationEvidenceAuthenticity.types';

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_STAGE_RECORD_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-journal-stage-record' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_EXECUTION_RECORD_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-journal-execution-record' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_EXECUTION_WRITE_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-journal-execution-write' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_RESULT_RECORD_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-journal-result-record' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ABANDONMENT_RECORD_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-journal-abandonment-record' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_RECORD_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-runtime-archive-record' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION =
  1 as const;

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS =
  Object.freeze({
    maximumStageRecordBytes: 49_152,
    maximumExecutionRecordBytes: 24_576,
    maximumExecutionRecordEnvelopeBytes: 7_680,
    maximumExecutionRecordCompositionReserveBytes: 512,
    maximumExecutionWriteBytes: 589_824,
    maximumResultRecordBytes: 49_152,
    maximumResultRecordEnvelopeBytes: 32_256,
    maximumResultRecordCompositionReserveBytes: 512,
    maximumArchiveWrapperBytes: 16_384,
    maximumExecutionsPerOwnerRequest: 4,
    maximumOwnerRequestsPerArchive: 5_880,
    maximumArchiveRecordBytes: 196_608,
    maximumArchiveFamilyBytes: 1_156_055_040,
  } as const);

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_STAGE_RECORD_MAXIMUM_BYTES_BY_BINDING =
  Object.freeze({
    'hosted-retrieval-query': 49_152,
    'opaque-continuation': 32_768,
    'provider-cache': 32_768,
    'provider-job': 32_768,
  } as const);

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_MAXIMUM_EXECUTIONS_BY_BINDING =
  Object.freeze({
    'hosted-retrieval-query': 1,
    'opaque-continuation': 1,
    'provider-cache': 2,
    'provider-job': 4,
  } as const);

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_MAXIMUM_ARCHIVE_COMPONENT_BYTES =
  Math.max(
    ...Object.entries(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_STAGE_RECORD_MAXIMUM_BYTES_BY_BINDING
    ).map(
      ([bindingKind, maximumStageRecordBytes]) =>
        maximumStageRecordBytes +
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_MAXIMUM_EXECUTIONS_BY_BINDING[
          bindingKind as keyof typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_MAXIMUM_EXECUTIONS_BY_BINDING
        ] *
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordBytes +
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumResultRecordBytes +
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveWrapperBytes
    )
  );

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_EXECUTION_COMPOSITION_BYTES =
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_RECEIPT_MAXIMUM_BYTES +
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordEnvelopeBytes +
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordCompositionReserveBytes;

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_RESULT_COMPOSITION_BYTES =
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_BUSINESS_RESULT_MAXIMUM_BYTES +
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumResultRecordEnvelopeBytes +
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumResultRecordCompositionReserveBytes;

export const isAgentEvaluationCapabilityEffectProviderJournalPreDispatchArchiveCapacity =
  (): boolean =>
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_EXECUTION_COMPOSITION_BYTES <=
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordBytes &&
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_RESULT_COMPOSITION_BYTES <=
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumResultRecordBytes &&
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_MAXIMUM_ARCHIVE_COMPONENT_BYTES <=
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveRecordBytes;

type JournalIdentity = Readonly<{
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  ownerRequestId: string;
  ownerRequestDigest: CanonicalDigest;
  runtimeFactSourceAuthorityDigest: CanonicalDigest;
  preEffectIntentDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityEffectProviderJournalStageRecord =
  Readonly<
    JournalIdentity & {
      format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_STAGE_RECORD_FORMAT;
      version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION;
      preEffectIntent: AgentEvaluationCapabilityPreEffectIntent;
      stageRequest: AgentEvaluationCapabilityEffectProviderStageRequest;
      sealedAt: Instant;
      recordDigest: CanonicalDigest;
    }
  >;

export type AgentEvaluationCapabilityEffectProviderJournalExecutionRecord =
  Readonly<
    JournalIdentity & {
      format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_EXECUTION_RECORD_FORMAT;
      version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION;
      stageDigest: CanonicalDigest;
      executionSequence: number;
      priorExecutionRecordDigest: CanonicalDigest | null;
      executionReceipt: AgentEvaluationCapabilityEffectProviderExecutionReceipt;
      spoolAad: AgentEvaluationCapabilityEffectProviderSpoolAad | null;
      spoolEnvelopeAuthority: AgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority | null;
      sealedAt: Instant;
      recordDigest: CanonicalDigest;
    }
  >;

export type AgentEvaluationCapabilityEffectProviderJournalExecutionWrite =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_EXECUTION_WRITE_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION;
    executionRecord: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord;
    spoolEnvelope: AgentEvaluationProviderResultSpoolEnvelope | null;
    writeDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityEffectProviderJournalResultRecord =
  Readonly<
    JournalIdentity & {
      format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_RESULT_RECORD_FORMAT;
      version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION;
      stageDigest: CanonicalDigest;
      terminalExecutionRecordDigest: CanonicalDigest;
      businessResult: AgentEvaluationCapabilityEffectProviderBusinessResult;
      effectSourceFact: AgentEvaluationProviderCapabilitySharedObservedFact | null;
      stateVaultRetireRequest: AgentNativeProviderStateVaultRetireRequest | null;
      stateVaultRetirementReceipt: AgentNativeProviderStateVaultRetirementReceipt | null;
      nextStateVaultSealRequest: AgentNativeProviderStateVaultSealRequestProjection | null;
      nextStateVaultSealReceipt: AgentNativeProviderStateVaultSealReceipt | null;
      resultSealReceipt: AgentEvaluationCapabilityEffectProviderResultSealReceipt;
      spoolDispositionReceipts: readonly AgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt[];
      sealedAt: Instant;
      recordDigest: CanonicalDigest;
    }
  >;

/** Durable terminal tombstone for an unfinished owner; it never satisfies release archive closure. */
export type AgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord =
  Readonly<
    JournalIdentity & {
      format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ABANDONMENT_RECORD_FORMAT;
      version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION;
      stageDigest: CanonicalDigest;
      lastExecutionRecordDigest: CanonicalDigest | null;
      reason: 'attempt-terminal' | 'cleanup-requested' | 'stage-expired';
      spoolDispositionReceipts: readonly AgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt[];
      abandonedAt: Instant;
      recordDigest: CanonicalDigest;
    }
  >;

export type AgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_RECORD_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION;
    attemptId: string;
    turnIndex: number;
    ownerRequestDigest: CanonicalDigest;
    preEffectIntentDigest: CanonicalDigest;
    stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord;
    executionRecords: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[];
    resultRecord: AgentEvaluationCapabilityEffectProviderJournalResultRecord;
    effectSourceReceiptDigest: CanonicalDigest;
    recordDigest: CanonicalDigest;
  }>;

const stageKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'invocationId',
  'ownerRequestId',
  'ownerRequestDigest',
  'runtimeFactSourceAuthorityDigest',
  'preEffectIntentDigest',
  'preEffectIntent',
  'stageRequest',
  'sealedAt',
  'recordDigest',
] as const);

const executionKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'invocationId',
  'ownerRequestId',
  'ownerRequestDigest',
  'runtimeFactSourceAuthorityDigest',
  'preEffectIntentDigest',
  'stageDigest',
  'executionSequence',
  'priorExecutionRecordDigest',
  'executionReceipt',
  'spoolAad',
  'spoolEnvelopeAuthority',
  'sealedAt',
  'recordDigest',
] as const);

const executionWriteKeys = Object.freeze([
  'format',
  'version',
  'executionRecord',
  'spoolEnvelope',
  'writeDigest',
] as const);

const resultKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'invocationId',
  'ownerRequestId',
  'ownerRequestDigest',
  'runtimeFactSourceAuthorityDigest',
  'preEffectIntentDigest',
  'stageDigest',
  'terminalExecutionRecordDigest',
  'businessResult',
  'effectSourceFact',
  'stateVaultRetireRequest',
  'stateVaultRetirementReceipt',
  'nextStateVaultSealRequest',
  'nextStateVaultSealReceipt',
  'resultSealReceipt',
  'spoolDispositionReceipts',
  'sealedAt',
  'recordDigest',
] as const);

const abandonmentKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'invocationId',
  'ownerRequestId',
  'ownerRequestDigest',
  'runtimeFactSourceAuthorityDigest',
  'preEffectIntentDigest',
  'stageDigest',
  'lastExecutionRecordDigest',
  'reason',
  'spoolDispositionReceipts',
  'abandonedAt',
  'recordDigest',
] as const);

const archiveKeys = Object.freeze([
  'format',
  'version',
  'attemptId',
  'turnIndex',
  'ownerRequestDigest',
  'preEffectIntentDigest',
  'stageRecord',
  'executionRecords',
  'resultRecord',
  'effectSourceReceiptDigest',
  'recordDigest',
] as const);

const utf8Encoder = new TextEncoder();

const withinBytes = (value: unknown, maximumBytes: number): boolean => {
  try {
    return (
      utf8Encoder.encode(canonicalJsonText(value)).byteLength <= maximumBytes
    );
  } catch {
    return false;
  }
};

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

const programFor = (
  intent: AgentEvaluationCapabilityPreEffectIntent
): AgentCapabilityProbeProgram =>
  createAgentCapabilityProbeProgram({
    capabilityProfileId: intent.runtimeFactSourceAuthority
      .capabilityProfileId as AgentCapabilityProbeProfileId,
    capabilityProfileDigest:
      intent.runtimeFactSourceAuthority.capabilityProfileDigest,
  });

const identityFor = (
  intent: AgentEvaluationCapabilityPreEffectIntent
): JournalIdentity =>
  Object.freeze({
    namespaceId: intent.namespaceId,
    planDigest: intent.planDigest,
    repositoryCommit: intent.repositoryCommit,
    attemptId: intent.attemptId,
    descriptorDigest: intent.descriptorDigest,
    turnIndex: intent.turnIndex,
    invocationId: intent.invocationId,
    ownerRequestId: intent.ownerRequestId,
    ownerRequestDigest: intent.ownerRequestDigest,
    runtimeFactSourceAuthorityDigest:
      intent.runtimeFactSourceAuthority.authorityDigest,
    preEffectIntentDigest: intent.intentDigest,
  });

const identityMatches = (
  value: JournalIdentity,
  intent: AgentEvaluationCapabilityPreEffectIntent
): boolean =>
  sameCanonicalJson(identityFor(intent), {
    namespaceId: value.namespaceId,
    planDigest: value.planDigest,
    repositoryCommit: value.repositoryCommit,
    attemptId: value.attemptId,
    descriptorDigest: value.descriptorDigest,
    turnIndex: value.turnIndex,
    invocationId: value.invocationId,
    ownerRequestId: value.ownerRequestId,
    ownerRequestDigest: value.ownerRequestDigest,
    runtimeFactSourceAuthorityDigest: value.runtimeFactSourceAuthorityDigest,
    preEffectIntentDigest: value.preEffectIntentDigest,
  });

const selfDigestMatches = (
  value: Readonly<Record<string, unknown>>,
  digestKey: 'recordDigest' | 'writeDigest'
): boolean => {
  const expected = value[digestKey];
  if (!isAgentCanonicalDigest(expected)) return false;
  const base = { ...value };
  delete base[digestKey];
  return expected === digestAgentCanonicalValue(base);
};

const executionRecordEnvelope = (
  record: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord
): Readonly<Record<string, unknown>> => {
  const { executionReceipt: _executionReceipt, ...envelope } = record;
  return Object.freeze(envelope);
};

const resultRecordEnvelope = (
  record: AgentEvaluationCapabilityEffectProviderJournalResultRecord
): Readonly<Record<string, unknown>> => {
  const { businessResult: _businessResult, ...envelope } = record;
  return Object.freeze(envelope);
};

const maximumStageRecordBytesFor = (
  stageRequest: AgentEvaluationCapabilityEffectProviderStageRequest
): number =>
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_STAGE_RECORD_MAXIMUM_BYTES_BY_BINDING[
    stageRequest.bindingKind
  ];

export const createAgentEvaluationCapabilityEffectProviderJournalStageRecord = (
  intent: AgentEvaluationCapabilityPreEffectIntent,
  stageRequest: AgentEvaluationCapabilityEffectProviderStageRequest
): AgentEvaluationCapabilityEffectProviderJournalStageRecord => {
  const program = programFor(intent);
  if (
    !isAgentEvaluationCapabilityPreEffectIntent(intent) ||
    !isAgentEvaluationCapabilityEffectProviderJournalPreDispatchArchiveCapacity() ||
    !isAgentEvaluationCapabilityEffectProviderStageRequest(
      stageRequest,
      program,
      intent
    )
  ) {
    throw new TypeError('Capability effect Provider journal stage is invalid.');
  }
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_STAGE_RECORD_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION,
    ...identityFor(intent),
    preEffectIntent: intent,
    stageRequest,
    sealedAt: stageRequest.stagedAt,
  });
  const record = Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
  if (!safe(record, maximumStageRecordBytesFor(stageRequest))) {
    throw new TypeError(
      'Capability effect Provider journal stage is unsafe or unbounded.'
    );
  }
  return record;
};

export const isAgentEvaluationCapabilityEffectProviderJournalStageRecord = (
  value: unknown
): value is AgentEvaluationCapabilityEffectProviderJournalStageRecord => {
  if (!hasExactAgentControlKeys(value, stageKeys)) return false;
  const record =
    value as AgentEvaluationCapabilityEffectProviderJournalStageRecord;
  try {
    return (
      record.format ===
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_STAGE_RECORD_FORMAT &&
      record.version ===
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION &&
      isAgentEvaluationCapabilityPreEffectIntent(record.preEffectIntent) &&
      identityMatches(record, record.preEffectIntent) &&
      isAgentEvaluationCapabilityEffectProviderStageRequest(
        record.stageRequest,
        programFor(record.preEffectIntent),
        record.preEffectIntent
      ) &&
      record.sealedAt === record.stageRequest.stagedAt &&
      selfDigestMatches(record, 'recordDigest') &&
      safe(record, maximumStageRecordBytesFor(record.stageRequest))
    );
  } catch {
    return false;
  }
};

const sequenceMatches = (
  record: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
  stage: AgentEvaluationCapabilityEffectProviderStageRequest,
  prior: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord | null,
  program: AgentCapabilityProbeProgram
): boolean => {
  if (record.executionSequence !== record.executionReceipt.pollSequence) {
    return false;
  }
  const bindingKind: string = stage.bindingKind;
  switch (bindingKind) {
    case 'provider-job':
      return (
        record.executionReceipt.requestProjection.operation ===
          'background-poll' &&
        record.executionSequence >= 1 &&
        record.executionSequence <= program.hardLimits.maximumPollAttempts &&
        (record.executionSequence === 1) === (prior === null)
      );
    case 'hosted-retrieval-query':
      return (
        record.executionReceipt.requestProjection.operation ===
          'hosted-retrieval-query' &&
        record.executionSequence === 0 &&
        prior === null
      );
    case 'opaque-continuation':
      return (
        record.executionReceipt.requestProjection.operation ===
          'continuation-resume' &&
        record.executionSequence === 0 &&
        prior === null
      );
    case 'provider-cache':
      return (
        ((record.executionSequence === 0 &&
          record.executionReceipt.requestProjection.operation ===
            'cache-cold') ||
          (record.executionSequence === 1 &&
            record.executionReceipt.requestProjection.operation ===
              'cache-warm')) &&
        (record.executionSequence === 0) === (prior === null)
      );
    default:
      return false;
  }
};

type ExecutionRecordWithStageExpiry =
  AgentEvaluationCapabilityEffectProviderJournalExecutionRecord &
    Readonly<{ stageRequestExpiresAt: Instant }>;

const spoolMatches = (record: ExecutionRecordWithStageExpiry): boolean => {
  const response = record.executionReceipt.responseProjection;
  const receipt = record.executionReceipt.resultSpoolReceipt;
  const aad = record.spoolAad;
  const envelope = record.spoolEnvelopeAuthority;
  if (response.responseBodyDigest === null) {
    return receipt === null && aad === null && envelope === null;
  }
  if (
    receipt === null ||
    aad === null ||
    envelope === null ||
    !isAgentEvaluationCapabilityEffectProviderSpoolAad(aad) ||
    !isAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(envelope)
  ) {
    return false;
  }
  return (
    aad.namespaceDigest ===
      digestAgentCanonicalValue({ namespaceId: record.namespaceId }) &&
    aad.planDigest === record.planDigest &&
    aad.repositoryCommit === record.repositoryCommit &&
    aad.attemptId === record.attemptId &&
    aad.descriptorDigest === record.descriptorDigest &&
    aad.turnIndex === record.turnIndex &&
    aad.invocationId === record.invocationId &&
    aad.ownerRequestDigest === record.ownerRequestDigest &&
    aad.stageDigest === record.stageDigest &&
    aad.executionSequence === record.executionSequence &&
    aad.dispatchIntentDigest ===
      record.executionReceipt.dispatchIntent.intentDigest &&
    aad.transportReceiptDigest ===
      record.executionReceipt.transportReceipt.receiptDigest &&
    aad.responseBodyDigest === response.responseBodyDigest &&
    aad.responseProjectionDigest === response.projectionDigest &&
    aad.responseDigest === response.responseDigest &&
    aad.normalizedEventSetDigest === response.normalizedEventSetDigest &&
    receipt.createdAt === response.observedAt &&
    Date.parse(receipt.expiresAt) <= Date.parse(record.stageRequestExpiresAt) &&
    doesAgentEvaluationCapabilityEffectProviderSpoolReceiptMatch(
      receipt,
      aad,
      envelope
    )
  );
};

const withStageExpiry = (
  record: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
  stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord
): ExecutionRecordWithStageExpiry =>
  Object.assign(Object.create(null), record, {
    stageRequestExpiresAt: stageRecord.stageRequest.expiresAt,
  }) as ExecutionRecordWithStageExpiry;

export type CreateAgentEvaluationCapabilityEffectProviderJournalExecutionRecordInput =
  Readonly<{
    stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord;
    executionReceipt: AgentEvaluationCapabilityEffectProviderExecutionReceipt;
    priorExecutionRecord: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord | null;
    spoolAad: AgentEvaluationCapabilityEffectProviderSpoolAad | null;
    spoolEnvelopeAuthority: AgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority | null;
  }>;

export const createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord =
  (
    input: CreateAgentEvaluationCapabilityEffectProviderJournalExecutionRecordInput
  ): AgentEvaluationCapabilityEffectProviderJournalExecutionRecord => {
    if (
      !isAgentEvaluationCapabilityEffectProviderJournalStageRecord(
        input.stageRecord
      )
    ) {
      throw new TypeError(
        'Capability effect Provider journal stage is invalid.'
      );
    }
    const stageRecord = input.stageRecord;
    const intent = stageRecord.preEffectIntent;
    const program = programFor(intent);
    const stage = stageRecord.stageRequest;
    const prior = input.priorExecutionRecord;
    if (
      !isAgentEvaluationCapabilityEffectProviderExecutionReceipt(
        input.executionReceipt,
        program,
        intent,
        stage,
        prior?.executionReceipt ?? null
      )
    ) {
      throw new TypeError(
        'Capability effect Provider journal execution is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_EXECUTION_RECORD_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION,
      ...identityFor(intent),
      stageDigest: stage.stageDigest,
      executionSequence: input.executionReceipt.pollSequence,
      priorExecutionRecordDigest: prior?.recordDigest ?? null,
      executionReceipt: input.executionReceipt,
      spoolAad: input.spoolAad,
      spoolEnvelopeAuthority: input.spoolEnvelopeAuthority,
      sealedAt: input.executionReceipt.executedAt,
    });
    const record = Object.freeze({
      ...base,
      recordDigest: digestAgentCanonicalValue(base),
    });
    if (
      !sequenceMatches(record, stage, prior, program) ||
      !spoolMatches(withStageExpiry(record, stageRecord)) ||
      !withinBytes(
        executionRecordEnvelope(record),
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordEnvelopeBytes
      ) ||
      !safe(
        record,
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordBytes
      )
    ) {
      throw new TypeError(
        'Capability effect Provider journal execution drifted or is unbounded.'
      );
    }
    return record;
  };

export const isAgentEvaluationCapabilityEffectProviderJournalExecutionRecord = (
  value: unknown,
  stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord,
  priorExecutionRecord: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord | null
): value is AgentEvaluationCapabilityEffectProviderJournalExecutionRecord => {
  if (
    !hasExactAgentControlKeys(value, executionKeys) ||
    !isAgentEvaluationCapabilityEffectProviderJournalStageRecord(stageRecord)
  ) {
    return false;
  }
  try {
    const record =
      value as AgentEvaluationCapabilityEffectProviderJournalExecutionRecord;
    const program = programFor(stageRecord.preEffectIntent);
    return (
      record.format ===
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_EXECUTION_RECORD_FORMAT &&
      record.version ===
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION &&
      identityMatches(record, stageRecord.preEffectIntent) &&
      record.stageDigest === stageRecord.stageRequest.stageDigest &&
      record.priorExecutionRecordDigest ===
        (priorExecutionRecord?.recordDigest ?? null) &&
      isAgentEvaluationCapabilityEffectProviderExecutionReceipt(
        record.executionReceipt,
        program,
        stageRecord.preEffectIntent,
        stageRecord.stageRequest,
        priorExecutionRecord?.executionReceipt ?? null
      ) &&
      sequenceMatches(
        record,
        stageRecord.stageRequest,
        priorExecutionRecord,
        program
      ) &&
      record.sealedAt === record.executionReceipt.executedAt &&
      spoolMatches(withStageExpiry(record, stageRecord)) &&
      withinBytes(
        executionRecordEnvelope(record),
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordEnvelopeBytes
      ) &&
      selfDigestMatches(record, 'recordDigest') &&
      safe(
        record,
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordBytes
      )
    );
  } catch {
    return false;
  }
};

export const createAgentEvaluationCapabilityEffectProviderJournalExecutionWrite =
  (
    executionRecord: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
    spoolEnvelope: AgentEvaluationProviderResultSpoolEnvelope | null
  ): AgentEvaluationCapabilityEffectProviderJournalExecutionWrite => {
    const hasSpool = executionRecord.spoolEnvelopeAuthority !== null;
    if (
      hasSpool !== (spoolEnvelope !== null) ||
      (spoolEnvelope !== null &&
        (!isAgentEvaluationProviderResultSpoolEnvelope(spoolEnvelope) ||
          !sameCanonicalJson(
            createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
              spoolEnvelope
            ),
            executionRecord.spoolEnvelopeAuthority
          )))
    ) {
      throw new TypeError(
        'Capability effect Provider journal execution-write spool drifted.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_EXECUTION_WRITE_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION,
      executionRecord,
      spoolEnvelope,
    });
    const write = Object.freeze({
      ...base,
      writeDigest: digestAgentCanonicalValue(base),
    });
    if (
      inspectAgentControlJson(
        write,
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionWriteBytes
      ).length > 0
    ) {
      throw new TypeError(
        'Capability effect Provider journal execution-write is unbounded.'
      );
    }
    return write;
  };

export const isAgentEvaluationCapabilityEffectProviderJournalExecutionWrite = (
  value: unknown,
  stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord,
  priorExecutionRecord: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord | null
): value is AgentEvaluationCapabilityEffectProviderJournalExecutionWrite => {
  if (!hasExactAgentControlKeys(value, executionWriteKeys)) return false;
  const write =
    value as AgentEvaluationCapabilityEffectProviderJournalExecutionWrite;
  try {
    return (
      write.format ===
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_EXECUTION_WRITE_FORMAT &&
      write.version ===
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION &&
      isAgentEvaluationCapabilityEffectProviderJournalExecutionRecord(
        write.executionRecord,
        stageRecord,
        priorExecutionRecord
      ) &&
      sameCanonicalJson(
        write,
        createAgentEvaluationCapabilityEffectProviderJournalExecutionWrite(
          write.executionRecord,
          write.spoolEnvelope
        )
      ) &&
      selfDigestMatches(write, 'writeDigest') &&
      withinBytes(
        write,
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionWriteBytes
      )
    );
  } catch {
    return false;
  }
};

const isBusinessResult = (
  value: unknown
): value is AgentEvaluationCapabilityEffectProviderBusinessResult => {
  if (
    !hasExactAgentControlKeys(value, [
      'status',
      'providerStatus',
      'outputText',
      'responseDigest',
      'resultDigest',
    ])
  ) {
    return false;
  }
  const result = value as AgentEvaluationCapabilityEffectProviderBusinessResult;
  const { resultDigest, ...base } = result;
  return (
    ['completed', 'failed', 'unavailable'].includes(result.status) &&
    (result.providerStatus === null ||
      [
        'cancelled',
        'completed',
        'failed',
        'in-progress',
        'queued',
        'requires-action',
      ].includes(result.providerStatus)) &&
    (result.outputText === null || typeof result.outputText === 'string') &&
    isAgentCanonicalDigest(result.responseDigest) &&
    isAgentCanonicalDigest(resultDigest) &&
    resultDigest === digestAgentCanonicalValue(base) &&
    safe(
      result,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_BUSINESS_RESULT_MAXIMUM_BYTES
    )
  );
};

const businessResultMatchesTerminal = (
  result: AgentEvaluationCapabilityEffectProviderBusinessResult,
  terminal: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord
): boolean => {
  const execution = terminal.executionReceipt;
  const response = execution.responseProjection;
  return (
    isBusinessResult(result) &&
    result.status === execution.executionStatus &&
    result.providerStatus === response.providerStatus &&
    result.responseDigest === response.responseDigest &&
    (result.outputText === null) === (response.outputTextDigest === null) &&
    (result.outputText === null ||
      digestAgentCanonicalValue({ text: result.outputText }) ===
        response.outputTextDigest)
  );
};

const resultDispositionsMatch = (
  dispositions: readonly AgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt[],
  executions: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[],
  resultSeal: AgentEvaluationCapabilityEffectProviderResultSealReceipt
): boolean => {
  const spoolExecutions = executions.filter(
    (execution) => execution.executionReceipt.resultSpoolReceipt !== null
  );
  return (
    dispositions.length === spoolExecutions.length &&
    dispositions.every((disposition, index) => {
      const execution = spoolExecutions[index]!;
      const receipt = execution.executionReceipt.resultSpoolReceipt!;
      return (
        isAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt(
          disposition
        ) &&
        doesAgentEvaluationCapabilityEffectProviderSpoolDispositionMatch(
          receipt,
          disposition,
          resultSeal.receiptDigest
        ) &&
        disposition.disposedAt === resultSeal.sealedAt &&
        Date.parse(disposition.disposedAt) < Date.parse(receipt.expiresAt)
      );
    })
  );
};

const archiveEligibilityProjection = (
  stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord,
  executionRecords: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[],
  resultRecord: AgentEvaluationCapabilityEffectProviderJournalResultRecord
): Readonly<Record<string, unknown>> => {
  const placeholderDigest = digestAgentCanonicalValue({
    capabilityEffectProviderArchivePlaceholder: 1,
  });
  return Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_RECORD_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION,
    attemptId: stageRecord.attemptId,
    turnIndex: stageRecord.turnIndex,
    ownerRequestDigest: stageRecord.ownerRequestDigest,
    preEffectIntentDigest: stageRecord.preEffectIntentDigest,
    stageRecord,
    executionRecords,
    resultRecord,
    effectSourceReceiptDigest: placeholderDigest,
    recordDigest: placeholderDigest,
  });
};

export type CreateAgentEvaluationCapabilityEffectProviderJournalResultRecordInput =
  Readonly<{
    stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord;
    executionRecords: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[];
    businessResult: AgentEvaluationCapabilityEffectProviderBusinessResult;
    effectSourceFact: AgentEvaluationProviderCapabilitySharedObservedFact | null;
    stateVaultRetireRequest: AgentNativeProviderStateVaultRetireRequest | null;
    stateVaultRetirementReceipt: AgentNativeProviderStateVaultRetirementReceipt | null;
    nextStateVaultSealRequest: AgentNativeProviderStateVaultSealRequestProjection | null;
    nextStateVaultSealReceipt: AgentNativeProviderStateVaultSealReceipt | null;
    resultSealReceipt: AgentEvaluationCapabilityEffectProviderResultSealReceipt;
    spoolDispositionReceipts: readonly AgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt[];
  }>;

export const createAgentEvaluationCapabilityEffectProviderJournalResultRecord =
  (
    input: CreateAgentEvaluationCapabilityEffectProviderJournalResultRecordInput
  ): AgentEvaluationCapabilityEffectProviderJournalResultRecord => {
    if (
      !isAgentEvaluationCapabilityEffectProviderJournalStageRecord(
        input.stageRecord
      ) ||
      input.executionRecords.length < 1 ||
      input.executionRecords.length >
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionsPerOwnerRequest
    ) {
      throw new TypeError(
        'Capability effect Provider journal result execution chain is invalid.'
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
          'Capability effect Provider journal result execution chain drifted.'
        );
      }
      prior = execution;
    }
    const terminal = prior!;
    const intent = input.stageRecord.preEffectIntent;
    const binding = intent.inputAuthorityBinding;
    const stateful =
      binding.bindingKind === 'provider-job' ||
      binding.bindingKind === 'opaque-continuation';
    if (
      terminal.executionReceipt.executionStatus === 'in-progress' ||
      !businessResultMatchesTerminal(input.businessResult, terminal) ||
      input.businessResult.resultDigest !==
        input.resultSealReceipt.businessResultDigest ||
      (input.effectSourceFact !== null &&
        !isAgentEvaluationProviderCapabilityObservedFact(
          input.effectSourceFact
        )) ||
      !isAgentEvaluationCapabilityEffectProviderResultSealReceipt(
        input.resultSealReceipt,
        input.stageRecord.stageRequest,
        terminal.executionReceipt,
        input.effectSourceFact
      ) ||
      !doesAgentEvaluationCapabilityEffectProviderFactMatchContext(
        programFor(input.stageRecord.preEffectIntent),
        input.stageRecord.preEffectIntent,
        input.stageRecord.stageRequest,
        terminal.executionReceipt,
        input.executionRecords.at(-2)?.executionReceipt ?? null,
        input.effectSourceFact,
        input.nextStateVaultSealRequest,
        input.nextStateVaultSealReceipt
      ) ||
      Date.parse(input.resultSealReceipt.sealedAt) <
        Date.parse(terminal.executionReceipt.executedAt) ||
      Date.parse(input.resultSealReceipt.sealedAt) >=
        Date.parse(input.stageRecord.stageRequest.expiresAt) ||
      Date.parse(input.resultSealReceipt.sealedAt) -
        Date.parse(terminal.executionReceipt.executedAt) >
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_ACK_DELAY_MS ||
      !resultDispositionsMatch(
        input.spoolDispositionReceipts,
        input.executionRecords,
        input.resultSealReceipt
      )
    ) {
      throw new TypeError(
        'Capability effect Provider journal result preimages drifted.'
      );
    }
    if (stateful) {
      if (
        input.stateVaultRetireRequest === null ||
        input.stateVaultRetirementReceipt === null ||
        binding.stateVaultSealRequest === null ||
        binding.stateVaultSealReceipt === null ||
        !isAgentNativeProviderStateVaultRetireRequest(
          input.stateVaultRetireRequest
        ) ||
        !isAgentNativeProviderStateVaultRetirementReceipt(
          input.stateVaultRetirementReceipt,
          input.stateVaultRetireRequest,
          binding.stateVaultSealRequest,
          binding.stateVaultSealReceipt
        ) ||
        input.stateVaultRetireRequest.disposition !== 'consumed' ||
        input.stateVaultRetireRequest.retireRequestDigest !==
          input.resultSealReceipt.stateVaultRetireRequestDigest ||
        input.stateVaultRetirementReceipt.receiptDigest !==
          input.resultSealReceipt.stateVaultRetirementReceiptDigest
      ) {
        throw new TypeError(
          'Capability effect Provider journal result retirement drifted.'
        );
      }
    } else if (
      input.stateVaultRetireRequest !== null ||
      input.stateVaultRetirementReceipt !== null
    ) {
      throw new TypeError(
        'Stateless Provider journal result carried vault retirement.'
      );
    }
    const continuationProduced =
      input.stageRecord.stageRequest.bindingKind === 'opaque-continuation' &&
      input.resultSealReceipt.resultStatus === 'produced';
    if (continuationProduced) {
      if (
        input.nextStateVaultSealRequest === null ||
        input.nextStateVaultSealReceipt === null ||
        !isAgentNativeProviderStateVaultSealRequest(
          input.nextStateVaultSealRequest
        ) ||
        !isAgentNativeProviderStateVaultSealReceipt(
          input.nextStateVaultSealReceipt,
          input.nextStateVaultSealRequest
        ) ||
        input.nextStateVaultSealReceipt.status !== 'sealed' ||
        input.nextStateVaultSealRequest.sealRequestDigest !==
          input.resultSealReceipt.nextStateVaultSealRequestDigest ||
        input.nextStateVaultSealReceipt.receiptDigest !==
          input.resultSealReceipt.nextStateVaultSealReceiptDigest
      ) {
        throw new TypeError(
          'Capability effect Provider journal continuation rotation drifted.'
        );
      }
    } else if (
      input.nextStateVaultSealRequest !== null ||
      input.nextStateVaultSealReceipt !== null ||
      input.resultSealReceipt.nextStateVaultSealRequestDigest !== null ||
      input.resultSealReceipt.nextStateVaultSealReceiptDigest !== null
    ) {
      throw new TypeError(
        'Capability effect Provider journal result carried unexpected next state.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_RESULT_RECORD_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION,
      ...identityFor(intent),
      stageDigest: input.stageRecord.stageRequest.stageDigest,
      terminalExecutionRecordDigest: terminal.recordDigest,
      businessResult: input.businessResult,
      effectSourceFact: input.effectSourceFact,
      stateVaultRetireRequest: input.stateVaultRetireRequest,
      stateVaultRetirementReceipt: input.stateVaultRetirementReceipt,
      nextStateVaultSealRequest: input.nextStateVaultSealRequest,
      nextStateVaultSealReceipt: input.nextStateVaultSealReceipt,
      resultSealReceipt: input.resultSealReceipt,
      spoolDispositionReceipts: Object.freeze([
        ...input.spoolDispositionReceipts,
      ]),
      sealedAt: input.resultSealReceipt.sealedAt,
    });
    const record = Object.freeze({
      ...base,
      recordDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        record,
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumResultRecordBytes
      ) ||
      !withinBytes(
        resultRecordEnvelope(record),
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumResultRecordEnvelopeBytes
      ) ||
      !withinBytes(
        archiveEligibilityProjection(
          input.stageRecord,
          input.executionRecords,
          record
        ),
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveRecordBytes
      )
    ) {
      throw new TypeError(
        'Capability effect Provider journal result is unsafe or cannot enter the bounded archive.'
      );
    }
    return record;
  };

export const isAgentEvaluationCapabilityEffectProviderJournalResultRecord = (
  value: unknown,
  stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord,
  executionRecords: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[]
): value is AgentEvaluationCapabilityEffectProviderJournalResultRecord => {
  if (!hasExactAgentControlKeys(value, resultKeys)) return false;
  const record =
    value as AgentEvaluationCapabilityEffectProviderJournalResultRecord;
  try {
    const recreated =
      createAgentEvaluationCapabilityEffectProviderJournalResultRecord({
        stageRecord,
        executionRecords,
        businessResult: record.businessResult,
        effectSourceFact: record.effectSourceFact,
        stateVaultRetireRequest: record.stateVaultRetireRequest,
        stateVaultRetirementReceipt: record.stateVaultRetirementReceipt,
        nextStateVaultSealRequest: record.nextStateVaultSealRequest,
        nextStateVaultSealReceipt: record.nextStateVaultSealReceipt,
        resultSealReceipt: record.resultSealReceipt,
        spoolDispositionReceipts: record.spoolDispositionReceipts,
      });
    return sameCanonicalJson(record, recreated);
  } catch {
    return false;
  }
};

export const createAgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord =
  (
    input: Readonly<{
      stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord;
      executionRecords: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[];
      reason: 'attempt-terminal' | 'cleanup-requested' | 'stage-expired';
      spoolDispositionReceipts: readonly AgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt[];
      abandonedAt: Instant;
    }>
  ): AgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord => {
    if (
      !isAgentEvaluationCapabilityEffectProviderJournalStageRecord(
        input.stageRecord
      ) ||
      input.executionRecords.length >
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionsPerOwnerRequest ||
      !['attempt-terminal', 'cleanup-requested', 'stage-expired'].includes(
        input.reason
      ) ||
      !isAgentControlInstant(input.abandonedAt)
    ) {
      throw new TypeError(
        'Capability effect Provider journal abandonment input is invalid.'
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
          'Capability effect Provider journal abandonment execution chain drifted.'
        );
      }
      prior = execution;
    }
    const spoolExecutions = input.executionRecords.filter(
      (execution) => execution.executionReceipt.resultSpoolReceipt !== null
    );
    if (
      input.spoolDispositionReceipts.length !== spoolExecutions.length ||
      input.spoolDispositionReceipts.some((disposition, index) => {
        const receipt =
          spoolExecutions[index]!.executionReceipt.resultSpoolReceipt!;
        return (
          !doesAgentEvaluationCapabilityEffectProviderSpoolDispositionMatch(
            receipt,
            disposition,
            null
          ) ||
          disposition.abandonmentReason !== input.reason ||
          disposition.disposedAt !== input.abandonedAt
        );
      }) ||
      Date.parse(input.abandonedAt) <
        Date.parse(prior?.sealedAt ?? input.stageRecord.sealedAt) ||
      (input.reason === 'stage-expired' &&
        Date.parse(input.abandonedAt) <
          Date.parse(input.stageRecord.stageRequest.expiresAt))
    ) {
      throw new TypeError(
        'Capability effect Provider journal abandonment dispositions drifted.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ABANDONMENT_RECORD_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION,
      ...identityFor(input.stageRecord.preEffectIntent),
      stageDigest: input.stageRecord.stageRequest.stageDigest,
      lastExecutionRecordDigest: prior?.recordDigest ?? null,
      reason: input.reason,
      spoolDispositionReceipts: Object.freeze([
        ...input.spoolDispositionReceipts,
      ]),
      abandonedAt: input.abandonedAt,
    });
    const record = Object.freeze({
      ...base,
      recordDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        record,
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumResultRecordBytes
      )
    ) {
      throw new TypeError(
        'Capability effect Provider journal abandonment is unsafe or unbounded.'
      );
    }
    return record;
  };

export const isAgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord =
  (
    value: unknown,
    stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord,
    executionRecords: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[]
  ): value is AgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord => {
    if (!hasExactAgentControlKeys(value, abandonmentKeys)) return false;
    const record =
      value as AgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord;
    try {
      return sameCanonicalJson(
        record,
        createAgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord({
          stageRecord,
          executionRecords,
          reason: record.reason,
          spoolDispositionReceipts: record.spoolDispositionReceipts,
          abandonedAt: record.abandonedAt,
        })
      );
    } catch {
      return false;
    }
  };

export const createAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord =
  (
    input: Readonly<{
      stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord;
      executionRecords: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[];
      resultRecord: AgentEvaluationCapabilityEffectProviderJournalResultRecord;
      effectSourceReceiptDigest: CanonicalDigest;
    }>
  ): AgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord => {
    if (
      !isAgentEvaluationCapabilityEffectProviderJournalStageRecord(
        input.stageRecord
      ) ||
      !isAgentEvaluationCapabilityEffectProviderJournalResultRecord(
        input.resultRecord,
        input.stageRecord,
        input.executionRecords
      ) ||
      !isAgentCanonicalDigest(input.effectSourceReceiptDigest)
    ) {
      throw new TypeError(
        'Capability effect Provider runtime archive input is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_RECORD_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_VERSION,
      attemptId: input.stageRecord.attemptId,
      turnIndex: input.stageRecord.turnIndex,
      ownerRequestDigest: input.stageRecord.ownerRequestDigest,
      preEffectIntentDigest: input.stageRecord.preEffectIntentDigest,
      stageRecord: input.stageRecord,
      executionRecords: Object.freeze([...input.executionRecords]),
      resultRecord: input.resultRecord,
      effectSourceReceiptDigest: input.effectSourceReceiptDigest,
    });
    const record = Object.freeze({
      ...base,
      recordDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        record,
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveRecordBytes
      )
    ) {
      throw new TypeError(
        'Capability effect Provider runtime archive is unsafe or unbounded.'
      );
    }
    return record;
  };

export const isAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord = (
  value: unknown
): value is AgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord => {
  if (!hasExactAgentControlKeys(value, archiveKeys)) return false;
  const record =
    value as AgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord;
  try {
    return sameCanonicalJson(
      record,
      createAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord({
        stageRecord: record.stageRecord,
        executionRecords: record.executionRecords,
        resultRecord: record.resultRecord,
        effectSourceReceiptDigest: record.effectSourceReceiptDigest,
      })
    );
  } catch {
    return false;
  }
};

export const isAgentEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBudget =
  (recordCount: number, canonicalBytes: number): boolean =>
    Number.isSafeInteger(recordCount) &&
    recordCount >= 0 &&
    recordCount <=
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumOwnerRequestsPerArchive &&
    Number.isSafeInteger(canonicalBytes) &&
    canonicalBytes >= 0 &&
    canonicalBytes <=
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveFamilyBytes;
