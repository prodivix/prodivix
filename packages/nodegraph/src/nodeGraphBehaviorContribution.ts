import {
  BEHAVIOR_EMPTY_SCHEMA_DIGEST,
  readBehaviorJsonValue,
  type BehaviorJsonValue,
  type BehaviorRegistryContribution,
  type BehaviorRegistryDescriptor,
  type BehaviorRuntimeCapabilityAdapter,
  type BehaviorRuntimeInvocation,
} from '@prodivix/behavior';
import {
  createNodeGraphProgramCancellationController,
  createNodeGraphTemporaryStateHost,
  executeNodeGraphProgram,
  type NodeGraphProgramCancellationController,
  type NodeGraphProgramExecutorRegistry,
  type NodeGraphProgramExecutionResult,
  type NodeGraphProgramRuntimeGateways,
  type NodeGraphProgramTraceEvent,
  type NodeGraphTemporaryStateHost,
} from './nodeGraphProgramRuntime';
import type { NodeGraphProgram } from './nodeGraphPlanner';
import type { NodeGraphSurfaceRuntimeAdapter } from './nodeGraphSurfaceRuntime';

const descriptor = (
  kind: string,
  targetCapability: string,
  effect: BehaviorRegistryDescriptor['effect'],
  cancellation: BehaviorRegistryDescriptor['cancellation']
): BehaviorRegistryDescriptor =>
  Object.freeze({
    kind,
    owner: 'nodegraph',
    inputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
    outputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
    targetCapability,
    runtimeZones: Object.freeze(['client', 'test'] as const),
    effect,
    cancellation,
    determinism: 'controlled',
    sourceTraceResolverId: 'nodegraph.program-source',
    redactionPolicyId: 'nodegraph.transport-safe-value',
  });

const triggerDescriptors = Object.freeze([
  descriptor(
    'nodegraph.graph-input',
    'behavior:nodegraph:input',
    'read',
    'none'
  ),
  descriptor('nodegraph.event', 'behavior:nodegraph:event', 'read', 'none'),
  descriptor(
    'nodegraph.checkpoint-trigger',
    'behavior:nodegraph:checkpoint',
    'read',
    'none'
  ),
]);

const actionDescriptors = Object.freeze([
  descriptor(
    'nodegraph.invoke',
    'behavior:nodegraph:invoke',
    'write',
    'cooperative'
  ),
  descriptor(
    'nodegraph.resume',
    'behavior:nodegraph:resume',
    'write',
    'cooperative'
  ),
  descriptor(
    'nodegraph.cancel',
    'behavior:nodegraph:cancel',
    'write',
    'required'
  ),
]);

const observationDescriptors = Object.freeze([
  descriptor('nodegraph.node-enter', 'behavior:nodegraph:node', 'read', 'none'),
  descriptor('nodegraph.node-exit', 'behavior:nodegraph:node', 'read', 'none'),
  descriptor(
    'nodegraph.port-output',
    'behavior:nodegraph:port',
    'read',
    'none'
  ),
  descriptor(
    'nodegraph.checkpoint',
    'behavior:nodegraph:checkpoint',
    'read',
    'none'
  ),
  descriptor(
    'nodegraph.graph-result',
    'behavior:nodegraph:result',
    'read',
    'none'
  ),
  descriptor(
    'nodegraph.graph-error',
    'behavior:nodegraph:error',
    'read',
    'none'
  ),
  descriptor(
    'nodegraph.graph-cancel',
    'behavior:nodegraph:cancel',
    'read',
    'none'
  ),
  descriptor(
    'nodegraph.nodegraph-output',
    'behavior:nodegraph:output',
    'read',
    'none'
  ),
]);

export const NODEGRAPH_BEHAVIOR_REGISTRY_CONTRIBUTION: BehaviorRegistryContribution =
  Object.freeze({
    contributorId: 'core.nodegraph',
    triggers: triggerDescriptors,
    actions: actionDescriptors,
    observations: observationDescriptors,
  });

