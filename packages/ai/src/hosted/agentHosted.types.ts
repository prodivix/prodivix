import type {
  AgentCapabilityGrant,
  AgentComputerUseSessionId,
  AgentExternalSourceResultId,
  AgentInvocationId,
  AgentJsonValue,
  AgentRetrievalIndexId,
  AgentRetrievalQueryId,
  AgentRunId,
  AgentTaskId,
  AgentToolCallId,
  AgentToolDescriptor,
  AgentToolEffect,
  AgentToolExecutionLocus,
  AgentToolRegistrySnapshot,
  AgentTargetScope,
  AgentUsageVectorRef,
  AgentWorkspaceRevisionVector,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';
import type { AgentUsageVector } from '../providers/agentProvider.types';
import type {
  AgentBudgetDemand,
  AgentBudgetLedgerState,
} from '../usage/agentBudgetLedger';

export type AgentHostedCapabilityIssue = Readonly<{
  code:
    | 'AI-6002'
    | 'AI-6003'
    | 'AI-6013'
    | 'AI-7001'
    | 'AI-7002'
    | 'AI-7003'
    | 'AI-7004'
    | 'AI-7012'
    | 'AI-7013'
    | 'AI-7014'
    | 'AI-7015'
    | 'AI-9001';
  path: string;
  message: string;
  blocking: true;
}>;

export type AgentToolDiscoveryReceipt = Readonly<{
  invocationId: AgentInvocationId;
  registryDigest: CanonicalDigest;
  queryDigest: CanonicalDigest;
  matchedDescriptorDigests: readonly CanonicalDigest[];
  expandedDescriptorDigests: readonly CanonicalDigest[];
  providerReceiptDigest?: CanonicalDigest;
  receiptDigest: CanonicalDigest;
}>;

export type AgentToolCallIdentity = Readonly<{
  callId: AgentToolCallId;
  invocationId: AgentInvocationId;
  parentCallId?: AgentToolCallId;
  taskId: AgentTaskId;
  runId: AgentRunId;
  generation: number;
  depth: number;
}>;

export type AgentToolCallRequest = Readonly<{
  identity: AgentToolCallIdentity;
  registryDigest: CanonicalDigest;
  descriptorDigest: CanonicalDigest;
  grant: AgentCapabilityGrant;
  effectivePolicyDigest: CanonicalDigest;
  contextPackDigest: CanonicalDigest;
  capabilityQualificationDigest: CanonicalDigest;
  runtimeZone: 'browser' | 'server' | 'native' | 'sandbox';
  workspaceRevision: AgentWorkspaceRevisionVector;
  targetScope: AgentTargetScope;
  inputDigest: CanonicalDigest;
  inputByteLength: number;
  observability: 'per-call' | 'opaque-chain';
  budgetDemand: AgentBudgetDemand;
  requestedAt: Instant;
}>;

export type AgentToolCallAuthorization = Readonly<{
  identity: AgentToolCallIdentity;
  registryDigest: CanonicalDigest;
  descriptorDigest: CanonicalDigest;
  grantId: string;
  reservationId: string;
  effectivePolicyDigest: CanonicalDigest;
  contextPackDigest: CanonicalDigest;
  capabilityQualificationDigest: CanonicalDigest;
  inputDigest: CanonicalDigest;
  targetScopeDigest: CanonicalDigest;
  callFenceDigest: CanonicalDigest;
  authorizedAt: Instant;
  expiresAt: Instant;
  authorizationDigest: CanonicalDigest;
}>;

export type AgentToolCallPreflightResult =
  | Readonly<{
      ok: true;
      authorization: AgentToolCallAuthorization;
      ledger: AgentBudgetLedgerState;
    }>
  | Readonly<{
      ok: false;
      issues: readonly AgentHostedCapabilityIssue[];
      ledger: AgentBudgetLedgerState;
    }>;

export type AgentToolLifecyclePhase =
  | 'decoded'
  | 'preflighted'
  | 'authorized'
  | 'budget-reserved'
  | 'executed'
  | 'normalized'
  | 'redacted'
  | 'staged'
  | 'finalized'
  | 'cleaned';

export type AgentToolCleanupReceipt = Readonly<{
  cleanupId: string;
  residualState: 'none' | 'detected' | 'unknown';
  providerStateDeleted: boolean;
  deletionReceiptRef?: string;
  completedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentToolAdapterResult = Readonly<{
  status: 'succeeded' | 'failed' | 'cancelled';
  output?: AgentJsonValue;
  artifactRefs: readonly string[];
  actualDemand: AgentBudgetDemand;
  completedAt: Instant;
  cleanup: AgentToolCleanupReceipt;
}>;

export type AgentHostedToolAdapter = Readonly<{
  descriptorDigest: CanonicalDigest;
  execute(
    input: Readonly<{
      authorization: AgentToolCallAuthorization;
      payload: AgentJsonValue;
    }>
  ): Promise<AgentToolAdapterResult>;
}>;

export type AgentToolCallReceipt = Readonly<{
  identity: AgentToolCallIdentity;
  registryDigest: CanonicalDigest;
  descriptorDigest: CanonicalDigest;
  executionLocus: AgentToolExecutionLocus;
  effect: AgentToolEffect;
  authorizationDigest: CanonicalDigest;
  reservationId: string;
  lifecycle: readonly AgentToolLifecyclePhase[];
  terminalStatus: 'succeeded' | 'failed' | 'cancelled' | 'fenced';
  resultDisposition:
    'context-data-only' | 'staged-proposal-only' | 'discarded' | 'audit-only';
  normalizedOutputDigest?: CanonicalDigest;
  outputByteLength: number;
  artifactRefs: readonly string[];
  usage: AgentUsageVector;
  cleanupReceiptDigest: CanonicalDigest;
  completedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentHostedToolExecutionResult =
  | Readonly<{
      status: 'completed';
      receipt: AgentToolCallReceipt;
      normalizedOutput?: AgentJsonValue;
      ledger: AgentBudgetLedgerState;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly AgentHostedCapabilityIssue[];
      ledger: AgentBudgetLedgerState;
    }>;

export type AgentExternalSourceResult = Readonly<{
  sourceResultId: AgentExternalSourceResultId;
  canonicalUrl?: string;
  retrievedAt: Instant;
  contentDigest?: CanonicalDigest;
  snapshotRef?: string;
  providerCitationRef?: string;
  authority: 'external-untrusted';
  instructionBoundary: 'data-only';
  availability: 'snapshotted' | 'reference-only' | 'unavailable';
  resultDigest: CanonicalDigest;
}>;

export type AgentRetrievalQueryReceipt = Readonly<{
  queryId: AgentRetrievalQueryId;
  toolDescriptorDigest: CanonicalDigest;
  queryDigest: CanonicalDigest;
  purpose: 'public-research' | 'authorized-project-retrieval';
  networkPolicyDigest: CanonicalDigest;
  sourceResultRefs: readonly AgentExternalSourceResultId[];
  sourceResultDigests: readonly CanonicalDigest[];
  indexDigest?: CanonicalDigest;
  retrievalConfigurationDigest?: CanonicalDigest;
  usageRef: AgentUsageVectorRef;
  startedAt: Instant;
  completedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentExternalSourceTraceMapping = Readonly<{
  sourceResultId: AgentExternalSourceResultId;
  sourceResultDigest: CanonicalDigest;
  sourceTraceRef: string;
  sourceOwnerId: string;
  verifiedSnapshotDigest?: CanonicalDigest;
  mappedAt: Instant;
  mappingDigest: CanonicalDigest;
}>;

export type AgentRetrievalIndexIdentity = Readonly<{
  indexId: AgentRetrievalIndexId;
  projectId: string;
  workspaceId: string;
  operatorId: string;
  providerConfigurationId?: string;
  corpusRevision: AgentWorkspaceRevisionVector;
  corpusManifestDigest: CanonicalDigest;
  chunkerId: string;
  chunkerVersion: string;
  chunkerDigest: CanonicalDigest;
  embeddingModelDigest: CanonicalDigest;
  rankerDigest: CanonicalDigest;
  visibilityPolicyDigest: CanonicalDigest;
  storageRegion?: string;
  retentionPolicyDigest: CanonicalDigest;
  tenantIsolation: 'proven' | 'unproven';
  ambientMemory: 'disabled';
  createdAt: Instant;
  expiresAt: Instant;
  indexDigest: CanonicalDigest;
}>;

export type AgentRetrievalIndexDeletionReceipt = Readonly<{
  indexId: AgentRetrievalIndexId;
  indexDigest: CanonicalDigest;
  operatorId: string;
  status: 'deleted' | 'not-found' | 'failed';
  residualState: 'none' | 'detected' | 'unknown';
  deletedAt: Instant;
  providerReceiptDigest?: CanonicalDigest;
  receiptDigest: CanonicalDigest;
}>;

export type AgentHostedSandboxDescriptor = Readonly<{
  sandboxId: string;
  runtimeId: string;
  runtimeImageDigest: CanonicalDigest;
  packageManifestDigest: CanonicalDigest;
  workspaceMount: 'none' | 'read-only-snapshot';
  network: 'none' | 'policy-bound';
  networkPolicyDigest?: CanonicalDigest;
  secretInjection: 'none' | 'callback-bound-purpose-only';
  ambientEnvironment: 'disabled';
  maxInputBytes: number;
  maxOutputBytes: number;
  maxFiles: number;
  maxFileBytes: number;
  maxElapsedMs: number;
  maxComputeSeconds: number;
  cleanupRequired: true;
  descriptorDigest: CanonicalDigest;
}>;

export type AgentHostedSandboxReceipt = Readonly<{
  sandboxId: string;
  descriptorDigest: CanonicalDigest;
  callId: AgentToolCallId;
  runtimeImageDigest: CanonicalDigest;
  packageManifestDigest: CanonicalDigest;
  networkPolicyDigest?: CanonicalDigest;
  inputDigest: CanonicalDigest;
  outputDigest?: CanonicalDigest;
  outputByteLength: number;
  filesystemDiffDigest?: CanonicalDigest;
  usage: AgentUsageVector;
  cleanupReceiptDigest: CanonicalDigest;
  completedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentMcpServerIdentity = Readonly<{
  serverId: string;
  publisherId: string;
  operatorId: string;
  version: string;
  implementationDigest: CanonicalDigest;
  manifestDigest: CanonicalDigest;
  transport: 'stdio' | 'streamable-http';
  transportPolicyDigest: CanonicalDigest;
  authPolicyDigest: CanonicalDigest;
  networkPolicyDigest: CanonicalDigest;
  statePolicyDigest: CanonicalDigest;
  retentionPolicyDigest: CanonicalDigest;
  admittedToolDescriptorDigests: readonly CanonicalDigest[];
  disabledCapabilities: readonly (
    | 'sampling'
    | 'roots'
    | 'filesystem'
    | 'elicitation'
    | 'notifications'
    | 'nested-model-call'
  )[];
  installation: 'preinstalled';
  trust: 'operator-pinned';
  identityDigest: CanonicalDigest;
}>;

export type AgentComputerUseSession = Readonly<{
  sessionId: AgentComputerUseSessionId;
  taskId: AgentTaskId;
  runId: AgentRunId;
  generation: number;
  purpose: 'verification-read-only';
  environment: 'disposable-evaluation';
  browserProfile: 'fresh-disposable';
  workspaceAccess: 'none' | 'read-only-snapshot';
  productionSessionAccess: 'none';
  targetAllowlist: readonly string[];
  networkPolicyDigest: CanonicalDigest;
  maxSteps: number;
  maxElapsedMs: number;
  viewportDigest: CanonicalDigest;
  browserIdentityDigest: CanonicalDigest;
  createdAt: Instant;
  expiresAt: Instant;
  sessionDigest: CanonicalDigest;
}>;

export type AgentComputerUseAction = Readonly<{
  actionId: string;
  kind: 'observe' | 'scroll' | 'pointer' | 'keyboard' | 'navigate';
  target: string;
  parametersDigest: CanonicalDigest;
  screenshotDigest: CanonicalDigest;
  viewportDigest: CanonicalDigest;
  browserIdentityDigest: CanonicalDigest;
  suggestedByInvocationId: AgentInvocationId;
}>;

export type AgentComputerUseActionAuthorization = Readonly<{
  sessionId: AgentComputerUseSessionId;
  sessionDigest: CanonicalDigest;
  generation: number;
  step: number;
  actionDigest: CanonicalDigest;
  adapterId: string;
  authorizedAt: Instant;
  expiresAt: Instant;
  authorizationDigest: CanonicalDigest;
}>;

export type AgentComputerUseStepReceipt = Readonly<{
  sessionId: AgentComputerUseSessionId;
  sessionDigest: CanonicalDigest;
  generation: number;
  step: number;
  action: AgentComputerUseAction;
  adapterAuthorizationDigest: CanonicalDigest;
  resultDigest: CanonicalDigest;
  usage: AgentUsageVector;
  completedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentParallelToolCall = Readonly<{
  callId: AgentToolCallId;
  descriptorDigest: CanonicalDigest;
  effect: AgentToolEffect;
  concurrencyPolicyDigest: CanonicalDigest;
  targetScopeDigest: CanonicalDigest;
  sourceSnapshotDigest?: CanonicalDigest;
  inputDigest: CanonicalDigest;
}>;

export type AgentParallelToolPlan = Readonly<{
  groupId: string;
  taskId: AgentTaskId;
  runId: AgentRunId;
  generation: number;
  calls: readonly AgentParallelToolCall[];
  maxFanOut: number;
  planDigest: CanonicalDigest;
}>;

export type AgentStagedToolResult = Readonly<{
  callId: AgentToolCallId;
  descriptorDigest: CanonicalDigest;
  generation: number;
  status: 'succeeded' | 'failed' | 'cancelled' | 'late';
  resultDigest?: CanonicalDigest;
  completedAt: Instant;
}>;

export type AgentParallelToolJoinReceipt = Readonly<{
  groupId: string;
  planDigest: CanonicalDigest;
  generation: number;
  joinedCallIds: readonly AgentToolCallId[];
  cancelledCallIds: readonly AgentToolCallId[];
  lateCallIds: readonly AgentToolCallId[];
  status: 'joined' | 'conflicted' | 'incomplete' | 'fenced';
  resultDigest?: CanonicalDigest;
  receiptDigest: CanonicalDigest;
}>;

export type AgentManagedAgentAdmission = Readonly<{
  providerAgentId: string;
  taskId: AgentTaskId;
  runId: AgentRunId;
  taskMode: 'explain' | 'plan' | 'propose' | 'apply';
  requestedEffect: AgentToolEffect;
  perStepReceipts: 'available' | 'opaque';
  delegatedToolSelection: 'none' | 'provider-managed';
  providerState: 'none' | 'opaque';
  outputAuthority: 'external-untrusted';
  admittedSupportTier: 'admission-only' | 'disabled';
  admissionDigest: CanonicalDigest;
}>;

export type AgentHostedFact =
  | Readonly<{ factType: 'tool-descriptor'; value: AgentToolDescriptor }>
  | Readonly<{
      factType: 'tool-registry-snapshot';
      value: AgentToolRegistrySnapshot;
    }>
  | Readonly<{
      factType: 'tool-discovery-receipt';
      value: AgentToolDiscoveryReceipt;
    }>
  | Readonly<{
      factType: 'tool-call-receipt';
      value: AgentToolCallReceipt;
    }>
  | Readonly<{
      factType: 'external-source-result';
      value: AgentExternalSourceResult;
    }>
  | Readonly<{
      factType: 'retrieval-query-receipt';
      value: AgentRetrievalQueryReceipt;
    }>
  | Readonly<{
      factType: 'retrieval-index-identity';
      value: AgentRetrievalIndexIdentity;
    }>
  | Readonly<{
      factType: 'retrieval-index-deletion-receipt';
      value: AgentRetrievalIndexDeletionReceipt;
    }>
  | Readonly<{
      factType: 'hosted-sandbox-descriptor';
      value: AgentHostedSandboxDescriptor;
    }>
  | Readonly<{
      factType: 'mcp-server-identity';
      value: AgentMcpServerIdentity;
    }>
  | Readonly<{
      factType: 'computer-use-session';
      value: AgentComputerUseSession;
    }>
  | Readonly<{
      factType: 'parallel-tool-join-receipt';
      value: AgentParallelToolJoinReceipt;
    }>;
