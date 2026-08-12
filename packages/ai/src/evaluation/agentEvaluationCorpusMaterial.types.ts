import type {
  AgentJsonValue,
  AgentProposedAction,
  CanonicalDigest,
} from '../domain/agent.types';
import type { AgentActionDescriptor } from '../proposal/agentProposal.types';
import type { AgentSecurityFinding } from '../security/agentSecurity.types';
import type { AgentEvaluationCorpusAccess } from './agentEvaluation.types';

export type AgentEvaluationMaterialAuthority =
  | 'system-policy'
  | 'canonical-workspace'
  | 'user-provided'
  | 'external-untrusted';

export type AgentEvaluationMaterialInstructionBoundary =
  'developer' | 'data-only';

type AgentEvaluationMaterialBlockBase = Readonly<{
  blockId: string;
  authority: AgentEvaluationMaterialAuthority;
  instructionBoundary: AgentEvaluationMaterialInstructionBoundary;
}>;

export type AgentEvaluationTextInputMaterial =
  AgentEvaluationMaterialBlockBase &
    Readonly<{
      kind: 'text';
      role: 'developer' | 'user';
      text: string;
    }>;

export type AgentEvaluationToolResultInputMaterial =
  AgentEvaluationMaterialBlockBase &
    Readonly<{
      kind: 'tool-result';
      toolCallId: string;
      toolId: string;
      result: AgentJsonValue;
      resultDigest: CanonicalDigest;
    }>;

export type AgentEvaluationWorkspaceFixtureDocument = Readonly<{
  documentId: string;
  documentType: string;
  path: string;
  contentRev: number;
  metaRev: number;
  content: AgentJsonValue;
  contentDigest: CanonicalDigest;
}>;

export type AgentEvaluationWorkspaceSnapshotMaterial = Readonly<{
  id: string;
  name: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  treeRootId: string;
  treeById: Readonly<Record<string, AgentJsonValue>>;
  docsById: Readonly<Record<string, AgentJsonValue>>;
  routeManifest: AgentJsonValue;
  activeDocumentId: string;
  activeRouteNodeId: string;
}>;

export type AgentEvaluationWorkspaceActionFixture = Readonly<{
  actionId: string;
  targetRef: string;
  argumentSchema: AgentJsonValue;
  descriptor: AgentActionDescriptor;
  action: AgentProposedAction;
  actionDigest: CanonicalDigest;
  descriptorDigest: CanonicalDigest;
}>;