export type NodeGraphBehaviorExecutionTarget = Readonly<{
  program: NodeGraphProgram;
  workspaceRevision: number;
  grantedCapabilities?: readonly string[];
  gateways?: NodeGraphProgramRuntimeGateways;
  executors?: NodeGraphProgramExecutorRegistry;
  stateHost?: NodeGraphTemporaryStateHost;
  surfaceAdapter?: NodeGraphSurfaceRuntimeAdapter;
}>;

export type ResolveNodeGraphBehaviorExecutionTarget = (
  invocation: BehaviorRuntimeInvocation
) =>
  | NodeGraphBehaviorExecutionTarget
  | null
  | Promise<NodeGraphBehaviorExecutionTarget | null>;

export type CreateNodeGraphBehaviorRuntimeAdaptersInput = Readonly<{
  resolveTarget: ResolveNodeGraphBehaviorExecutionTarget;
  maximumSteps?: number;
  maximumConcurrency?: number;
}>;

type AttemptExecution = {
  controller: NodeGraphProgramCancellationController;
  stateHost: NodeGraphTemporaryStateHost;
  events: NodeGraphProgramTraceEvent[];
  result?: NodeGraphProgramExecutionResult;
};

const targetMissing = (
  invocation: BehaviorRuntimeInvocation
): ReturnType<BehaviorRuntimeCapabilityAdapter['invoke']> =>
  Object.freeze({
    status: 'failed',
    error: Object.freeze({
      code: 'nodegraph-target-missing',
      safeMessage: `NodeGraph target is unavailable for ${invocation.stepId}.`,
    }),
  });

const attemptKey = (invocation: BehaviorRuntimeInvocation): string =>
  `${invocation.attemptId}\u0000${invocation.target?.targetId ?? ''}`;

const selectorRecord = (
  invocation: BehaviorRuntimeInvocation
): Readonly<Record<string, BehaviorJsonValue>> =>
  invocation.input &&
  typeof invocation.input === 'object' &&
  !Array.isArray(invocation.input)
    ? (invocation.input as Readonly<Record<string, BehaviorJsonValue>>)
    : {};

const asBehaviorOutput = (
  value: unknown
):
  | Readonly<{ ok: true; value?: BehaviorJsonValue }>
  | Readonly<{ ok: false }> => {
  if (value === undefined) return Object.freeze({ ok: true });
  const bounded = readBehaviorJsonValue(value);
  return bounded === undefined
    ? Object.freeze({ ok: false })
    : Object.freeze({ ok: true, value: bounded });
};

const unavailableObservation = (
  capabilityId: string
): ReturnType<BehaviorRuntimeCapabilityAdapter['invoke']> =>
  Object.freeze({
    status: 'failed',
    error: Object.freeze({
      code: 'nodegraph-observation-unavailable',
      safeMessage: `NodeGraph observation is unavailable: ${capabilityId}.`,
    }),
  });

const bridgeCancellation = (
  invocation: BehaviorRuntimeInvocation,
  controller: NodeGraphProgramCancellationController
): (() => void) => {
  if (invocation.signal.aborted) {
    controller.abort('behavior-cancelled');
    return () => undefined;
  }
  const abortLike = invocation.signal as typeof invocation.signal & {
    addEventListener?: (
      type: 'abort',
      listener: () => void,
      options?: { once?: boolean }
    ) => void;
    removeEventListener?: (type: 'abort', listener: () => void) => void;
  };
  if (!abortLike.addEventListener) return () => undefined;
  const abort = () => controller.abort('behavior-cancelled');
  abortLike.addEventListener('abort', abort, { once: true });
  return () => abortLike.removeEventListener?.('abort', abort);
};

/**
 * Executes every Behavior graph action through the canonical compiled Program
 * runtime. Attempt state and observations are runtime-only and never become
 * Workspace writes.
 */
