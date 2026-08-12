import {
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  type AgentEvaluationWorkspaceFixtureMaterial,
} from '@prodivix/ai';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { describe, expect, it } from 'vitest';
import {
  createAgentEvaluationControlledWorkspaceDomainPlan,
  evaluateAgentEvaluationControlledWorkspaceG3,
} from './controlledWorkspaceRuntimeOwners';

const workspaceFixture = (
  proposalStatus: 'ready' | 'blocked'
): Readonly<{
  caseId: string;
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
}> => {
  for (const material of getG4V8PublicEvaluationCaseMaterials()) {
    const block = material.invocation.blocks.find(
      (candidate) => candidate.kind === 'workspace-fixture'
    );
    if (
      block?.kind === 'workspace-fixture' &&
      block.fixture.expectedOutcome.proposal.status === proposalStatus &&
      (proposalStatus === 'blocked' ||
        block.fixture.expectedOutcome.transaction.expectedCommandCount > 0)
    ) {
      return Object.freeze({ caseId: material.caseId, fixture: block.fixture });
    }
  }
  throw new TypeError(`Missing ${proposalStatus} Workspace fixture.`);
};

const issuedAt = '2026-08-08T00:00:10.000Z';
const expiresAt = '2026-08-08T00:10:10.000Z';

describe('controlled Workspace production owner adapters', () => {
  it('plans a current-registry action through a reversible Workspace Transaction', () => {
    const { caseId, fixture } = workspaceFixture('ready');
    const result = createAgentEvaluationControlledWorkspaceDomainPlan({
      caseId,
      attemptId: `attempt.${caseId}.owners`,
      fixture,
      issuedAt,
      expiresAt,
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.plan.transaction.commands).toHaveLength(
      fixture.expectedOutcome.transaction.expectedCommandCount
    );
    expect(result.plan.candidateSnapshot).not.toEqual(
      fixture.workspaceSnapshot
    );
    expect(result.ownerAuthorityReceiptDigests).toContain(
      result.reverseTransactionDigest
    );
  }, 60_000);

  it('keeps the frozen Behavior capability block at zero mutation', () => {
    const { caseId, fixture } = workspaceFixture('blocked');
    const result = createAgentEvaluationControlledWorkspaceDomainPlan({
      caseId,
      attemptId: `attempt.${caseId}.owners`,
      fixture,
      issuedAt,
      expiresAt,
    });

    expect(result).toMatchObject({
      status: 'expected-blocked',
      diagnosticCode: 'AI-5005',
    });
    expect(fixture.expectedOutcome.transaction).toMatchObject({
      expectedCommandCount: 0,
      expectedTransactionCount: 0,
      changedDocumentIds: [],
    });
  });

  it('builds the real G3 plan and remains incomplete without promoted Evidence authority', async () => {
    const { caseId, fixture } = workspaceFixture('ready');
    const domain = createAgentEvaluationControlledWorkspaceDomainPlan({
      caseId,
      attemptId: `attempt.${caseId}.g3`,
      fixture,
      issuedAt,
      expiresAt,
    });
    expect(domain.status).toBe('ready');
    if (domain.status !== 'ready') return;
    const baseWorkspace = fixture.workspaceSnapshot as WorkspaceSnapshot;
    const finalWorkspace = domain.plan.candidateSnapshot;
    const result = await evaluateAgentEvaluationControlledWorkspaceG3({
      evaluationNamespaceId: 'namespace.g4',
      evaluationPlanDigest: digestAgentCanonicalValue('evaluation-plan'),
      repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
      projectId: 'project.g4',
      caseId,
      attemptId: `attempt.${caseId}.g3`,
      descriptorDigest: digestAgentCanonicalValue('attempt-descriptor'),
      capabilityDescriptorDigest: digestAgentCanonicalValue(
        'capability-descriptor'
      ),
      controlledWorkspaceGrantDigest: digestAgentCanonicalValue(
        'controlled-workspace-grant'
      ),
      grantGeneration: 1,
      fixture,
      baseWorkspace,
      finalWorkspace,
      baseSnapshotRef: `workspace-snapshot://${caseId}/base`,
      baseSnapshotDigest: fixture.workspaceSnapshotDigest,
      finalSnapshotRef: `workspace-snapshot://${caseId}/final`,
      finalSnapshotDigest: digestAgentCanonicalValue(finalWorkspace),
      operationReceiptDigests: [digestAgentCanonicalValue('operation')],
      commandReceiptDigests: [digestAgentCanonicalValue('command')],
      transactionReceiptDigests: [digestAgentCanonicalValue('transaction')],
    });

    expect(result.status).toBe('incomplete');
    if (result.status !== 'incomplete') return;
    expect(['plan-blocked', 'evidence-authority-unavailable']).toContain(
      result.reason
    );
    expect(result.planDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(result.ownerAuthorityReceiptDigests).toEqual([
      result.incompleteAuthorityReceiptDigest,
    ]);
  });
});
