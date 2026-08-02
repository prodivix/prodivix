import { describe, expect, it } from 'vitest';
import type {
  AgentApprovalDecision,
  AgentCapabilityGrant,
  AgentPolicy,
  AgentWorkspaceRevisionVector,
} from '../domain/agent.types';
import { digestAgentPolicy } from '../domain/agentPolicyCodec';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createV1Policy } from '../__tests__/agentV1Fixtures';
import {
  createAgentActionDescriptor,
  createAgentActionRegistrySnapshot,
} from './agentActionRegistry';
import { createAgentActionProposal } from './agentProposal';
import {
  createAgentProposalPlanningReceipt,
  createAgentProposalPreview,
} from './agentProposalPreview';
import {
  createAgentApprovalDecision,
  preflightAgentApproval,
} from './agentApproval';
import {
  createAgentWorkspaceMutationReceipt,
  preflightAgentRollback,
} from './agentWorkspaceMutation';
import type { AgentRollbackPreflightContext } from './agentProposal.types';

const NOW = '2026-08-01T10:00:00.000Z';
const LATER = '2026-08-01T10:05:00.000Z';
const EXPIRY = '2026-08-01T11:00:00.000Z';
const actor = Object.freeze({
  kind: 'user' as const,
  principalId: 'user.test',
});
const revision: AgentWorkspaceRevisionVector = Object.freeze({
  workspaceRev: 42,
  routeRev: 8,
  opSeq: 144,
  documents: Object.freeze([
    Object.freeze({ documentId: 'page.catalog', contentRev: 21, metaRev: 3 }),
    Object.freeze({ documentId: 'route.catalog', contentRev: 4, metaRev: 1 }),
  ]),
});
const budget = Object.freeze({
  usageLimits: Object.freeze([
    Object.freeze({ unit: 'text-token-input' as const, maximum: '10000' }),
  ]),
  costLimits: Object.freeze([
    Object.freeze({ currency: 'USD', maximum: '10' }),
  ]),
  maxModelInvocations: 2,
  maxToolCalls: 2,
  maxRepairRounds: 1,
  maxTransactions: 1,
  maxArtifactBytes: 1024,
  maxElapsedMs: 600_000,
});

const registry = createAgentActionRegistrySnapshot('registry.g4-v5', [
  createAgentActionDescriptor({
    descriptorId: 'action.pir.document-update',
    ownerId: 'prodivix.pir',
    actionType: 'document.update',
    inputSchemaId: 'pir.document-update@current',
    requiredCapabilities: ['read', 'propose'],
    allowedTargetKinds: ['document'],
    maximumInputBytes: 64 * 1024,
    risk: {
      id: 'risk.pir-change',
      level: 'medium',
      message: 'Changes PIR authoring state.',
    },
  }),
  createAgentActionDescriptor({
    descriptorId: 'action.route.rename-segment',
    ownerId: 'prodivix.route',
    actionType: 'segment.rename',
    inputSchemaId: 'route.segment-rename@current',
    requiredCapabilities: ['read', 'propose'],
    allowedTargetKinds: ['semantic-target'],
    maximumInputBytes: 4096,
    risk: {
      id: 'risk.route-change',
      level: 'high',
      message: 'Changes route reachability.',
    },
  }),
]);

const proposal = createAgentActionProposal(registry, {
  proposalId: 'proposal.g4-v5.catalog',
  taskId: 'task.g4-v5.catalog',
  runId: 'run.g4-v5.catalog',
  baseRevision: revision,
  contextPackDigest: digestAgentCanonicalValue('context.g4-v5'),
  actions: [
    {
      ownerId: 'prodivix.route',
      actionType: 'segment.rename',
      inputSchemaId: 'route.segment-rename@current',
      target: { kind: 'semantic-target', id: 'route.products' },
      input: { segment: 'inventory' },
    },
    {
      ownerId: 'prodivix.pir',
      actionType: 'document.update',
      inputSchemaId: 'pir.document-update@current',
      target: { kind: 'document', id: 'page.catalog' },
      input: { title: 'Inventory' },
    },
  ],
  explanation: 'Update the Catalog page and its route.',
  assumptions: ['The authenticated Catalog remains the selected target.'],
  requestedVerification: {
    policyRef: 'verification.policy.catalog',
    requiredCheckKinds: ['unit', 'browser-e2e'],
  },
  modelInvocationRefs: ['invocation.g4-v5.catalog'],
});

const planning = createAgentProposalPlanningReceipt({
  proposalId: proposal.proposalId,
  baseRevision: revision,
  proposedSnapshotDigest: digestAgentCanonicalValue('snapshot.proposed'),
  transactionDigest: digestAgentCanonicalValue('transaction.forward'),
  reverseTransactionDigest: digestAgentCanonicalValue('transaction.reverse'),
  semanticDiffDigest: digestAgentCanonicalValue('semantic.diff'),
  impactSetRef: 'impact.g4-v5.catalog',
  impactDigest: digestAgentCanonicalValue('impact.g4-v5.catalog'),
  verificationPlanRef: 'plan.g4-v5.catalog',
  verificationPlanDigest: digestAgentCanonicalValue('plan.g4-v5.catalog'),
  sourceTraceDigest: digestAgentCanonicalValue('source-trace.g4-v5.catalog'),
  requiredCapabilities: ['read', 'propose'],
  risks: registry.descriptors.map(({ risk }) => risk),
  diagnosticRefs: [],
  plannedAt: NOW,
  expiresAt: EXPIRY,
});