export const createNodeGraphBehaviorRuntimeAdapters = (
  input: CreateNodeGraphBehaviorRuntimeAdaptersInput
): readonly BehaviorRuntimeCapabilityAdapter[] => {
  const attempts = new Map<string, AttemptExecution>();

  const run = async (
    invocation: BehaviorRuntimeInvocation,
    resume: boolean
  ): Promise<
    Awaited<ReturnType<BehaviorRuntimeCapabilityAdapter['invoke']>>
  > => {
    if (!invocation.target) return targetMissing(invocation);
    const target = await input.resolveTarget(invocation);
    if (!target || target.workspaceRevision !== invocation.workspaceRevision) {
      return targetMissing(invocation);
    }
    const key = attemptKey(invocation);
    const previous = attempts.get(key);
    if (resume && !previous) {
      return Object.freeze({
        status: 'failed',
        error: Object.freeze({
          code: 'nodegraph-resume-unavailable',
          safeMessage:
            'NodeGraph resume requires an earlier attempt generation.',
        }),
      });
    }
    previous?.controller.abort('behavior-generation-replaced');
    const controller = createNodeGraphProgramCancellationController();
    const execution: AttemptExecution = {
      controller,
      stateHost:
        previous?.stateHost ??
        target.stateHost ??
        createNodeGraphTemporaryStateHost(),
      events: [],
    };
    attempts.set(key, execution);
    const disposeCancellation = bridgeCancellation(invocation, controller);
    try {
      const executionInput = {
        program: target.program,
        invocationId: invocation.invocationId,
        ...(invocation.input !== undefined ? { input: invocation.input } : {}),
        grantedCapabilities: target.grantedCapabilities,
        signal: controller.signal,
        stateHost: execution.stateHost,
        gateways: target.gateways,
        executors: target.executors,
        ...(input.maximumSteps !== undefined
          ? { maximumSteps: input.maximumSteps }
          : {}),
        ...(input.maximumConcurrency !== undefined
          ? { maximumConcurrency: input.maximumConcurrency }
          : {}),
        correlation: {
          behaviorAttemptId: invocation.attemptId,
          behaviorInstructionId: invocation.instructionId,
          behaviorStepId: invocation.stepId,
          behaviorProgramDigest: invocation.programDigest,
        },
        observer(event) {
          execution.events.push(event);
        },
      } satisfies Parameters<typeof executeNodeGraphProgram>[0];
      const result = target.surfaceAdapter
        ? (await target.surfaceAdapter.invoke(executionInput)).result
        : await executeNodeGraphProgram(executionInput);
      execution.result = result;
      if (result.status === 'cancelled') {
        return Object.freeze({
          status: 'cancelled',
          reason: 'NodeGraph invocation was cancelled.',
        });
      }
      if (result.status !== 'completed') {
        return Object.freeze({
          status: 'failed',
          error: Object.freeze({
            code: `nodegraph-${result.error?.code ?? result.status}`,
            safeMessage:
              result.error?.safeMessage ??
              `NodeGraph invocation stopped with ${result.status}.`,
          }),
        });
      }
      const output = asBehaviorOutput(result.output);
      if (!output.ok) {
        return Object.freeze({
          status: 'failed',
          error: Object.freeze({
            code: 'nodegraph-output-invalid',
            safeMessage:
              'NodeGraph output is not a bounded transport-safe Behavior value.',
          }),
        });
      }
      return output.value === undefined
        ? Object.freeze({ status: 'succeeded' })
        : Object.freeze({ status: 'succeeded', output: output.value });
    } finally {
      disposeCancellation();
    }
  };

  const invoke: BehaviorRuntimeCapabilityAdapter = Object.freeze({
    capabilityId: 'nodegraph.invoke',
    owner: 'nodegraph',
    invoke: (invocation) => run(invocation, false),
  });
  const resume: BehaviorRuntimeCapabilityAdapter = Object.freeze({
    capabilityId: 'nodegraph.resume',
    owner: 'nodegraph',
    invoke: (invocation) => run(invocation, true),
  });
  const cancel: BehaviorRuntimeCapabilityAdapter = Object.freeze({
    capabilityId: 'nodegraph.cancel',
    owner: 'nodegraph',
    invoke(invocation) {
      const execution = attempts.get(attemptKey(invocation));
      if (!execution) return unavailableObservation('nodegraph.cancel');
      execution.controller.abort('behavior-cancel-action');
      return Object.freeze({ status: 'succeeded' });
    },
  });

  const echoTrigger = (
    capabilityId: string
  ): BehaviorRuntimeCapabilityAdapter =>
    Object.freeze({
      capabilityId,
      owner: 'nodegraph',
      invoke(invocation) {
        return invocation.input === undefined
          ? Object.freeze({ status: 'succeeded' })
          : Object.freeze({
              status: 'succeeded',
              output: invocation.input,
            });
      },
    });

  const observe = (
    capabilityId: string,
    project: (
      execution: AttemptExecution,
      invocation: BehaviorRuntimeInvocation
    ) => unknown
  ): BehaviorRuntimeCapabilityAdapter =>
    Object.freeze({
      capabilityId,
      owner: 'nodegraph',
      invoke(invocation) {
        if (!invocation.target) return targetMissing(invocation);
        const execution = attempts.get(attemptKey(invocation));
        if (!execution) return unavailableObservation(capabilityId);
        const output = asBehaviorOutput(project(execution, invocation));
        if (!output.ok || output.value === undefined) {
          return unavailableObservation(capabilityId);
        }
        return Object.freeze({ status: 'succeeded', output: output.value });
      },
    });

  const latestEvent = (
    execution: AttemptExecution,
    kind: NodeGraphProgramTraceEvent['kind'],
    nodeId?: string
  ): NodeGraphProgramTraceEvent | undefined =>
    [...execution.events]
      .reverse()
      .find(
        (event) =>
          event.kind === kind &&
          (nodeId === undefined || event.nodeId === nodeId)
      );

  return Object.freeze([
    echoTrigger('nodegraph.graph-input'),
    echoTrigger('nodegraph.event'),
    echoTrigger('nodegraph.checkpoint-trigger'),
    invoke,
    resume,
    cancel,
    observe('nodegraph.node-enter', (execution, invocation) => {
      const nodeId = selectorRecord(invocation).nodeId;
      const event = latestEvent(
        execution,
        'node-started',
        typeof nodeId === 'string' ? nodeId : undefined
      );
      return event
        ? {
            nodeId: event.nodeId ?? '',
            sequence: event.sequence,
            sourcePath: event.sourcePath ?? '',
          }
        : undefined;
    }),
    observe('nodegraph.node-exit', (execution, invocation) => {
      const nodeId = selectorRecord(invocation).nodeId;
      const event = latestEvent(
        execution,
        'node-completed',
        typeof nodeId === 'string' ? nodeId : undefined
      );
      return event
        ? {
            nodeId: event.nodeId ?? '',
            sequence: event.sequence,
            sourcePath: event.sourcePath ?? '',
          }
        : undefined;
    }),
    observe('nodegraph.port-output', (execution, invocation) => {
      const selector = selectorRecord(invocation);
      return typeof selector.nodeId === 'string' &&
        typeof selector.portId === 'string'
        ? execution.result?.outputsByNode[selector.nodeId]?.[selector.portId]
        : undefined;
    }),
    observe('nodegraph.checkpoint', (execution, invocation) => {
      const checkpointId = selectorRecord(invocation).checkpointId;
      return [...execution.events]
        .reverse()
        .find(
          (event) =>
            event.kind === 'observation' &&
            event.detail?.observationKind === 'checkpoint' &&
            (typeof checkpointId !== 'string' ||
              event.detail.checkpointId === checkpointId)
        )?.detail;
    }),
    observe('nodegraph.graph-result', (execution) =>
      execution.result?.status === 'completed'
        ? {
            status: execution.result.status,
            output: execution.result.output ?? null,
            steps: execution.result.steps,
          }
        : undefined
    ),
    observe('nodegraph.graph-error', (execution) =>
      execution.result?.error
        ? {
            code: execution.result.error.code,
            category: execution.result.error.category,
            retryable: execution.result.error.retryable,
            safeMessage: execution.result.error.safeMessage,
            sourceRef: execution.result.error.sourceRef,
          }
        : undefined
    ),
    observe('nodegraph.graph-cancel', (execution) =>
      execution.result?.status === 'cancelled'
        ? { status: 'cancelled' }
        : undefined
    ),
    observe(
      'nodegraph.nodegraph-output',
      (execution) => execution.result?.output
    ),
  ]);
};
