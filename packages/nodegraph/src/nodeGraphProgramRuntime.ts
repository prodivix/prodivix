import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  createNodeGraphDescriptorRegistry,
  digestNodeGraphProgramValue,
  readNodeGraphProgramValue,
  type NodeGraphDescriptor,
  type NodeGraphDescriptorRegistry,
  type NodeGraphProgram,
  type NodeGraphProgramNode,
  type NodeGraphProgramValue,
} from './nodeGraphPlanner';

export type NodeGraphProgramError = Readonly<{
  code: string;
  category:
    | 'validation'
    | 'capability'
    | 'state-conflict'
    | 'timeout'
    | 'cancelled'
    | 'domain'
    | 'executor';
  retryable: boolean;
  safeMessage: string;
  sourceRef: Readonly<{
    documentId: string;
    nodeId?: string;
    portId?: string;
  }>;
}>;

export type NodeGraphProgramCancellationSignal = Readonly<{
  readonly aborted: boolean;
  readonly reasonCode?: string;
  subscribe(listener: () => void): () => void;
}>;

export type NodeGraphProgramCancellationController = Readonly<{
  signal: NodeGraphProgramCancellationSignal;
  abort(reasonCode?: string): void;
}>;

export const createNodeGraphProgramCancellationController =
  (): NodeGraphProgramCancellationController => {
    let aborted = false;
    let reasonCode: string | undefined;
    const listeners = new Set<() => void>();
    const signal = Object.freeze({
      get aborted() {
        return aborted;
      },
      get reasonCode() {
        return reasonCode;
      },
      subscribe(listener: () => void) {
        if (aborted) {
          listener();
          return () => undefined;
        }
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    return Object.freeze({
      signal,
      abort(nextReasonCode = 'cancelled') {
        if (aborted) return;
        aborted = true;
        reasonCode = nextReasonCode;
        for (const listener of listeners) listener();
        listeners.clear();
      },
    });
  };

const createLinkedNodeGraphProgramCancellationController = (
  parent: NodeGraphProgramCancellationSignal
): Readonly<{
  controller: NodeGraphProgramCancellationController;
  dispose(): void;
}> => {
  const controller = createNodeGraphProgramCancellationController();
  const dispose = parent.subscribe(() =>
    controller.abort(parent.reasonCode ?? 'parent-cancelled')
  );
  return Object.freeze({ controller, dispose });
};

export type NodeGraphTemporaryStateRead = Readonly<{
  exists: boolean;
  value?: NodeGraphProgramValue;
  version: number;
}>;

export type NodeGraphTemporaryStateCommitResult =
  | Readonly<{ ok: true; revision: number }>
  | Readonly<{
      ok: false;
      conflictKey: string;
      expectedVersion: number;
      actualVersion: number;
    }>;

export type NodeGraphTemporaryStateTransaction = Readonly<{
  invocationId: string;
  read(key: string): NodeGraphTemporaryStateRead;
  stage(
    key: string,
    value: NodeGraphProgramValue,
    expectedVersion?: number
  ): void;
  beginScope(): void;
  commitScope(): boolean;
  rollbackScope(): boolean;
  commit(): NodeGraphTemporaryStateCommitResult;
  rollback(): void;
  readonly active: boolean;
  readonly scopeDepth: number;
}>;

export type NodeGraphTemporaryStateHost = Readonly<{
  begin(invocationId: string): NodeGraphTemporaryStateTransaction;
  snapshot(): Readonly<{
    revision: number;
    values: Readonly<Record<string, NodeGraphProgramValue>>;
  }>;
}>;

const DEFAULT_VALUE_LIMITS = Object.freeze({
  maximumDepth: 24,
  maximumNodes: 10_000,
  maximumUtf8Bytes: 1_048_576,
});

const canonicalStateKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 512 &&
  value === value.trim() &&
  !value.includes('\u0000');

const readBoundedValue = (value: unknown): NodeGraphProgramValue | undefined =>
  readNodeGraphProgramValue(value, DEFAULT_VALUE_LIMITS);

export const createNodeGraphTemporaryStateHost = (
  initialValues: Readonly<Record<string, unknown>> = {}
): NodeGraphTemporaryStateHost => {
  const values = new Map<string, NodeGraphProgramValue>();
  const versions = new Map<string, number>();
  let revision = 0;
  for (const key of Object.keys(initialValues).sort(compareUnicodeCodePoints)) {
    const value = readBoundedValue(initialValues[key]);
    if (!canonicalStateKey(key) || value === undefined) {
      throw new TypeError('NodeGraph temporary state must be bounded JSON.');
    }
    values.set(key, value);
    versions.set(key, revision);
  }

  const snapshot = () => {
    const output: Record<string, NodeGraphProgramValue> = Object.create(null);
    for (const key of [...values.keys()].sort(compareUnicodeCodePoints)) {
      output[key] = values.get(key)!;
    }
    return Object.freeze({
      revision,
      values: Object.freeze(output),
    });
  };

  return Object.freeze({
    begin(invocationId: string): NodeGraphTemporaryStateTransaction {
      if (!canonicalStateKey(invocationId)) {
        throw new TypeError(
          'NodeGraph state transactions require a canonical invocation id.'
        );
      }
      let active = true;
      const layers: Map<string, NodeGraphProgramValue>[] = [new Map()];
      const expectedVersions = new Map<string, number>();
      const ensureActive = () => {
        if (!active) throw new Error('NodeGraph state transaction is closed.');
      };
      const read = (key: string): NodeGraphTemporaryStateRead => {
        ensureActive();
        if (!canonicalStateKey(key)) {
          throw new TypeError('NodeGraph state key is invalid.');
        }
        for (let index = layers.length - 1; index >= 0; index -= 1) {
          const layer = layers[index]!;
          if (layer.has(key)) {
            return Object.freeze({
              exists: true,
              value: layer.get(key)!,
              version: expectedVersions.get(key) ?? versions.get(key) ?? 0,
            });
          }
        }
        const exists = values.has(key);
        const version = versions.get(key) ?? 0;
        expectedVersions.set(key, version);
        return Object.freeze({
          exists,
          ...(exists ? { value: values.get(key)! } : {}),
          version,
        });
      };
      const transaction: NodeGraphTemporaryStateTransaction = Object.freeze({
        invocationId,
        read,
        stage(key, value, expectedVersion) {
          ensureActive();
          const bounded = readBoundedValue(value);
          if (
            !canonicalStateKey(key) ||
            bounded === undefined ||
            (expectedVersion !== undefined &&
              (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0))
          ) {
            throw new TypeError('NodeGraph staged state write is invalid.');
          }
          if (!expectedVersions.has(key)) {
            expectedVersions.set(
              key,
              expectedVersion ?? versions.get(key) ?? 0
            );
          } else if (
            expectedVersion !== undefined &&
            expectedVersions.get(key) !== expectedVersion
          ) {
            throw new Error(
              'NodeGraph state write declared conflicting CAS versions.'
            );
          }
          layers[layers.length - 1]!.set(key, bounded);
        },
        beginScope() {
          ensureActive();
          layers.push(new Map());
        },
        commitScope() {
          ensureActive();
          if (layers.length === 1) return false;
          const completed = layers.pop()!;
          const parent = layers[layers.length - 1]!;
          for (const key of [...completed.keys()].sort(
            compareUnicodeCodePoints
          )) {
            parent.set(key, completed.get(key)!);
          }
          return true;
        },
        rollbackScope() {
          ensureActive();
          if (layers.length === 1) return false;
          layers.pop();
          return true;
        },
        commit() {
          ensureActive();
          if (layers.length !== 1) {
            throw new Error(
              'NodeGraph state transaction has an unclosed nested scope.'
            );
          }
          const writes = layers[0]!;
          for (const key of [...writes.keys()].sort(compareUnicodeCodePoints)) {
            const expected = expectedVersions.get(key) ?? 0;
            const actual = versions.get(key) ?? 0;
            if (expected !== actual) {
              active = false;
              return Object.freeze({
                ok: false as const,
                conflictKey: key,
                expectedVersion: expected,
                actualVersion: actual,
              });
            }
          }
          if (writes.size > 0) {
            revision += 1;
            for (const key of [...writes.keys()].sort(
              compareUnicodeCodePoints
            )) {
              values.set(key, writes.get(key)!);
              versions.set(key, revision);
            }
          }
          active = false;
          return Object.freeze({ ok: true as const, revision });
        },
        rollback() {
          if (!active) return;
          layers.splice(0, layers.length, new Map());
          expectedVersions.clear();
          active = false;
        },
        get active() {
          return active;
        },
        get scopeDepth() {
          return Math.max(0, layers.length - 1);
        },
      });
      return transaction;
    },
    snapshot,
  });
};

export type NodeGraphDataGateway = Readonly<{
  dispatch(
    input: Readonly<{
      kind: 'query' | 'mutation' | 'page' | 'cancel';
      operationId: string;
      value?: NodeGraphProgramValue;
      signal: NodeGraphProgramCancellationSignal;
    }>
  ): Promise<unknown>;
}>;

export type NodeGraphRouteGateway = Readonly<{
  dispatch(
    input: Readonly<{
      kind: 'navigate' | 'back' | 'params';
      value?: NodeGraphProgramValue;
      signal: NodeGraphProgramCancellationSignal;
    }>
  ): Promise<unknown>;
}>;

export type NodeGraphAnimationGateway = Readonly<{
  dispatch(
    input: Readonly<{
      kind: 'play' | 'pause' | 'wait-marker';
      animationId: string;
      markerId?: string;
      value?: NodeGraphProgramValue;
      signal: NodeGraphProgramCancellationSignal;
    }>
  ): Promise<unknown>;
}>;

export type NodeGraphServerGateway = Readonly<{
  invoke(
    input: Readonly<{
      functionId: string;
      value?: NodeGraphProgramValue;
      signal: NodeGraphProgramCancellationSignal;
    }>
  ): Promise<unknown>;
}>;

export type NodeGraphCodeSlotGateway = Readonly<{
  invoke(
    input: Readonly<{
      codeSlotId: string;
      value?: NodeGraphProgramValue;
      signal: NodeGraphProgramCancellationSignal;
    }>
  ): Promise<unknown>;
}>;

export type NodeGraphSubgraphGateway = Readonly<{
  invoke(
    input: Readonly<{
      documentId: string;
      expectedDocumentRevision: number;
      expectedContractDigest: string;
      expectedProgramDigest: string;
      value?: NodeGraphProgramValue;
      grantedCapabilities: readonly string[];
      signal: NodeGraphProgramCancellationSignal;
    }>
  ): Promise<unknown>;
}>;

export type NodeGraphObservationGateway = Readonly<{
  wait(
    input: Readonly<{
      observationId: string;
      signal: NodeGraphProgramCancellationSignal;
    }>
  ): Promise<unknown>;
}>;

export type NodeGraphAuthGateway = Readonly<{
  dispatch(
    input: Readonly<{
      kind: 'session' | 'require-authenticated' | 'require-permission';
      permissionId?: string;
      value?: NodeGraphProgramValue;
      signal: NodeGraphProgramCancellationSignal;
    }>
  ): Promise<unknown>;
}>;

export type NodeGraphDeterministicScheduler = Readonly<{
  wait(
    input: Readonly<{
      ticks: number;
      signal: NodeGraphProgramCancellationSignal;
    }>
  ): Promise<void>;
}>;

export type NodeGraphProgramRuntimeGateways = Readonly<{
  data?: NodeGraphDataGateway;
  route?: NodeGraphRouteGateway;
  animation?: NodeGraphAnimationGateway;
  server?: NodeGraphServerGateway;
  codeSlot?: NodeGraphCodeSlotGateway;
  subgraph?: NodeGraphSubgraphGateway;
  observation?: NodeGraphObservationGateway;
  auth?: NodeGraphAuthGateway;
  scheduler?: NodeGraphDeterministicScheduler;
}>;

type NodeGraphStateAction =
  | Readonly<{ kind: 'begin-scope' }>
  | Readonly<{ kind: 'commit-scope' }>
  | Readonly<{ kind: 'rollback-scope' }>
  | Readonly<{
      kind: 'stage';
      key: string;
      value: NodeGraphProgramValue;
      expectedVersion?: number;
    }>;

export type NodeGraphProgramNodeOutcome = Readonly<{
  outputs?: Readonly<Record<string, unknown>>;
  controlPortIds?: readonly string[];
  primaryOutput?: unknown;
  observations?: readonly Readonly<{
    kind: 'log' | 'checkpoint' | 'domain';
    detail: Readonly<Record<string, unknown>>;
  }>[];
  stateActions?: readonly NodeGraphStateAction[];
  error?: NodeGraphProgramError;
}>;

export type NodeGraphProgramNodeExecutionContext = Readonly<{
  program: NodeGraphProgram;
  node: NodeGraphProgramNode;
  inputs: Readonly<
    Record<string, NodeGraphProgramValue | readonly NodeGraphProgramValue[]>
  >;
  primaryInput?: NodeGraphProgramValue;
  requestInput?: NodeGraphProgramValue;
  attempt: number;
  signal: NodeGraphProgramCancellationSignal;
  gateways: NodeGraphProgramRuntimeGateways;
  grantedCapabilities: readonly string[];
  readState(key: string): NodeGraphTemporaryStateRead;
  emitFrame(
    kind: 'codeslot' | 'subgraph' | 'domain',
    phase: 'entered' | 'exited' | 'cancelled',
    detail?: Readonly<Record<string, NodeGraphProgramValue>>
  ): void;
}>;

export type NodeGraphProgramNodeExecutor = (
  context: NodeGraphProgramNodeExecutionContext
) => NodeGraphProgramNodeOutcome | Promise<NodeGraphProgramNodeOutcome>;

export type NodeGraphProgramExecutorRegistry = Readonly<{
  resolve(executorId: string): NodeGraphProgramNodeExecutor | null;
}>;

const configurationRecord = (
  node: NodeGraphProgramNode
): Readonly<Record<string, NodeGraphProgramValue>> =>
  node.configuration as Readonly<Record<string, NodeGraphProgramValue>>;

const canonicalConfigurationString = (
  configuration: Readonly<Record<string, NodeGraphProgramValue>>,
  key: string
): string | null => {
  const value = configuration[key];
  return canonicalStateKey(value) ? value : null;
};

const dataOutputPortIds = (node: NodeGraphProgramNode): readonly string[] =>
  node.ports
    .filter((port) => port.direction === 'output' && port.flow === 'data')
    .map((port) => port.id)
    .sort(compareUnicodeCodePoints);

const controlOutputPortIds = (node: NodeGraphProgramNode): readonly string[] =>
  node.ports
    .filter((port) => port.direction === 'output' && port.flow === 'control')
    .map((port) => port.id)
    .sort(compareUnicodeCodePoints);

const emitValue = (
  node: NodeGraphProgramNode,
  value: unknown,
  controlPortIds = controlOutputPortIds(node)
): NodeGraphProgramNodeOutcome => ({
  primaryOutput: value,
  outputs: Object.fromEntries(
    dataOutputPortIds(node).map((portId) => [portId, value])
  ),
  controlPortIds,
});

const readPointer = (
  value: NodeGraphProgramValue | undefined,
  pointer: string
): NodeGraphProgramValue | undefined => {
  if (pointer === '') return value;
  if (!pointer.startsWith('/')) return undefined;
  let current = value;
  for (const encoded of pointer.slice(1).split('/')) {
    const segment = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/u.test(segment)) return undefined;
      current = current[Number(segment)];
      continue;
    }
    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      Object.hasOwn(current, segment)
    ) {
      current = (current as Readonly<Record<string, NodeGraphProgramValue>>)[
        segment
      ];
      continue;
    }
    return undefined;
  }
  return current;
};