const preview = createAgentProposalPreview({
  previewId: 'preview.g4-v5.catalog',
  proposal,
  planning,
});

const basePolicy = createV1Policy('policy.g4-v5.catalog');
const policy: AgentPolicy = Object.freeze({
  ...basePolicy,
  id: 'policy.g4-v5.catalog',
  name: 'G4 V5 Catalog policy',
  contextRules: Object.freeze({
    allowedAuthorities: Object.freeze(['canonical', 'derived'] as const),
    allowedItemKinds: Object.freeze(['workspace-document']),
    maximumSensitivity: 'internal',
    maxItems: 256,
    maxBytes: 262_144,
    requireSourceTrace: true,
    externalInstructionBoundary: 'data-only',
  }),
  capabilityRules: Object.freeze([
    Object.freeze({
      id: 'capability.g4-v5.catalog',
      effect: 'allow' as const,
      capabilities: Object.freeze([
        'approve',
        'commit',
        'propose',
        'read',
        'rollback',
      ] as const),
      targetScope: Object.freeze({
        targets: Object.freeze([
          Object.freeze({
            kind: 'workspace' as const,
            id: 'workspace.catalog',
          }),
        ]),
      }),
      toolIds: Object.freeze([]),
      runtimeZones: Object.freeze(['server'] as const),
      maximumRisk: 'critical' as const,
    }),
  ]),
  approvalRules: Object.freeze([
    Object.freeze({
      id: 'approval.g4-v5.catalog',
      riskLevels: Object.freeze(['critical', 'high', 'low', 'medium'] as const),
      capabilities: Object.freeze(['commit', 'rollback'] as const),
      decisionAuthority: 'explicit-human' as const,
      rollbackAuthorization: 'on-unsatisfied-closure' as const,
    }),
  ]),
  networkRules: Object.freeze([]),
  secretRules: Object.freeze([]),
  budgetCeiling: budget,
  verificationRules: Object.freeze({
    requiredModes: Object.freeze(['apply'] as const),
    requiredClosure: 'satisfied' as const,
    requiredCheckKinds: Object.freeze(['browser-e2e', 'unit']),
    repair: 'approval-bound' as const,
    rollback: 'approval-bound' as const,
  }),
  retentionRules: Object.freeze({
    auditDays: 30,
    sanitizedTraceDays: 7,
    rawPrivateArtifactDays: 0,
    providerStateDays: 0,
    requireDeletionReceipt: true,
  }),
  privacy: Object.freeze({
    maximumSensitivity: 'internal' as const,
    allowedRegions: Object.freeze([]),
    providerTraining: 'deny' as const,
    providerTelemetry: 'deny' as const,
    rawArtifactCapture: 'deny' as const,
  }),
});
const policyDigest = digestAgentPolicy(policy);

const grant: AgentCapabilityGrant = Object.freeze({
  grantId: 'grant.g4-v5.catalog',
  subject: actor,
  taskId: proposal.taskId,
  runId: proposal.runId,
  workspaceId: 'workspace.catalog',
  baseRevision: revision,
  targetScope: Object.freeze({
    targets: Object.freeze([
      Object.freeze({ kind: 'workspace' as const, id: 'workspace.catalog' }),
    ]),
  }),
  capabilities: Object.freeze([
    'read',
    'propose',
    'approve',
    'commit',
    'rollback',
  ] as const),
  toolIds: Object.freeze([]),
  runtimeZones: Object.freeze([]),
  secretRefs: Object.freeze([]),
  limits: Object.freeze({ budget, maxUses: 1 }),
  policyRef: Object.freeze({ documentId: policy.id }),
  policyDigest,
  issuedAt: NOW,
  expiresAt: EXPIRY,
  maxUses: 1,
});

const decision = createAgentApprovalDecision({
  decisionId: 'decision.g4-v5.catalog',
  decision: 'approved',
  actor,
  taskId: proposal.taskId,
  runId: proposal.runId,
  previewId: preview.previewId,
  previewDigest: preview.previewDigest,
  baseRevision: revision,
  transactionDigest: preview.transactionDigest,
  impactDigest: preview.impactDigest,
  verificationPlanDigest: preview.verificationPlanDigest,
  grantRef: Object.freeze({ grantId: grant.grantId }),
  policyDigest,
  rollbackAuthorization: 'on-unsatisfied-closure',
  decidedAt: NOW,
  expiresAt: EXPIRY,
});

const authorizationDigest = digestAgentCanonicalValue({
  actor,
  projectId: 'project.catalog',
  workspaceId: grant.workspaceId,
});

