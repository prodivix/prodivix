import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  exact,
  safe,
} from './agentHostedRetrievalRuntimeResourceRegistration';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES,
} from './agentHostedRetrievalRuntimeResourceRecovery';

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-owner-health-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_STORAGE_SUMMARY_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-owner-storage-summary' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_MAXIMUM_LIFETIME_MS =
  125_000 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_RECEIPT_MAXIMUM_BYTES =
  16_384 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_MAXIMUM_COUNT =
  10_000_000 as const;

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS =
  Object.freeze([
    'active-read.issue',
    'cleanup.claim',
    'cleanup.execute',
    'cleanup.recovery.list',
    'cleanup.result.read',
    'registration-result.read',
    'registration-result.write',
    'registration-set.read',
    'registration.create',
    'terminal-fence.derive',
  ] as const);

export type AgentHostedRetrievalRuntimeResourceOwnerHealthOperation =
  (typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS)[number];

const OWNER_HEALTH_SCHEMA_CONTRACT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-owner-schema-contract' as const;

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST =
  digestAgentCanonicalValue({
    format: OWNER_HEALTH_SCHEMA_CONTRACT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    exactRuntimeResourceCount:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
    routes: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES,
    purposes: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES,
    supportedOperations:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
  });

export type AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_RECEIPT_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  purpose: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readOwnerHealth;
  namespaceId: string;
  ownerAuthorityIssuerId: string;
  implementationDigest: CanonicalDigest;
  schemaContractDigest: CanonicalDigest;
  supportedOperations: readonly AgentHostedRetrievalRuntimeResourceOwnerHealthOperation[];
  storageSummary: AgentHostedRetrievalRuntimeResourceOwnerStorageSummary;
  storageSummaryDigest: CanonicalDigest;
  status: 'ready';
  checkedAt: Instant;
  expiresAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceOwnerStorageSummary = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_STORAGE_SUMMARY_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  namespaceId: string;
  schemaContractDigest: CanonicalDigest;
  ledgerRevision: number;
  registrationCount: number;
  activeResourceCount: number;
  activeReadLeaseCount: number;
  unfinishedCleanupCount: number;
  overdueCount: number;
  summarizedAt: Instant;
  summaryDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceOwnerHealthBinding = Readonly<{
  namespaceId: string;
  ownerAuthorityIssuerId: string;
  implementationDigest: CanonicalDigest;
  schemaContractDigest: CanonicalDigest;
}>;

const ownerHealthReceiptKeys = Object.freeze([
  'format',
  'version',
  'purpose',
  'namespaceId',
  'ownerAuthorityIssuerId',
  'implementationDigest',
  'schemaContractDigest',
  'supportedOperations',
  'storageSummary',
  'storageSummaryDigest',
  'status',
  'checkedAt',
  'expiresAt',
  'receiptDigest',
] as const);

const ownerHealthInputKeys = Object.freeze([
  'namespaceId',
  'ownerAuthorityIssuerId',
  'implementationDigest',
  'schemaContractDigest',
  'supportedOperations',
  'storageSummary',
  'storageSummaryDigest',
  'checkedAt',
  'expiresAt',
] as const);

const ownerStorageSummaryKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'schemaContractDigest',
  'ledgerRevision',
  'registrationCount',
  'activeResourceCount',
  'activeReadLeaseCount',
  'unfinishedCleanupCount',
  'overdueCount',
  'summarizedAt',
  'summaryDigest',
] as const);

const ownerStorageSummaryInputKeys = Object.freeze(
  ownerStorageSummaryKeys.slice(2, -1)
);

const ownerHealthBindingKeys = Object.freeze([
  'namespaceId',
  'ownerAuthorityIssuerId',
  'implementationDigest',
  'schemaContractDigest',
] as const);

const isBoundedOwnerHealthCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) &&
  (value as number) >= 0 &&
  (value as number) <=
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_MAXIMUM_COUNT;

