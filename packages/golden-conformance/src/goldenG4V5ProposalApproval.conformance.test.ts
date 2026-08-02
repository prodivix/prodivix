import {
  createAgentActionProposal,
  decodeAgentProposalFact,
  digestAgentCanonicalValue,
  encodeAgentProposalFact,
} from '@prodivix/ai';
import {
  applyWorkspaceTransaction,
  WORKSPACE_AGENT_ACTION_REGISTRY,
} from '@prodivix/workspace';
import {
  createWorkspaceAgentProposalProjection,
  prepareWorkspaceAgentCommit,
  prepareWorkspaceAgentRollback,
  reconcileWorkspaceAgentCommit,
  rejectWorkspaceAgentCommitConflict,
} from '@prodivix/workspace-sync';
import { describe, expect, it } from 'vitest';
import {
  cloneWorkspaceWithRevisionDrift,
  createGoldenG4V5ApprovalContext,
  createGoldenG4V5CommitResponse,
  GOLDEN_G4_V5_BASE_WORKSPACE,
  GOLDEN_G4_V5_GRANT,
  GOLDEN_G4_V5_IDS,
  GOLDEN_G4_V5_POLICY,
  GOLDEN_G4_V5_PROJECTION,
  GOLDEN_G4_V5_PROPOSAL,
  GOLDEN_G4_V5_RUN,
  GOLDEN_G4_V5_TASK,
  GOLDEN_G4_V5_TIME,
  prepareGoldenG4V5Commit,
} from './goldenG4V5ProposalApprovalFixture';
import { createGoldenG3V4Plan } from './goldenG3VerificationPlanFixture';