const programError = (
  context: NodeGraphProgramNodeExecutionContext,
  code: string,
  category: NodeGraphProgramError['category'],
  safeMessage: string,
  retryable = false
): NodeGraphProgramError =>
  Object.freeze({
    code,
    category,
    retryable,
    safeMessage,
    sourceRef: Object.freeze({
      documentId: context.program.documentId,
      nodeId: context.node.id,
    }),
  });

const requireGateway = <Gateway>(
  context: NodeGraphProgramNodeExecutionContext,
  gateway: Gateway | undefined,
  capability: string
): Gateway | NodeGraphProgramError =>
  gateway ??
  programError(
    context,
    'NODEGRAPH_GATEWAY_UNAVAILABLE',
    'capability',
    `The ${capability} gateway is unavailable.`
  );

const isProgramError = (value: unknown): value is NodeGraphProgramError =>
  Boolean(
    value &&
    typeof value === 'object' &&
    'code' in value &&
    'safeMessage' in value
  );

const domainValueOutcome = async (
  context: NodeGraphProgramNodeExecutionContext,
  invoke: () => Promise<unknown>,
  detail: Readonly<Record<string, NodeGraphProgramValue>> = {}
): Promise<NodeGraphProgramNodeOutcome> => {
  context.emitFrame('domain', 'entered', detail);
  try {
    const value = await invoke();
    context.emitFrame(
      'domain',
      context.signal.aborted ? 'cancelled' : 'exited',
      detail
    );
    return emitValue(context.node, value);
  } catch {
    context.emitFrame(
      'domain',
      context.signal.aborted ? 'cancelled' : 'exited',
      detail
    );
    return {
      error: programError(
        context,
        'NODEGRAPH_DOMAIN_INVOCATION_FAILED',
        'domain',
        'The typed domain gateway rejected the invocation.',
        true
      ),
    };
  }
};

