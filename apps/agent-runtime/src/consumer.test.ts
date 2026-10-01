import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAgentClaimLease,
  createAgentRunControl,
  transitionAgentRunPhase,
  createOpenAIResponsesAgentProviderAdapter,
  digestAgentCanonicalValue,
  reduceAgentRun,
  createAgentProductView,
  createAgentRunUserCommand,
  type AgentRunUserCommand,
  type AgentRunSnapshot,
} from '@prodivix/ai';
import {
  AgentRuntimeConsumer,
  type AgentRuntimeNativeFactory,
} from '#src/consumer.js';
import type { AgentRuntimePorts } from '#src/ports.js';
import { expiry, runtimeFixture, time } from '#src/runtime.fixture.js';
import { AgentRuntimeFileJournal } from '#src/fileJournal.js';
import { runtimeApplyFixture } from '#src/apply.fixture.js';
import { createVerificationRunSnapshot } from '@prodivix/verification';
import { completedVerificationFixture } from '#src/applyEvidence.fixture.js';
import type { AgentRuntimeVerificationDriver } from '#src/verificationDriver.js';

const fixturePorts = (fixture = runtimeFixture()) => {
  let current: AgentRunSnapshot | undefined;
  const events: Parameters<AgentRuntimePorts['transition']>[0]['event'][] = [];
  const calls: string[] = [];
  const ports: AgentRuntimePorts = {
    publishTaskOutput: vi.fn(async () => {}),
    listAdmissionChallenges: vi.fn(async () => []),
    completeAdmission: vi.fn(async () => {}),
    listTasks: vi.fn(async () => [
      {
        workspaceId: fixture.workspace.id,
        task: fixture.task,
        ...(current ? { run: current } : {}),
      },
    ]),
    readContext: vi.fn(async () => ({
      task: fixture.task,
      workspace: fixture.workspace,
    })),
    createRun: vi.fn(async ({ snapshot, event }) => {
      current = snapshot;
      events.push(event);
      calls.push('create');
      return snapshot;
    }),
    startRun: vi.fn(async ({ previous, snapshot, event }) => {
      const reduced = reduceAgentRun(fixture.task, previous, event);
      expect(reduced.accepted).toBe(true);
      if (!reduced.accepted) throw new Error('Start rejected');
      expect(reduced.state.snapshotDigest).toBe(snapshot.snapshotDigest);
      current = snapshot;
      events.push(event);
      calls.push(event.type);
      return snapshot;
    }),
    claimLease: vi.fn(
      async ({ runId, leaseId, holderId, generation, observedAt, expiresAt }) =>
        createAgentClaimLease({
          runId,
          leaseId,
          holderId,
          generation,
          acquiredAt: observedAt,
          expiresAt,
        })
    ),
    renewLease: vi.fn(async (input) =>
      createAgentClaimLease({
        leaseId: input.authority.leaseId,
        holderId: input.authority.holderId,
        generation: input.authority.generation,
        runId: input.runId,
        acquiredAt: input.authority.observedAt,
        expiresAt: input.expiresAt,
      })
    ),
    transition: vi.fn(async ({ previous, snapshot, event }) => {
      expect(previous.snapshotDigest).toBe(current!.snapshotDigest);
      const reduced = reduceAgentRun(fixture.task, previous, event);
      expect(reduced.accepted).toBe(true);
      if (!reduced.accepted) throw new Error('Transition rejected');
      expect(reduced.state.snapshotDigest).toBe(snapshot.snapshotDigest);
      current = snapshot;
      events.push(event);
      calls.push(event.type);
      return snapshot;
    }),
    claimDispatch: vi.fn(async (input) => {
      calls.push('dispatch.claim');
      return {
        operationId: input.operationId,
        ...input.authority,
        expiresAt: input.expiresAt,
        dispatchState: 'claimed',
        reconciliationRequired: false,
        replayed: false,
      };
    }),
    markDispatched: vi.fn(async () => {
      calls.push('dispatch.mark');
    }),
    publishProposal: vi.fn(async () => {}),
    publishPreview: vi.fn(async () => {}),
    consumeCancellation: vi.fn(async ({ previous, snapshot, event }) => {
      const reduced = reduceAgentRun(fixture.task, previous, event);
      if (
        !reduced.accepted ||
        reduced.state.snapshotDigest !== snapshot.snapshotDigest
      )
        throw new Error('Cancellation rejected');
      current = snapshot;
      events.push(event);
      return snapshot;
    }),
    readProduct: vi.fn(async () => ({
      view: createAgentProductView({
        task: fixture.task,
        run: current!,
        events,
        mutations: [],
        verificationBindings: [],
        verificationClosures: [],
        repairRounds: [],
        commands: [],
        currentRevision: fixture.task.spec.baseRevision,
        actorAuthorized: true,
      }),
      currentRevision: fixture.task.spec.baseRevision,
      actorAuthorized: true,
    })),
    commitWorkspace: vi.fn(async () => {
      throw new Error('No approved mutation');
    }),
    publishMutation: vi.fn(async () => {}),
    createVerificationRun: vi.fn(async ({ request }) => request),
    readVerificationRun: vi.fn(async () => {
      throw new Error('No G3 run');
    }),
    appendVerificationEvent: vi.fn(async () => {
      throw new Error('No G3 event');
    }),
    readVerificationEvidence: vi.fn(async () => {
      throw new Error('No G3 Evidence');
    }),
    readVerificationView: vi.fn(async () => {
      throw new Error('No G3 view');
    }),
    publishVerificationBinding: vi.fn(async () => {}),
    publishVerificationClosure: vi.fn(async () => {}),
    publishRepairFailure: vi.fn(async () => {}),
  };
  return { ports, calls, events, current: () => current };
};

