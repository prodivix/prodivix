import {
  acknowledgeAgentRunCleanup,
  cancelAgentRun,
  createAgentActionProposal,
  createAgentRunControl,
  createAgentTaskOutput,
  validateAgentTaskOutputBinding,
  createUnknownAgentUsageVector,
  digestAgentCanonicalValue,
  finalizeAgentModelInvocation,
  finalizeAgentRun,
  preflightAgentInvocation,
  priceAgentUsage,
  recoverAgentRun,
  reduceAgentRun,
  reserveAgentRunBudget,
  settleAgentRunBudget,
  settleAgentRunOperation,
  startAgentRun,
  startAgentRunOperation,
  transitionAgentRunPhase,
  type AgentControlCommandIdentity,
  type AgentInvocationPlan,
  type AgentNativeProviderAdapter,
  type AgentRunTransitionResult,
  type AgentRunSuccessProof,
} from '@prodivix/ai';
import { WORKSPACE_AGENT_ACTION_REGISTRY } from '@prodivix/workspace';
import { isPlainObject } from '@prodivix/shared/safety';
import type { AgentRuntimeConfiguration } from '#src/config.js';
import type { AgentRuntimePorts, RuntimeTask } from '#src/ports.js';
import {
  parseAgentRuntimeOutput,
  prepareAgentRuntimeContext,
  prepareAgentRuntimePreview,
} from '#src/composition.js';
import { createAgentRuntimeNativeAdapter } from '#src/nativeTransport.js';
import {
  bindAdmittedAgentRuntimeProfile,
  evaluateAgentRuntimeAdmission,
} from '#src/admission.js';
import { AgentRuntimeFileJournal } from '#src/fileJournal.js';
import {
  createAgentRuntimeVerificationDriver,
  type AgentRuntimeVerificationDriver,
} from '#src/verificationDriver.js';
import {
  continueAgentRuntimeApply,
  type AgentRuntimeVerificationRecord,
} from '#src/apply.js';
import { AgentRuntimeServiceError } from '#src/transport.js';
import {
  agentRuntimeTaskOutputProof,
  readAgentRuntimeTaskOutput,
  type AgentRuntimeTaskOutputRecord,
} from '#src/taskOutput.js';

export type AgentRuntimeNativeFactory = typeof createAgentRuntimeNativeAdapter;
const producer = Object.freeze({
  kind: 'service' as const,
  principalId: 'agent.runtime',
});

/** One ordinary durable consumer. Domain owners plan exact writes; humans alone approve them. */
export class AgentRuntimeConsumer {
  constructor(
    private readonly config: AgentRuntimeConfiguration,
    private readonly ports: AgentRuntimePorts,
    private readonly options: {
      now?: () => string;
      nativeFactory?: AgentRuntimeNativeFactory;
      journal?: AgentRuntimeFileJournal;
      verificationDriver?: AgentRuntimeVerificationDriver;
    } = {}
  ) {}

  async poll(
    signal?: AbortSignal,
    options: Readonly<{ includeAdmissions?: boolean }> = {}
  ): Promise<readonly Readonly<{ taskId: string; status: string }>[]> {
    const tasks = await this.ports.listTasks(signal);
    if (options.includeAdmissions !== false) await this.pollAdmissions(signal);
    const results: { taskId: string; status: string }[] = [];
    const activeResourcePhases = [
      'committing',
      'verifying',
      'repairing',
      'cancelling',
    ];
    const orderedTasks = [...tasks].sort(
      (left, right) =>
        Number(activeResourcePhases.includes(right.run?.run.phase ?? '')) -
        Number(activeResourcePhases.includes(left.run?.run.phase ?? ''))
    );
    for (const task of orderedTasks) {
      if (signal?.aborted) break;
      let status: string;
      try {
        status = await this.consume(task, signal);
      } catch {
        status = 'retry-required';
      }
      results.push({ taskId: task.task.spec.taskId, status });
      if (
        [
          'verifying',
          'verification-timeout-cleanup-required',
          'commit-reconciliation-required',
          'rollback-reconciliation-required',
          'cancel-reconciliation-required',
          'retry-required',
        ].includes(status)
      )
        break;
    }
    return results;
  }

