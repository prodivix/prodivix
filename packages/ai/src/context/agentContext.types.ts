import type {
  AgentContextAuthority,
  AgentContextInstructionBoundary,
  AgentContextItem,
  AgentContextItemKind,
  AgentContextOmission,
  AgentContextPack,
  AgentGroundingReference,
  AgentRunId,
  AgentSensitivity,
  AgentTargetScope,
  AgentTaskId,
  AgentWorkspaceRevisionVector,
  CanonicalDigest,
} from '../domain/agent.types';
import type { AgentEffectivePolicy } from '../policy/agentPolicyEvaluation';
import type {
  AgentProviderConfigurationIdentity,
  AgentProviderDataPolicy,
} from '../providers/agentProvider.types';

export type AgentContextContributorKind =
  | 'semantic-index'
  | 'code'
  | 'source-trace'
  | 'issues'
  | 'scenario'
  | 'verification';

export type AgentContextContributorDescriptor = Readonly<{
  contributorId: string;
  kind: AgentContextContributorKind;
  implementationDigest: CanonicalDigest;
  configurationDigest: CanonicalDigest;
  semanticSnapshotRef?: string;
  semanticProviderSetDigest?: CanonicalDigest;
  descriptorDigest: CanonicalDigest;
}>;

export type AgentContextCandidate = Readonly<{
  kind: AgentContextItemKind;
  authority: AgentContextAuthority;
  source: AgentGroundingReference;
  revision: AgentWorkspaceRevisionVector;
  mediaType: string;
  content: string;
  sensitivity: AgentSensitivity;
  instructionBoundary: AgentContextInstructionBoundary;
  sourceTraceRef?: string;
}>;

export type AgentContextContributionRequest = Readonly<{
  workspaceRevision: AgentWorkspaceRevisionVector;
  targetScope: AgentTargetScope;
}>;

export type AgentContextBuildIssue = Readonly<{
  code: 'AI-3001' | 'AI-6010' | 'AI-6011' | 'AI-7002' | 'AI-7003' | 'AI-9001';
  path: string;
  message: string;
  blocking: boolean;
}>;

export type AgentContextContributionResult =
  | Readonly<{
      status: 'ready';
      candidates: readonly AgentContextCandidate[];
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly AgentContextBuildIssue[];
    }>;

export type AgentContextContributor = Readonly<{
  descriptor: AgentContextContributorDescriptor;
  contribute(
    request: AgentContextContributionRequest
  ): AgentContextContributionResult | Promise<AgentContextContributionResult>;
}>;

export type AgentContextProviderBinding = Readonly<{
  provider: AgentProviderConfigurationIdentity;
  dataPolicy: AgentProviderDataPolicy;
}>;

export type AgentContextBudget = Readonly<{
  maxItems: number;
  maxBytes: number;
}>;

export type AgentContextMaterial = Readonly<{
  item: AgentContextItem;
  content: string;
}>;

export type AgentContextBuildRequest = Readonly<{
  taskId: AgentTaskId;
  runId: AgentRunId;
  workspaceRevision: AgentWorkspaceRevisionVector;
  semanticSnapshotRef: string;
  semanticProviderSetDigest: CanonicalDigest;
  targetScope: AgentTargetScope;
  policy: AgentEffectivePolicy;
  providerSet: readonly AgentContextProviderBinding[];
  contributors: readonly AgentContextContributor[];
  requiredContributorKinds?: readonly AgentContextContributorKind[];
  budget?: AgentContextBudget;
  secretCanaries?: readonly string[];
}>;

export type AgentContextBuildResult =
  | Readonly<{
      status: 'ready';
      pack: AgentContextPack;
      materials: readonly AgentContextMaterial[];
      issues: readonly AgentContextBuildIssue[];
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly AgentContextBuildIssue[];
      omitted: readonly AgentContextOmission[];
    }>;
