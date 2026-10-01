import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  reduceAgentRun,
  digestAgentCanonicalValue,
  finalizeAgentRun,
  createAgentRepairTaskRequest,
  createAgentActionProposal,
  createAgentRunControl,
  startAgentRun,
  transitionAgentRunPhase,
  createAgentProductView,
  type AgentRunTransitionResult,
} from '@prodivix/ai';
import {
  applyWorkspaceTransaction,
  createAgentWorkspaceRevisionFromSnapshot,
  WORKSPACE_AGENT_ACTION_REGISTRY,
  createWorkspaceTransactionOperation,
  encodeWorkspaceDocument,
  getWorkspaceOperationId,
  createWorkspaceVerificationImpactSet,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createVerificationPlan,
  applyVerificationRunEvent,
  decodeVerificationPlan,
  encodeVerificationPlan,
} from '@prodivix/verification';
import {
  decodeWorkspaceOperationCommitResponse,
  projectWorkspaceAgentCommittedSnapshot,
} from '@prodivix/workspace-sync';
import { continueAgentRuntimeApply } from '#src/apply.js';
import {
  prepareAgentRuntimeContext,
  prepareAgentRuntimePreview,
} from '#src/composition.js';
import { AgentRuntimeFileJournal } from '#src/fileJournal.js';
import { runtimeApplyFixture } from '#src/apply.fixture.js';
import { time } from '#src/runtime.fixture.js';
import type { AgentRuntimePorts } from '#src/ports.js';
import type { AgentRuntimeVerificationDriver } from '#src/verificationDriver.js';
import {
  completedVerificationFixture,
  verificationViewFixture,
} from '#src/applyEvidence.fixture.js';

const harness = async (
  options: Parameters<typeof runtimeApplyFixture>[0] = {}
) => {
  const fixture = runtimeApplyFixture(options);
  let workspace = fixture.workspace;
  const commitResponses = new Map<string, unknown>();
  let state = fixture.run;
  const journal = new AgentRuntimeFileJournal(
    await mkdtemp(join(tmpdir(), 'prodivix-agent-apply-'))
  );
  await journal.put('proposal', fixture.proposal.proposalId, {
    historicalRun: fixture.historicalRun,
    projection: fixture.projection,
  });
  const ports: Partial<AgentRuntimePorts> = {
    readProduct: vi.fn(async () => fixture.product(state)),
    commitWorkspace: vi.fn(
      async ({
        request,
        receipt,
      }: Parameters<AgentRuntimePorts['commitWorkspace']>[0]) => {
        const operationId = getWorkspaceOperationId(request.operation);
        if (commitResponses.has(operationId))
          return commitResponses.get(operationId);
        if (request.operation.kind !== 'transaction')
          throw new Error('Typed transaction required');
        const before = workspace;
        const transaction =
          receipt.kind === 'rollback'
            ? fixture.projection.actionPlan.reverseTransaction
            : fixture.projection.actionPlan.transaction;
        const applied = applyWorkspaceTransaction(before, transaction);
        if (!applied.ok) throw new Error(JSON.stringify(applied));
        const after = projectWorkspaceAgentCommittedSnapshot(
          before,
          applied.snapshot
        );
        const response = {
          workspaceId: after.id,
          workspaceRev: after.workspaceRev,
          routeRev: after.routeRev,
          opSeq: after.opSeq,
          updatedDocuments: Object.values(after.docsById)
            .filter(
              (document) =>
                digestAgentCanonicalValue(document) !==
                digestAgentCanonicalValue(before.docsById[document.id])
            )
            .map((document) =>
              encodeWorkspaceDocument({ ...document, updatedAt: time })
            ),
          acceptedMutationId: operationId,
        };
        decodeWorkspaceOperationCommitResponse(
          response,
          before,
          createWorkspaceTransactionOperation(transaction)
        );
        workspace = after;
        commitResponses.set(operationId, response);
        return response;
      }
    ),
    readContext: vi.fn(async () => ({ task: fixture.task, workspace })),
    publishMutation: vi.fn(async () => {}),
    createVerificationRun: vi.fn(async ({ request }) => request),
    publishVerificationBinding: vi.fn(async () => {}),
    publishRepairFailure: vi.fn(async () => {}),
    readVerificationRun: vi.fn(async ({ verificationRunId }) => {
      const records = await Promise.all(
        ['', '.rollback'].map((suffix) =>
          journal.read<import('#src/apply.js').AgentRuntimeVerificationRecord>(
            'verification',
            fixture.proposal.proposalId + suffix
          )
        )
      );
      return records
        .flatMap((record) => record?.runs ?? [])
        .find(({ runId }) => runId === verificationRunId)!;
    }),
    readVerificationEvidence: vi.fn(async () => {
      throw new Error('Queued runs do not have Evidence');
    }),
    readVerificationView: vi.fn(async () => {
      throw new Error('Queued runs do not have a Closure view');
    }),
  };
  const driver: AgentRuntimeVerificationDriver = {
    preflight: vi.fn(async () => {}),
    dispatch: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
  };
  const terminal = vi.fn(async (outcome: string) => outcome);
  const persist = async (result: AgentRunTransitionResult) => {
    if (!result.accepted)
      throw new Error(result.issues.map(({ message }) => message).join(';'));
    const reduced = reduceAgentRun(fixture.task, state, result.event);
    expect(reduced.accepted).toBe(true);
    state = result.state;
    fixture.events.push(result.event);
  };
  const input = {
    ...fixture,
    journal,
    ports: ports as AgentRuntimePorts,
    driver,
    state: () => state,
    authority: () => ({
      leaseId: 'lease.fixture',
      holderId: 'worker.fixture',
      generation: state.run.generation,
      observedAt: time,
    }),
    persist,
    terminal,
    succeed: vi.fn(async () => {}),
    now: () => time,
  };
  return {
    input,
    ports,
    driver,
    terminal,
    journal,
    fixture,
    state: () => state,
    workspace: () => workspace,
  };
};

