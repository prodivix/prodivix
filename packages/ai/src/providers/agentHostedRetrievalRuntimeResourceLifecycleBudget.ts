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
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type { AgentCapabilityProbePublicResourceMaterial } from './agentCapabilityProbeProgram';
import type {
  AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  AgentHostedRetrievalRuntimeResourceRegistrationIntent,
  AgentHostedRetrievalRuntimeResourceRegistrationRequest,
} from './agentHostedRetrievalRuntimeResourceRegistration';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  isAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  isAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  isAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  expectedRuntimeAuthorityKeys,
} from './agentHostedRetrievalRuntimeResourceRegistration';
import type {
  AgentBudgetDemand,
  AgentBudgetSettlement,
} from '../usage/agentBudgetLedger';
import { createAgentUsageVector } from '../usage/agentUsage';

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUDGET_RETENTION_SECONDS =
  691_200 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUDGET_TOOL_CALLS =
  3 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUDGET_CLOSURE_PROJECTION_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-budget-closure-projection' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUDGET_CLOSURE_PROJECTION_MAXIMUM_BYTES =
  16_384 as const;

export type AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUDGET_CLOSURE_PROJECTION_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    budgetReservationAuthority: AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority;
    budgetReservationAuthorityDigest: CanonicalDigest;
    reservationId: string;
    ledgerRevision: number;
    demand: AgentBudgetDemand;
    demandDigest: CanonicalDigest;
    demandBytesDigest: CanonicalDigest;
    reservedAt: Instant;
    closureKind: 'reconciled' | 'settled';
    settlement: AgentBudgetSettlement;
    settlementDigest: CanonicalDigest;
    projectionDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleBudgetDemandBinding =
  Readonly<{
    registrationRequestDigest: CanonicalDigest;
    registrationIntentDigest: CanonicalDigest;
    publicResourceDescriptorDigest: CanonicalDigest;
    demand: AgentBudgetDemand;
    demandDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding =
  Readonly<{
    registrationRequestDigest: CanonicalDigest;
    registrationIntentDigest: CanonicalDigest;
    createJournalArchiveRecordDigest: CanonicalDigest;
    projection: AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection;
    projectionDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureArchiveRecordSource =
  Readonly<{
    archiveRecordDigest: CanonicalDigest;
    journalRecord: Readonly<{
      operation: 'create' | 'delete';
      registrationRequestDigest: CanonicalDigest;
    }>;
    budgetClosureProjection: AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection | null;
    budgetClosureProjectionDigest: CanonicalDigest;
  }>;

const utf8 = new TextEncoder();

export const createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand = (
  registrationIntent: AgentHostedRetrievalRuntimeResourceRegistrationIntent,
  material: AgentCapabilityProbePublicResourceMaterial
): AgentBudgetDemand => {
  if (
    !isAgentHostedRetrievalRuntimeResourceRegistrationIntent(
      registrationIntent
    ) ||
    material.descriptor.descriptorDigest !==
      registrationIntent.publicResourceDescriptorDigest
  ) {
    throw new TypeError('Hosted lifecycle budget material is invalid.');
  }
  const content =
    registrationIntent.capabilityProfileId ===
    'g4-provider-hosted-retrieval-document'
      ? material.documentText
      : material.contentText;
  if (content === null) {
    throw new TypeError('Hosted lifecycle budget material is missing.');
  }
  const uploadBytes = utf8.encode(content).byteLength;
  const storageByteSeconds =
    uploadBytes *
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUDGET_RETENTION_SECONDS;
  if (!Number.isSafeInteger(storageByteSeconds)) {
    throw new TypeError('Hosted lifecycle budget demand is unbounded.');
  }
  return Object.freeze({
    usage: createAgentUsageVector(
      Object.freeze([
        Object.freeze({
          unit: 'hosted-tool-call' as const,
          logicalAmount: String(
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUDGET_TOOL_CALLS
          ),
          billableAmount: String(
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUDGET_TOOL_CALLS
          ),
          confidence: 'estimated' as const,
        }),
        Object.freeze({
          unit: 'provider-upload-byte' as const,
          logicalAmount: String(uploadBytes),
          billableAmount: String(uploadBytes),
          confidence: 'measured' as const,
        }),
        Object.freeze({
          unit: 'provider-storage-byte-second' as const,
          logicalAmount: String(storageByteSeconds),
          billableAmount: String(storageByteSeconds),
          confidence: 'estimated' as const,
        }),
      ])
    ),
    cost: Object.freeze([]),
    modelInvocations: 0,
    toolCalls: 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: 0,
  });
};

export const digestAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand = (
  demand: AgentBudgetDemand
): CanonicalDigest => digestAgentCanonicalValue(demand);

const lifecycleAuthorityKey = (
  request: AgentHostedRetrievalRuntimeResourceRegistrationRequest
): string => `${request.protocolFamily}\u0000${request.capabilityProfileId}`;

/** Exact four public-material-derived lifecycle demands for one frozen run. */
export const createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemandBindings =
  (
    registrationRequests: readonly AgentHostedRetrievalRuntimeResourceRegistrationRequest[],
    publicResourceMaterials: readonly AgentCapabilityProbePublicResourceMaterial[]
  ): readonly AgentHostedRetrievalRuntimeResourceLifecycleBudgetDemandBinding[] => {
    if (
      registrationRequests.length !== 4 ||
      publicResourceMaterials.length !== 4 ||
      registrationRequests.some(
        (request) =>
          !isAgentHostedRetrievalRuntimeResourceRegistrationRequest(request)
      )
    ) {
      throw new TypeError('Hosted lifecycle budget binding set is incomplete.');
    }
    const materialByDescriptor = new Map(
      publicResourceMaterials.map(
        (material) => [material.descriptor.descriptorDigest, material] as const
      )
    );
    const requests = [...registrationRequests].sort((left, right) =>
      lifecycleAuthorityKey(left) < lifecycleAuthorityKey(right)
        ? -1
        : lifecycleAuthorityKey(left) > lifecycleAuthorityKey(right)
          ? 1
          : 0
    );
    if (
      materialByDescriptor.size !== 4 ||
      new Set(requests.map(({ requestDigest }) => requestDigest)).size !== 4 ||
      !sameCanonicalJson(
        requests.map(lifecycleAuthorityKey),
        expectedRuntimeAuthorityKeys
      )
    ) {
      throw new TypeError('Hosted lifecycle budget binding set drifted.');
    }
    return Object.freeze(
      requests.map((request) => {
        const material = materialByDescriptor.get(
          request.registrationIntent.publicResourceDescriptorDigest
        );
        if (!material) {
          throw new TypeError('Hosted lifecycle budget material is missing.');
        }
        const demand =
          createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(
            request.registrationIntent,
            material
          );
        return Object.freeze({
          registrationRequestDigest: request.requestDigest,
          registrationIntentDigest: request.registrationIntentDigest,
          publicResourceDescriptorDigest:
            request.registrationIntent.publicResourceDescriptorDigest,
          demand,
          demandDigest:
            digestAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(
              demand
            ),
        });
      })
    );
  };

/** Exact four distinct reservation closures joined back to their requests. */
export const createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings =
  (
    registrationRequests: readonly AgentHostedRetrievalRuntimeResourceRegistrationRequest[],
    createArchiveRecords: readonly AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureArchiveRecordSource[]
  ): readonly AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding[] => {
    if (
      registrationRequests.length !== 4 ||
      createArchiveRecords.length !== 4 ||
      registrationRequests.some(
        (request) =>
          !isAgentHostedRetrievalRuntimeResourceRegistrationRequest(request)
      ) ||
      createArchiveRecords.some(
        (record) =>
          record.journalRecord.operation !== 'create' ||
          !isAgentCanonicalDigest(record.archiveRecordDigest) ||
          !isAgentCanonicalDigest(
            record.journalRecord.registrationRequestDigest
          ) ||
          record.budgetClosureProjection === null ||
          !isAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection(
            record.budgetClosureProjection
          ) ||
          record.budgetClosureProjectionDigest !==
            record.budgetClosureProjection.projectionDigest
      )
    ) {
      throw new TypeError('Hosted lifecycle budget closure set is incomplete.');
    }
    const recordByRequest = new Map(
      createArchiveRecords.map(
        (record) =>
          [record.journalRecord.registrationRequestDigest, record] as const
      )
    );
    const requests = [...registrationRequests].sort((left, right) =>
      lifecycleAuthorityKey(left) < lifecycleAuthorityKey(right)
        ? -1
        : lifecycleAuthorityKey(left) > lifecycleAuthorityKey(right)
          ? 1
          : 0
    );
    if (
      recordByRequest.size !== 4 ||
      new Set(
        createArchiveRecords.map(
          ({ budgetClosureProjection }) =>
            budgetClosureProjection!.reservationId
        )
      ).size !== 4 ||
      new Set(
        createArchiveRecords.map(
          ({ archiveRecordDigest }) => archiveRecordDigest
        )
      ).size !== 4 ||
      !sameCanonicalJson(
        requests.map(lifecycleAuthorityKey),
        expectedRuntimeAuthorityKeys
      )
    ) {
      throw new TypeError('Hosted lifecycle budget closure set drifted.');
    }
    return Object.freeze(
      requests.map((request) => {
        const record = recordByRequest.get(request.requestDigest);
        const projection = record?.budgetClosureProjection;
        if (
          !record ||
          !projection ||
          projection.budgetReservationAuthorityDigest !==
            request.budgetReservationAuthorityDigest ||
          !sameCanonicalJson(
            projection.budgetReservationAuthority,
            request.budgetReservationAuthority
          )
        ) {
          throw new TypeError(
            'Hosted lifecycle budget closure authority drifted.'
          );
        }
        return Object.freeze({
          registrationRequestDigest: request.requestDigest,
          registrationIntentDigest: request.registrationIntentDigest,
          createJournalArchiveRecordDigest: record.archiveRecordDigest,
          projection,
          projectionDigest: projection.projectionDigest,
        });
      })
    );
  };

const canonicalDemand = (demand: AgentBudgetDemand): AgentBudgetDemand =>
  Object.freeze({
    usage: createAgentUsageVector(demand.usage.amounts),
    cost: Object.freeze([]),
    modelInvocations: demand.modelInvocations,
    toolCalls: demand.toolCalls,
    repairRounds: demand.repairRounds,
    transactions: demand.transactions,
    artifactBytes: demand.artifactBytes,
    elapsedMs: demand.elapsedMs,
  });

const isLifecycleDemand = (value: AgentBudgetDemand): boolean => {
  try {
    const normalized = canonicalDemand(value);
    const byUnit = new Map(
      value.usage.amounts.map((amount) => [amount.unit, amount])
    );
    const tool = byUnit.get('hosted-tool-call');
    const upload = byUnit.get('provider-upload-byte');
    const storage = byUnit.get('provider-storage-byte-second');
    const canonicalInteger = /^(0|[1-9][0-9]*)$/u;
    const uploadBytes =
      upload?.logicalAmount && canonicalInteger.test(upload.logicalAmount)
        ? Number(upload.logicalAmount)
        : Number.NaN;
    const storageByteSeconds =
      storage?.logicalAmount && canonicalInteger.test(storage.logicalAmount)
        ? Number(storage.logicalAmount)
        : Number.NaN;
    return (
      sameCanonicalJson(normalized, value) &&
      value.cost.length === 0 &&
      [
        value.modelInvocations,
        value.toolCalls,
        value.repairRounds,
        value.transactions,
        value.artifactBytes,
        value.elapsedMs,
      ].every((entry) => entry === 0) &&
      value.usage.amounts.length === 3 &&
      value.usage.amounts.every(
        (amount) =>
          amount.cachedAmount === undefined &&
          amount.sourceDigest === undefined &&
          amount.logicalAmount !== undefined &&
          amount.billableAmount === amount.logicalAmount
      ) &&
      tool?.logicalAmount === '3' &&
      tool.confidence === 'estimated' &&
      Number.isSafeInteger(uploadBytes) &&
      uploadBytes > 0 &&
      upload?.confidence === 'measured' &&
      Number.isSafeInteger(storageByteSeconds) &&
      storageByteSeconds ===
        uploadBytes *
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUDGET_RETENTION_SECONDS &&
      storage?.confidence === 'estimated'
    );
  } catch {
    return false;
  }
};

const projectionKeys = Object.freeze([
  'format',
  'version',
  'budgetReservationAuthority',
  'budgetReservationAuthorityDigest',
  'reservationId',
  'ledgerRevision',
  'demand',
  'demandDigest',
  'demandBytesDigest',
  'reservedAt',
  'closureKind',
  'settlement',
  'settlementDigest',
  'projectionDigest',
] as const);

export const createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection =
  (
    budgetReservationAuthority: AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
    demandInput: AgentBudgetDemand,
    settlement: AgentBudgetSettlement
  ): AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection => {
    const demand = canonicalDemand(demandInput);
    const demandDigest =
      digestAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(demand);
    const { settlementDigest, ...settlementBase } = settlement;
    if (
      !isAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority(
        budgetReservationAuthority
      ) ||
      !isLifecycleDemand(demand) ||
      budgetReservationAuthority.demandDigest !== demandDigest ||
      budgetReservationAuthority.demandBytesDigest !== demandDigest ||
      !hasExactAgentControlKeys(settlement, [
        'actual',
        'charged',
        'requiresReconciliation',
        ...(settlement.requiresReconciliation
          ? (['reconciliationReason'] as const)
          : []),
        'settledAt',
        'settlementDigest',
      ]) ||
      !sameCanonicalJson(settlement.actual, demand) ||
      !sameCanonicalJson(settlement.charged, demand) ||
      !isAgentControlInstant(settlement.settledAt) ||
      Date.parse(settlement.settledAt) <
        Date.parse(budgetReservationAuthority.reservedAt) ||
      settlementDigest !== digestAgentCanonicalValue(settlementBase) ||
      (settlement.requiresReconciliation
        ? ![
            'ack-loss',
            'provider-disconnect',
            'timeout',
            'worker-loss',
          ].includes(settlement.reconciliationReason ?? '')
        : settlement.reconciliationReason !== undefined)
    ) {
      throw new TypeError('Hosted lifecycle budget closure is invalid.');
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUDGET_CLOSURE_PROJECTION_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      budgetReservationAuthority,
      budgetReservationAuthorityDigest:
        budgetReservationAuthority.authorityDigest,
      reservationId: budgetReservationAuthority.reservationId,
      ledgerRevision: budgetReservationAuthority.ledgerRevision,
      demand,
      demandDigest,
      demandBytesDigest: demandDigest,
      reservedAt: budgetReservationAuthority.reservedAt,
      closureKind: settlement.requiresReconciliation
        ? ('reconciled' as const)
        : ('settled' as const),
      settlement,
      settlementDigest,
    });
    const value = Object.freeze({
      ...base,
      projectionDigest: digestAgentCanonicalValue(base),
    });
    if (
      inspectAgentControlJson(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUDGET_CLOSURE_PROJECTION_MAXIMUM_BYTES
      ).length !== 0 ||
      containsAgentControlCredentialLikeText(canonicalJsonText(value))
    ) {
      throw new TypeError('Hosted lifecycle budget closure is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection => {
    if (!hasExactAgentControlKeys(value, projectionKeys)) return false;
    try {
      const candidate =
        value as AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection;
      return sameCanonicalJson(
        candidate,
        createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection(
          candidate.budgetReservationAuthority,
          candidate.demand,
          candidate.settlement
        )
      );
    } catch {
      return false;
    }
  };

export const matchAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosure = (
  projection: AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  budgetReservationAuthority: AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  expectedSettledAt: Instant
): boolean =>
  isAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection(
    projection
  ) &&
  projection.budgetReservationAuthorityDigest ===
    budgetReservationAuthority.authorityDigest &&
  sameCanonicalJson(
    projection.budgetReservationAuthority,
    budgetReservationAuthority
  ) &&
  projection.settlement.settledAt === expectedSettledAt;

export const matchAgentHostedRetrievalRuntimeResourceLifecycleBudgetMaterial = (
  projection: AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  registrationIntent: AgentHostedRetrievalRuntimeResourceRegistrationIntent,
  material: AgentCapabilityProbePublicResourceMaterial
): boolean => {
  if (
    !isAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection(
      projection
    )
  ) {
    return false;
  }
  try {
    return sameCanonicalJson(
      projection.demand,
      createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(
        registrationIntent,
        material
      )
    );
  } catch {
    return false;
  }
};

export const isAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemandDigest =
  (demand: AgentBudgetDemand, digest: CanonicalDigest): boolean =>
    isAgentCanonicalDigest(digest) &&
    isLifecycleDemand(demand) &&
    digestAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(demand) ===
      digest;
