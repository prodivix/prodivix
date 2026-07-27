import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  digestNodeGraphProgramValue,
  readNodeGraphProgramValue,
} from './nodeGraphPlanner';
import type {
  CreateNodeGraphDebugControllerInput,
  CreateNodeGraphDebugControllerResult,
  NodeGraphDebugCommand,
  NodeGraphDebugCommandResult,
  NodeGraphDebugController,
  NodeGraphDebugEvent,
  NodeGraphDebugIdentity,
  NodeGraphDebugIssue,
  NodeGraphDebugNodeOutcome,
  NodeGraphDebugSnapshot,
  NodeGraphDebugStatus,
} from './nodeGraphDebugger.types';
import type {
  NodeGraphProgram,
  NodeGraphProgramNode,
  NodeGraphProgramValue,
} from './nodeGraphPlanner';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

const isCanonicalId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 512 &&
  value === value.trim() &&
  !value.includes('\u0000');

const validateProgram = (
  program: NodeGraphProgram
): NodeGraphDebugIssue | null => {
  if (
    !isCanonicalId(program.documentId) ||
    !DIGEST_PATTERN.test(program.programDigest)
  ) {
    return Object.freeze({
      code: 'invalid-program',
      safeMessage: 'NodeGraph debugger requires a canonical compiled Program.',
    });
  }
  const { programDigest: _programDigest, ...withoutDigest } = program;
  if (digestNodeGraphProgramValue(withoutDigest) !== program.programDigest) {
    return Object.freeze({
      code: 'invalid-program',
      safeMessage: 'NodeGraph debugger rejected a Program digest mismatch.',
    });
  }
  const nodeIds = program.nodes.map(({ id }) => id);
  const orderedNodeIds = program.executionWaves.flatMap((wave) => wave);
  if (
    !nodeIds.every(isCanonicalId) ||
    new Set(nodeIds).size !== nodeIds.length ||
    orderedNodeIds.length !== nodeIds.length ||
    new Set(orderedNodeIds).size !== orderedNodeIds.length ||
    orderedNodeIds.some((nodeId) => !nodeIds.includes(nodeId))
  ) {
    return Object.freeze({
      code: 'invalid-program',
      safeMessage:
        'NodeGraph debugger requires exact unique nodes in dependency waves.',
    });
  }
  return null;
};

const freezeValues = (
  values: ReadonlyMap<string, NodeGraphProgramValue>
): Readonly<Record<string, NodeGraphProgramValue>> => {
  const output: Record<string, NodeGraphProgramValue> = Object.create(null);
  [...values]
    .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
    .forEach(([nodeId, value]) => {
      output[nodeId] = value;
    });
  return Object.freeze(output);
};

const freezeInputs = (
  node: NodeGraphProgramNode,
  values: ReadonlyMap<string, NodeGraphProgramValue>
): Readonly<Record<string, NodeGraphProgramValue>> => {
  const inputs: Record<string, NodeGraphProgramValue> = Object.create(null);
  node.dependencyNodeIds.forEach((nodeId) => {
    const value = values.get(nodeId);
    if (value !== undefined) inputs[nodeId] = value;
  });
  return Object.freeze(inputs);
};

type RunMode = 'continue' | 'step-into' | 'step-over' | 'step-out';