const firstPartyExecutor: NodeGraphProgramNodeExecutor = async (context) => {
  const configuration = configurationRecord(context.node);
  const descriptorId = context.node.descriptorId;
  const primaryInput = context.primaryInput ?? context.requestInput;
  switch (descriptorId) {
    case 'core.start':
      return emitValue(
        context.node,
        configuration.value ?? context.requestInput
      );
    case 'core.end':
      return emitValue(context.node, primaryInput, []);
    case 'core.constant':
      return emitValue(context.node, configuration.value);
    case 'core.map':
    case 'core.shape': {
      const pointer = canonicalConfigurationString(configuration, 'path');
      const mapped = pointer
        ? readPointer(primaryInput, pointer)
        : primaryInput;
      return emitValue(context.node, mapped);
    }
    case 'core.process':
      return emitValue(context.node, primaryInput ?? context.requestInput);
    case 'core.compare': {
      const operator =
        canonicalConfigurationString(configuration, 'operator') ?? 'equal';
      const right = configuration.right;
      const left = primaryInput;
      const result =
        operator === 'equal'
          ? digestNodeGraphProgramValue(left) ===
            digestNodeGraphProgramValue(right)
          : operator === 'not-equal'
            ? digestNodeGraphProgramValue(left) !==
              digestNodeGraphProgramValue(right)
            : typeof left === 'number' && typeof right === 'number'
              ? operator === 'greater-than'
                ? left > right
                : operator === 'greater-than-or-equal'
                  ? left >= right
                  : operator === 'less-than'
                    ? left < right
                    : operator === 'less-than-or-equal'
                      ? left <= right
                      : false
              : false;
      return emitValue(context.node, result);
    }
    case 'core.branch': {
      const selected = Boolean(primaryInput ?? configuration.value);
      const preferred = selected ? 'out.control.true' : 'out.control.false';
      const controls = controlOutputPortIds(context.node);
      return emitValue(
        context.node,
        primaryInput,
        controls.includes(preferred) ? [preferred] : []
      );
    }
    case 'core.switch': {
      const selector = String(primaryInput ?? configuration.value ?? '');
      const preferred = `out.control.case-${selector}`;
      const controls = controlOutputPortIds(context.node);
      return emitValue(
        context.node,
        primaryInput,
        controls.includes(preferred)
          ? [preferred]
          : controls.includes('out.control.default')
            ? ['out.control.default']
            : []
      );
    }
    case 'core.merge':
    case 'core.parallel.join': {
      const ordered = Object.keys(context.inputs)
        .sort(compareUnicodeCodePoints)
        .map((portId) => context.inputs[portId]!);
      return emitValue(
        context.node,
        configuration.mode === 'first' ? ordered[0] : ordered
      );
    }
    case 'core.parallel.fork':
      return emitValue(context.node, primaryInput);
    case 'core.parallel.first-success': {
      const gateway = requireGateway(
        context,
        context.gateways.observation,
        'Observation'
      );
      if (isProgramError(gateway)) return { error: gateway };
      const configuredBranches = configuration.branches;
      if (
        !Array.isArray(configuredBranches) ||
        configuredBranches.length === 0 ||
        configuredBranches.length > 64
      ) {
        return {
          error: programError(
            context,
            'NODEGRAPH_FIRST_SUCCESS_INVALID',
            'validation',
            'First-success requires between 1 and 64 typed observation branches.'
          ),
        };
      }
      const branches = configuredBranches
        .map((branch) => {
          if (!isPlainObject(branch)) return null;
          const branchId = branch.branchId;
          const observationId = branch.observationId;
          return canonicalStateKey(branchId) && canonicalStateKey(observationId)
            ? Object.freeze({ branchId, observationId })
            : null;
        })
        .filter(
          (
            branch
          ): branch is Readonly<{
            branchId: string;
            observationId: string;
          }> => Boolean(branch)
        )
        .sort((left, right) =>
          compareUnicodeCodePoints(left.branchId, right.branchId)
        );
      if (
        branches.length !== configuredBranches.length ||
        branches.some(
          (branch, index) => branch.branchId === branches[index - 1]?.branchId
        )
      ) {
        return {
          error: programError(
            context,
            'NODEGRAPH_FIRST_SUCCESS_INVALID',
            'validation',
            'First-success branches require unique canonical branch and observation identities.'
          ),
        };
      }
      const pending = new Map<
        string,
        Promise<
          Readonly<{
            branchId: string;
            ok: boolean;
            value?: unknown;
          }>
        >
      >();
      const scopes = new Map<
        string,
        ReturnType<typeof createLinkedNodeGraphProgramCancellationController>
      >();
      for (const branch of branches) {
        const scope = createLinkedNodeGraphProgramCancellationController(
          context.signal
        );
        scopes.set(branch.branchId, scope);
        pending.set(
          branch.branchId,
          Promise.resolve()
            .then(() =>
              gateway.wait({
                observationId: branch.observationId,
                signal: scope.controller.signal,
              })
            )
            .then(
              (value) =>
                Object.freeze({
                  branchId: branch.branchId,
                  ok: true,
                  value,
                }),
              () =>
                Object.freeze({
                  branchId: branch.branchId,
                  ok: false,
                })
            )
        );
      }
      try {
        while (pending.size > 0) {
          const settled = await Promise.race(pending.values());
          pending.delete(settled.branchId);
          if (!settled.ok) continue;
          for (const [branchId, scope] of scopes) {
            if (branchId !== settled.branchId) {
              scope.controller.abort('first-success-loser');
            }
          }
          return {
            ...emitValue(context.node, {
              branchId: settled.branchId,
              reason: 'first-success',
              value: settled.value ?? null,
            }),
            observations: [
              {
                kind: 'domain',
                detail: {
                  branchId: settled.branchId,
                  reason: 'first-success',
                },
              },
            ],
          };
        }
      } finally {
        for (const scope of scopes.values()) scope.dispose();
      }
      return {
        error: programError(
          context,
          'NODEGRAPH_FIRST_SUCCESS_EXHAUSTED',
          'domain',
          'All first-success branches failed before producing a value.'
        ),
      };
    }
    case 'core.loop.bounded': {
      const gateway = requireGateway(
        context,
        context.gateways.codeSlot,
        'CodeSlot'
      );
      if (isProgramError(gateway)) return { error: gateway };
      const maxIterations = configuration.maxIterations;
      const iterations = configuration.iterations ?? maxIterations;
      if (
        !context.node.codeSlotId ||
        typeof maxIterations !== 'number' ||
        !Number.isSafeInteger(maxIterations) ||
        maxIterations <= 0 ||
        typeof iterations !== 'number' ||
        !Number.isSafeInteger(iterations) ||
        iterations <= 0 ||
        iterations > maxIterations
      ) {
        return {
          error: programError(
            context,
            'NODEGRAPH_LOOP_BUDGET_INVALID',
            'validation',
            'Bounded loops require a CodeSlot and iterations within maxIterations.'
          ),
        };
      }
      let value: unknown = primaryInput;
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        context.emitFrame('codeslot', 'entered', {
          codeSlotId: context.node.codeSlotId,
          iteration,
        });
        try {
          const result = await gateway.invoke({
            codeSlotId: context.node.codeSlotId,
            value: {
              iteration,
              value: readBoundedValue(value) ?? null,
            },
            signal: context.signal,
          });
          context.emitFrame(
            'codeslot',
            context.signal.aborted ? 'cancelled' : 'exited',
            {
              codeSlotId: context.node.codeSlotId,
              iteration,
            }
          );
          if (isPlainObject(result) && typeof result.done === 'boolean') {
            value = result.value;
            if (result.done) return emitValue(context.node, value);
          } else {
            value = result;
          }
        } catch {
          context.emitFrame(
            'codeslot',
            context.signal.aborted ? 'cancelled' : 'exited',
            {
              codeSlotId: context.node.codeSlotId,
              iteration,
            }
          );
          return {
            error: programError(
              context,
              'NODEGRAPH_LOOP_ITERATION_FAILED',
              'executor',
              'A bounded loop iteration failed in its CodeSlot.'
            ),
          };
        }
      }
      if (configuration.untilDone === true) {
        return {
          error: programError(
            context,
            'NODEGRAPH_LOOP_BUDGET_EXCEEDED',
            'validation',
            'The bounded loop did not complete within maxIterations.'
          ),
        };
      }
      return emitValue(context.node, value);
    }
    case 'core.error.boundary':
    case 'core.retry':
      return emitValue(context.node, primaryInput);
    case 'core.assert':
      return primaryInput
        ? emitValue(context.node, primaryInput)
        : {
            error: programError(
              context,
              'NODEGRAPH_ASSERTION_FAILED',
              'validation',
              canonicalConfigurationString(configuration, 'safeMessage') ??
                'A graph assertion failed.'
            ),
          };
    case 'core.structured-log':
      return {
        ...emitValue(context.node, primaryInput),
        observations: [
          {
            kind: 'log',
            detail: { value: primaryInput ?? null },
          },
        ],
      };
    case 'core.checkpoint':
      return {
        ...emitValue(context.node, primaryInput),
        observations: [
          {
            kind: 'checkpoint',
            detail: {
              checkpointId:
                canonicalConfigurationString(configuration, 'checkpointId') ??
                context.node.id,
            },
          },
        ],
      };
    case 'core.state.read': {
      const key = canonicalConfigurationString(configuration, 'key');
      if (!key) {
        return {
          error: programError(
            context,
            'NODEGRAPH_STATE_KEY_INVALID',
            'validation',
            'State read requires a canonical key.'
          ),
        };
      }
      const read = context.readState(key);
      return emitValue(context.node, read.exists ? read.value : null);
    }
    case 'core.state.update': {
      const key = canonicalConfigurationString(configuration, 'key');
      const value = primaryInput ?? configuration.value;
      const bounded = readBoundedValue(value);
      const expectedVersion = configuration.expectedVersion;
      if (
        !key ||
        bounded === undefined ||
        (expectedVersion !== undefined &&
          (typeof expectedVersion !== 'number' ||
            !Number.isSafeInteger(expectedVersion) ||
            expectedVersion < 0))
      ) {
        return {
          error: programError(
            context,
            'NODEGRAPH_STATE_WRITE_INVALID',
            'validation',
            'State update requires a key, bounded value, and optional CAS version.'
          ),
        };
      }
      return {
        ...emitValue(context.node, bounded),
        stateActions: [
          {
            kind: 'stage',
            key,
            value: bounded,
            ...(typeof expectedVersion === 'number' ? { expectedVersion } : {}),
          },
        ],
      };
    }
    case 'core.state.transaction.begin':
      return {
        ...emitValue(context.node, primaryInput),
        stateActions: [{ kind: 'begin-scope' }],
      };
    case 'core.state.transaction.commit':
      return {
        ...emitValue(context.node, primaryInput),
        stateActions: [{ kind: 'commit-scope' }],
      };
    case 'core.state.transaction.rollback':
      return {
        ...emitValue(context.node, primaryInput),
        stateActions: [{ kind: 'rollback-scope' }],
      };
    case 'core.data.query':
    case 'core.data.mutation':
    case 'core.data.page':
    case 'core.data.cancel': {
      const gateway = requireGateway(context, context.gateways.data, 'Data');
      if (isProgramError(gateway)) return { error: gateway };
      const operationId = canonicalConfigurationString(
        configuration,
        'operationId'
      );
      if (!operationId) {
        return {
          error: programError(
            context,
            'NODEGRAPH_DATA_OPERATION_INVALID',
            'validation',
            'Data nodes require an exact operationId.'
          ),
        };
      }
      const kind = descriptorId.slice('core.data.'.length) as
        'query' | 'mutation' | 'page' | 'cancel';
      return domainValueOutcome(context, () =>
        gateway.dispatch({
          kind,
          operationId,
          value: primaryInput,
          signal: context.signal,
        })
      );
    }
    case 'core.route.navigate':
    case 'core.route.back':
    case 'core.route.params': {
      const gateway = requireGateway(context, context.gateways.route, 'Route');
      if (isProgramError(gateway)) return { error: gateway };
      const kind = descriptorId.slice('core.route.'.length) as
        'navigate' | 'back' | 'params';
      return domainValueOutcome(context, () =>
        gateway.dispatch({
          kind,
          value: primaryInput ?? configuration.value,
          signal: context.signal,
        })
      );
    }
    case 'core.animation.play':
    case 'core.animation.pause':
    case 'core.animation.wait-marker': {
      const gateway = requireGateway(
        context,
        context.gateways.animation,
        'Animation'
      );
      if (isProgramError(gateway)) return { error: gateway };
      const animationId = canonicalConfigurationString(
        configuration,
        'animationId'
      );
      if (!animationId) {
        return {
          error: programError(
            context,
            'NODEGRAPH_ANIMATION_TARGET_INVALID',
            'validation',
            'Animation nodes require an exact animationId.'
          ),
        };
      }
      const kind = descriptorId.slice('core.animation.'.length) as
        'play' | 'pause' | 'wait-marker';
      return domainValueOutcome(context, () =>
        gateway.dispatch({
          kind,
          animationId,
          ...(kind === 'wait-marker'
            ? {
                markerId:
                  canonicalConfigurationString(configuration, 'markerId') ?? '',
              }
            : {}),
          value: primaryInput,
          signal: context.signal,
        })
      );
    }
    case 'core.server.invoke': {
      const gateway = requireGateway(
        context,
        context.gateways.server,
        'Server'
      );
      if (isProgramError(gateway)) return { error: gateway };
      const functionId = canonicalConfigurationString(
        configuration,
        'functionId'
      );
      if (!functionId) {
        return {
          error: programError(
            context,
            'NODEGRAPH_SERVER_FUNCTION_INVALID',
            'validation',
            'Server nodes require an exact functionId.'
          ),
        };
      }
      return domainValueOutcome(context, () =>
        gateway.invoke({
          functionId,
          value: primaryInput,
          signal: context.signal,
        })
      );
    }
    case 'core.auth.session':
    case 'core.auth.require-authenticated':
    case 'core.auth.require-permission': {
      const gateway = requireGateway(context, context.gateways.auth, 'Auth');
      if (isProgramError(gateway)) return { error: gateway };
      const kind = descriptorId.slice('core.auth.'.length) as
        'session' | 'require-authenticated' | 'require-permission';
      const permissionId = canonicalConfigurationString(
        configuration,
        'permissionId'
      );
      if (kind === 'require-permission' && !permissionId) {
        return {
          error: programError(
            context,
            'NODEGRAPH_AUTH_PERMISSION_INVALID',
            'validation',
            'Auth permission nodes require an exact permissionId.'
          ),
        };
      }
      return domainValueOutcome(
        context,
        () =>
          gateway.dispatch({
            kind,
            ...(permissionId ? { permissionId } : {}),
            value: primaryInput,
            signal: context.signal,
          }),
        {
          authOperation: kind,
          ...(permissionId ? { permissionId } : {}),
        }
      );
    }
    case 'core.async.wait': {
      const gateway = requireGateway(
        context,
        context.gateways.observation,
        'Observation'
      );
      if (isProgramError(gateway)) return { error: gateway };
      const observationId = canonicalConfigurationString(
        configuration,
        'observationId'
      );
      if (!observationId) {
        return {
          error: programError(
            context,
            'NODEGRAPH_OBSERVATION_INVALID',
            'validation',
            'Async wait requires an exact observationId.'
          ),
        };
      }
      return domainValueOutcome(context, () =>
        gateway.wait({ observationId, signal: context.signal })
      );
    }
    case 'core.code': {
      const gateway = requireGateway(
        context,
        context.gateways.codeSlot,
        'CodeSlot'
      );
      if (isProgramError(gateway)) return { error: gateway };
      if (!context.node.codeSlotId) {
        return {
          error: programError(
            context,
            'NODEGRAPH_CODE_SLOT_MISSING',
            'validation',
            'Code nodes require a resolved CodeSlot.'
          ),
        };
      }
      context.emitFrame('codeslot', 'entered', {
        codeSlotId: context.node.codeSlotId,
      });
      const outcome = await domainValueOutcome(context, () =>
        gateway.invoke({
          codeSlotId: context.node.codeSlotId!,
          value: primaryInput,
          signal: context.signal,
        })
      );
      context.emitFrame(
        'codeslot',
        context.signal.aborted ? 'cancelled' : 'exited',
        { codeSlotId: context.node.codeSlotId }
      );
      return outcome;
    }
    case 'core.subgraph.call': {
      const gateway = requireGateway(
        context,
        context.gateways.subgraph,
        'Subgraph'
      );
      if (isProgramError(gateway)) return { error: gateway };
      const documentId = canonicalConfigurationString(
        configuration,
        'documentId'
      );
      const expectedContractDigest = canonicalConfigurationString(
        configuration,
        'expectedContractDigest'
      );
      const expectedDocumentRevision = configuration.expectedDocumentRevision;
      const resolvedSubgraph = context.program.resolvedSubgraphs.find(
        (subgraph) => subgraph.documentId === documentId
      );
      const requiredCapabilities = Array.isArray(
        configuration.requiredCapabilities
      )
        ? configuration.requiredCapabilities.filter(
            (value): value is string => typeof value === 'string'
          )
        : [];
      if (
        !documentId ||
        !expectedContractDigest ||
        typeof expectedDocumentRevision !== 'number' ||
        !Number.isSafeInteger(expectedDocumentRevision) ||
        !resolvedSubgraph ||
        resolvedSubgraph.documentRevision !== expectedDocumentRevision ||
        resolvedSubgraph.contractDigest !== expectedContractDigest ||
        requiredCapabilities.some(
          (capability) => !context.grantedCapabilities.includes(capability)
        )
      ) {
        return {
          error: programError(
            context,
            'NODEGRAPH_SUBGRAPH_CONTRACT_INVALID',
            'capability',
            'Subgraph identity, contract digest, or capability closure is invalid.'
          ),
        };
      }
      context.emitFrame('subgraph', 'entered', { documentId });
      const outcome = await domainValueOutcome(context, () =>
        gateway.invoke({
          documentId,
          expectedDocumentRevision,
          expectedContractDigest,
          expectedProgramDigest: resolvedSubgraph.programDigest,
          value: primaryInput,
          grantedCapabilities: context.grantedCapabilities,
          signal: context.signal,
        })
      );
      context.emitFrame(
        'subgraph',
        context.signal.aborted ? 'cancelled' : 'exited',
        { documentId }
      );
      return outcome;
    }
    default:
      return {
        error: programError(
          context,
          'NODEGRAPH_EXECUTOR_UNSUPPORTED',
          'executor',
          'No first-party executor supports this descriptor.'
        ),
      };
  }
};