  async pollAdmissions(signal?: AbortSignal): Promise<void> {
    for (const challenge of await this.ports.listAdmissionChallenges(signal)) {
      if (signal?.aborted) break;
      try {
        await this.ports.completeAdmission(
          await evaluateAgentRuntimeAdmission(challenge, this.config),
          signal
        );
      } catch {
        /* A failed challenge remains durable and cannot starve admitted Tasks. */
      }
    }
  }

  async consume(item: RuntimeTask, signal?: AbortSignal): Promise<string> {
    const now = this.options.now ?? (() => new Date().toISOString());
    const { task, workspaceId } = item;
    let state = item.run;
    if (state?.run.phase === 'terminal') return 'terminal';
    const runId = state?.run.runId ?? `run.runtime.${task.taskDigest.slice(7)}`;
    let binding = this.config.bindings.find(
      (entry) => entry.taskId === task.spec.taskId
    );
    let prepared:
      Awaited<ReturnType<typeof prepareAgentRuntimeContext>> | undefined;
    let context:
      Awaited<ReturnType<AgentRuntimePorts['readContext']>> | undefined;
    let diagnostic = 'AI-6010';
    if (this.config.bindings.length > 0) {
      try {
        context = await this.ports.readContext(item, signal);
        if (context.task.taskDigest !== task.taskDigest)
          throw new Error('AI-6011');
        if (context.admission)
          binding = bindAdmittedAgentRuntimeProfile(
            task,
            context.admission,
            this.config
          );
        if (!binding) throw new Error('AI-6010');
        if (
          !state ||
          state.run.phase === 'queued' ||
          state.run.phase === 'preparing'
        ) {
          prepared = await prepareAgentRuntimeContext({
            task,
            workspace: context.workspace,
            binding,
            runId,
            at: now(),
            ...(context.repair ? { repair: context.repair } : {}),
          });
          if (
            state &&
            state.run.contextPackDigest !== prepared.pack.manifestDigest
          )
            throw new Error('AI-6011');
        }
      } catch (cause) {
        diagnostic =
          cause instanceof Error && /^AI-[0-9]{4}$/u.test(cause.message)
            ? cause.message
            : 'AI-6011';
      }
    }
    const command = (label: string): AgentControlCommandIdentity => ({
      eventId: `${runId}.${label}.${state?.cursor ?? 0}`,
      idempotencyKey: `${runId}.${label}.${state?.cursor ?? 0}`,
      occurredAt: now(),
      producer,
    });
    if (!state) {
      const created = createAgentRunControl(task, {
        runId,
        ...(prepared
          ? { contextPackDigest: prepared.pack.manifestDigest }
          : {}),
        command: command('created'),
      });
      if (!created.accepted)
        throw new Error('Agent runtime Run creation was rejected.');
      state = await this.ports.createRun(
        { workspaceId, snapshot: created.state, event: created.event },
        signal
      );
    }
    const product = await this.ports.readProduct(
      { workspaceId, runId },
      signal
    );
    const cancellation = product.view.commands.find(
      (entry) =>
        entry.kind === 'cancel' &&
        (state!.run.phase === 'cancelling'
          ? entry.expectedGeneration + 1 === state!.run.generation
          : entry.expectedGeneration === state!.run.generation &&
            entry.expectedSnapshotDigest === state!.snapshotDigest)
    );
    if (cancellation) {
      const cancellationCommand = (
        label: string
      ): AgentControlCommandIdentity => ({
        ...command(label),
        eventId: `cancel.runtime.${digestAgentCanonicalValue({ commandId: cancellation.commandId, label }).slice(7)}`,
        idempotencyKey: `cancel.runtime.${digestAgentCanonicalValue({ commandId: cancellation.commandId, label }).slice(7)}`,
        occurredAt: new Date(
          Math.max(
            Date.parse(now()),
            Date.parse(state!.run.updatedAt),
            Date.parse(cancellation.requestedAt)
          )
        ).toISOString(),
      });
      const cancelPersist = async (result: AgentRunTransitionResult) => {
        if (!result.accepted)
          throw new Error(
            'Agent runtime cancellation owner rejected a transition.'
          );
        state = await this.ports.consumeCancellation(
          {
            workspaceId,
            commandId: cancellation.commandId,
            previous: state!,
            snapshot: result.state,
            event: result.event,
          },
          signal
        );
        if (state.snapshotDigest !== result.state.snapshotDigest)
          throw new Error(
            'Agent runtime cancellation acknowledgement drifted.'
          );
      };
      if (state.run.phase !== 'cancelling')
        await cancelPersist(
          cancelAgentRun(task, state, {
            ...cancellationCommand('requested'),
            reason: cancellation.reason ?? 'Explicit human cancellation.',
          })
        );
      if (product.view.proposal && this.options.journal) {
        const verifications = await Promise.all(
          ['', '.rollback'].map((suffix) =>
            this.options.journal!.read<AgentRuntimeVerificationRecord>(
              'verification',
              product.view.proposal!.proposalId + suffix
            )
          )
        );
        for (const verification of verifications) {
          if (!verification) continue;
          if (!binding) return 'cancel-reconciliation-required';
          const driver =
            this.options.verificationDriver ??
            createAgentRuntimeVerificationDriver();
          for (const initial of verification.runs) {
            let run;
            try {
              run = await this.ports.readVerificationRun(
                { workspaceId, runId, verificationRunId: initial.runId },
                signal
              );
            } catch (cause) {
              // The journal precedes canonical Run creation. Backend cleanup still fences every resource actually established.
              if (
                cause instanceof AgentRuntimeServiceError &&
                cause.status === 404
              )
                continue;
              throw cause;
            }
            // A terminal execution does not prove resource cleanup; repeat the driver's exact idempotent cleanup after ACK loss.
            await driver.cancel(
              {
                binding,
                task,
                plan: verification.plan,
                run,
                agentRunId: runId,
                cancellationCommandId: cancellation.commandId,
              },
              signal
            );
            const current = await this.ports.readVerificationRun(
              { workspaceId, runId, verificationRunId: initial.runId },
              signal
            );
            if (['queued', 'running', 'cancelling'].includes(current.status))
              return 'cancel-reconciliation-required';
          }
        }
      }
      if (state.cleanupState !== 'clean')
        await cancelPersist(
          acknowledgeAgentRunCleanup(task, state, {
            ...cancellationCommand('cleanup'),
            cleanupState: 'clean',
            receiptDigest: digestAgentCanonicalValue({
              runId,
              generation: state.run.generation,
              resources: 'stateless-provider-no-retained-resources',
            }),
          })
        );
      await cancelPersist(
        finalizeAgentRun(task, state, {
          ...cancellationCommand('terminal'),
          outcome: 'cancelled',
          diagnosticCode: 'AI-6003',
        })
      );
      return 'cancelled';
    }
    if (state.run.phase === 'cancelling')
      return 'cancel-reconciliation-required';
    if (state.run.phase === 'queued') {
      const started = startAgentRun(task, state, {
        ...command('started'),
        attemptId: `${runId}.attempt.1`,
      });
      if (!started.accepted)
        throw new Error('Agent runtime owner rejected its initial start.');
      state = await this.ports.startRun(
        {
          workspaceId,
          previous: state,
          snapshot: started.state,
          event: started.event,
        },
        signal
      );
      if (state.snapshotDigest !== started.state.snapshotDigest)
        throw new Error('Agent runtime start acknowledgement drifted.');
    }
    const leaseId = `${runId}.lease.${state.run.generation}`;
    const expiresAt = new Date(
      Date.parse(now()) + this.config.leaseMs
    ).toISOString();
    let lease: Awaited<ReturnType<AgentRuntimePorts['renewLease']>>;
    try {
      lease = await this.ports.renewLease(
        {
          workspaceId,
          runId,
          authority: {
            leaseId,
            holderId: this.config.workerId,
            generation: state.run.generation,
            observedAt: now(),
          },
          expiresAt,
        },
        signal
      );
    } catch (cause) {
      if (
        !(cause instanceof AgentRuntimeServiceError) ||
        ![404, 409].includes(cause.status)
      )
        throw cause;
      lease = await this.ports.claimLease(
        {
          workspaceId,
          runId,
          leaseId,
          holderId: this.config.workerId,
          generation: state.run.generation,
          observedAt: now(),
          expiresAt,
        },
        signal
      );
    }
    if (
      lease.runId !== runId ||
      lease.generation !== state.run.generation ||
      lease.holderId !== this.config.workerId ||
      Date.parse(lease.expiresAt) <= Date.parse(now())
    )
      throw new Error('Agent runtime lease was rejected.');
    const executionController = new AbortController();
    const parentSignal = signal;
    const abortExecution = () => executionController.abort();
    parentSignal?.addEventListener('abort', abortExecution, { once: true });
    if (parentSignal?.aborted) abortExecution();
    signal = executionController.signal;
    let heartbeatRunning = false;
    const heartbeat = setInterval(
      () => {
        if (heartbeatRunning || signal!.aborted) return;
        heartbeatRunning = true;
        void (async () => {
          try {
            const current = await this.ports.readProduct(
              { workspaceId, runId },
              signal
            );
            if (
              current.view.identity.generation !== lease.generation ||
              current.view.commands.some(
                (entry) =>
                  entry.kind === 'cancel' &&
                  entry.expectedGeneration === lease.generation &&
                  entry.expectedSnapshotDigest ===
                    current.view.identity.runSnapshotDigest
              )
            )
              return abortExecution();
            const renewed = await this.ports.renewLease(
              {
                workspaceId,
                runId,
                authority: {
                  leaseId: lease.leaseId,
                  holderId: lease.holderId,
                  generation: lease.generation,
                  observedAt: now(),
                },
                expiresAt: new Date(
                  Date.parse(now()) + this.config.leaseMs
                ).toISOString(),
              },
              signal
            );
            if (
              renewed.generation !== lease.generation ||
              renewed.leaseId !== lease.leaseId ||
              renewed.holderId !== lease.holderId ||
              Date.parse(renewed.expiresAt) <= Date.parse(now())
            )
              abortExecution();
            else lease = renewed;
          } catch {
            abortExecution();
          } finally {
            heartbeatRunning = false;
          }
        })();
      },
      Math.max(
        100,
        Math.min(
          this.config.pollIntervalMs,
          Math.floor(this.config.leaseMs / 3),
          1_000
        )
      )
    );
    try {
      const authority = () => ({
        leaseId: lease.leaseId,
        holderId: lease.holderId,
        generation: state!.run.generation,
        observedAt: now(),
      });
      const persist = async (result: AgentRunTransitionResult) => {
        if (!result.accepted)
          throw new Error('Agent runtime owner rejected a transition.');
        const previous = state!;
        state = await this.ports.transition(
          {
            workspaceId,
            authority: authority(),
            previous,
            snapshot: result.state,
            event: result.event,
          },
          signal
        );
        if (state.snapshotDigest !== result.state.snapshotDigest)
          throw new Error('Agent runtime transition acknowledgement drifted.');
      };
      const terminal = async (
        outcome:
          | 'blocked'
          | 'infrastructure-error'
          | 'failed'
          | 'budget-exhausted'
          | 'cancelled',
        code = diagnostic
      ) => {
        await persist(
          finalizeAgentRun(task, state!, {
            ...command(`terminal.${outcome}`),
            outcome,
            diagnosticCode: code,
          })
        );
        return outcome;
      };
      const completeRun = async (
        successProof: AgentRunSuccessProof
      ): Promise<string> => {
        if (signal?.aborted || Date.parse(lease.expiresAt) <= Date.parse(now()))
          throw new Error('AI-6004');
        const elapsedMs = Date.parse(now()) - Date.parse(state!.run.createdAt);
        if (
          !Number.isFinite(elapsedMs) ||
          elapsedMs >
            Math.min(
              task.spec.budget.maxElapsedMs,
              binding?.policy.budgetCeiling.maxElapsedMs ??
                task.spec.budget.maxElapsedMs
            )
        )
          return terminal('budget-exhausted', 'AI-6002');
        await persist(
          finalizeAgentRun(task, state!, {
            ...command('succeeded'),
            outcome: 'succeeded',
            successProof,
          })
        );
        return 'succeeded';
      };
      if (
        ['awaiting-approval', 'committing', 'verifying', 'repairing'].includes(
          state.run.phase
        )
      ) {
        if (
          !binding ||
          !context ||
          !this.options.journal ||
          task.spec.mode !== 'apply'
        )
          return terminal('blocked', 'AI-6001');
        return continueAgentRuntimeApply({
          task,
          workspace: context.workspace,
          ...(context.repair ? { repair: context.repair } : {}),
          binding,
          ports: this.ports,
          journal: this.options.journal,
          driver:
            this.options.verificationDriver ??
            createAgentRuntimeVerificationDriver(),
          state: () => state!,
          authority,
          command,
          persist,
          terminal,
          succeed: completeRun,
          now,
          signal,
        });
      }
      const recoverUncertainDispatch = async () => {
        const uncertain = state!;
        const recovered = recoverAgentRun(task, uncertain, {
          position: 'model-stream',
          attemptId: `${runId}.recovery.${uncertain.run.generation + 1}`,
          eventIdPrefix: `${runId}.recovery.${uncertain.cursor}`,
          idempotencyKeyPrefix: `${runId}.recovery.${uncertain.cursor}`,
          occurredAt: now(),
          producer,
        });
        if (!recovered.recovered)
          return terminal('infrastructure-error', 'AI-6004');
        for (const event of recovered.events)
          await persist(reduceAgentRun(task, state!, event));
        return terminal('infrastructure-error', 'AI-6004');
      };
      if (
        state.run.phase === 'running' ||
        state.pendingOperation?.state === 'started'
      ) {
        if (
          state.run.phase === 'running' &&
          binding &&
          this.options.journal &&
          ['explain', 'plan'].includes(task.spec.mode)
        ) {
          const saved = await readAgentRuntimeTaskOutput({
            journal: this.options.journal,
            task,
            run: state,
            effectivePolicyDigest:
              binding.policy.evaluation.effectivePolicyDigest,
          });
          if (saved) {
            await this.ports.publishTaskOutput(
              {
                workspaceId,
                runId,
                authority: authority(),
                output: saved.output,
              },
              signal
            );
            return completeRun(agentRuntimeTaskOutputProof(saved));
          }
        }
        return recoverUncertainDispatch();
      }
      if (!binding || !prepared || !context) return terminal('blocked');
      const plan: AgentInvocationPlan = {
        invocationId: `${runId}.invocation.${state.run.generation}`,
        taskId: task.spec.taskId,
        runId,
        taskMode: task.spec.mode,
        generation: state.run.generation,
        attempt: state.run.attempt,
        provider: binding.catalog.provider,
        providerDataPolicy: binding.catalog.dataPolicy,
        model: binding.catalog.model,
        capabilityProfile: binding.catalog.capabilityProfile,
        qualification: binding.qualification,
        inferenceConfiguration: binding.inference,
        contextPack: prepared.pack,
        policyDigest: prepared.pack.policyDigest,
        grantCapabilities: binding.grant.capabilities,
        startedAt: now(),
      };
      const minimumSupportTier =
        task.spec.mode === 'explain' || task.spec.mode === 'plan'
          ? ('admission-only' as const)
          : ('release-evaluated' as const);
      const preflight = preflightAgentInvocation(plan, {
        at: plan.startedAt,
        minimumSupportTier,
      });
      if (!preflight.ok)
        return terminal('blocked', preflight.issues[0]?.code ?? 'AI-6010');
      const request = {
        invocationId: plan.invocationId,
        requestDigest: preflight.requestDigest,
        providerConfigurationId: plan.provider.providerConfigurationId,
        modelLineageDigest: plan.model.lineageDigest,
        capabilityProfileDigest: plan.capabilityProfile.profileDigest,
        inferenceConfigurationDigest:
          plan.inferenceConfiguration.configurationDigest,
        contextPackDigest: plan.contextPack.manifestDigest,
      };
      let adapter: AgentNativeProviderAdapter;
      try {
        adapter = (
          this.options.nativeFactory ?? createAgentRuntimeNativeAdapter
        )({
          binding,
          task,
          context: prepared,
          request,
          now,
          timeoutMs: Math.max(
            1,
            Math.min(
              task.spec.budget.maxElapsedMs,
              binding.policy.budgetCeiling.maxElapsedMs,
              60_000
            )
          ),
        });
      } catch {
        return terminal('blocked', 'AI-6010');
      }
      const reservationId = `${plan.invocationId}.reservation`;
      const reserved = reserveAgentRunBudget(task, state, {
        ...command('reserved'),
        reservationId,
        demand: binding.reservation,
      });
      if (!reserved.accepted) return terminal('budget-exhausted', 'AI-6002');
      await persist(reserved);
      await persist(
        transitionAgentRunPhase(task, state, {
          ...command('running'),
          phase: 'running',
        })
      );
      await persist(
        startAgentRunOperation(task, state, {
          ...command('model.started'),
          operationId: plan.invocationId,
          kind: 'model-stream',
          request,
        })
      );
      const claim = await this.ports.claimDispatch(
        {
          workspaceId,
          runId,
          operationId: plan.invocationId,
          authority: authority(),
          expiresAt: lease.expiresAt,
        },
        signal
      );
      if (
        claim.operationId !== plan.invocationId ||
        claim.generation !== state.run.generation ||
        claim.leaseId !== lease.leaseId ||
        claim.holderId !== lease.holderId ||
        claim.dispatchState !== 'claimed' ||
        claim.reconciliationRequired ||
        claim.replayed
      )
        return recoverUncertainDispatch();
      await this.ports.markDispatched(
        { workspaceId, runId, claim, observedAt: now() },
        signal
      );
      const events: Parameters<
        typeof finalizeAgentModelInvocation
      >[0]['events'][number][] = [];
      let output = '';
      let usage:
        Parameters<typeof finalizeAgentModelInvocation>[0]['usage'] | undefined;
      let failed = false;
      try {
        for await (const fact of adapter.invokeRuntime(request, signal)) {
          if (fact.factType === 'provider-event') {
            events.push(fact.value.durableEvent);
            if (fact.value.durableEvent.type === 'output-delta') {
              const delta = isPlainObject(fact.value.payload)
                ? fact.value.payload.delta
                : undefined;
              if (
                typeof delta !== 'string' ||
                Buffer.byteLength(output) + Buffer.byteLength(delta) > 262_144
              )
                throw new Error('AI-5001');
              output += delta;
            }
            if (fact.value.durableEvent.type === 'tool-call')
              throw new Error('AI-7001');
          } else if (fact.factType === 'usage-vector') {
            if (usage) throw new Error('AI-6013');
            usage = fact.value;
          } else throw new Error('AI-6010');
        }
      } catch {
        failed = true;
      }
      const actualUsage =
        usage ??
        createUnknownAgentUsageVector([
          'text-token-input',
          'text-token-output',
        ]);
      let costs: Parameters<typeof finalizeAgentModelInvocation>[0]['cost'] =
        [];
      try {
        if (binding.pricing)
          costs = priceAgentUsage(actualUsage, binding.pricing);
      } catch {
        failed = true;
      }
      const settled = settleAgentRunBudget(task, state, {
        ...command('budget.settled'),
        reservationId,
        actual: {
          ...binding.reservation,
          usage: actualUsage,
          cost: costs,
          elapsedMs: Math.max(
            0,
            Date.parse(now()) - Date.parse(plan.startedAt)
          ),
        },
      });
      if (!settled.accepted) return terminal('infrastructure-error', 'AI-6013');
      await persist(settled);
      let responseValue: unknown = output;
      try {
        responseValue = parseAgentRuntimeOutput(
          output,
          task.spec.mode === 'explain'
            ? ['answer']
            : task.spec.mode === 'plan'
              ? ['plan']
              : ['actions', 'explanation', 'assumptions']
        );
      } catch {
        failed = true;
      }
      const receipt = finalizeAgentModelInvocation({
        plan,
        preflightAt: plan.startedAt,
        minimumSupportTier,
        events,
        outcome:
          !failed && events.at(-1)?.type === 'completed'
            ? 'completed'
            : 'provider-error',
        responseDigest: digestAgentCanonicalValue(responseValue),
        usage: actualUsage,
        costStatus: binding.pricing ? 'priced' : 'not-applicable',
        cost: costs,
        ...(binding.pricing
          ? { pricingSnapshotRef: binding.pricing.pricingSnapshotId }
          : {}),
        completedAt: now(),
      });
      if (!receipt.ok) {
        await persist(
          settleAgentRunOperation(task, state, {
            ...command('model.failed'),
            status: 'failed',
          })
        );
        return terminal('failed', receipt.issues[0]?.code ?? 'AI-6011');
      }
      await persist(
        settleAgentRunOperation(task, state, {
          ...command('model.completed'),
          status: 'completed',
          result: receipt.receipt,
          resultDigest: digestAgentCanonicalValue(receipt.receipt),
        })
      );
      if (failed || receipt.receipt.outcome !== 'completed')
        return terminal('failed', 'AI-6011');
      if (task.spec.mode === 'explain' || task.spec.mode === 'plan') {
        const kind =
          task.spec.mode === 'explain'
            ? ('answer' as const)
            : ('plan' as const);
        const value = parseAgentRuntimeOutput(output, [kind]);
        if (typeof value[kind] !== 'string')
          return terminal('blocked', 'AI-5001');
        let record: AgentRuntimeTaskOutputRecord;
        try {
          record = {
            output: createAgentTaskOutput({
              outputId: `${plan.invocationId}.output`,
              taskId: task.spec.taskId,
              runId,
              generation: state.run.generation,
              modelInvocationId: plan.invocationId,
              contextPackDigest: prepared.pack.manifestDigest,
              projectPolicyDigest: task.spec.policyDigest,
              effectivePolicyDigest: prepared.pack.policyDigest,
              kind,
              text: value[kind],
              recordedAt: now(),
            }),
            receipt: receipt.receipt,
            groundingDigests: prepared.pack.items.map(
              ({ contentDigest }) => contentDigest
            ),
          };
          if (
            !validateAgentTaskOutputBinding(record.output, {
              task,
              run: state,
              receipt: record.receipt,
              effectivePolicyDigest:
                binding.policy.evaluation.effectivePolicyDigest,
            })
          )
            return terminal('blocked', 'AI-7006');
        } catch {
          return terminal('blocked', 'AI-5001');
        }
        if (this.options.journal)
          await this.options.journal.put('task-output', runId, record);
        // Publication may have succeeded despite a lost ACK. Preserve the original fact and retry it on the next poll.
        await this.ports.publishTaskOutput(
          { workspaceId, runId, authority: authority(), output: record.output },
          signal
        );
        return completeRun(agentRuntimeTaskOutputProof(record));
      }
      try {
        const value = parseAgentRuntimeOutput(output, [
          'actions',
          'explanation',
          'assumptions',
        ]);
        const proposal = createAgentActionProposal(
          WORKSPACE_AGENT_ACTION_REGISTRY,
          {
            proposalId: `${plan.invocationId}.proposal`,
            taskId: task.spec.taskId,
            runId,
            baseRevision: task.spec.baseRevision,
            contextPackDigest: prepared.pack.manifestDigest,
            actions: value.actions as Parameters<
              typeof createAgentActionProposal
            >[1]['actions'],
            explanation: value.explanation as string,
            assumptions: value.assumptions as string[],
            requestedVerification: task.spec.verificationRequirement,
            modelInvocationRefs: [plan.invocationId],
          }
        );
        const projection = prepareAgentRuntimePreview({
          task,
          run: state,
          workspace: context.workspace,
          binding,
          proposal,
          at: now(),
          ...(context.repair ? { repair: context.repair } : {}),
        });
        if (task.spec.mode === 'apply') {
          if (!this.options.journal) return terminal('blocked', 'AI-6001');
          await this.options.journal.put('proposal', proposal.proposalId, {
            historicalRun: state,
            projection,
          });
        }
        await this.ports.publishProposal(
          { workspaceId, runId, authority: authority(), proposal },
          signal
        );
        await this.ports.publishPreview(
          {
            workspaceId,
            runId,
            authority: authority(),
            planning: projection.planning,
            preview: projection.preview,
          },
          signal
        );
        if (task.spec.mode === 'propose') {
          return completeRun({
            mode: 'propose',
            proposalDigest: proposal.proposalDigest,
            previewDigest: projection.preview.previewDigest,
          });
        }
        await persist(
          transitionAgentRunPhase(task, state, {
            ...command('approval.wait'),
            phase: 'awaiting-approval',
          })
        );
        return 'awaiting-approval';
      } catch {
        return terminal('blocked', 'AI-5001');
      }
      return 'succeeded';
    } finally {
      clearInterval(heartbeat);
      parentSignal?.removeEventListener('abort', abortExecution);
      executionController.abort();
    }
  }
}