const completeRuns = async (
  h: Awaited<ReturnType<typeof harness>>,
  mutationKey: string,
  kind: 'promoted' | 'missing' | 'revoked'
) => {
  const record = await h.journal.read<
    import('#src/apply.js').AgentRuntimeVerificationRecord
  >('verification', mutationKey);
  if (!record) throw new Error('Verification was not created');
  const completed = record.runs.map((run) =>
    completedVerificationFixture(
      record.plan,
      run,
      h.fixture.task.spec.projectId,
      kind !== 'missing'
    )
  );
  const evidence = completed.flatMap((item) => item.evidence);
  const current = new Map(completed.map((item) => [item.run.runId, item.run]));
  const readInitial = h.input.ports.readVerificationRun;
  h.input.ports.createVerificationRun = vi.fn(
    async ({ request }) => current.get(request.runId) ?? request
  );
  h.input.ports.readVerificationRun = vi.fn(
    async (input, signal) =>
      current.get(input.verificationRunId) ?? readInitial(input, signal)
  );
  h.input.ports.readVerificationEvidence = vi.fn(async ({ evidenceId }) =>
    evidence.find(({ id }) => id === evidenceId)!
  );
  h.input.ports.readVerificationView = vi.fn(async () =>
    verificationViewFixture(evidence, kind === 'revoked')
  );
  h.input.ports.appendVerificationEvent = vi.fn(
    async ({ verificationRunId, event }) => {
      const result = applyVerificationRunEvent(
        current.get(verificationRunId)!,
        event
      );
      if (result.status !== 'applied') throw new Error(result.message);
      current.set(verificationRunId, result.snapshot);
      return result.snapshot;
    }
  );
  h.input.ports.publishVerificationClosure = vi.fn(async () => {});
  return { record, current, evidence };
};