const FIRST_PARTY_DESCRIPTOR_SPECS = Object.freeze([
  ['core.start', 'pure', [], 'forbidden', true, false],
  ['core.end', 'pure', [], 'forbidden', false, true],
  ['core.constant', 'pure', [], 'forbidden', false, false],
  ['core.map', 'pure', [], 'optional', false, false],
  ['core.shape', 'pure', [], 'optional', false, false],
  ['core.process', 'pure', [], 'forbidden', false, false],
  ['core.compare', 'pure', [], 'forbidden', false, false],
  ['core.branch', 'pure', [], 'forbidden', false, false],
  ['core.switch', 'pure', [], 'forbidden', false, false],
  ['core.merge', 'pure', [], 'forbidden', false, false],
  ['core.assert', 'pure', [], 'forbidden', false, false],
  ['core.structured-log', 'pure', [], 'forbidden', false, false],
  ['core.checkpoint', 'pure', [], 'forbidden', false, false],
  ['core.parallel.fork', 'pure', [], 'forbidden', false, false],
  ['core.parallel.join', 'pure', [], 'forbidden', false, false],
  [
    'core.parallel.first-success',
    'idempotent-effect',
    ['observation:wait'],
    'forbidden',
    false,
    false,
  ],
  ['core.loop.bounded', 'pure', ['code:execute'], 'required', false, false],
  ['core.error.boundary', 'pure', [], 'forbidden', false, false],
  ['core.retry', 'pure', [], 'forbidden', false, false],
  ['core.state.read', 'temporary-state', [], 'forbidden', false, false],
  ['core.state.update', 'temporary-state', [], 'forbidden', false, false],
  [
    'core.state.transaction.begin',
    'temporary-state',
    [],
    'forbidden',
    false,
    false,
  ],
  [
    'core.state.transaction.commit',
    'temporary-state',
    [],
    'forbidden',
    false,
    false,
  ],
  [
    'core.state.transaction.rollback',
    'temporary-state',
    [],
    'forbidden',
    false,
    false,
  ],
  [
    'core.data.query',
    'idempotent-effect',
    ['data:query'],
    'forbidden',
    false,
    false,
  ],
  [
    'core.data.mutation',
    'mutation-effect',
    ['data:mutation'],
    'forbidden',
    false,
    false,
  ],
  [
    'core.data.page',
    'idempotent-effect',
    ['data:query'],
    'forbidden',
    false,
    false,
  ],
  [
    'core.data.cancel',
    'idempotent-effect',
    ['data:cancel'],
    'forbidden',
    false,
    false,
  ],
  [
    'core.route.navigate',
    'mutation-effect',
    ['route:navigate'],
    'forbidden',
    false,
    false,
  ],
  [
    'core.route.back',
    'mutation-effect',
    ['route:navigate'],
    'forbidden',
    false,
    false,
  ],
  ['core.route.params', 'pure', ['route:read'], 'forbidden', false, false],
  [
    'core.animation.play',
    'mutation-effect',
    ['animation:control'],
    'forbidden',
    false,
    false,
  ],
  [
    'core.animation.pause',
    'mutation-effect',
    ['animation:control'],
    'forbidden',
    false,
    false,
  ],
  [
    'core.animation.wait-marker',
    'idempotent-effect',
    ['animation:observe'],
    'forbidden',
    false,
    false,
  ],
  [
    'core.server.invoke',
    'mutation-effect',
    ['server:invoke'],
    'forbidden',
    false,
    false,
  ],
  ['core.auth.session', 'pure', ['auth:read'], 'forbidden', false, false],
  [
    'core.auth.require-authenticated',
    'idempotent-effect',
    ['auth:require'],
    'forbidden',
    false,
    false,
  ],
  [
    'core.auth.require-permission',
    'idempotent-effect',
    ['auth:permission'],
    'forbidden',
    false,
    false,
  ],
  [
    'core.async.wait',
    'idempotent-effect',
    ['observation:wait'],
    'forbidden',
    false,
    false,
  ],
  ['core.code', 'pure', ['code:execute'], 'required', false, false],
  [
    'core.subgraph.call',
    'idempotent-effect',
    ['nodegraph:invoke'],
    'forbidden',
    false,
    false,
  ],
] as const);