describe('G4 V5 authenticated Catalog proposal and approval Golden', () => {
  it('plans six domains as one atomic reversible Transaction with full review facts', () => {
    const projection = GOLDEN_G4_V5_PROJECTION;
    expect(
      projection.actionPlan.transaction.commands.length
    ).toBeGreaterThanOrEqual(6);
    expect(projection.semanticDiff.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: expect.objectContaining({ kind: 'route-manifest' }),
        }),
        expect.objectContaining({
          semantic: expect.objectContaining({ kind: 'code-source' }),
        }),
        expect.objectContaining({
          semantic: expect.objectContaining({ kind: 'graph-node' }),
        }),
        expect.objectContaining({
          semantic: expect.objectContaining({ kind: 'animation-entity' }),
        }),
      ])
    );
    expect(projection.impactSet.impactedDomains).toEqual(
      expect.arrayContaining([
        'animation',
        'code',
        'data',
        'nodegraph',
        'pir',
        'route',
      ])
    );
    expect(projection.verificationPlan.status).toBe('ready');
    expect(projection.preview.transactionDigest).toBe(
      digestAgentCanonicalValue(projection.actionPlan.transaction)
    );
    const applied = applyWorkspaceTransaction(
      GOLDEN_G4_V5_BASE_WORKSPACE,
      projection.actionPlan.transaction
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const reversed = applyWorkspaceTransaction(
      applied.snapshot,
      projection.actionPlan.reverseTransaction
    );
    expect(reversed).toMatchObject({
      ok: true,
      snapshot: GOLDEN_G4_V5_BASE_WORKSPACE,
    });
  });

  it('fails the whole dry-run and emits no outbox write when one action is invalid', () => {
    const invalid = createAgentActionProposal(WORKSPACE_AGENT_ACTION_REGISTRY, {
      proposalId: 'proposal.golden.g4-v5.invalid',
      taskId: GOLDEN_G4_V5_PROPOSAL.taskId,
      runId: GOLDEN_G4_V5_PROPOSAL.runId,
      baseRevision: GOLDEN_G4_V5_PROPOSAL.baseRevision,
      contextPackDigest: GOLDEN_G4_V5_PROPOSAL.contextPackDigest,
      actions: GOLDEN_G4_V5_PROPOSAL.actions.map((action) =>
        action.ownerId === 'prodivix.data'
          ? { ...action, input: { content: { invalid: true } } }
          : action
      ),
      explanation: GOLDEN_G4_V5_PROPOSAL.explanation,
      assumptions: GOLDEN_G4_V5_PROPOSAL.assumptions,
      requestedVerification: GOLDEN_G4_V5_PROPOSAL.requestedVerification,
      modelInvocationRefs: GOLDEN_G4_V5_PROPOSAL.modelInvocationRefs,
    });
    const result = createWorkspaceAgentProposalProjection({
      workspace: GOLDEN_G4_V5_BASE_WORKSPACE,
      task: GOLDEN_G4_V5_TASK,
      run: GOLDEN_G4_V5_RUN,
      proposal: invalid,
      grant: GOLDEN_G4_V5_GRANT,
      policy: GOLDEN_G4_V5_POLICY,
      transactionId: 'transaction.golden.g4-v5.invalid',
      reverseTransactionId: 'transaction.golden.g4-v5.invalid.reverse',
      issuedAt: GOLDEN_G4_V5_TIME.plan,
      previewId: 'preview.golden.g4-v5.invalid',
      plannedAt: GOLDEN_G4_V5_TIME.plan,
      expiresAt: GOLDEN_G4_V5_TIME.expiry,
      frameworkTargets: ['react-vite', 'vue-vite'],
      runtimeZones: ['browser', 'client', 'server'],
      verificationPlanner: (impactSet) => createGoldenG3V4Plan({ impactSet }),
    });
    expect(result).toMatchObject({ status: 'blocked' });
    expect(GOLDEN_G4_V5_BASE_WORKSPACE).toEqual(
      GOLDEN_G4_V5_PROJECTION.actionPlan.baseSnapshot
    );
    expect(
      createWorkspaceAgentProposalProjection({
        workspace: GOLDEN_G4_V5_BASE_WORKSPACE,
        task: GOLDEN_G4_V5_TASK,
        run: GOLDEN_G4_V5_RUN,
        proposal: GOLDEN_G4_V5_PROPOSAL,
        grant: GOLDEN_G4_V5_GRANT,
        policy: GOLDEN_G4_V5_POLICY,
        transactionId: 'transaction.golden.g4-v5.invalid-time',
        reverseTransactionId: 'transaction.golden.g4-v5.invalid-time.reverse',
        issuedAt: 'not-an-instant',
        previewId: 'preview.golden.g4-v5.invalid-time',
        plannedAt: GOLDEN_G4_V5_TIME.plan,
        expiresAt: GOLDEN_G4_V5_TIME.expiry,
        frameworkTargets: ['react-vite', 'vue-vite'],
        runtimeZones: ['browser', 'client', 'server'],
        verificationPlanner: (impactSet) => createGoldenG3V4Plan({ impactSet }),
      })
    ).toMatchObject({ status: 'blocked' });
  });

  it('commits only exact approval, reconciles strict ACK, and authorizes exact rollback', () => {
    const prepared = prepareGoldenG4V5Commit();
    expect(prepared).toMatchObject({
      status: 'ready',
      outboxEntry: {
        id: GOLDEN_G4_V5_IDS.transaction,
        entryKind: 'operation',
      },
      receipt: { kind: 'commit', state: 'started' },
    });
    if (prepared.status !== 'ready') return;
    const acknowledged = reconcileWorkspaceAgentCommit({
      outboxEntry: prepared.outboxEntry,
      startedReceipt: prepared.receipt,
      response: createGoldenG4V5CommitResponse(),
      receiptId: 'receipt.golden.g4-v5.commit.ack',
      completedAt: GOLDEN_G4_V5_TIME.ack,
    });
    expect(acknowledged).toMatchObject({
      status: 'acknowledged',
      receipt: { kind: 'commit', state: 'acknowledged' },
    });
    if (acknowledged.status !== 'acknowledged') return;
    const approval = createGoldenG4V5ApprovalContext();
    expect(
      prepareWorkspaceAgentRollback({
        projection: GOLDEN_G4_V5_PROJECTION,
        approval,
        commitReceipt: acknowledged.receipt,
        currentSnapshot: acknowledged.snapshot,
        rollbackPreflight: {
          trigger: 'unsatisfied-closure',
          actorAuthorized: true,
          hasInterveningAuthoring: false,
          hasExternalSideEffects: false,
          at: GOLDEN_G4_V5_TIME.ack,
        },
        producer: { kind: 'service', principalId: 'service.golden.g4-v5' },
        receiptId: 'receipt.golden.g4-v5.rollback.started',
        startedAt: GOLDEN_G4_V5_TIME.ack,
        now: Date.parse(GOLDEN_G4_V5_TIME.ack),
      })
    ).toMatchObject({
      status: 'ready',
      receipt: { kind: 'rollback', state: 'started' },
    });
  });

  it('invalidates revision, policy, transaction, and actor drift before Outbox', () => {
    const approval = createGoldenG4V5ApprovalContext();
    const baseInput = {
      projection: GOLDEN_G4_V5_PROJECTION,
      approval,
      currentSnapshot: GOLDEN_G4_V5_BASE_WORKSPACE,
      producer: {
        kind: 'service' as const,
        principalId: 'service.golden.g4-v5',
      },
      receiptId: 'receipt.golden.g4-v5.drift',
      startedAt: GOLDEN_G4_V5_TIME.commit,
      now: Date.parse(GOLDEN_G4_V5_TIME.commit),
    };
    expect(
      prepareWorkspaceAgentCommit({
        ...baseInput,
        currentSnapshot: cloneWorkspaceWithRevisionDrift(
          GOLDEN_G4_V5_BASE_WORKSPACE
        ),
      })
    ).toMatchObject({ status: 'stale' });
    expect(
      prepareWorkspaceAgentCommit({
        ...baseInput,
        approval: {
          ...approval,
          policy: { ...approval.policy, name: 'Drifted policy' },
        },
      })
    ).toMatchObject({ status: 'invalidated' });
    expect(
      prepareWorkspaceAgentCommit({
        ...baseInput,
        projection: {
          ...GOLDEN_G4_V5_PROJECTION,
          actionPlan: {
            ...GOLDEN_G4_V5_PROJECTION.actionPlan,
            transaction: {
              ...GOLDEN_G4_V5_PROJECTION.actionPlan.transaction,
              label: 'Drifted transaction',
            },
          },
        },
      })
    ).toMatchObject({ status: 'invalidated' });
    expect(
      prepareWorkspaceAgentCommit({
        ...baseInput,
        approval: { ...approval, actorAuthorized: false },
      })
    ).toMatchObject({ status: 'rejected' });
  });

  it('turns 409 into a fresh-proposal requirement and never auto-rebases', () => {
    const prepared = prepareGoldenG4V5Commit();
    expect(prepared.status).toBe('ready');
    if (prepared.status !== 'ready') return;
    const conflict = rejectWorkspaceAgentCommitConflict({
      startedReceipt: prepared.receipt,
      conflict: {
        status: 409,
        current: cloneWorkspaceWithRevisionDrift(GOLDEN_G4_V5_BASE_WORKSPACE),
      },
      receiptId: 'receipt.golden.g4-v5.commit.conflict',
      completedAt: GOLDEN_G4_V5_TIME.ack,
    });
    expect(conflict).toMatchObject({
      status: 'new-proposal-required',
      receipt: { state: 'conflicted' },
      issues: [{ code: 'AI-7005' }],
    });
  });

  it('round-trips strict proposal facts and rejects future wire fields', () => {
    const approval = createGoldenG4V5ApprovalContext();
    const prepared = prepareGoldenG4V5Commit();
    expect(prepared.status).toBe('ready');
    if (prepared.status !== 'ready') return;
    const facts = [
      { factType: 'proposal' as const, value: GOLDEN_G4_V5_PROPOSAL },
      {
        factType: 'planning' as const,
        value: GOLDEN_G4_V5_PROJECTION.planning,
      },
      { factType: 'preview' as const, value: GOLDEN_G4_V5_PROJECTION.preview },
      { factType: 'approval' as const, value: approval.decision },
      {
        factType: 'workspace-mutation-receipt' as const,
        value: prepared.receipt,
      },
    ];
    for (const fact of facts) {
      const wire = encodeAgentProposalFact(
        WORKSPACE_AGENT_ACTION_REGISTRY,
        fact
      );
      expect(
        decodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, wire)
      ).toEqual({ ok: true, value: fact });
      expect(
        decodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, {
          ...wire,
          futureAuthority: true,
        })
      ).toMatchObject({ ok: false, issues: [{ code: 'AI-9001' }] });
    }
  });
});