describe('ordinary approved authoring and G3 owner chain', () => {
  it('blocks missing actual execution admission before an Outbox or Workspace write', async () => {
    const h = await harness();
    h.driver.preflight = vi.fn(async () => {
      throw new Error('Driver missing');
    });
    expect(await continueAgentRuntimeApply(h.input)).toBe('blocked');
    expect(h.ports.commitWorkspace).not.toHaveBeenCalled();
    expect(
      await h.journal.read('commit', h.fixture.proposal.proposalId)
    ).toBeUndefined();
  });
  it('commits an exact approved Outbox and binds actual G3 runs without calling dispatch ACK evidence', async () => {
    const h = await harness();
    const status = await continueAgentRuntimeApply(h.input);
    const ack = await h.journal.read<{ snapshot: WorkspaceSnapshot }>(
      'commit-ack',
      h.fixture.proposal.proposalId
    );
    const actualImpact = createWorkspaceVerificationImpactSet({
      before: h.fixture.workspace,
      after: ack!.snapshot,
      operationIds: [h.fixture.projection.actionPlan.transaction.id],
      frameworkTargets: [
        ...new Set(
          h.fixture.binding.verification.checks.flatMap(
            ({ frameworkTargets }) => frameworkTargets
          )
        ),
      ],
      runtimeZones: ['browser', 'server'],
    });
    if (actualImpact.status !== 'ready') throw new Error(actualImpact.message);
    const actual = createVerificationPlan({
      ...h.fixture.binding.verification,
      impactSet: actualImpact.impactSet,
    });
    const differences = Object.keys(actual.plan).filter(
      (key) =>
        digestAgentCanonicalValue(
          actual.plan[key as keyof typeof actual.plan]
        ) !==
        digestAgentCanonicalValue(
          h.fixture.projection.verificationPlan[key as keyof typeof actual.plan]
        )
    );
    expect(
      status,
      JSON.stringify({
        terminal: h.terminal.mock.calls,
        differences,
        cells: actual.plan.cells.map(({ requirement, surface, preflight }) => ({
          requirement,
          surface,
          preflight,
        })),
      })
    ).toBe('verifying');
    expect(h.state().run.phase).toBe('verifying');
    expect(h.ports.publishMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt: expect.objectContaining({ state: 'acknowledged' }),
      }),
      undefined
    );
    expect(h.ports.publishVerificationBinding).toHaveBeenCalled();
    expect(h.driver.dispatch).toHaveBeenCalled();
    expect(h.ports.readVerificationEvidence).not.toHaveBeenCalled();
    expect(h.input.succeed).not.toHaveBeenCalled();
    expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
    expect(h.ports.commitWorkspace).toHaveBeenCalledTimes(1);
    expect(h.driver.dispatch).toHaveBeenCalledTimes(1);
  });
  it('retains the original started Instant and exact request after an ACK is lost', async () => {
    const h = await harness();
    const realCommit = h.ports.commitWorkspace!;
    h.input.ports.commitWorkspace = vi
      .fn()
      .mockRejectedValueOnce(new Error('ACK lost'))
      .mockImplementation(realCommit);
    await expect(continueAgentRuntimeApply(h.input)).rejects.toThrow(
      'ACK lost'
    );
    const original = await h.journal.read(
      'commit',
      h.fixture.proposal.proposalId
    );
    expect(
      await continueAgentRuntimeApply({
        ...h.input,
        now: () => '2026-10-01T00:00:01.000Z',
      })
    ).toBe('verifying');
    expect(
      await h.journal.read('commit', h.fixture.proposal.proposalId)
    ).toEqual(original);
    const calls = vi.mocked(h.input.ports.commitWorkspace).mock.calls;
    expect(calls[0]![0].request).toEqual(calls[1]![0].request);
    expect(calls[0]![0].receipt).toEqual(calls[1]![0].receipt);
  });
  it.each(['promoted', 'missing', 'revoked'] as const)(
    'requires exact durable G3 Closure after %s Evidence',
    async (kind) => {
      const h = await harness();
      expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
      const { record, current } = await completeRuns(
        h,
        h.fixture.proposal.proposalId,
        kind
      );
      const result = await continueAgentRuntimeApply(h.input);
      expect(result, JSON.stringify(h.terminal.mock.calls)).toBe(
        kind === 'promoted' ? 'succeeded' : 'failed'
      );
      expect(h.input.ports.publishVerificationClosure).toHaveBeenCalledWith(
        expect.objectContaining({
          receipt: expect.objectContaining({
            verdict:
              kind === 'promoted'
                ? 'satisfied'
                : kind === 'revoked'
                  ? 'stale'
                  : 'unsatisfied',
          }),
        }),
        undefined
      );
      expect(
        [...current.values()].every(({ closureDigest }) =>
          Boolean(closureDigest)
        )
      ).toBe(true);
      expect(h.input.succeed).toHaveBeenCalledTimes(
        kind === 'promoted' ? 1 : 0
      );
      expect(h.driver.dispatch).toHaveBeenCalledTimes(record!.runs.length);
      if (kind === 'missing')
        expect(h.input.ports.readVerificationEvidence).not.toHaveBeenCalled();
    }
  );
  it('keeps the public Closure receipt exact when publication acknowledgement is lost and server time advances', async () => {
    const h = await harness();
    expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
    const completed = await completeRuns(
      h,
      h.fixture.proposal.proposalId,
      'promoted'
    );
    h.input.ports.publishVerificationClosure = vi
      .fn()
      .mockRejectedValueOnce(new Error('Closure ACK lost'))
      .mockResolvedValue(undefined);
    await expect(continueAgentRuntimeApply(h.input)).rejects.toThrow(
      'Closure ACK lost'
    );
    const first = vi.mocked(h.input.ports.publishVerificationClosure).mock
      .calls[0]![0].receipt;
    const currentView = verificationViewFixture(completed.evidence);
    const { viewDigest: _digest, ...body } = currentView;
    const { createVerificationEvidenceVerifiedView } =
      await import('@prodivix/verification');
    h.input.ports.readVerificationView = vi.fn(async () =>
      createVerificationEvidenceVerifiedView({
        closureEvaluationInstant: '2026-10-01T00:00:01.000Z',
        revocationRecordDigest: body.revocationRecordDigest,
        records: body.records.map(
          ({ recordDigest: _recordDigest, ...record }) => record
        ),
      })
    );
    expect(
      await continueAgentRuntimeApply({
        ...h.input,
        now: () => '2026-10-01T00:00:01.000Z',
      })
    ).toBe('succeeded');
    expect(
      vi.mocked(h.input.ports.publishVerificationClosure).mock.calls[1]![0]
        .receipt
    ).toEqual(first);
    expect(h.input.ports.appendVerificationEvent).toHaveBeenCalledTimes(
      completed.record.runs.length
    );
    expect(
      h
        .state()
        .budgetLedger.reservations.every(({ status }) => status === 'settled')
    ).toBe(true);
  });
  it('charges Closure owner round trips and blocks late publication completion before a successful proof', async () => {
    const h = await harness();
    expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
    await completeRuns(h, h.fixture.proposal.proposalId, 'promoted');
    let at = time;
    h.input.ports.publishVerificationClosure = vi.fn(async () => {
      at = new Date(
        Date.parse(time) + h.fixture.task.spec.budget.maxElapsedMs + 1
      ).toISOString();
    });
    expect(await continueAgentRuntimeApply({ ...h.input, now: () => at })).toBe(
      'blocked'
    );
    expect(h.terminal).toHaveBeenCalledWith('blocked', 'AI-6002');
    expect(h.input.ports.publishVerificationClosure).toHaveBeenCalledTimes(1);
    expect(h.state().budgetLedger.reservations[0]!.status).toBe('reserved');
    expect(h.state().budgetLedger.reservations[0]!.settlement).toBeUndefined();
    expect(h.input.succeed).not.toHaveBeenCalled();
  });
  it('settles time spent awaiting the final Closure publication ACK', async () => {
    const h = await harness();
    expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
    await completeRuns(h, h.fixture.proposal.proposalId, 'promoted');
    let at = time;
    h.input.ports.publishVerificationClosure = vi.fn(async () => {
      at = new Date(Date.parse(time) + 2_000).toISOString();
    });
    expect(await continueAgentRuntimeApply({ ...h.input, now: () => at })).toBe(
      'succeeded'
    );
    expect(
      h.state().budgetLedger.reservations[0]!.settlement!.charged.elapsedMs
    ).toBe(2_000);
    expect(h.input.succeed).toHaveBeenCalledTimes(1);
  });

  it('uses only the pre-authorized reverse, then verifies the restored revision and retains the original failure', async () => {
    const h = await harness({ rollback: true });
    expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
    const original = await completeRuns(
      h,
      h.fixture.proposal.proposalId,
      'missing'
    );
    expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
    expect(h.ports.commitWorkspace).toHaveBeenCalledTimes(2);
    expect(h.workspace().opSeq).toBe(h.fixture.workspace.opSeq + 2);
    for (const document of Object.values(h.fixture.workspace.docsById))
      expect(h.workspace().docsById[document.id]!.content).toEqual(
        document.content
      );
    const failure = await h.journal.read<
      import('@prodivix/workspace-sync').WorkspaceAgentRepairFailure
    >('repair-failure', h.state().run.runId);
    expect(failure!.closure.verdict).toBe('unsatisfied');
    expect(failure!.plan.planDigest).toBe(original.record.plan.planDigest);
    const rollback = await completeRuns(
      h,
      h.fixture.proposal.proposalId + '.rollback',
      'promoted'
    );
    expect(
      decodeVerificationPlan(encodeVerificationPlan(rollback.record.plan)).ok
    ).toBe(true);
    expect(rollback.record.plan.targetRevision).toBe(
      h.workspace().workspaceRev
    );
    expect(await continueAgentRuntimeApply(h.input)).toBe('failed');
    const final = await h.journal.read<{ receipt: { verdict: string } }>(
      'rollback-closure',
      h.fixture.proposal.proposalId
    );
    expect(final!.receipt.verdict).toBe('satisfied');
    expect(await h.journal.read('repair-failure', h.state().run.runId)).toEqual(
      failure
    );
    expect(h.input.succeed).not.toHaveBeenCalled();
    expect(h.ports.commitWorkspace).toHaveBeenCalledTimes(2);
    expect(
      h
        .state()
        .budgetLedger.reservations.map(
          ({ settlement }) => settlement!.charged.transactions
        )
    ).toEqual([1, 1]);
  });

  it('replays the exact rollback Outbox after its ACK is lost even though the Workspace already advanced', async () => {
    const h = await harness({ rollback: true });
    expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
    await completeRuns(h, h.fixture.proposal.proposalId, 'missing');
    const commit = h.input.ports.commitWorkspace;
    h.input.ports.commitWorkspace = vi.fn(async (input, signal) => {
      const result = await commit(input, signal);
      if (
        input.receipt.kind === 'rollback' &&
        vi.mocked(h.input.ports.commitWorkspace).mock.calls.length === 1
      )
        throw new Error('Rollback ACK lost');
      return result;
    });
    await expect(continueAgentRuntimeApply(h.input)).rejects.toThrow(
      'Rollback ACK lost'
    );
    const original = await h.journal.read(
      'rollback',
      h.fixture.proposal.proposalId
    );
    expect(h.workspace().opSeq).toBe(h.fixture.workspace.opSeq + 2);
    expect(
      await continueAgentRuntimeApply({
        ...h.input,
        now: () => '2026-10-01T00:00:01.000Z',
      })
    ).toBe('verifying');
    expect(
      await h.journal.read('rollback', h.fixture.proposal.proposalId)
    ).toEqual(original);
    const calls = vi.mocked(h.input.ports.commitWorkspace).mock.calls;
    expect(calls[0]![0].receipt).toEqual(calls[1]![0].receipt);
    expect(calls[0]![0].request).toEqual(calls[1]![0].request);
    expect(h.workspace().opSeq).toBe(h.fixture.workspace.opSeq + 2);
  });

  it.each(['intervening-authoring', 'transaction-budget'] as const)(
    'blocks rollback before another authoring write for %s',
    async (failure) => {
      const h = await harness({
        rollback: true,
        ...(failure === 'transaction-budget' ? { maxTransactions: 1 } : {}),
      });
      expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
      await completeRuns(h, h.fixture.proposal.proposalId, 'missing');
      if (failure === 'intervening-authoring')
        h.input.ports.readContext = vi.fn(async () => ({
          task: h.fixture.task,
          workspace: { ...h.workspace(), opSeq: h.workspace().opSeq + 1 },
        }));
      expect(await continueAgentRuntimeApply(h.input)).toBe('blocked');
      expect(h.ports.commitWorkspace).toHaveBeenCalledTimes(1);
      expect(
        await h.journal.read('rollback', h.fixture.proposal.proposalId)
      ).toBeUndefined();
    }
  );

  it.each(['artifact', 'wall-time'] as const)(
    'charges %s before the first Workspace write',
    async (kind) => {
      const h = await harness(
        kind === 'artifact' ? { maxArtifactBytes: 0 } : {}
      );
      const input =
        kind === 'wall-time'
          ? { ...h.input, now: () => '2026-10-01T00:03:00.001Z' }
          : h.input;
      expect(await continueAgentRuntimeApply(input)).toBe('blocked');
      expect(h.ports.commitWorkspace).not.toHaveBeenCalled();
      expect(
        await h.journal.read('commit', h.fixture.proposal.proposalId)
      ).toBeUndefined();
    }
  );

  it('rechecks current revocation after a Closure publication loses its acknowledgement', async () => {
    const h = await harness();
    expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
    const { evidence } = await completeRuns(
      h,
      h.fixture.proposal.proposalId,
      'promoted'
    );
    h.input.ports.publishVerificationClosure = vi
      .fn()
      .mockRejectedValueOnce(new Error('Closure ACK lost'))
      .mockResolvedValue(undefined);
    await expect(continueAgentRuntimeApply(h.input)).rejects.toThrow(
      'Closure ACK lost'
    );
    h.input.ports.readVerificationView = vi.fn(async () =>
      verificationViewFixture(evidence, true)
    );
    expect(await continueAgentRuntimeApply(h.input)).toBe('blocked');
    expect(h.input.succeed).not.toHaveBeenCalled();
    expect(h.input.ports.publishVerificationClosure).toHaveBeenCalledTimes(1);
  });

  it('keeps repair available after a satisfied rollback and grounds a new, separately approved proposal in the original failure', async () => {
    const h = await harness({ rollback: true });
    expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
    await completeRuns(h, h.fixture.proposal.proposalId, 'missing');
    expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
    const originalClosure = vi.mocked(h.input.ports.publishVerificationClosure)
      .mock.calls[0]![0].receipt;
    await completeRuns(
      h,
      h.fixture.proposal.proposalId + '.rollback',
      'promoted'
    );
    expect(await continueAgentRuntimeApply(h.input)).toBe('failed');
    const originalFailure = await h.journal.read<
      import('@prodivix/workspace-sync').WorkspaceAgentRepairFailure
    >('repair-failure', h.state().run.runId);
    const ended = finalizeAgentRun(h.fixture.task, h.state(), {
      ...h.fixture.command('terminal.failed'),
      outcome: 'failed',
    });
    if (!ended.accepted) throw new Error('Parent finalization failed');
    h.fixture.events.push(ended.event);
    const sourceProduct = h.fixture.product(ended.state).view;
    const closures = [
      originalClosure,
      ...vi
        .mocked(h.input.ports.publishVerificationClosure)
        .mock.calls.map(([input]) => input.receipt),
    ];
    const bindings = vi
      .mocked(h.ports.publishVerificationBinding!)
      .mock.calls.map(([input]) => input.binding);
    const product = createAgentProductView({
      task: h.fixture.task,
      run: ended.state,
      events: h.fixture.events,
      proposal: sourceProduct.proposal!,
      planning: sourceProduct.planning!,
      preview: sourceProduct.preview!,
      approval: sourceProduct.approval!,
      mutations: vi
        .mocked(h.ports.publishMutation!)
        .mock.calls.map(([input]) => input.receipt)
        .filter(
          (entry, index, entries) =>
            entries.findIndex(
              ({ receiptId }) => receiptId === entry.receiptId
            ) === index
        ),
      verificationBindings: bindings.filter(
        (entry, index) =>
          bindings.findIndex(
            ({ bindingId }) => bindingId === entry.bindingId
          ) === index
      ),
      verificationClosures: closures,
      repairRounds: [],
      commands: [],
      currentRevision: createAgentWorkspaceRevisionFromSnapshot(h.workspace()),
      actorAuthorized: true,
    });
    expect(product.availableActions).toContain('repair');
    const at = '2026-10-01T00:00:01.000Z';
    const request = createAgentRepairTaskRequest({
      requestId: 'repair.after.rollback',
      parentTask: h.fixture.task,
      parentRun: ended.state,
      failedClosureReceipt: originalFailure!.closureReceipt,
      counterexamples: originalFailure!.counterexamples,
      currentRevision: createAgentWorkspaceRevisionFromSnapshot(h.workspace()),
      usageFacts: {
        acknowledgedCommits: 2,
        promotedArtifactBytes: 0,
        openedRepairRounds: 0,
      },
      requestedAt: at,
    });
    const task = request.requestedTask;
    const binding = {
      ...h.fixture.binding,
      taskId: task.spec.taskId,
      grant: {
        ...h.fixture.binding.grant,
        grantId: task.spec.initialGrantRef.grantId,
        taskId: task.spec.taskId,
        baseRevision: task.spec.baseRevision,
        limits: { ...h.fixture.binding.grant.limits, budget: task.spec.budget },
      },
    };
    const runId = 'run.repair.derived';
    const context = await prepareAgentRuntimeContext({
      task,
      workspace: h.workspace(),
      binding,
      runId,
      at,
      repair: originalFailure!,
    });
    expect(
      context.materials.some(({ content }) =>
        content.includes(h.fixture.task.spec.intent)
      )
    ).toBe(true);
    expect(
      context.materials.some(({ content }) =>
        content.includes(originalFailure!.closure.closureDigest)
      )
    ).toBe(true);
    const childEvents: import('@prodivix/ai').AgentControlEvent[] = [];
    const accept = (result: AgentRunTransitionResult) => {
      if (!result.accepted) throw new Error('Derived Run rejected');
      childEvents.push(result.event);
      return result.state;
    };
    let run = accept(
      createAgentRunControl(task, {
        runId,
        contextPackDigest: context.pack.manifestDigest,
        command: { ...h.fixture.command('repair.created'), occurredAt: at },
      })
    );
    run = accept(
      startAgentRun(task, run, {
        ...h.fixture.command('repair.started'),
        occurredAt: at,
        attemptId: 'attempt.repair',
      })
    );
    run = accept(
      transitionAgentRunPhase(task, run, {
        ...h.fixture.command('repair.running'),
        occurredAt: at,
        phase: 'running',
      })
    );
    const proposal = createAgentActionProposal(
      WORKSPACE_AGENT_ACTION_REGISTRY,
      {
        ...h.fixture.proposal,
        proposalId: 'proposal.repair.derived',
        taskId: task.spec.taskId,
        runId,
        baseRevision: task.spec.baseRevision,
        contextPackDigest: context.pack.manifestDigest,
      }
    );
    const preview = prepareAgentRuntimePreview({
      task,
      run,
      workspace: h.workspace(),
      binding,
      proposal,
      at,
      repair: originalFailure!,
    });
    expect(preview.planning.proposalId).not.toBe(
      h.fixture.projection.planning.proposalId
    );
    expect(preview.planning.transactionDigest).not.toBe(
      h.fixture.projection.planning.transactionDigest
    );
    expect(preview.verificationPlan.targetRevision).toBe(
      h.workspace().workspaceRev
    );
    expect(task.spec.budget.maxTransactions).toBe(1);
    run = accept(
      transitionAgentRunPhase(task, run, {
        ...h.fixture.command('repair.waiting'),
        occurredAt: at,
        phase: 'awaiting-approval',
      })
    );
    const emptyApproval = createAgentProductView({
      task,
      run,
      events: childEvents,
      proposal,
      planning: preview.planning,
      preview: preview.preview,
      mutations: [],
      verificationBindings: [],
      verificationClosures: [],
      repairRounds: [],
      commands: [],
      currentRevision: task.spec.baseRevision,
      actorAuthorized: true,
    });
    expect(emptyApproval.approval).toBeUndefined();
    expect(emptyApproval.availableActions).toContain('approve');
    expect(emptyApproval.availableActions).not.toContain('repair');
  });

  it('reserves the adapter hard artifact upper bound even when the estimated Plan cost fits', async () => {
    const estimate =
      runtimeApplyFixture().projection.verificationPlan.budget.artifactBytes;
    const h = await harness({ maxArtifactBytes: estimate });
    expect(
      h.fixture.projection.verificationPlan.budget.artifactBytes
    ).toBeLessThanOrEqual(h.fixture.task.spec.budget.maxArtifactBytes);
    expect(await continueAgentRuntimeApply(h.input)).toBe('blocked');
    expect(h.ports.commitWorkspace).not.toHaveBeenCalled();
  });
  it('rejects promoted artifact bytes above the formal reservation before publishing a Closure', async () => {
    const h = await harness();
    expect(await continueAgentRuntimeApply(h.input)).toBe('verifying');
    const completed = await completeRuns(
      h,
      h.fixture.proposal.proposalId,
      'promoted'
    );
    const maximum =
      h.state().budgetLedger.reservations[0]!.demand.artifactBytes;
    const evidence = completed.evidence.map((item, index) =>
      index === 0
        ? { ...item, artifacts: [{ ...item.artifacts[0]!, size: maximum + 1 }] }
        : item
    );
    h.input.ports.readVerificationEvidence = vi.fn(async ({ evidenceId }) =>
      evidence.find(({ id }) => id === evidenceId)!
    );
    expect(await continueAgentRuntimeApply(h.input)).toBe('blocked');
    expect(h.input.ports.readVerificationView).not.toHaveBeenCalled();
    expect(h.input.ports.appendVerificationEvent).not.toHaveBeenCalled();
    expect(h.input.ports.publishVerificationClosure).not.toHaveBeenCalled();
    expect(h.input.succeed).not.toHaveBeenCalled();
  });

  it('reconciles an already-started exact commit before checking newly unavailable resources or exhausted time', async () => {
    const h = await harness();
    const commit = h.input.ports.commitWorkspace;
    h.input.ports.commitWorkspace = vi.fn(async (input, signal) => {
      const result = await commit(input, signal);
      if (vi.mocked(h.input.ports.commitWorkspace).mock.calls.length === 1)
        throw new Error('Commit ACK lost');
      return result;
    });
    await expect(continueAgentRuntimeApply(h.input)).rejects.toThrow(
      'Commit ACK lost'
    );
    h.driver.preflight = vi.fn(async () => {
      throw new Error('Resources became unavailable');
    });
    expect(
      await continueAgentRuntimeApply({
        ...h.input,
        now: () => '2026-10-01T00:03:00.001Z',
      })
    ).toBe('blocked');
    const calls = vi.mocked(h.input.ports.commitWorkspace).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0].request).toEqual(calls[1]![0].request);
    expect(calls[0]![0].receipt).toEqual(calls[1]![0].receipt);
    expect(
      await h.journal.read('commit-ack', h.fixture.proposal.proposalId)
    ).toBeDefined();
    expect(h.workspace().opSeq).toBe(h.fixture.workspace.opSeq + 1);
    expect(h.ports.createVerificationRun).not.toHaveBeenCalled();
  });
});