export const FIRST_PARTY_NODEGRAPH_DESCRIPTORS: readonly NodeGraphDescriptor[] =
  Object.freeze(
    FIRST_PARTY_DESCRIPTOR_SPECS.map(
      ([id, effect, requiredCapabilities, codeSlot, entry, terminal]) =>
        Object.freeze({
          id,
          version: '1',
          executorId: `core.nodegraph.executor.${id.slice('core.'.length)}`,
          implementationDigest: digestNodeGraphProgramValue({
            id,
            implementationVersion: 1,
          }),
          configurationSchemaDigest: digestNodeGraphProgramValue({
            id,
            configurationVersion: 1,
          }),
          effect,
          runtimeZones: Object.freeze(['client', 'server', 'test'] as const),
          requiredCapabilities: Object.freeze([...requiredCapabilities]),
          codeSlot,
          entry,
          terminal,
        })
    )
  );

export const createFirstPartyNodeGraphDescriptorRegistry =
  (): NodeGraphDescriptorRegistry => {
    const result = createNodeGraphDescriptorRegistry(
      FIRST_PARTY_NODEGRAPH_DESCRIPTORS
    );
    if (!result.ok) {
      throw new Error(
        'First-party NodeGraph descriptors violate their registry contract.'
      );
    }
    return result.registry;
  };

export const createFirstPartyNodeGraphProgramExecutorRegistry = (
  extensions: Readonly<Record<string, NodeGraphProgramNodeExecutor>> = {}
): NodeGraphProgramExecutorRegistry => {
  const executors = new Map<string, NodeGraphProgramNodeExecutor>();
  for (const descriptor of FIRST_PARTY_NODEGRAPH_DESCRIPTORS) {
    executors.set(descriptor.executorId, firstPartyExecutor);
  }
  for (const executorId of Object.keys(extensions).sort(
    compareUnicodeCodePoints
  )) {
    executors.set(executorId, extensions[executorId]!);
  }
  return Object.freeze({
    resolve(executorId: string) {
      return executors.get(executorId) ?? null;
    },
  });
};

export type NodeGraphProgramTraceEvent = Readonly<{
  sequence: number;
  kind:
    | 'graph-started'
    | 'wave-started'
    | 'node-started'
    | 'node-retried'
    | 'node-timed-out'
    | 'node-completed'
    | 'node-skipped'
    | 'frame-entered'
    | 'frame-exited'
    | 'frame-cancelled'
    | 'observation'
    | 'late-completion-discarded'
    | 'graph-completed'
    | 'graph-failed'
    | 'graph-cancelled';
  nodeId?: string;
  wave?: number;
  attempt?: number;
  sourcePath?: string;
  frameKind?: 'codeslot' | 'subgraph' | 'domain';
  correlation?: NodeGraphProgramCorrelation;
  detail?: Readonly<Record<string, NodeGraphProgramValue>>;
}>;

export type NodeGraphProgramCorrelation = Readonly<{
  behaviorAttemptId: string;
  behaviorInstructionId: string;
  behaviorStepId: string;
  behaviorProgramDigest: string;
}>;

export type NodeGraphProgramRuntimeObserver = (
  event: NodeGraphProgramTraceEvent
) => void;