const nativeFixture = (
  fixture: ReturnType<typeof runtimeFixture>,
  calls: string[],
  content = '{"answer":"The exported count is 1."}'
) =>
  vi.fn((input: Parameters<AgentRuntimeNativeFactory>[0]) =>
    createOpenAIResponsesAgentProviderAdapter({
      identity: fixture.binding.catalog.provider.adapter,
      declaredProfileDigests: [
        fixture.binding.catalog.capabilityProfile.profileDigest,
      ],
      supportedProfileDigests: [
        fixture.binding.catalog.capabilityProfile.profileDigest,
      ],
      now: input.now,
      transport: {
        async *stream() {
          calls.push('provider');
          yield { type: 'response.output_text.delta', delta: content };
          yield {
            type: 'response.completed',
            response: {
              id: 'response.fixture',
              status: 'completed',
              usage: { input_tokens: 40, output_tokens: 12 },
            },
          };
        },
      },
    })
  );

describe('ordinary durable Agent runtime consumer', () => {
  it('persists a blocked Run for missing configuration without touching the provider or Workspace writes', async () => {
    const fixture = runtimeFixture();
    const state = fixturePorts(fixture);
    const nativeFactory = nativeFixture(fixture, state.calls);
    const consumer = new AgentRuntimeConsumer(
      { ...fixture.config, bindings: [] },
      state.ports,
      { now: () => time, nativeFactory }
    );
    expect(
      await consumer.consume({
        workspaceId: fixture.workspace.id,
        task: fixture.task,
      })
    ).toBe('blocked');
    expect(state.current()?.run).toMatchObject({
      runId: `run.runtime.${fixture.task.taskDigest.slice(7)}`,
      phase: 'terminal',
      outcome: 'blocked',
    });
    expect(state.events.map(({ type }) => type)).toEqual([
      'run.created',
      'run.started',
      'run.terminal',
    ]);
    expect(nativeFactory).not.toHaveBeenCalled();
    expect(state.ports.readContext).not.toHaveBeenCalled();
    expect(state.ports.publishProposal).not.toHaveBeenCalled();
    expect(state.ports.claimDispatch).not.toHaveBeenCalled();
    expect(await consumer.poll()).toEqual([
      { taskId: fixture.task.spec.taskId, status: 'terminal' },
    ]);
  });

  it('runs an admitted explain Task through actual owners and dispatch fencing with only digest-bound durable results', async () => {
    const fixture = runtimeFixture();
    const state = fixturePorts(fixture);
    const consumer = new AgentRuntimeConsumer(fixture.config, state.ports, {
      now: () => time,
      nativeFactory: nativeFixture(fixture, state.calls),
    });
    expect(
      await consumer.consume({
        workspaceId: fixture.workspace.id,
        task: fixture.task,
      })
    ).toBe('succeeded');
    expect(state.current()?.run).toMatchObject({
      phase: 'terminal',
      outcome: 'succeeded',
      contextPackDigest: expect.stringMatching(/^sha256-/u),
    });
    expect(state.calls.indexOf('budget.reserved')).toBeLessThan(
      state.calls.indexOf('dispatch.claim')
    );
    expect(state.calls.indexOf('dispatch.mark')).toBeLessThan(
      state.calls.indexOf('provider')
    );
    const completed = state.events.find(
      ({ type }) => type === 'model.completed'
    )!;
    expect(completed.sanitizedPayload).toHaveProperty('result');
    expect(JSON.stringify(state.events)).not.toContain(
      'The exported count is 1.'
    );
    expect(state.ports.publishTaskOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          kind: 'answer',
          text: 'The exported count is 1.',
          projectPolicyDigest: fixture.task.spec.policyDigest,
          effectivePolicyDigest:
            fixture.binding.policy.evaluation.effectivePolicyDigest,
        }),
      }),
      expect.any(AbortSignal)
    );
    expect(completed.sanitizedPayload).toMatchObject({
      result: {
        responseDigest: digestAgentCanonicalValue({
          answer: 'The exported count is 1.',
        }),
      },
    });
    expect(state.current()?.budgetLedger.reservations[0]?.status).toBe(
      'settled'
    );
    expect(state.ports.publishProposal).not.toHaveBeenCalled();
  });

  it.each(['propose', 'apply'] as const)(
    'blocks admission-only %s before any provider dispatch',
    async (mode) => {
      const fixture = runtimeFixture(mode);
      const state = fixturePorts(fixture);
      const nativeFactory = nativeFixture(fixture, state.calls);
      expect(
        await new AgentRuntimeConsumer(fixture.config, state.ports, {
          now: () => time,
          nativeFactory,
        }).poll()
      ).toEqual([{ taskId: fixture.task.spec.taskId, status: 'blocked' }]);
      expect(nativeFactory).not.toHaveBeenCalled();
      expect(state.ports.claimDispatch).not.toHaveBeenCalled();
    }
  );

  it('rejects drifted exact qualification and current Workspace before any provider dispatch', async () => {
    const fixture = runtimeFixture();
    const state = fixturePorts(fixture);
    state.ports.readContext = vi.fn(async () => ({
      task: fixture.task,
      workspace: { ...fixture.workspace, opSeq: 2 },
    }));
    expect(
      await new AgentRuntimeConsumer(fixture.config, state.ports, {
        now: () => time,
      }).poll()
    ).toEqual([{ taskId: fixture.task.spec.taskId, status: 'blocked' }]);
    expect(state.ports.claimDispatch).not.toHaveBeenCalled();
    const second = fixturePorts(fixture);
    const drifted = {
      ...fixture.binding,
      qualification: {
        ...fixture.binding.qualification,
        qualificationDigest: digestAgentCanonicalValue('drifted'),
      },
    };
    expect(
      await new AgentRuntimeConsumer(
        { ...fixture.config, bindings: [drifted] },
        second.ports,
        { now: () => time }
      ).poll()
    ).toEqual([{ taskId: fixture.task.spec.taskId, status: 'blocked' }]);
    expect(second.ports.claimDispatch).not.toHaveBeenCalled();
  });

  it('does not redispatch an operation with an ambiguous durable dispatch claim', async () => {
    const fixture = runtimeFixture();
    const state = fixturePorts(fixture);
    state.ports.claimDispatch = vi.fn(async (input) => ({
      operationId: input.operationId,
      ...input.authority,
      expiresAt: expiry,
      dispatchState: 'dispatched',
      reconciliationRequired: true,
      replayed: true,
    }));
    const nativeFactory = nativeFixture(fixture, state.calls);
    expect(
      await new AgentRuntimeConsumer(fixture.config, state.ports, {
        now: () => time,
        nativeFactory,
      }).poll()
    ).toEqual([
      { taskId: fixture.task.spec.taskId, status: 'infrastructure-error' },
    ]);
    expect(state.calls).not.toContain('provider');
    expect(state.ports.markDispatched).not.toHaveBeenCalled();
  });

  it('makes two initial consumers use the same exact Run identity', async () => {
    const fixture = runtimeFixture();
    const first = createAgentRunControl(fixture.task, {
      runId: `run.runtime.${fixture.task.taskDigest.slice(7)}`,
      command: {
        eventId: 'created',
        idempotencyKey: 'created',
        occurredAt: time,
        producer: { kind: 'service', principalId: 'agent.runtime' },
      },
    });
    expect(first.accepted).toBe(true);
    const a = fixturePorts(fixture);
    const b = fixturePorts(fixture);
    await new AgentRuntimeConsumer(
      { ...fixture.config, bindings: [] },
      a.ports,
      { now: () => time }
    ).poll();
    await new AgentRuntimeConsumer(
      { ...fixture.config, bindings: [] },
      b.ports,
      { now: () => time }
    ).poll();
    expect(a.current()?.run.runId).toBe(b.current()?.run.runId);
  });
  it('consumes queued cancellation through canonical cleanup without starting or claiming a revoked Run', async () => {
    const fixture = runtimeFixture();
    const state = fixturePorts(fixture);
    const read = state.ports.readProduct;
    let command: AgentRunUserCommand | undefined;
    state.ports.readProduct = vi.fn(async (input, signal) => {
      const value = await read(input, signal);
      command ??= createAgentRunUserCommand({
        commandId: 'user.cancel.fixture',
        taskId: fixture.task.spec.taskId,
        runId: state.current()!.run.runId,
        kind: 'cancel',
        actor: { kind: 'user', principalId: 'user.fixture' },
        expectedGeneration: state.current()!.run.generation,
        expectedSnapshotDigest: state.current()!.snapshotDigest,
        idempotencyKey: 'user.cancel.fixture',
        requestedAt: '2026-10-01T00:00:01.000Z',
      });
      return { ...value, view: { ...value.view, commands: [command] } };
    });
    expect(
      await new AgentRuntimeConsumer(
        { ...fixture.config, bindings: [] },
        state.ports,
        { now: () => time }
      ).poll()
    ).toEqual([{ taskId: fixture.task.spec.taskId, status: 'cancelled' }]);
    expect(state.events.map(({ type }) => type)).toEqual([
      'run.created',
      'run.cancel-requested',
      'cleanup.acknowledged',
      'run.terminal',
    ]);
    expect(state.current()?.run).toMatchObject({
      phase: 'terminal',
      generation: 1,
      attempt: 0,
      outcome: 'cancelled',
    });
    expect(state.ports.startRun).not.toHaveBeenCalled();
    expect(state.ports.claimLease).not.toHaveBeenCalled();
    expect(state.ports.renewLease).not.toHaveBeenCalled();
    expect(state.events.at(-1)?.occurredAt).toBe(command!.requestedAt);
  });
  it('renews its own lease during a slow provider response', async () => {
    const fixture = runtimeFixture();
    const state = fixturePorts(fixture);
    const nativeFactory: AgentRuntimeNativeFactory = (input) =>
      createOpenAIResponsesAgentProviderAdapter({
        identity: fixture.binding.catalog.provider.adapter,
        declaredProfileDigests: [
          fixture.binding.catalog.capabilityProfile.profileDigest,
        ],
        supportedProfileDigests: [
          fixture.binding.catalog.capabilityProfile.profileDigest,
        ],
        now: input.now,
        transport: {
          async *stream() {
            await new Promise((resolve) => setTimeout(resolve, 350));
            yield {
              type: 'response.output_text.delta',
              delta: '{"answer":"Count is 1."}',
            };
            yield {
              type: 'response.completed',
              response: {
                id: 'slow.fixture',
                status: 'completed',
                usage: { input_tokens: 40, output_tokens: 12 },
              },
            };
          },
        },
      });
    expect(
      await new AgentRuntimeConsumer(
        { ...fixture.config, pollIntervalMs: 100 },
        state.ports,
        { now: () => time, nativeFactory }
      ).poll()
    ).toEqual([{ taskId: fixture.task.spec.taskId, status: 'succeeded' }]);
    expect(vi.mocked(state.ports.renewLease).mock.calls.length).toBeGreaterThan(
      2
    );
    expect(state.ports.claimLease).not.toHaveBeenCalled();
  });
  it('publishes a bounded plan as visible output before completing the Run', async () => {
    const fixture = runtimeFixture('plan');
    const state = fixturePorts(fixture);
    expect(
      await new AgentRuntimeConsumer(fixture.config, state.ports, {
        now: () => time,
        nativeFactory: nativeFixture(
          fixture,
          state.calls,
          '{"plan":"Inspect the bound count document, then preview the change."}'
        ),
      }).poll()
    ).toEqual([{ taskId: fixture.task.spec.taskId, status: 'succeeded' }]);
    expect(state.ports.publishTaskOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          kind: 'plan',
          text: 'Inspect the bound count document, then preview the change.',
        }),
      }),
      expect.any(AbortSignal)
    );
  });
  it('does not succeed when a visible output ACK completes after the whole Task budget', async () => {
    const fixture = runtimeFixture();
    const state = fixturePorts(fixture);
    let at = time;
    state.ports.publishTaskOutput = vi.fn(async () => {
      at = new Date(
        Date.parse(time) + fixture.task.spec.budget.maxElapsedMs + 1
      ).toISOString();
    });
    const consumer = new AgentRuntimeConsumer(fixture.config, state.ports, {
      now: () => at,
      nativeFactory: nativeFixture(fixture, state.calls),
    });
    expect(await consumer.poll()).toEqual([
      { taskId: fixture.task.spec.taskId, status: 'budget-exhausted' },
    ]);
    expect(state.current()?.run).toMatchObject({
      phase: 'terminal',
      outcome: 'budget-exhausted',
    });
    expect(state.ports.publishTaskOutput).toHaveBeenCalledTimes(1);
  });
  it('replays the exact durable final answer after publication loses its ACK without invoking the model again', async () => {
    const fixture = runtimeFixture();
    const state = fixturePorts(fixture);
    const nativeFactory = nativeFixture(fixture, state.calls);
    const journal = new AgentRuntimeFileJournal(
      await mkdtemp(join(tmpdir(), 'prodivix-output-replay-'))
    );
    state.ports.publishTaskOutput = vi
      .fn()
      .mockRejectedValueOnce(new Error('Output ACK lost'))
      .mockResolvedValue(undefined);
    const consumer = new AgentRuntimeConsumer(fixture.config, state.ports, {
      now: () => time,
      nativeFactory,
      journal,
    });
    expect(await consumer.poll()).toEqual([
      { taskId: fixture.task.spec.taskId, status: 'retry-required' },
    ]);
    expect(state.current()?.run.phase).toBe('running');
    expect(state.current()?.pendingOperation?.state).toBe('settled');
    const exact = await journal.read('task-output', state.current()!.run.runId);
    expect(await consumer.poll()).toEqual([
      { taskId: fixture.task.spec.taskId, status: 'succeeded' },
    ]);
    expect(
      await journal.read('task-output', state.current()!.run.runId)
    ).toEqual(exact);
    expect(nativeFactory).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(state.ports.publishTaskOutput).mock.calls;
    expect(calls[0]![0].output).toEqual(calls[1]![0].output);
  });
  it('keeps callback authority alive beyond a short lease while the real provider callback is still running', async () => {
    const fixture = runtimeFixture();
    const state = fixturePorts(fixture);
    const started = Date.now();
    const now = () =>
      new Date(Date.parse(time) + Date.now() - started).toISOString();
    const nativeFactory: AgentRuntimeNativeFactory = (input) =>
      createOpenAIResponsesAgentProviderAdapter({
        identity: fixture.binding.catalog.provider.adapter,
        declaredProfileDigests: [
          fixture.binding.catalog.capabilityProfile.profileDigest,
        ],
        supportedProfileDigests: [
          fixture.binding.catalog.capabilityProfile.profileDigest,
        ],
        now: input.now,
        transport: {
          async *stream() {
            await new Promise((resolve) => setTimeout(resolve, 5_300));
            yield {
              type: 'response.output_text.delta',
              delta: '{"answer":"The count is 1."}',
            };
            yield {
              type: 'response.completed',
              response: {
                id: 'long.fixture',
                status: 'completed',
                usage: { input_tokens: 40, output_tokens: 12 },
              },
            };
          },
        },
      });
    expect(
      await new AgentRuntimeConsumer(
        { ...fixture.config, leaseMs: 5_000, pollIntervalMs: 100 },
        state.ports,
        { now, nativeFactory }
      ).poll()
    ).toEqual([{ taskId: fixture.task.spec.taskId, status: 'succeeded' }]);
    const renewals = vi.mocked(state.ports.renewLease).mock.calls;
    expect(
      Date.parse(renewals.at(-1)![0].authority.observedAt) -
        Date.parse(renewals[0]![0].authority.observedAt)
    ).toBeGreaterThan(5_000);
    expect(renewals.at(-1)![0].expiresAt > now()).toBe(true);
  }, 15_000);
  it('aborts a live provider callback on durable human cancellation and only cleans up after it has settled', async () => {
    const fixture = runtimeFixture();
    const state = fixturePorts(fixture);
    const read = state.ports.readProduct;
    let command: AgentRunUserCommand | undefined;
    let settled = false;
    state.ports.readProduct = vi.fn(async (input, signal) => {
      const value = await read(input, signal);
      if (state.current()?.pendingOperation?.state === 'started')
        command ??= createAgentRunUserCommand({
          commandId: 'cancel.live',
          taskId: fixture.task.spec.taskId,
          runId: state.current()!.run.runId,
          kind: 'cancel',
          actor: {
            kind: 'user',
            principalId: fixture.task.spec.actor.principalId,
          },
          expectedGeneration: state.current()!.run.generation,
          expectedSnapshotDigest: state.current()!.snapshotDigest,
          idempotencyKey: 'cancel.live',
          requestedAt: time,
        });
      return {
        ...value,
        view: { ...value.view, commands: command ? [command] : [] },
      };
    });
    const transition = state.ports.transition;
    state.ports.transition = vi.fn(async (input, signal) => {
      if (signal?.aborted) throw new Error('Revoked callback');
      return transition(input, signal);
    });
    const nativeFactory: AgentRuntimeNativeFactory = (input) =>
      createOpenAIResponsesAgentProviderAdapter({
        identity: fixture.binding.catalog.provider.adapter,
        declaredProfileDigests: [
          fixture.binding.catalog.capabilityProfile.profileDigest,
        ],
        supportedProfileDigests: [
          fixture.binding.catalog.capabilityProfile.profileDigest,
        ],
        now: input.now,
        transport: {
          async *stream(_request, signal) {
            try {
              await new Promise<void>((_resolve, reject) => {
                const abort = () => reject(new Error('Cancelled'));
                if (signal?.aborted) abort();
                else signal?.addEventListener('abort', abort, { once: true });
              });
            } finally {
              settled = true;
            }
            yield {
              type: 'response.output_text.delta',
              delta: '{"answer":"Completed."}',
            };
          },
        },
      });
    const consumer = new AgentRuntimeConsumer(
      { ...fixture.config, pollIntervalMs: 100 },
      state.ports,
      { now: () => time, nativeFactory }
    );
    expect(await consumer.poll()).toEqual([
      { taskId: fixture.task.spec.taskId, status: 'retry-required' },
    ]);
    expect(settled).toBe(true);
    expect(state.ports.consumeCancellation).not.toHaveBeenCalled();
    expect(await consumer.poll()).toEqual([
      { taskId: fixture.task.spec.taskId, status: 'cancelled' },
    ]);
    expect(state.current()?.run).toMatchObject({
      outcome: 'cancelled',
      generation: 2,
      attempt: 1,
    });
    expect(state.ports.publishTaskOutput).not.toHaveBeenCalled();
    expect(
      state.events.filter(({ type }) => type === 'model.started')
    ).toHaveLength(1);
  });
  it('keeps a verifying Task ahead of a queued slow provider Task without dispatching another model', async () => {
    const active = runtimeApplyFixture();
    const committing = transitionAgentRunPhase(active.task, active.run, {
      ...active.command('committing'),
      phase: 'committing',
    });
    if (!committing.accepted) throw new Error('Fixture transition rejected');
    const verifying = transitionAgentRunPhase(active.task, committing.state, {
      ...active.command('verifying'),
      phase: 'verifying',
    });
    if (!verifying.accepted) throw new Error('Fixture transition rejected');
    const pending = runtimeFixture('explain');
    const state = fixturePorts(pending);
    state.ports.listTasks = vi.fn(async () => [
      { task: pending.task, workspaceId: pending.workspace.id },
      {
        task: active.task,
        workspaceId: active.workspace.id,
        run: verifying.state,
      },
    ]);
    const consumer = new AgentRuntimeConsumer(pending.config, state.ports);
    const modelDispatch = vi.fn(async () => 'succeeded');
    const consume = vi
      .spyOn(consumer, 'consume')
      .mockImplementation(async (item) =>
        item.task.taskDigest === active.task.taskDigest
          ? 'verifying'
          : modelDispatch()
      );
    expect(await consumer.poll()).toEqual([
      { taskId: active.task.spec.taskId, status: 'verifying' },
    ]);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(modelDispatch).not.toHaveBeenCalled();
  });
  it('retries actual cleanup of terminal commit and rollback G3 Runs after its ACK is lost', async () => {
    const fixture = runtimeApplyFixture({ rollback: true });
    const common = runtimeFixture();
    const ports = fixturePorts(common).ports;
    let current = fixture.run;
    const command = createAgentRunUserCommand({
      commandId: 'cancel.terminal-g3',
      taskId: fixture.task.spec.taskId,
      runId: current.run.runId,
      kind: 'cancel',
      actor: fixture.task.spec.actor as { kind: 'user'; principalId: string },
      expectedGeneration: current.run.generation,
      expectedSnapshotDigest: current.snapshotDigest,
      idempotencyKey: 'cancel.terminal-g3',
      requestedAt: time,
    });
    const journal = new AgentRuntimeFileJournal(
      await mkdtemp(join(tmpdir(), 'prodivix-terminal-g3-cleanup-'))
    );
    const plan = fixture.projection.verificationPlan;
    const runs = new Map<
      string,
      ReturnType<typeof createVerificationRunSnapshot>
    >();
    for (const suffix of ['', '.rollback']) {
      const initial = createVerificationRunSnapshot({
        runId: `verification.cleanup${suffix}`,
        plan,
        surface: plan.cells[0]!.surface,
        scope: 'required',
        origin: 'cli',
        providerId: fixture.binding.verificationDriver.providerId,
        selectedCellIds: plan.cells
          .filter(({ requirement }) => requirement === 'required')
          .map(({ id }) => id),
        attemptIdByCellId: Object.fromEntries(
          plan.cells.map(({ id }) => [id, `attempt.cleanup${suffix}`])
        ),
        createdAt: time,
      });
      const completed = completedVerificationFixture(
        plan,
        initial,
        fixture.task.spec.projectId,
        true
      ).run;
      runs.set(initial.runId, completed);
      await journal.put('verification', fixture.proposal.proposalId + suffix, {
        plan,
        runs: [initial],
        startedAt: time,
      });
    }
    ports.listTasks = vi.fn(async () => [
      { task: fixture.task, workspaceId: fixture.workspace.id, run: current },
    ]);
    ports.readContext = vi.fn(async () => ({
      task: fixture.task,
      workspace: fixture.workspace,
    }));
    ports.readProduct = vi.fn(async () => {
      const product = fixture.product(current);
      return { ...product, view: { ...product.view, commands: [command] } };
    });
    ports.readVerificationRun = vi.fn(async ({ verificationRunId }) =>
      runs.get(verificationRunId)!
    );
    const cleaned = new Set<string>();
    ports.consumeCancellation = vi.fn(async ({ previous, snapshot, event }) => {
      if (event.type === 'cleanup.acknowledged' && cleaned.size !== runs.size)
        throw new Error('Backend resource cleanup fence');
      const reduced = reduceAgentRun(fixture.task, previous, event);
      if (
        !reduced.accepted ||
        reduced.state.snapshotDigest !== snapshot.snapshotDigest
      )
        throw new Error('Cancellation rejected');
      current = snapshot;
      fixture.events.push(event);
      return snapshot;
    });
    let lost = false;
    const driver: AgentRuntimeVerificationDriver = {
      preflight: vi.fn(),
      dispatch: vi.fn(),
      cancel: vi.fn(async ({ run }) => {
        expect(['queued', 'running', 'cancelling']).not.toContain(run.status);
        cleaned.add(run.runId);
        if (!lost) {
          lost = true;
          throw new Error('Cleanup ACK lost');
        }
      }),
    };
    const consumer = new AgentRuntimeConsumer(
      { ...common.config, bindings: [fixture.binding] },
      ports,
      { now: () => time, journal, verificationDriver: driver }
    );
    expect(await consumer.poll()).toEqual([
      { taskId: fixture.task.spec.taskId, status: 'retry-required' },
    ]);
    expect(current.run.phase).toBe('cancelling');
    expect(
      fixture.events.some(({ type }) => type === 'cleanup.acknowledged')
    ).toBe(false);
    expect(await consumer.poll()).toEqual([
      { taskId: fixture.task.spec.taskId, status: 'cancelled' },
    ]);
    expect(current.run).toMatchObject({
      phase: 'terminal',
      outcome: 'cancelled',
    });
    expect(current.cleanupState).toBe('clean');
    expect(
      vi.mocked(driver.cancel).mock.calls.map(([input]) => input.run.runId)
    ).toEqual([
      'verification.cleanup',
      'verification.cleanup',
      'verification.cleanup.rollback',
    ]);
    expect(ports.claimLease).not.toHaveBeenCalled();
    expect(ports.publishVerificationClosure).not.toHaveBeenCalled();
  });
  it.each([
    'rollback-reconciliation-required',
    'cancel-reconciliation-required',
    'retry-required',
  ] as const)(
    'retains the task lane while %s work may still own resources',
    async (status) => {
      const fixture = runtimeFixture();
      const other = runtimeFixture('plan');
      const state = fixturePorts(fixture);
      state.ports.listTasks = vi.fn(async () => [
        { task: fixture.task, workspaceId: fixture.workspace.id },
        { task: other.task, workspaceId: other.workspace.id },
      ]);
      const consumer = new AgentRuntimeConsumer(fixture.config, state.ports);
      const consume = vi.spyOn(consumer, 'consume').mockResolvedValue(status);
      expect(await consumer.poll()).toEqual([
        { taskId: fixture.task.spec.taskId, status },
      ]);
      expect(consume).toHaveBeenCalledTimes(1);
    }
  );
});