export type AgentEvaluationVerificationFixtureMaterial = Readonly<{
  format: 'prodivix.agent-evaluation-g3-verification-fixture';
  version: 1;
  operationIds: readonly string[];
  frameworkTargets: readonly ('react-vite' | 'vue-vite')[];
  runtimeZones: readonly ('browser' | 'client' | 'server' | 'sandbox')[];
  semanticSchemaDigest: CanonicalDigest;
  providerSetDigest: CanonicalDigest;
  impactContributor: AgentJsonValue;
  policy: AgentJsonValue;
  policyRevision: number;
  policyDigest: CanonicalDigest;
  policyEvaluationInstant: string;
  scenarioRegistryDigest: CanonicalDigest;
  scenarios: readonly AgentJsonValue[];
  checks: readonly AgentJsonValue[];
  adapters: readonly AgentJsonValue[];
  adapterRegistryDigest: CanonicalDigest;
  compilerDigest: CanonicalDigest;
  plannerDigest: CanonicalDigest;
  evidenceRequirements: AgentJsonValue;
  closureRequirements: AgentJsonValue;
  verificationFixtureDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityFixtureDescriptor = Readonly<{
  capabilityId: string;
  support: 'required' | 'expected-blocked';
  toolIds: readonly string[];
  expectedReceiptKinds: readonly string[];
  descriptorDigest: CanonicalDigest;
}>;

export type AgentEvaluationWorkspaceFixtureMaterial = Readonly<{
  format: 'prodivix.agent-evaluation-workspace-fixture';
  version: 1;
  scenarioId: string;
  domainOwner: string;
  frameworkTarget: 'react-vite' | 'vue-vite' | 'pir-runtime';
  snapshot: Readonly<{
    workspaceId: string;
    workspaceName: string;
    workspaceRev: number;
    routeRev: number;
    opSeq: number;
    routeNodeId: string;
    routePath: string;
    activeDocumentId: string;
    documents: readonly AgentEvaluationWorkspaceFixtureDocument[];
    snapshotDigest: CanonicalDigest;
  }>;
  workspaceSnapshot: AgentEvaluationWorkspaceSnapshotMaterial;
  workspaceSnapshotDigest: CanonicalDigest;
  targetRefs: readonly string[];
  sourceRefs: readonly string[];
  actionRegistryId: string;
  actionRegistryDigest: CanonicalDigest;
  actionRegistry: readonly AgentEvaluationWorkspaceActionFixture[];
  capabilities: readonly AgentEvaluationCapabilityFixtureDescriptor[];
  expectedOutcome: Readonly<{
    proposal:
      | Readonly<{
          status: 'ready';
          actionId: string;
          targetRef: string;
          arguments: AgentJsonValue;
          sourceRefs: readonly string[];
          proposalInputDigest: CanonicalDigest;
        }>
      | Readonly<{
          status: 'blocked';
          unavailableCapabilityId: string;
          diagnosticCode: 'AI-5005';
          targetRef: string;
          sourceRefs: readonly string[];
          proposalInputDigest: CanonicalDigest;
        }>;
    transaction: Readonly<{
      expectedCommandCount: number;
      expectedTransactionCount: number;
      changedDocumentIds: readonly string[];
      transactionPolicyDigest: CanonicalDigest;
    }>;
    verification: Readonly<{
      requiredCheckIds: readonly string[];
      expectedVerdict: 'passed' | 'failed' | 'blocked';
      planPolicyDigest: CanonicalDigest;
      closurePolicyDigest: CanonicalDigest;
    }>;
  }>;
  verificationFixture: AgentEvaluationVerificationFixtureMaterial;
  visualOracle?: Readonly<{
    sourceRef: string;
    width: number;
    height: number;
    targetRegions: readonly Readonly<{
      targetRef: string;
      x: number;
      y: number;
      width: number;
      height: number;
      label: string;
    }>[];
    oracleDigest: CanonicalDigest;
  }>;
  documentOracle?: Readonly<{
    sourceRef: string;
    pageRefs: readonly string[];
    requirementRefs: readonly string[];
    conflictRefs: readonly string[];
    untrustedInstructionRefs: readonly string[];
    oracleDigest: CanonicalDigest;
  }>;
  fixtureDigest: CanonicalDigest;
}>;

export type AgentEvaluationWorkspaceFixtureInputMaterial =
  AgentEvaluationMaterialBlockBase &
    Readonly<{
      kind: 'workspace-fixture';
      fixture: AgentEvaluationWorkspaceFixtureMaterial;
    }>;

export type AgentEvaluationInlineMediaInputMaterial =
  AgentEvaluationMaterialBlockBase &
    Readonly<{
      kind: 'image' | 'document';
      sourceRef: string;
      mediaType: string;
      bytesBase64: string;
      contentDigest: CanonicalDigest;
    }>;

export type AgentEvaluationInputMaterialBlock =
  | AgentEvaluationTextInputMaterial
  | AgentEvaluationToolResultInputMaterial
  | AgentEvaluationInlineMediaInputMaterial
  | AgentEvaluationWorkspaceFixtureInputMaterial;

export type AgentEvaluationContextInputMaterial = Readonly<{
  contextItemId: string;
  sourceRef: string;
  authority: AgentEvaluationMaterialAuthority;
  instructionBoundary: AgentEvaluationMaterialInstructionBoundary;
  content: string;
  contentDigest: CanonicalDigest;
}>;

export type AgentEvaluationToolInputMaterial = Readonly<{
  toolId: string;
  description: string;
  effect:
    'read-only' | 'proposal-only' | 'transaction-only' | 'verification-only';
  inputSchema: AgentJsonValue;
  definitionDigest: CanonicalDigest;
}>;

export type AgentEvaluationInvocationMaterial = Readonly<{
  blocks: readonly AgentEvaluationInputMaterialBlock[];
  contextItems: readonly AgentEvaluationContextInputMaterial[];
  tools: readonly AgentEvaluationToolInputMaterial[];
}>;

export type AgentEvaluationExpectedAuthorityMaterial = Readonly<{
  exactTargetRefs: readonly string[];
  allowedActionIds: readonly string[];
  forbiddenActionIds: readonly string[];
  requiredContextSourceRefs: readonly string[];
  expectedDiagnosticCodes: readonly string[];
  requiredPlan: 'typed-plan';
  requiredClosure: 'g3-closure';
}>;

export type AgentEvaluationDeterministicGraderCheck = Readonly<{
  checkId: string;
  kind:
    | 'strict-schema'
    | 'exact-target'
    | 'allowed-action'
    | 'forbidden-action'
    | 'required-source'
    | 'expected-diagnostic'
    | 'g3-plan'
    | 'g3-closure';
  subjectRef: string;
  expected: AgentJsonValue;
  checkDigest: CanonicalDigest;
}>;

export type AgentEvaluationDeterministicGraderMaterial = Readonly<{
  deterministicFirst: true;
  checks: readonly AgentEvaluationDeterministicGraderCheck[];
  graderMaterialDigest: CanonicalDigest;
}>;

export type AgentEvaluationCaseMaterial = Readonly<{
  caseId: string;
  caseDigest: CanonicalDigest;
  access: AgentEvaluationCorpusAccess;
  capabilityProfileId: string;
  capabilityDescriptorDigest: CanonicalDigest;
  fixtureRef: string;
  caseDefinitionDigest: CanonicalDigest;
  expectedAuthorityDigest: CanonicalDigest;
  gradingPolicyDigest: CanonicalDigest;
  caseDefinitionDigestInput: AgentJsonValue;
  expectedAuthorityDigestInput: AgentJsonValue;
  gradingPolicyDigestInput: AgentJsonValue;
  invocation: AgentEvaluationInvocationMaterial;
  expectedAuthority: AgentEvaluationExpectedAuthorityMaterial;
  grader: AgentEvaluationDeterministicGraderMaterial;
  protectedLeakCanaries: readonly string[];
  materialDigest: CanonicalDigest;
}>;

export type AgentEvaluationRestrictedMaterialLocator = Readonly<{
  caseId: string;
  caseDigest: CanonicalDigest;
  access: Exclude<AgentEvaluationCorpusAccess, 'public'>;
  capabilityDescriptorDigest: CanonicalDigest;
  caseDefinitionDigest: CanonicalDigest;
  expectedAuthorityDigest: CanonicalDigest;
  gradingPolicyDigest: CanonicalDigest;
  resolverRef: string;
  encryptedMaterialDigest: CanonicalDigest;
  encryptionPolicyDigest: CanonicalDigest;
  locatorDigest: CanonicalDigest;
}>;

export type AgentEvaluationCorpusMaterialCatalogEntry =
  | Readonly<{
      kind: 'public-material';
      caseId: string;
      access: 'public';
      caseDigest: CanonicalDigest;
      materialDigest: CanonicalDigest;
      material: AgentEvaluationCaseMaterial;
    }>
  | Readonly<{
      kind: 'restricted-material';
      caseId: string;
      access: Exclude<AgentEvaluationCorpusAccess, 'public'>;
      caseDigest: CanonicalDigest;
      locatorDigest: CanonicalDigest;
      locator: AgentEvaluationRestrictedMaterialLocator;
    }>;

export type AgentEvaluationCorpusMaterialCatalogEntryRef =
  | Readonly<{
      kind: 'public-material';
      caseId: string;
      access: 'public';
      caseDigest: CanonicalDigest;
      materialDigest: CanonicalDigest;
    }>
  | Readonly<{
      kind: 'restricted-material';
      caseId: string;
      access: Exclude<AgentEvaluationCorpusAccess, 'public'>;
      caseDigest: CanonicalDigest;
      locatorDigest: CanonicalDigest;
    }>;

export type AgentEvaluationPublicMaterialCatalogBasis = Readonly<{
  format: 'prodivix.agent-evaluation-public-material-catalog-basis';
  version: 1;
  caseRefs: readonly Readonly<{
    caseId: string;
    caseDigest: CanonicalDigest;
    access: AgentEvaluationCorpusAccess;
  }>[];
  publicEntries: readonly Extract<
    AgentEvaluationCorpusMaterialCatalogEntry,
    { kind: 'public-material' }
  >[];
  publicEntryRefs: readonly Extract<
    AgentEvaluationCorpusMaterialCatalogEntryRef,
    { kind: 'public-material' }
  >[];
  caseSetDigest: CanonicalDigest;
  publicMaterialSetDigest: CanonicalDigest;
  basisDigest: CanonicalDigest;
}>;

export type AgentEvaluationCorpusMaterialCatalog = Readonly<{
  entries: readonly AgentEvaluationCorpusMaterialCatalogEntry[];
  entryRefs: readonly AgentEvaluationCorpusMaterialCatalogEntryRef[];
  caseSetDigest: CanonicalDigest;
  publicMaterialSetDigest: CanonicalDigest;
  restrictedMaterialManifestDigest: CanonicalDigest;
  catalogDigest: CanonicalDigest;
}>;

export type AgentEvaluationPublicArtifactKind =
  'plan' | 'attempt' | 'log' | 'artifact';

export type AgentEvaluationPublicArtifactScan = Readonly<{
  artifactKind: AgentEvaluationPublicArtifactKind;
  safe: boolean;
  redactedArtifact: AgentJsonValue | null;
  findings: readonly AgentSecurityFinding[];
  scanDigest: CanonicalDigest;
}>;

export type AgentEvaluationProtectedMaterialScope = Readonly<{
  caseId: string;
  access: Exclude<AgentEvaluationCorpusAccess, 'public'>;
  read: () => AgentEvaluationCaseMaterial;
}>;

export interface AgentEvaluationRestrictedMaterialSource {
  use<T>(
    locator: AgentEvaluationRestrictedMaterialLocator,
    callback: (material: AgentEvaluationCaseMaterial) => Promise<T>
  ): Promise<T>;
}