const approvalContext = () => ({
  proposal,
  preview,
  planning,
  decision,
  grant,
  policy,
  currentRevision: revision,
  actorAuthorizationDigest: authorizationDigest,
  expectedActorAuthorizationDigest: authorizationDigest,
  actorAuthorized: true,
  grantUseCount: 0,
  at: LATER,
});

describe('G4 V5 proposal and approval contract', () => {
  it('canonicalizes registered actions and rejects generic authority payloads', () => {
    expect(proposal.actions.map(({ ownerId }) => ownerId)).toEqual([
      'prodivix.pir',
      'prodivix.route',
    ]);
    expect(proposal.proposalDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(() =>
      createAgentActionProposal(registry, {
        ...proposal,
        actions: [
          {
            ownerId: 'prodivix.pir',
            actionType: 'document.update',
            inputSchemaId: 'pir.document-update@current',
            target: { kind: 'document', id: 'page.catalog' },
            input: { patch: [{ op: 'replace', path: '/', value: {} }] },
          },
        ],
      })
    ).toThrow(/write authority/iu);
  });

  it('binds preview and explicit human approval to every exact digest', () => {
    expect(preflightAgentApproval(approvalContext())).toMatchObject({
      status: 'ready',
    });
    expect(
      preflightAgentApproval({
        ...approvalContext(),
        currentRevision: {
          ...revision,
          workspaceRev: revision.workspaceRev + 1,
        },
      })
    ).toMatchObject({ status: 'stale', issues: [{ code: 'AI-6001' }] });
    expect(
      preflightAgentApproval({
        ...approvalContext(),
        decision: {
          ...decision,
          transactionDigest: digestAgentCanonicalValue('drifted'),
        },
      })
    ).toMatchObject({ status: 'invalidated', issues: [{ code: 'AI-7006' }] });
    expect(
      preflightAgentApproval({
        ...approvalContext(),
        policy: { ...policy, budgetCeiling: null },
      } as unknown as ReturnType<typeof approvalContext>)
    ).toMatchObject({ status: 'invalidated', issues: [{ code: 'AI-7006' }] });
  });

  it('denies self approval, expired grants, and exhausted grant use', () => {
    expect(() =>
      createAgentApprovalDecision({
        ...decision,
        actor: { kind: 'service', principalId: 'agent.model' },
      } as AgentApprovalDecision)
    ).toThrow(/invalid/iu);
    expect(
      preflightAgentApproval({ ...approvalContext(), grantUseCount: 1 })
    ).toMatchObject({ status: 'rejected', issues: [{ code: 'AI-7001' }] });
    expect(
      preflightAgentApproval({
        ...approvalContext(),
        at: '2026-08-01T12:00:00.000Z',
      })
    ).toMatchObject({ status: 'rejected', issues: [{ code: 'AI-5006' }] });
  });

  it('allows only the approved exact reverse Transaction with no intervening change', () => {
    const targetRevision: AgentWorkspaceRevisionVector = Object.freeze({
      ...revision,
      workspaceRev: revision.workspaceRev + 1,
      opSeq: revision.opSeq + 1,
      documents: Object.freeze(
        revision.documents.map((document) =>
          document.documentId === 'page.catalog'
            ? Object.freeze({
                ...document,
                contentRev: document.contentRev + 1,
              })
            : document
        )
      ),
    });
    const commit = createAgentWorkspaceMutationReceipt({
      receiptId: 'receipt.g4-v5.commit',
      kind: 'commit',
      state: 'acknowledged',
      taskId: proposal.taskId,
      runId: proposal.runId,
      proposalId: proposal.proposalId,
      previewId: preview.previewId,
      decisionId: decision.decisionId,
      operationId: 'transaction.g4-v5.catalog',
      baseRevision: revision,
      transactionDigest: planning.transactionDigest,
      reverseTransactionDigest: planning.reverseTransactionDigest,
      requestDigest: digestAgentCanonicalValue('commit.request'),
      producer: actor,
      startedAt: NOW,
      completedAt: LATER,
      targetRevision,
      mutationDigest: digestAgentCanonicalValue('commit.ack'),
    });
    const rollback = {
      commit,
      approval: approvalContext(),
      trigger: 'unsatisfied-closure' as const,
      currentRevision: targetRevision,
      reverseTransactionDigest: planning.reverseTransactionDigest,
      actorAuthorized: true,
      hasInterveningAuthoring: false,
      hasExternalSideEffects: false,
      at: LATER,
    };
    expect(preflightAgentRollback(rollback)).toMatchObject({ status: 'ready' });
    expect(
      preflightAgentRollback({ ...rollback, hasInterveningAuthoring: true })
    ).toMatchObject({ status: 'blocked', issues: [{ code: 'AI-8004' }] });
    expect(
      preflightAgentRollback({
        ...rollback,
        approval: {
          ...approvalContext(),
          policy: { ...policy, budgetCeiling: null },
        },
      } as unknown as AgentRollbackPreflightContext)
    ).toMatchObject({ status: 'blocked', issues: [{ code: 'AI-8004' }] });
  });
});