export const createNodeGraphDebugController = (
  input: CreateNodeGraphDebugControllerInput
): CreateNodeGraphDebugControllerResult => {
  const invalidProgram = validateProgram(input.program);
  if (
    invalidProgram ||
    !isCanonicalId(input.jobId) ||
    !isCanonicalId(input.attemptId) ||
    !isCanonicalId(input.leaseId) ||
    !Number.isSafeInteger(input.initialGeneration ?? 1) ||
    (input.initialGeneration ?? 1) < 1
  ) {
    return Object.freeze({
      ok: false,
      issue:
        invalidProgram ??
        Object.freeze({
          code: 'invalid-program' as const,
          safeMessage:
            'NodeGraph debugger requires canonical job, attempt, lease, and generation identity.',
        }),
    });
  }

  const maximumCommands = Math.max(
    1,
    Math.trunc(input.maximumCommands ?? 1_000)
  );
  const maximumBreakpoints = Math.max(
    1,
    Math.trunc(input.maximumBreakpoints ?? 256)
  );
  const maximumEvents = Math.max(1, Math.trunc(input.maximumEvents ?? 2_048));
  const valueProjection = Object.freeze({
    maximumDepth: Math.max(1, Math.trunc(input.maximumValueDepth ?? 16)),
    maximumNodes: Math.max(1, Math.trunc(input.maximumValueNodes ?? 4_096)),
    maximumUtf8Bytes: Math.max(
      1,
      Math.trunc(input.maximumValueUtf8Bytes ?? 262_144)
    ),
  });
  const nodeById = new Map(input.program.nodes.map((node) => [node.id, node]));
  const orderedNodeIds = input.program.executionWaves.flatMap((wave) => wave);
  const waveByNodeId = new Map<string, number>();
  input.program.executionWaves.forEach((wave, waveIndex) => {
    wave.forEach((nodeId) => waveByNodeId.set(nodeId, waveIndex));
  });
  const sourcePathByNodeId = new Map(
    input.program.sourceTrace
      .filter(({ kind }) => kind === 'node')
      .map(({ id, sourcePath }) => [id, sourcePath])
  );

  let generation = input.initialGeneration ?? 1;
  let commandSequence = 0;
  let eventSequence = 0;
  let currentIndex = 0;
  let status: NodeGraphDebugStatus = 'paused';
  let pauseRequested = false;
  let breakpointConsumedIndex: number | undefined;
  let droppedEventCount = 0;
  let terminalIssue: NodeGraphDebugIssue | undefined;
  const breakpoints = new Set<string>();
  const values = new Map<string, NodeGraphProgramValue>();
  const events: NodeGraphDebugEvent[] = [];

  const identity = (): NodeGraphDebugIdentity =>
    Object.freeze({
      jobId: input.jobId,
      attemptId: input.attemptId,
      programDigest: input.program.programDigest,
      generation,
      leaseId: input.leaseId,
    });

  const appendEvent = (
    event: Omit<
      NodeGraphDebugEvent,
      'sequence' | 'commandSequence' | 'generation'
    >
  ): void => {
    eventSequence += 1;
    events.push(
      Object.freeze({
        sequence: eventSequence,
        commandSequence,
        generation,
        ...event,
      })
    );
    while (events.length > maximumEvents) {
      events.shift();
      droppedEventCount += 1;
    }
  };

  const current = () => {
    const nodeId = orderedNodeIds[currentIndex];
    if (!nodeId) return undefined;
    return Object.freeze({
      nodeId,
      waveIndex: waveByNodeId.get(nodeId) ?? 0,
      sourcePath:
        sourcePathByNodeId.get(nodeId) ??
        `/nodesById/${nodeId.replaceAll('~', '~0').replaceAll('/', '~1')}`,
    });
  };

  const snapshot = (): NodeGraphDebugSnapshot => {
    const active = current();
    const includeFrame =
      active && (status === 'paused' || status === 'running');
    return Object.freeze({
      identity: identity(),
      status,
      commandSequence,
      eventSequence,
      ...(active ? { current: active } : {}),
      callStack: Object.freeze(
        includeFrame
          ? [
              Object.freeze({
                frameId: `root:${input.program.documentId}`,
                documentId: input.program.documentId,
                nodeId: active.nodeId,
                sourcePath: active.sourcePath,
              }),
            ]
          : []
      ),
      breakpoints: Object.freeze(
        [...breakpoints].sort(compareUnicodeCodePoints)
      ),
      outputsByNodeId: freezeValues(values),
      events: Object.freeze([...events]),
      droppedEventCount,
      ...(terminalIssue ? { issue: terminalIssue } : {}),
    });
  };

  const reject = (issue: NodeGraphDebugIssue): NodeGraphDebugCommandResult =>
    Object.freeze({
      accepted: false,
      issue,
      snapshot: snapshot(),
    });

  const accept = (): NodeGraphDebugCommandResult =>
    Object.freeze({
      accepted: true,
      snapshot: snapshot(),
    });

  const validateCommand = (
    command: NodeGraphDebugCommand
  ): NodeGraphDebugIssue | null => {
    const expectedIdentity = identity();
    if (
      command.jobId !== expectedIdentity.jobId ||
      command.attemptId !== expectedIdentity.attemptId ||
      command.programDigest !== expectedIdentity.programDigest ||
      command.generation !== expectedIdentity.generation ||
      command.leaseId !== expectedIdentity.leaseId ||
      command.expectedCommandSequence !== commandSequence + 1
    ) {
      return Object.freeze({
        code: 'stale-command',
        safeMessage: 'NodeGraph debug command identity or sequence is stale.',
      });
    }
    if (commandSequence >= maximumCommands) {
      return Object.freeze({
        code: 'lease-expired',
        safeMessage: 'NodeGraph debug command lease budget is exhausted.',
      });
    }
    commandSequence += 1;
    return null;
  };

  const fail = (issue: NodeGraphDebugIssue): void => {
    terminalIssue = issue;
    status = 'failed';
    appendEvent({
      kind: 'failed',
      ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
      ...(issue.nodeId
        ? { sourcePath: sourcePathByNodeId.get(issue.nodeId) }
        : {}),
      issueCode: issue.code,
    });
  };

  const run = async (mode: RunMode): Promise<NodeGraphDebugCommandResult> => {
    status = 'running';
    pauseRequested = false;
    appendEvent({ kind: 'resumed' });
    const runGeneration = generation;
    let executed = 0;

    while (currentIndex < orderedNodeIds.length) {
      if (generation !== runGeneration) {
        return accept();
      }
      const nodeId = orderedNodeIds[currentIndex]!;
      const node = nodeById.get(nodeId)!;
      const sourcePath =
        sourcePathByNodeId.get(nodeId) ?? `/nodesById/${nodeId}`;
      if (
        mode === 'continue' &&
        breakpoints.has(nodeId) &&
        breakpointConsumedIndex !== currentIndex
      ) {
        breakpointConsumedIndex = currentIndex;
        status = 'paused';
        appendEvent({
          kind: 'breakpoint-hit',
          nodeId,
          sourcePath,
        });
        return accept();
      }
      if (breakpointConsumedIndex === currentIndex) {
        breakpointConsumedIndex = undefined;
      }
      appendEvent({ kind: 'node-entered', nodeId, sourcePath });
      let outcome: NodeGraphDebugNodeOutcome;
      try {
        outcome = await input.executor(
          Object.freeze({
            identity: Object.freeze({
              ...identity(),
              generation: runGeneration,
            }),
            node,
            inputsByDependencyNodeId: freezeInputs(node, values),
            sourcePath,
            signal: Object.freeze({
              get aborted() {
                return (
                  generation !== runGeneration ||
                  status === 'cancelled' ||
                  status === 'detached'
                );
              },
              get reason() {
                return generation === runGeneration
                  ? undefined
                  : 'NodeGraph debug generation was replaced.';
              },
            }),
          })
        );
      } catch {
        fail(
          Object.freeze({
            code: 'executor-failed',
            safeMessage:
              'NodeGraph debug executor failed before producing a safe outcome.',
            nodeId,
          })
        );
        return accept();
      }
      if (generation !== runGeneration) {
        appendEvent({
          kind: 'late-completion-discarded',
          nodeId,
          sourcePath,
        });
        return accept();
      }
      if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
        fail(
          Object.freeze({
            code: 'executor-failed',
            safeMessage:
              'NodeGraph debug executor returned an invalid outcome.',
            nodeId,
          })
        );
        return accept();
      }
      let projected: NodeGraphProgramValue | undefined;
      if (outcome.sensitiveOutput === true) {
        projected = Object.freeze({
          redacted: true,
          type: 'sensitive',
        });
      } else if (Object.hasOwn(outcome, 'output')) {
        projected = readNodeGraphProgramValue(outcome.output, valueProjection);
        if (projected === undefined) {
          fail(
            Object.freeze({
              code: 'invalid-output',
              safeMessage:
                'NodeGraph debug output exceeded its safe value projection contract.',
              nodeId,
            })
          );
          return accept();
        }
      }
      if (projected !== undefined) values.set(nodeId, projected);
      appendEvent({
        kind: 'node-exited',
        nodeId,
        sourcePath,
        ...(projected !== undefined
          ? { outputDigest: digestNodeGraphProgramValue(projected) }
          : {}),
      });
      currentIndex += 1;
      executed += 1;

      if (pauseRequested) {
        status = 'paused';
        appendEvent({ kind: 'paused' });
        return accept();
      }
      if ((mode === 'step-into' || mode === 'step-over') && executed >= 1) {
        status = 'paused';
        appendEvent({ kind: 'paused' });
        return accept();
      }
    }

    status = 'completed';
    appendEvent({ kind: 'completed' });
    return accept();
  };

  const controller: NodeGraphDebugController = Object.freeze({
    snapshot,
    async command(command) {
      const invalid = validateCommand(command);
      if (invalid) return reject(invalid);

      if (command.kind === 'set-breakpoints') {
        if (status !== 'paused') {
          return reject(
            Object.freeze({
              code: 'invalid-state',
              safeMessage:
                'Breakpoints can only be changed while the debugger is paused.',
            })
          );
        }
        const normalized = [...command.nodeIds].sort(compareUnicodeCodePoints);
        if (
          normalized.length > maximumBreakpoints ||
          normalized.some(
            (nodeId, index) =>
              !isCanonicalId(nodeId) ||
              !nodeById.has(nodeId) ||
              nodeId === normalized[index - 1]
          )
        ) {
          return reject(
            Object.freeze({
              code: 'invalid-breakpoint',
              safeMessage:
                'NodeGraph breakpoints must be unique bounded Program node identities.',
            })
          );
        }
        breakpoints.clear();
        normalized.forEach((nodeId) => breakpoints.add(nodeId));
        breakpointConsumedIndex = undefined;
        appendEvent({ kind: 'breakpoints-updated' });
        return accept();
      }

      if (command.kind === 'pause') {
        if (status !== 'running') {
          return reject(
            Object.freeze({
              code: 'invalid-state',
              safeMessage:
                'NodeGraph pause requires one active debug execution.',
            })
          );
        }
        pauseRequested = true;
        appendEvent({ kind: 'pause-requested' });
        return accept();
      }

      if (command.kind === 'cancel') {
        if (status !== 'running' && status !== 'paused') {
          return reject(
            Object.freeze({
              code: 'invalid-state',
              safeMessage:
                'NodeGraph cancel requires an active or paused debug execution.',
            })
          );
        }
        generation += 1;
        status = 'cancelled';
        appendEvent({ kind: 'cancelled' });
        return accept();
      }

      if (command.kind === 'detach') {
        if (
          status === 'completed' ||
          status === 'cancelled' ||
          status === 'failed' ||
          status === 'detached'
        ) {
          return reject(
            Object.freeze({
              code: 'invalid-state',
              safeMessage:
                'NodeGraph debugger cannot detach from a terminal session.',
            })
          );
        }
        generation += 1;
        status = 'detached';
        appendEvent({ kind: 'detached' });
        return accept();
      }

      if (status !== 'paused') {
        return reject(
          Object.freeze({
            code: 'invalid-state',
            safeMessage:
              'NodeGraph execution commands require a paused debug session.',
          })
        );
      }
      return run(command.kind);
    },
  });

  appendEvent({ kind: 'attached' });
  return Object.freeze({ ok: true, controller });
};