export type NodeGraphProgramExecutionResult = Readonly<{
  status: 'completed' | 'failed' | 'cancelled' | 'budget-exceeded';
  output?: NodeGraphProgramValue;
  outputsByNode: Readonly<
    Record<string, Readonly<Record<string, NodeGraphProgramValue>>>
  >;
  error?: NodeGraphProgramError;
  steps: number;
  stateRevision?: number;
  trace: readonly NodeGraphProgramTraceEvent[];
}>;

export type ExecuteNodeGraphProgramInput = Readonly<{
  program: NodeGraphProgram;
  invocationId: string;
  input?: unknown;
  grantedCapabilities?: readonly string[];
  signal?: NodeGraphProgramCancellationSignal;
  stateHost?: NodeGraphTemporaryStateHost;
  gateways?: NodeGraphProgramRuntimeGateways;
  executors?: NodeGraphProgramExecutorRegistry;
  maximumSteps?: number;
  maximumConcurrency?: number;
  maximumAttemptsPerNode?: number;
  correlation?: NodeGraphProgramCorrelation;
  observer?: NodeGraphProgramRuntimeObserver;
  waitBeforeRetry?: (
    attempt: number,
    signal: NodeGraphProgramCancellationSignal
  ) => Promise<void>;
}>;

const cancelledSentinel = Symbol('nodegraph-program-cancelled');
const timedOutSentinel = Symbol('nodegraph-node-timed-out');

const sanitizeExecutorError = (
  program: NodeGraphProgram,
  node: NodeGraphProgramNode
): NodeGraphProgramError =>
  Object.freeze({
    code: 'NODEGRAPH_EXECUTOR_FAILED',
    category: 'executor',
    retryable: false,
    safeMessage:
      'The node executor failed before producing a safe typed outcome.',
    sourceRef: Object.freeze({
      documentId: program.documentId,
      nodeId: node.id,
    }),
  });

const boundedOutcome = (
  program: NodeGraphProgram,
  node: NodeGraphProgramNode,
  outcome: NodeGraphProgramNodeOutcome
):
  | Readonly<{
      outputs: Readonly<Record<string, NodeGraphProgramValue>>;
      controlPortIds: readonly string[];
      primaryOutput?: NodeGraphProgramValue;
      observations: readonly Readonly<{
        kind: 'log' | 'checkpoint' | 'domain';
        detail: Readonly<Record<string, NodeGraphProgramValue>>;
      }>[];
      stateActions: readonly NodeGraphStateAction[];
      error?: NodeGraphProgramError;
    }>
  | NodeGraphProgramError => {
  if (!isPlainObject(outcome)) {
    return sanitizeExecutorError(program, node);
  }
  const declaredOutputs = new Set(dataOutputPortIds(node));
  const outputs: Record<string, NodeGraphProgramValue> = Object.create(null);
  for (const portId of Object.keys(outcome.outputs ?? {}).sort(
    compareUnicodeCodePoints
  )) {
    const value = readBoundedValue(outcome.outputs?.[portId]);
    if (!declaredOutputs.has(portId) || value === undefined) {
      return Object.freeze({
        ...sanitizeExecutorError(program, node),
        code: 'NODEGRAPH_OUTPUT_INVALID',
        safeMessage:
          'The node executor returned an undeclared or unbounded output.',
      });
    }
    outputs[portId] = value;
  }
  const controls = new Set(controlOutputPortIds(node));
  const controlPortIds = [...new Set(outcome.controlPortIds ?? [])].sort(
    compareUnicodeCodePoints
  );
  if (
    controlPortIds.some(
      (portId) => !canonicalStateKey(portId) || !controls.has(portId)
    )
  ) {
    return Object.freeze({
      ...sanitizeExecutorError(program, node),
      code: 'NODEGRAPH_CONTROL_OUTPUT_INVALID',
      safeMessage: 'The node executor selected an undeclared control output.',
    });
  }
  const primaryOutput =
    outcome.primaryOutput === undefined
      ? undefined
      : readBoundedValue(outcome.primaryOutput);
  if (outcome.primaryOutput !== undefined && primaryOutput === undefined) {
    return Object.freeze({
      ...sanitizeExecutorError(program, node),
      code: 'NODEGRAPH_OUTPUT_INVALID',
      safeMessage: 'The node executor returned an unbounded primary output.',
    });
  }
  const observations: {
    kind: 'log' | 'checkpoint' | 'domain';
    detail: Readonly<Record<string, NodeGraphProgramValue>>;
  }[] = [];
  for (const observation of outcome.observations ?? []) {
    const detail = readBoundedValue(observation.detail);
    if (
      (observation.kind !== 'log' &&
        observation.kind !== 'checkpoint' &&
        observation.kind !== 'domain') ||
      !detail ||
      typeof detail !== 'object' ||
      Array.isArray(detail)
    ) {
      return sanitizeExecutorError(program, node);
    }
    observations.push({
      kind: observation.kind,
      detail: detail as Readonly<Record<string, NodeGraphProgramValue>>,
    });
  }
  if (
    !Array.isArray(outcome.stateActions) ||
    outcome.stateActions.some((action) => !action || typeof action !== 'object')
  ) {
    if (outcome.stateActions !== undefined) {
      return sanitizeExecutorError(program, node);
    }
  }
  return Object.freeze({
    outputs: Object.freeze(outputs),
    controlPortIds: Object.freeze(controlPortIds),
    ...(primaryOutput !== undefined ? { primaryOutput } : {}),
    observations: Object.freeze(observations),
    stateActions: Object.freeze([...(outcome.stateActions ?? [])]),
    ...(outcome.error ? { error: outcome.error } : {}),
  });
};

const primaryInputForNode = (
  inputs: Readonly<
    Record<string, NodeGraphProgramValue | readonly NodeGraphProgramValue[]>
  >
): NodeGraphProgramValue | undefined => {
  const first = Object.keys(inputs).sort(compareUnicodeCodePoints)[0];
  if (!first) return undefined;
  return inputs[first] as NodeGraphProgramValue;
};