export const createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceOwnerStorageSummary,
    'format' | 'version' | 'summaryDigest'
  >
): AgentHostedRetrievalRuntimeResourceOwnerStorageSummary => {
  if (
    !exact(input, ownerStorageSummaryInputKeys) ||
    !isAgentControlIdentity(input.namespaceId) ||
    input.schemaContractDigest !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST ||
    !Number.isSafeInteger(input.ledgerRevision) ||
    input.ledgerRevision < 1 ||
    ![
      input.registrationCount,
      input.activeResourceCount,
      input.activeReadLeaseCount,
      input.unfinishedCleanupCount,
      input.overdueCount,
    ].every(isBoundedOwnerHealthCount) ||
    input.activeResourceCount > input.registrationCount ||
    input.unfinishedCleanupCount > input.registrationCount ||
    input.overdueCount > input.registrationCount ||
    !isAgentControlInstant(input.summarizedAt)
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource owner storage summary is invalid.'
    );
  }
  const base = Object.freeze({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_STORAGE_SUMMARY_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });
  return Object.freeze({
    ...base,
    summaryDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHostedRetrievalRuntimeResourceOwnerStorageSummary = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceOwnerStorageSummary => {
  if (!exact(value, ownerStorageSummaryKeys)) return false;
  const summary =
    value as AgentHostedRetrievalRuntimeResourceOwnerStorageSummary;
  const {
    format: _format,
    version: _version,
    summaryDigest: _digest,
    ...input
  } = summary;
  try {
    return sameCanonicalJson(
      summary,
      createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary(input)
    );
  } catch {
    return false;
  }
};

export const createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
    'format' | 'version' | 'purpose' | 'status' | 'receiptDigest'
  >
): AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt => {
  const checkedAtMs = Date.parse(input.checkedAt);
  const expiresAtMs = Date.parse(input.expiresAt);
  if (
    !exact(input, ownerHealthInputKeys) ||
    !isAgentControlIdentity(input.namespaceId) ||
    !isAgentControlIdentity(input.ownerAuthorityIssuerId) ||
    !isAgentCanonicalDigest(input.implementationDigest) ||
    input.schemaContractDigest !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST ||
    !sameCanonicalJson(
      input.supportedOperations,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS
    ) ||
    !isAgentHostedRetrievalRuntimeResourceOwnerStorageSummary(
      input.storageSummary
    ) ||
    input.storageSummaryDigest !== input.storageSummary.summaryDigest ||
    input.storageSummary.namespaceId !== input.namespaceId ||
    input.storageSummary.schemaContractDigest !== input.schemaContractDigest ||
    input.storageSummary.summarizedAt !== input.checkedAt ||
    !isAgentControlInstant(input.checkedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    expiresAtMs <= checkedAtMs ||
    expiresAtMs - checkedAtMs >
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_MAXIMUM_LIFETIME_MS
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource owner health receipt is invalid.'
    );
  }
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_RECEIPT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    purpose: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readOwnerHealth,
    namespaceId: input.namespaceId,
    ownerAuthorityIssuerId: input.ownerAuthorityIssuerId,
    implementationDigest: input.implementationDigest,
    schemaContractDigest: input.schemaContractDigest,
    supportedOperations: input.supportedOperations,
    storageSummary: input.storageSummary,
    storageSummaryDigest: input.storageSummaryDigest,
    status: 'ready' as const,
    checkedAt: input.checkedAt,
    expiresAt: input.expiresAt,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      receipt,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_RECEIPT_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource owner health receipt exceeds capacity.'
    );
  }
  return receipt;
};

export const isAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt => {
  if (
    !exact(value, ownerHealthReceiptKeys) ||
    !safe(
      value,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_RECEIPT_MAXIMUM_BYTES
    )
  ) {
    return false;
  }
  const receipt =
    value as AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt;
  try {
    return sameCanonicalJson(
      receipt,
      createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt({
        namespaceId: receipt.namespaceId,
        ownerAuthorityIssuerId: receipt.ownerAuthorityIssuerId,
        implementationDigest: receipt.implementationDigest,
        schemaContractDigest: receipt.schemaContractDigest,
        supportedOperations: receipt.supportedOperations,
        storageSummary: receipt.storageSummary,
        storageSummaryDigest: receipt.storageSummaryDigest,
        checkedAt: receipt.checkedAt,
        expiresAt: receipt.expiresAt,
      })
    );
  } catch {
    return false;
  }
};

/** Exact preactivation join; actual resource availability remains read-receipt bound. */
export const matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt = (
  receipt: AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  binding: AgentHostedRetrievalRuntimeResourceOwnerHealthBinding,
  observedAt: Instant
): boolean => {
  if (
    !isAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(receipt) ||
    !exact(binding, ownerHealthBindingKeys) ||
    !isAgentControlIdentity(binding.namespaceId) ||
    !isAgentControlIdentity(binding.ownerAuthorityIssuerId) ||
    !isAgentCanonicalDigest(binding.implementationDigest) ||
    binding.schemaContractDigest !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST ||
    !isAgentControlInstant(observedAt)
  ) {
    return false;
  }
  return (
    receipt.namespaceId === binding.namespaceId &&
    receipt.ownerAuthorityIssuerId === binding.ownerAuthorityIssuerId &&
    receipt.implementationDigest === binding.implementationDigest &&
    receipt.schemaContractDigest === binding.schemaContractDigest &&
    receipt.storageSummary.unfinishedCleanupCount === 0 &&
    receipt.storageSummary.overdueCount === 0 &&
    Date.parse(receipt.checkedAt) <= Date.parse(observedAt) &&
    Date.parse(observedAt) < Date.parse(receipt.expiresAt)
  );
};
