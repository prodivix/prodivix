import type {
  ExportRuntimeModuleFactory,
  ExportRuntimeRequirement,
} from '#src/export/types';

type DomainRuntimeKind = Extract<
  ExportRuntimeRequirement['kind'],
  'nodegraph-runtime' | 'animation-runtime'
>;

const createRuntimeModuleFactory = (
  kind: DomainRuntimeKind,
  suggestedName: string,
  body: string
): ExportRuntimeModuleFactory => {
  return (requirement) => ({
    id: `runtime:${kind}`,
    kind: 'runtime-helper',
    suggestedName,
    language: 'ts',
    imports: [],
    body,
    sourceTrace: requirement.sourceTrace,
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  });
};

/**
 * Framework-neutral runtime helpers for canonical domain projections.
 *
 * React and Vue consume these exact factories so a framework preset cannot
 * fork NodeGraph scheduling or Animation playback semantics.
 */
export const DOMAIN_RUNTIME_MODULE_FACTORIES = Object.freeze({
  'nodegraph-runtime': createRuntimeModuleFactory(
    'nodegraph-runtime',
    'nodegraph-runtime',
    `export type NodeGraphInput = unknown;
export type NodeGraphOutput = unknown;
export interface NodeGraphObject {
  readonly [key: string]: NodeGraphValue;
}
export type NodeGraphValue =
  | null
  | boolean
  | number
  | string
  | readonly NodeGraphValue[]
  | NodeGraphObject;

export type NodeGraphProgram = Readonly<{
  documentId: string;
  programDigest: string;
  executionWaves: readonly (readonly string[])[];
  nodes: readonly Readonly<{
    id: string;
    descriptorId: string;
    executorId: string;
    configuration: NodeGraphValue;
    ports: readonly Readonly<{
      id: string;
      direction: 'input' | 'output';
      flow: 'control' | 'data' | 'error';
    }>[];
  }>[];
  edges: readonly Readonly<{
    id: string;
    source: Readonly<{ nodeId: string; portId: string }>;
    target: Readonly<{ nodeId: string; portId: string }>;
    flow: 'control' | 'data' | 'error';
  }>[];
}>;

export type BlockedNodeGraphProgram = Readonly<{
  status: 'blocked';
  documentId: string;
  issues: readonly unknown[];
}>;

export type NodeGraphTrace = Readonly<{
  sequence: number;
  kind: 'node-entered' | 'node-exited';
  nodeId: string;
  sourcePath: string;
}>;

export type NodeGraphExecutionOptions = {
  signal?: AbortSignal;
  executors?: Readonly<Record<string, (context: Readonly<{
    input: NodeGraphValue | undefined;
    requestInput: NodeGraphValue;
    configuration: NodeGraphValue;
    signal?: AbortSignal;
  }>) => unknown | Promise<unknown>>>;
  onTrace?: (trace: NodeGraphTrace) => void;
};

export type NodeGraphExecutor = (
  input: NodeGraphInput,
  options?: NodeGraphExecutionOptions
) => Promise<NodeGraphOutput>;

const compareCodePoints = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const canonicalText = (value: unknown): string => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('NodeGraph Program contains a non-finite number.');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalText).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareCodePoints);
    if (keys.some((key) => key === '__proto__' || key === 'prototype' || key === 'constructor')) {
      throw new TypeError('NodeGraph Program contains an unsafe object key.');
    }
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalText(record[key])).join(',') + '}';
  }
  throw new TypeError('NodeGraph Program contains a non-JSON value.');
};

const sha256 = async (value: unknown): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new TypeError('NodeGraph Program integrity requires Web Crypto.');
  const bytes = new TextEncoder().encode(canonicalText(value));
  const hash = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return 'sha256-' + [...hash].map((part) => part.toString(16).padStart(2, '0')).join('');
};

const readValue = (value: unknown): NodeGraphValue => {
  canonicalText(value);
  return value as NodeGraphValue;
};

const dataOutputPorts = (node: NodeGraphProgram['nodes'][number]) =>
  node.ports
    .filter((port) => port.direction === 'output' && port.flow === 'data')
    .map((port) => port.id)
    .sort(compareCodePoints);

const nodeSourcePath = (nodeId: string) =>
  '/nodesById/' + nodeId.replace(/~/g, '~0').replace(/\\//g, '~1');

const executeFirstPartyNode = async (
  node: NodeGraphProgram['nodes'][number],
  input: NodeGraphValue | undefined,
  requestInput: NodeGraphValue,
  options: NodeGraphExecutionOptions
): Promise<NodeGraphValue | undefined> => {
  if (node.descriptorId === 'core.start') return requestInput;
  if (node.descriptorId === 'core.end' || node.descriptorId === 'core.process') return input;
  if (node.descriptorId === 'core.constant') {
    const configuration = node.configuration as Readonly<Record<string, NodeGraphValue>>;
    return configuration.value;
  }
  if (node.descriptorId === 'core.assert') {
    if (!input) throw new Error('NodeGraph assertion failed.');
    return input;
  }
  if (node.descriptorId === 'core.log' || node.descriptorId === 'core.checkpoint') return input;
  const executor = options.executors?.[node.executorId];
  if (!executor) {
    throw new TypeError('NodeGraph executor is unavailable: ' + node.executorId);
  }
  const output = await executor({
    input,
    requestInput,
    configuration: node.configuration,
    signal: options.signal,
  });
  return output === undefined ? undefined : readValue(output);
};

export const createNodeGraphExecutor = (
  program: NodeGraphProgram | BlockedNodeGraphProgram
): NodeGraphExecutor => async (rawInput, options = {}) => {
  if ('status' in program) {
    throw new TypeError('NodeGraph export is blocked: ' + canonicalText(program.issues));
  }
  const { programDigest, ...unsigned } = program;
  if (await sha256(unsigned) !== programDigest) {
    throw new TypeError('NodeGraph Program digest mismatch.');
  }
  const requestInput = readValue(rawInput);
  const nodeById = new Map(program.nodes.map((node) => [node.id, node] as const));
  const incomingByNodeId = new Map<string, typeof program.edges>();
  for (const node of program.nodes) {
    incomingByNodeId.set(
      node.id,
      program.edges
        .filter((edge) => edge.target.nodeId === node.id && edge.flow === 'data')
        .sort((left, right) => compareCodePoints(left.id, right.id))
    );
  }
  const valuesByPort = new Map<string, NodeGraphValue>();
  let terminal: NodeGraphValue | undefined = requestInput;
  let sequence = 0;
  for (const wave of program.executionWaves) {
    for (const nodeId of wave) {
      if (options.signal?.aborted) throw new DOMException('NodeGraph execution was cancelled.', 'AbortError');
      const node = nodeById.get(nodeId);
      if (!node) throw new TypeError('NodeGraph Program references a missing node.');
      sequence += 1;
      options.onTrace?.({
        sequence,
        kind: 'node-entered',
        nodeId,
        sourcePath: nodeSourcePath(nodeId),
      });
      const incoming = incomingByNodeId.get(nodeId) ?? [];
      const primary = incoming.length
        ? valuesByPort.get(incoming[0]!.source.nodeId + '\\u0000' + incoming[0]!.source.portId)
        : node.descriptorId === 'core.start'
          ? requestInput
          : undefined;
      const output = await executeFirstPartyNode(node, primary, requestInput, options);
      if (output !== undefined) {
        terminal = output;
        for (const portId of dataOutputPorts(node)) {
          valuesByPort.set(node.id + '\\u0000' + portId, output);
        }
      }
      sequence += 1;
      options.onTrace?.({
        sequence,
        kind: 'node-exited',
        nodeId,
        sourcePath: nodeSourcePath(nodeId),
      });
    }
  }
  return terminal;
};`
  ),
  'animation-runtime': createRuntimeModuleFactory(
    'animation-runtime',
    'animation-runtime',
    `export type AnimationHandle = {
  play(): void;
  pause(): void;
  cancel(): void;
};

export const createAnimationHandle = (animation: Animation): AnimationHandle => {
  return {
    play: () => animation.play(),
    pause: () => animation.pause(),
    cancel: () => animation.cancel(),
  };
};

export type AnimationMotionMode = 'full' | 'reduced';
export type AnimationCompositionEvent = Readonly<{
  sequence: number;
  atMs: number;
  kind: 'timeline-started' | 'timeline-completed' | 'timeline-cancelled' | 'marker-reached' | 'settled';
  compositionNodeId: string;
  timelineId?: string;
  markerId?: string;
  requiredInReducedMotion?: boolean;
}>;
export type AnimationCompositionProgram = Readonly<{
  compositionId: string;
  motionMode: AnimationMotionMode;
  durationMs: number;
  requiredMarkerIds: readonly string[];
  events: readonly AnimationCompositionEvent[];
  programDigest: string;
}>;
export type AnimationCompositionProgramBundle = Readonly<{
  compositionId: string;
  full: AnimationCompositionProgram;
  reduced: AnimationCompositionProgram;
}>;
export type BlockedAnimationCompositionProgram = Readonly<{
  status: 'blocked';
  compositionId: string;
  issues: readonly unknown[];
}>;

export type AnimationCompositionObservation = Readonly<{
  sequence: number;
  kind: 'composition-started' | AnimationCompositionEvent['kind'] | 'composition-completed' | 'composition-cancelled';
  compositionId: string;
  instanceId: string;
  generation: string;
  motionMode: AnimationMotionMode;
  logicalTimeMs: number;
  markerId?: string;
}>;

export type AnimationCompositionRunOptions = Readonly<{
  motionMode: AnimationMotionMode;
  instanceId: string;
  generation: string;
  signal?: AbortSignal;
  clock?: Readonly<{
    advanceTo(logicalTimeMs: number, signal: AbortSignal): void | Promise<void>;
  }>;
  apply?: (event: AnimationCompositionEvent, signal: AbortSignal) => void | Promise<void>;
  onObservation?: (observation: AnimationCompositionObservation) => void;
}>;

const animationCompareCodePoints = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const animationCanonicalText = (value: unknown): string => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Animation Program contains a non-finite number.');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(animationCanonicalText).join(',') + ']';
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(animationCompareCodePoints);
    if (keys.some((key) => key === '__proto__' || key === 'prototype' || key === 'constructor')) {
      throw new TypeError('Animation Program contains an unsafe object key.');
    }
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + animationCanonicalText(record[key])).join(',') + '}';
  }
  throw new TypeError('Animation Program contains a non-JSON value.');
};

const animationDigest = async (value: unknown): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new TypeError('Animation Program integrity requires Web Crypto.');
  const bytes = new TextEncoder().encode(animationCanonicalText(value));
  const hash = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return 'sha256-' + [...hash].map((part) => part.toString(16).padStart(2, '0')).join('');
};

const defaultAnimationClock = () => {
  let previous = 0;
  return {
    async advanceTo(logicalTimeMs: number, signal: AbortSignal) {
      const delayMs = Math.max(0, logicalTimeMs - previous);
      previous = logicalTimeMs;
      if (!delayMs) return;
      await new Promise<void>((resolve, reject) => {
        const handle = setTimeout(resolve, delayMs);
        signal.addEventListener('abort', () => {
          clearTimeout(handle);
          reject(new DOMException('Animation composition was cancelled.', 'AbortError'));
        }, { once: true });
      });
    },
  };
};

export const createAnimationCompositionController = (
  bundle: AnimationCompositionProgramBundle | BlockedAnimationCompositionProgram,
  identity: Readonly<{ animationDocumentId: string; targetDocumentId: string }>
) => {
  let active: AbortController | undefined;
  return {
    cancel(reason = 'Animation composition was cancelled.') {
      active?.abort(reason);
    },
    async run(options: AnimationCompositionRunOptions) {
      if ('status' in bundle) {
        throw new TypeError('Animation composition export is blocked: ' + animationCanonicalText(bundle.issues));
      }
      active?.abort('Animation composition generation was replaced.');
      const controller = new AbortController();
      active = controller;
      const abort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort', abort, { once: true });
      const program = bundle[options.motionMode];
      const { programDigest, ...unsigned } = program;
      if (await animationDigest(unsigned) !== programDigest) {
        throw new TypeError('Animation composition Program digest mismatch.');
      }
      const clock = options.clock ?? defaultAnimationClock();
      const observations: AnimationCompositionObservation[] = [];
      const publish = (
        kind: AnimationCompositionObservation['kind'],
        sequence: number,
        logicalTimeMs: number,
        markerId?: string
      ) => {
        const observation = {
          sequence,
          kind,
          compositionId: program.compositionId,
          instanceId: options.instanceId,
          generation: options.generation,
          motionMode: program.motionMode,
          logicalTimeMs,
          ...(markerId ? { markerId } : {}),
        } as const;
        observations.push(observation);
        options.onObservation?.(observation);
      };
      publish('composition-started', 0, 0);
      try {
        for (const event of program.events) {
          if (controller.signal.aborted) throw new DOMException('Animation composition was cancelled.', 'AbortError');
          await clock.advanceTo(event.atMs, controller.signal);
          await options.apply?.(event, controller.signal);
          publish(event.kind, event.sequence, event.atMs, event.markerId);
        }
        publish('composition-completed', program.events.length + 1, program.durationMs);
        return {
          status: 'completed' as const,
          animationDocumentId: identity.animationDocumentId,
          targetDocumentId: identity.targetDocumentId,
          logicalTimeMs: program.durationMs,
          observations: Object.freeze(observations),
        };
      } catch (error) {
        if (!controller.signal.aborted) throw error;
        const lastObservation = observations[observations.length - 1];
        publish('composition-cancelled', program.events.length + 1, lastObservation?.logicalTimeMs ?? 0);
        return {
          status: 'cancelled' as const,
          animationDocumentId: identity.animationDocumentId,
          targetDocumentId: identity.targetDocumentId,
          logicalTimeMs: observations[observations.length - 1]?.logicalTimeMs ?? 0,
          observations: Object.freeze(observations),
        };
      } finally {
        options.signal?.removeEventListener('abort', abort);
        if (active === controller) active = undefined;
      }
    },
  };
};`
  ),
});