export const executeNodeGraphProgram = async (
  input: ExecuteNodeGraphProgramInput
): Promise<NodeGraphProgramExecutionResult> => {
  const providedInput =
    input.input === undefined ? undefined : readBoundedValue(input.input);
  const trace: NodeGraphProgramTraceEvent[] = [];
  const sourcePathByNodeId = new Map(
    input.program.sourceTrace
      .filter((source) => source.kind === 'node')
      .map((source) => [source.id, source.sourcePath] as const)
  );
  let sequence = 0;
  const appendTrace = (event: Omit<NodeGraphProgramTraceEvent, 'sequence'>) => {
    sequence += 1;
    const frozen = Object.freeze({
      sequence,
      ...event,
      ...(event.nodeId && !event.sourcePath
        ? { sourcePath: sourcePathByNodeId.get(event.nodeId) }
        : {}),
      ...(input.correlation ? { correlation: input.correlation } : {}),
    });
    trace.push(frozen);
    try {
      input.observer?.(frozen);
    } catch {
      // Observers are projection-only and cannot alter graph execution.
    }
  };
  const fail = (
    status: NodeGraphProgramExecutionResult['status'],
    error: NodeGraphProgramError | undefined,
    steps: number,
    outputsByNode: Record<
      string,
      Readonly<Record<string, NodeGraphProgramValue>>
    >,
    stateTransaction: NodeGraphTemporaryStateTransaction
  ): NodeGraphProgramExecutionResult => {
    stateTransaction.rollback();
    appendTrace({
      kind: status === 'cancelled' ? 'graph-cancelled' : 'graph-failed',
      ...(error ? { detail: { code: error.code } } : {}),
    });
    return Object.freeze({
      status,
      outputsByNode: Object.freeze(outputsByNode),
      ...(error ? { error } : {}),
      steps,
      trace: Object.freeze(trace),
    });
  };

  const grantedCapabilities = Object.freeze(
    [...new Set(input.grantedCapabilities ?? [])].sort(compareUnicodeCodePoints)
  );
  const missingCapability = input.program.requiredCapabilities.find(
    (capability) => !grantedCapabilities.includes(capability)
  );
  const stateHost = input.stateHost ?? createNodeGraphTemporaryStateHost();
  const transaction = stateHost.begin(input.invocationId);
  const outputsByNode: Record<
    string,
    Readonly<Record<string, NodeGraphProgramValue>>
  > = Object.create(null);
  const primaryByNode = new Map<string, NodeGraphProgramValue>();
  const selectedControls = new Map<string, ReadonlySet<string>>();
  const activeNodes = new Set<string>();
  const nodeById = new Map(
    input.program.nodes.map((node) => [node.id, node] as const)
  );
  const incomingControlEdges = new Map<
    string,
    NodeGraphProgram['edges'][number][]
  >();
  const incomingDataEdges = new Map<
    string,
    NodeGraphProgram['edges'][number][]
  >();
  for (const edge of input.program.edges) {
    const target =
      edge.flow === 'control' ? incomingControlEdges : incomingDataEdges;
    const current = target.get(edge.target.nodeId) ?? [];
    current.push(edge);
    target.set(edge.target.nodeId, current);
  }
  for (const edges of [
    ...incomingControlEdges.values(),
    ...incomingDataEdges.values(),
  ]) {
    edges.sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
  }
  const cancellation =
    input.signal ?? createNodeGraphProgramCancellationController().signal;
  let generation = 0;
  const unsubscribeCancellation = cancellation.subscribe(() => {
    generation += 1;
  });
  const executors =
    input.executors ?? createFirstPartyNodeGraphProgramExecutorRegistry();
  const maximumSteps = Math.max(1, Math.trunc(input.maximumSteps ?? 100_000));
  const maximumConcurrency = Math.max(
    1,
    Math.trunc(input.maximumConcurrency ?? 8)
  );
  const maximumAttempts = Math.min(
    8,
    Math.max(1, Math.trunc(input.maximumAttemptsPerNode ?? 3))
  );
  let steps = 0;

  appendTrace({ kind: 'graph-started' });
  if (input.input !== undefined && providedInput === undefined) {
    unsubscribeCancellation();
    return fail(
      'failed',
      Object.freeze({
        code: 'NODEGRAPH_INPUT_INVALID',
        category: 'validation',
        retryable: false,
        safeMessage: 'Graph input exceeds the bounded JSON contract.',
        sourceRef: Object.freeze({
          documentId: input.program.documentId,
        }),
      }),
      steps,
      outputsByNode,
      transaction
    );
  }
  if (missingCapability) {
    unsubscribeCancellation();
    return fail(
      'failed',
      Object.freeze({
        code: 'NODEGRAPH_CAPABILITY_UNAVAILABLE',
        category: 'capability',
        retryable: false,
        safeMessage: `A required graph capability is unavailable: ${missingCapability}.`,
        sourceRef: Object.freeze({
          documentId: input.program.documentId,
        }),
      }),
      steps,
      outputsByNode,
      transaction
    );
  }

  const invokeNode = async (
    node: NodeGraphProgramNode,
    inputs: Readonly<
      Record<string, NodeGraphProgramValue | readonly NodeGraphProgramValue[]>
    >
  ) => {
    const executor = executors.resolve(node.executorId);
    if (!executor) {
      return sanitizeExecutorError(input.program, node);
    }
    const configuredAttempts = configurationRecord(node).retry;
    const configuredAttemptRecord =
      configuredAttempts &&
      typeof configuredAttempts === 'object' &&
      !Array.isArray(configuredAttempts)
        ? (configuredAttempts as Readonly<
            Record<string, NodeGraphProgramValue>
          >)
        : undefined;
    const configuredMaximumAttempts = configuredAttemptRecord?.maxAttempts;
    const configuredTimeoutTicks = configurationRecord(node).timeoutTicks;
    const timeoutTicks =
      typeof configuredTimeoutTicks === 'number' &&
      Number.isSafeInteger(configuredTimeoutTicks) &&
      configuredTimeoutTicks > 0
        ? configuredTimeoutTicks
        : undefined;
    if (timeoutTicks !== undefined && !input.gateways?.scheduler) {
      const schedulerUnavailable: NodeGraphProgramError = Object.freeze({
        code: 'NODEGRAPH_SCHEDULER_UNAVAILABLE',
        category: 'capability',
        retryable: false,
        safeMessage:
          'A deterministic scheduler is required for node timeoutTicks.',
        sourceRef: Object.freeze({
          documentId: input.program.documentId,
          nodeId: node.id,
        }),
      });
      return schedulerUnavailable;
    }
    const requestedAttempts =
      typeof configuredMaximumAttempts === 'number' &&
      Number.isSafeInteger(configuredMaximumAttempts)
        ? configuredMaximumAttempts
        : 1;
    const allowedAttempts =
      node.effect === 'pure' || node.effect === 'idempotent-effect'
        ? Math.min(maximumAttempts, Math.max(1, requestedAttempts))
        : 1;
    for (let attempt = 1; attempt <= allowedAttempts; attempt += 1) {
      if (cancellation.aborted) return cancelledSentinel;
      const invocationGeneration = generation;
      const nodeScope =
        createLinkedNodeGraphProgramCancellationController(cancellation);
      let attemptOpen = true;
      appendTrace({
        kind: 'node-started',
        nodeId: node.id,
        attempt,
      });
      const execution = Promise.resolve().then(() =>
        executor({
          program: input.program,
          node,
          inputs,
          primaryInput: primaryInputForNode(inputs),
          requestInput: providedInput,
          attempt,
          signal: nodeScope.controller.signal,
          gateways: input.gateways ?? {},
          grantedCapabilities,
          readState: (key) => transaction.read(key),
          emitFrame: (frameKind, phase, detail = {}) => {
            if (!attemptOpen) return;
            appendTrace({
              kind:
                phase === 'entered'
                  ? 'frame-entered'
                  : phase === 'exited'
                    ? 'frame-exited'
                    : 'frame-cancelled',
              nodeId: node.id,
              attempt,
              frameKind,
              detail,
            });
          },
        })
      );
      const cancelled = new Promise<
        typeof cancelledSentinel | typeof timedOutSentinel
      >((resolve) => {
        let unsubscribe: () => void = () => {};
        unsubscribe = nodeScope.controller.signal.subscribe(() => {
          unsubscribe();
          resolve(
            nodeScope.controller.signal.reasonCode === 'node-timeout'
              ? timedOutSentinel
              : cancelledSentinel
          );
        });
        void execution.finally(unsubscribe).catch(() => undefined);
      });
      const timeout =
        timeoutTicks === undefined
          ? null
          : input
              .gateways!.scheduler!.wait({
                ticks: timeoutTicks,
                signal: nodeScope.controller.signal,
              })
              .then(
                () => {
                  nodeScope.controller.abort('node-timeout');
                  return timedOutSentinel;
                },
                () => cancelledSentinel
              );
      let rawOutcome:
        | NodeGraphProgramNodeOutcome
        | typeof cancelledSentinel
        | typeof timedOutSentinel;
      try {
        rawOutcome = (await Promise.race([
          execution,
          cancelled,
          ...(timeout ? [timeout] : []),
        ])) as
          | NodeGraphProgramNodeOutcome
          | typeof cancelledSentinel
          | typeof timedOutSentinel;
      } catch {
        rawOutcome = {
          error: sanitizeExecutorError(input.program, node),
        };
      }
      attemptOpen = false;
      nodeScope.controller.abort('node-completed');
      nodeScope.dispose();
      if (rawOutcome === timedOutSentinel) {
        appendTrace({
          kind: 'node-timed-out',
          nodeId: node.id,
          attempt,
          detail: { timeoutTicks: timeoutTicks ?? 0 },
        });
        appendTrace({
          kind: 'late-completion-discarded',
          nodeId: node.id,
          attempt,
        });
        void execution.catch(() => undefined);
        const timeoutError: NodeGraphProgramError = Object.freeze({
          code: 'NODEGRAPH_NODE_TIMEOUT',
          category: 'timeout',
          retryable: node.effect !== 'mutation-effect',
          safeMessage:
            'The node exceeded its deterministic timeout tick budget.',
          sourceRef: Object.freeze({
            documentId: input.program.documentId,
            nodeId: node.id,
          }),
        });
        return timeoutError;
      }
      if (
        rawOutcome === cancelledSentinel ||
        generation !== invocationGeneration
      ) {
        appendTrace({
          kind: 'late-completion-discarded',
          nodeId: node.id,
          attempt,
        });
        void execution.catch(() => undefined);
        return cancelledSentinel;
      }
      const outcome = boundedOutcome(input.program, node, rawOutcome);
      if (isProgramError(outcome)) return outcome;
      if (outcome.error?.retryable && attempt < allowedAttempts) {
        appendTrace({
          kind: 'node-retried',
          nodeId: node.id,
          attempt,
          detail: { code: outcome.error.code },
        });
        await (input.waitBeforeRetry?.(attempt, cancellation) ??
          Promise.resolve());
        continue;
      }
      return outcome;
    }
    return sanitizeExecutorError(input.program, node);
  };

  try {
    for (const [waveIndex, wave] of input.program.executionWaves.entries()) {
      if (cancellation.aborted) {
        return fail('cancelled', undefined, steps, outputsByNode, transaction);
      }
      appendTrace({ kind: 'wave-started', wave: waveIndex });
      const candidates = [...wave]
        .map((nodeId) => nodeById.get(nodeId))
        .filter((node): node is NodeGraphProgramNode => Boolean(node))
        .sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
      for (
        let offset = 0;
        offset < candidates.length;
        offset += maximumConcurrency
      ) {
        const chunk = candidates.slice(offset, offset + maximumConcurrency);
        const pending = chunk.map(async (node) => {
          const controlEdges = incomingControlEdges.get(node.id) ?? [];
          const activatedControlEdges = controlEdges.filter(
            (edge) =>
              activeNodes.has(edge.source.nodeId) &&
              selectedControls.get(edge.source.nodeId)?.has(edge.source.portId)
          );
          const nodeConfiguration = configurationRecord(node);
          const joinMode =
            node.descriptorId === 'core.parallel.join'
              ? nodeConfiguration.joinMode
              : undefined;
          const quorum =
            typeof nodeConfiguration.quorum === 'number' &&
            Number.isSafeInteger(nodeConfiguration.quorum) &&
            nodeConfiguration.quorum > 0
              ? nodeConfiguration.quorum
              : 1;
          const active =
            controlEdges.length === 0 ||
            (joinMode === 'all'
              ? activatedControlEdges.length === controlEdges.length
              : joinMode === 'quorum'
                ? activatedControlEdges.length >= quorum
                : activatedControlEdges.length > 0);
          if (!active) {
            return Object.freeze({
              node,
              skipped: true as const,
            });
          }
          const inputs: Record<
            string,
            NodeGraphProgramValue | readonly NodeGraphProgramValue[]
          > = Object.create(null);
          const valuesByPort = new Map<string, NodeGraphProgramValue[]>();
          for (const edge of incomingDataEdges.get(node.id) ?? []) {
            const value =
              outputsByNode[edge.source.nodeId]?.[edge.source.portId];
            if (value === undefined) continue;
            const values = valuesByPort.get(edge.target.portId) ?? [];
            values.push(value);
            valuesByPort.set(edge.target.portId, values);
          }
          for (const port of node.ports) {
            if (port.direction !== 'input' || port.flow !== 'data') {
              continue;
            }
            const values = valuesByPort.get(port.id) ?? [];
            if (values.length === 0) continue;
            inputs[port.id] =
              port.cardinality === 'multiple'
                ? Object.freeze(values)
                : values[0]!;
          }
          const result = await invokeNode(node, Object.freeze(inputs));
          return Object.freeze({ node, result });
        });
        const completed = await Promise.all(pending);
        for (const completion of completed.sort((left, right) =>
          compareUnicodeCodePoints(left.node.id, right.node.id)
        )) {
          if ('skipped' in completion) {
            appendTrace({
              kind: 'node-skipped',
              nodeId: completion.node.id,
              wave: waveIndex,
            });
            continue;
          }
          if (completion.result === cancelledSentinel) {
            return fail(
              'cancelled',
              undefined,
              steps,
              outputsByNode,
              transaction
            );
          }
          steps += 1;
          if (steps > maximumSteps) {
            return fail(
              'budget-exceeded',
              Object.freeze({
                code: 'NODEGRAPH_STEP_BUDGET_EXCEEDED',
                category: 'validation',
                retryable: false,
                safeMessage: 'Graph execution exceeded its step budget.',
                sourceRef: Object.freeze({
                  documentId: input.program.documentId,
                  nodeId: completion.node.id,
                }),
              }),
              maximumSteps,
              outputsByNode,
              transaction
            );
          }
          if (isProgramError(completion.result)) {
            return fail(
              'failed',
              completion.result,
              steps,
              outputsByNode,
              transaction
            );
          }
          const outcome = completion.result;
          if (outcome.error) {
            const errorControl = controlOutputPortIds(completion.node).find(
              (portId) =>
                portId === 'out.control.error' || portId.endsWith('.error')
            );
            if (!errorControl) {
              return fail(
                'failed',
                outcome.error,
                steps,
                outputsByNode,
                transaction
              );
            }
            selectedControls.set(completion.node.id, new Set([errorControl]));
            const errorOutput = dataOutputPortIds(completion.node).find(
              (portId) =>
                portId === 'out.data.error' || portId.endsWith('.error')
            );
            outputsByNode[completion.node.id] = Object.freeze({
              ...outcome.outputs,
              ...(errorOutput
                ? {
                    [errorOutput]: {
                      code: outcome.error.code,
                      category: outcome.error.category,
                      retryable: outcome.error.retryable,
                      safeMessage: outcome.error.safeMessage,
                      sourceRef: {
                        ...outcome.error.sourceRef,
                      },
                    },
                  }
                : {}),
            });
          } else {
            selectedControls.set(
              completion.node.id,
              new Set(outcome.controlPortIds)
            );
          }
          activeNodes.add(completion.node.id);
          if (!outputsByNode[completion.node.id]) {
            outputsByNode[completion.node.id] = outcome.outputs;
          }
          if (outcome.primaryOutput !== undefined) {
            primaryByNode.set(completion.node.id, outcome.primaryOutput);
          }
          for (const action of outcome.stateActions) {
            if (action.kind === 'begin-scope') {
              transaction.beginScope();
            } else if (action.kind === 'commit-scope') {
              if (!transaction.commitScope()) {
                return fail(
                  'failed',
                  programError(
                    {
                      program: input.program,
                      node: completion.node,
                      inputs: {},
                      attempt: 1,
                      signal: cancellation,
                      gateways: input.gateways ?? {},
                      grantedCapabilities,
                      readState: (key) => transaction.read(key),
                      emitFrame: () => undefined,
                    },
                    'NODEGRAPH_STATE_SCOPE_INVALID',
                    'validation',
                    'State commit has no matching transaction scope.'
                  ),
                  steps,
                  outputsByNode,
                  transaction
                );
              }
            } else if (action.kind === 'rollback-scope') {
              if (!transaction.rollbackScope()) {
                return fail(
                  'failed',
                  programError(
                    {
                      program: input.program,
                      node: completion.node,
                      inputs: {},
                      attempt: 1,
                      signal: cancellation,
                      gateways: input.gateways ?? {},
                      grantedCapabilities,
                      readState: (key) => transaction.read(key),
                      emitFrame: () => undefined,
                    },
                    'NODEGRAPH_STATE_SCOPE_INVALID',
                    'validation',
                    'State rollback has no matching transaction scope.'
                  ),
                  steps,
                  outputsByNode,
                  transaction
                );
              }
            } else {
              transaction.stage(
                action.key,
                action.value,
                action.expectedVersion
              );
            }
          }
          for (const observation of outcome.observations) {
            appendTrace({
              kind: 'observation',
              nodeId: completion.node.id,
              detail: {
                observationKind: observation.kind,
                ...observation.detail,
              },
            });
          }
          appendTrace({
            kind: 'node-completed',
            nodeId: completion.node.id,
            wave: waveIndex,
          });
        }
      }
    }
    if (transaction.scopeDepth !== 0) {
      const node = input.program.nodes[0]!;
      return fail(
        'failed',
        programError(
          {
            program: input.program,
            node,
            inputs: {},
            attempt: 1,
            signal: cancellation,
            gateways: input.gateways ?? {},
            grantedCapabilities,
            readState: (key) => transaction.read(key),
            emitFrame: () => undefined,
          },
          'NODEGRAPH_STATE_SCOPE_OPEN',
          'validation',
          'Graph completed with an open state transaction scope.'
        ),
        steps,
        outputsByNode,
        transaction
      );
    }
    const stateCommit = transaction.commit();
    if (!stateCommit.ok) {
      return fail(
        'failed',
        Object.freeze({
          code: 'NODEGRAPH_STATE_CAS_CONFLICT',
          category: 'state-conflict',
          retryable: true,
          safeMessage:
            'Temporary state changed after this graph invocation began.',
          sourceRef: Object.freeze({
            documentId: input.program.documentId,
          }),
        }),
        steps,
        outputsByNode,
        transaction
      );
    }
    const terminal = [...input.program.nodes]
      .filter(
        (node) => activeNodes.has(node.id) && node.descriptorId === 'core.end'
      )
      .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
      .at(-1);
    const output = terminal ? primaryByNode.get(terminal.id) : undefined;
    appendTrace({ kind: 'graph-completed' });
    return Object.freeze({
      status: 'completed',
      ...(output !== undefined ? { output } : {}),
      outputsByNode: Object.freeze(outputsByNode),
      steps,
      stateRevision: stateCommit.revision,
      trace: Object.freeze(trace),
    });
  } catch {
    return fail(
      cancellation.aborted ? 'cancelled' : 'failed',
      cancellation.aborted
        ? undefined
        : Object.freeze({
            code: 'NODEGRAPH_RUNTIME_FAILED',
            category: 'executor',
            retryable: false,
            safeMessage:
              'Graph execution failed before producing a safe result.',
            sourceRef: Object.freeze({
              documentId: input.program.documentId,
            }),
          }),
      steps,
      outputsByNode,
      transaction
    );
  } finally {
    unsubscribeCancellation();
  }
};
