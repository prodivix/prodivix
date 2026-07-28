import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type { DeterministicRuntimeSession } from '@prodivix/runtime-core';
import {
  digestBehaviorValue,
  readBehaviorJsonValue,
} from './behaviorCanonical';
import type {
  BehaviorAssertion,
  BehaviorJsonValue,
  BehaviorScenarioProgram,
  BehaviorSourceRef,
} from './behavior.types';

export type BehaviorRuntimeMode = 'trigger' | 'action' | 'observation';

export type BehaviorRuntimeCancellationSignal = Readonly<{
  readonly aborted: boolean;
  readonly reason?: unknown;
}>;

export type BehaviorRuntimeError = Readonly<{
  code: string;
  safeMessage: string;
  retryable?: boolean;
}>;

export type BehaviorRuntimeCapabilityResult =
  | Readonly<{
      status: 'succeeded';
      output?: BehaviorJsonValue;
    }>
  | Readonly<{
      status: 'failed';
      error: BehaviorRuntimeError;
    }>
  | Readonly<{
      status: 'cancelled';
      reason?: string;
    }>;

export type BehaviorRuntimeInvocation = Readonly<{
  invocationId: string;
  attemptId: string;
  mode: BehaviorRuntimeMode;
  workspaceRevision: number;
  programDigest: string;
  instructionId: string;
  stepId: string;
  operation: string;
  capabilityId: string;
  input?: BehaviorJsonValue;
  expected?: BehaviorJsonValue;
  target?: BehaviorScenarioProgram['targetManifest'][number];
  source: BehaviorSourceRef;
  signal: BehaviorRuntimeCancellationSignal;
  controls?: DeterministicRuntimeSession;
  readStepOutput(stepId: string): BehaviorJsonValue | undefined;
}>;

export type BehaviorRuntimeCapabilityAdapter = Readonly<{
  capabilityId: string;
  owner: string;
  invoke(
    invocation: BehaviorRuntimeInvocation
  ): BehaviorRuntimeCapabilityResult | Promise<BehaviorRuntimeCapabilityResult>;
}>;

export type BehaviorRuntimeCapabilityRegistry = Readonly<{
  adapters: readonly BehaviorRuntimeCapabilityAdapter[];
  get(capabilityId: string): BehaviorRuntimeCapabilityAdapter | null;
}>;

export type BehaviorRuntimeRegistryIssue = Readonly<{
  code: 'invalid-adapter' | 'duplicate-capability';
  path: string;
  message: string;
}>;

export type CreateBehaviorRuntimeCapabilityRegistryResult =
  | Readonly<{
      ok: true;
      registry: BehaviorRuntimeCapabilityRegistry;
    }>
  | Readonly<{
      ok: false;
      issues: readonly BehaviorRuntimeRegistryIssue[];
    }>;

export type BehaviorRuntimeTraceEvent = Readonly<{
  sequence: number;
  kind:
    | 'instruction-started'
    | 'instruction-completed'
    | 'instruction-failed'
    | 'instruction-cancelled';
  attemptId: string;
  logicalTime?: number;
  instructionId: string;
  stepId: string;
  capabilityId?: string;
  source: BehaviorSourceRef;
  outputDigest?: string;
  errorCode?: string;
}>;

export type BehaviorRuntimeIssue = Readonly<{
  code:
    | 'invalid-program'
    | 'missing-capability'
    | 'capability-owner-mismatch'
    | 'runtime-zone-incompatible'
    | 'invalid-output'
    | 'assertion-failed'
    | 'unsupported-assertion'
    | 'capability-failed';
  message: string;
  instructionId?: string;
  stepId?: string;
  capabilityId?: string;
}>;

export type BehaviorRuntimeResult =
  | Readonly<{
      status: 'completed';
      attemptId: string;
      outputsByStepId: Readonly<Record<string, BehaviorJsonValue>>;
      trace: readonly BehaviorRuntimeTraceEvent[];
    }>
  | Readonly<{
      status: 'failed' | 'blocked';
      attemptId: string;
      issue: BehaviorRuntimeIssue;
      outputsByStepId: Readonly<Record<string, BehaviorJsonValue>>;
      trace: readonly BehaviorRuntimeTraceEvent[];
    }>
  | Readonly<{
      status: 'cancelled';
      attemptId: string;
      reason?: string;
      outputsByStepId: Readonly<Record<string, BehaviorJsonValue>>;
      trace: readonly BehaviorRuntimeTraceEvent[];
    }>;

export type BehaviorRuntimeDebugPort = Readonly<{
  beforeInstruction(
    input: Readonly<{
      attemptId: string;
      instructionId: string;
      stepId: string;
      source: BehaviorSourceRef;
    }>
  ): void | 'cancel' | Promise<void | 'cancel'>;
  afterInstruction?(
    input: Readonly<{
      attemptId: string;
      instructionId: string;
      stepId: string;
      source: BehaviorSourceRef;
      status: 'completed' | 'failed' | 'cancelled';
    }>
  ): void | Promise<void>;
  finish?(
    input: Readonly<{
      attemptId: string;
      status: BehaviorRuntimeResult['status'];
    }>
  ): void;
}>;

export type ExecuteBehaviorScenarioProgramInput = Readonly<{
  program: BehaviorScenarioProgram;
  attemptId: string;
  runtimeZone: 'client' | 'server' | 'test';
  registry: BehaviorRuntimeCapabilityRegistry;
  signal?: BehaviorRuntimeCancellationSignal;
  maximumConcurrency?: number;
  controls?: DeterministicRuntimeSession;
  debugger?: BehaviorRuntimeDebugPort;
}>;

const freezeAdapter = (
  adapter: BehaviorRuntimeCapabilityAdapter
): BehaviorRuntimeCapabilityAdapter =>
  Object.freeze({
    capabilityId: adapter.capabilityId,
    owner: adapter.owner,
    invoke: adapter.invoke,
  });

export const createBehaviorRuntimeCapabilityRegistry = (
  adapters: readonly BehaviorRuntimeCapabilityAdapter[]
): CreateBehaviorRuntimeCapabilityRegistryResult => {
  const normalized = [...adapters]
    .map(freezeAdapter)
    .sort((left, right) =>
      compareUnicodeCodePoints(left.capabilityId, right.capabilityId)
    );
  const issues: BehaviorRuntimeRegistryIssue[] = [];
  const seen = new Set<string>();
  normalized.forEach((adapter, index) => {
    if (!adapter.capabilityId.trim() || !adapter.owner.trim()) {
      issues.push({
        code: 'invalid-adapter',
        path: `/adapters/${index}`,
        message: 'Behavior runtime adapters require capabilityId and owner.',
      });
    }
    if (seen.has(adapter.capabilityId)) {
      issues.push({
        code: 'duplicate-capability',
        path: `/adapters/${index}/capabilityId`,
        message: `Duplicate Behavior runtime capability: ${adapter.capabilityId}.`,
      });
    }
    seen.add(adapter.capabilityId);
  });
  if (issues.length) {
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  const byCapability = new Map(
    normalized.map((adapter) => [adapter.capabilityId, adapter])
  );
  const frozenAdapters = Object.freeze(normalized);
  return Object.freeze({
    ok: true,
    registry: Object.freeze({
      adapters: frozenAdapters,
      get(capabilityId: string) {
        return byCapability.get(capabilityId) ?? null;
      },
    }),
  });
};

const runtimeMode = (operation: string): BehaviorRuntimeMode =>
  operation.startsWith('trigger:')
    ? 'trigger'
    : operation.startsWith('observe:')
      ? 'observation'
      : 'action';

const CAPABILITY_THROW_SAFE_MESSAGE =
  'Behavior capability invocation failed before producing a safe result.';

const containsValue = (
  actual: BehaviorJsonValue | undefined,
  expected: BehaviorJsonValue | undefined
): boolean => {
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.includes(expected);
  }
  if (Array.isArray(actual) && expected !== undefined) {
    return actual.some((value) => sameCanonicalJson(value, expected));
  }
  if (
    actual !== null &&
    typeof actual === 'object' &&
    !Array.isArray(actual) &&
    typeof expected === 'string'
  ) {
    return Object.hasOwn(actual, expected);
  }
  return false;
};

const evaluateAssertion = (
  assertion: BehaviorAssertion,
  actual: BehaviorJsonValue | undefined
): 'passed' | 'failed' | 'unsupported' => {
  switch (assertion.operator) {
    case 'equals':
      return actual !== undefined &&
        assertion.expected !== undefined &&
        sameCanonicalJson(actual, assertion.expected)
        ? 'passed'
        : 'failed';
    case 'not-equals':
      return actual === undefined ||
        assertion.expected === undefined ||
        !sameCanonicalJson(actual, assertion.expected)
        ? 'passed'
        : 'failed';
    case 'contains':
      return containsValue(actual, assertion.expected) ? 'passed' : 'failed';
    case 'absent':
      return actual === undefined || actual === null ? 'passed' : 'failed';
    case 'matches-schema':
    case 'custom':
      return 'unsupported';
  }
};

const freezeOutputs = (
  outputs: Map<string, BehaviorJsonValue>
): Readonly<Record<string, BehaviorJsonValue>> => {
  const record: Record<string, BehaviorJsonValue> = Object.create(null);
  [...outputs.entries()]
    .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
    .forEach(([stepId, output]) => {
      record[stepId] = output;
    });
  return Object.freeze(record);
};

const validateProgram = (
  program: BehaviorScenarioProgram
): BehaviorRuntimeIssue | null => {
  const ids = new Set<string>();
  for (const instruction of program.instructions) {
    if (!instruction.id.trim() || ids.has(instruction.id)) {
      return Object.freeze({
        code: 'invalid-program',
        message: `Behavior Program contains duplicate or empty instruction identity: ${instruction.id}.`,
        instructionId: instruction.id,
        stepId: instruction.stepId,
      });
    }
    ids.add(instruction.id);
  }
  for (const instruction of program.instructions) {
    const missing = instruction.dependencyInstructionIds.find(
      (dependencyId) => !ids.has(dependencyId)
    );
    if (missing) {
      return Object.freeze({
        code: 'invalid-program',
        message: `Behavior instruction ${instruction.id} references missing dependency ${missing}.`,
        instructionId: instruction.id,
        stepId: instruction.stepId,
      });
    }
  }
  return null;
};

/**
 * Executes one immutable Program through domain-owned capability adapters.
 * Each dependency wave emits completion events in canonical instruction order,
 * so provider completion timing cannot reorder the semantic trace.
 */
export const executeBehaviorScenarioProgram = async (
  input: ExecuteBehaviorScenarioProgramInput
): Promise<BehaviorRuntimeResult> => {
  const outputs = new Map<string, BehaviorJsonValue>();
  const trace: BehaviorRuntimeTraceEvent[] = [];
  let sequence = 0;
  const appendTrace = (
    event: Omit<BehaviorRuntimeTraceEvent, 'sequence' | 'attemptId'>
  ): void => {
    sequence += 1;
    trace.push(
      Object.freeze({
        sequence,
        attemptId: input.attemptId,
        ...(input.controls ? { logicalTime: input.controls.clock.now() } : {}),
        ...event,
      })
    );
  };
  const snapshot = () => Object.freeze([...trace]);
  const programIssue = validateProgram(input.program);
  if (!input.attemptId.trim() || programIssue) {
    return Object.freeze({
      status: 'blocked',
      attemptId: input.attemptId,
      issue:
        programIssue ??
        Object.freeze({
          code: 'invalid-program',
          message: 'Behavior execution requires a stable attempt identity.',
        }),
      outputsByStepId: freezeOutputs(outputs),
      trace: snapshot(),
    });
  }

  const manifestByCapability = new Map(
    input.program.capabilityManifest.map((entry) => [entry.capabilityId, entry])
  );
  const targetsByIdentity = new Map(
    input.program.targetManifest.map((target) => [
      `${target.targetId}:${target.capability}`,
      target,
    ])
  );
  const sourcesByInstruction = new Map(
    input.program.sourceTrace.map((entry) => [
      entry.instructionId,
      entry.source,
    ])
  );
  const observationsByStep = new Map(
    input.program.observations.map((observation) => [
      observation.stepId,
      observation,
    ])
  );

  for (const instruction of input.program.instructions) {
    const source = sourcesByInstruction.get(instruction.id);
    if (!source) {
      return Object.freeze({
        status: 'blocked',
        attemptId: input.attemptId,
        issue: Object.freeze({
          code: 'invalid-program',
          message: `Behavior instruction ${instruction.id} has no SourceTrace.`,
          instructionId: instruction.id,
          stepId: instruction.stepId,
        }),
        outputsByStepId: freezeOutputs(outputs),
        trace: snapshot(),
      });
    }
    if (!instruction.capabilityId) continue;
    const capability = manifestByCapability.get(instruction.capabilityId);
    if (!capability) {
      return Object.freeze({
        status: 'blocked',
        attemptId: input.attemptId,
        issue: Object.freeze({
          code: 'invalid-program',
          message: `Behavior capability manifest is missing ${instruction.capabilityId}.`,
          instructionId: instruction.id,
          stepId: instruction.stepId,
          capabilityId: instruction.capabilityId,
        }),
        outputsByStepId: freezeOutputs(outputs),
        trace: snapshot(),
      });
    }
    if (!capability.runtimeZones.includes(input.runtimeZone)) {
      return Object.freeze({
        status: 'blocked',
        attemptId: input.attemptId,
        issue: Object.freeze({
          code: 'runtime-zone-incompatible',
          message: `Behavior capability ${instruction.capabilityId} is unavailable in ${input.runtimeZone}.`,
          instructionId: instruction.id,
          stepId: instruction.stepId,
          capabilityId: instruction.capabilityId,
        }),
        outputsByStepId: freezeOutputs(outputs),
        trace: snapshot(),
      });
    }
    if (
      instruction.targetId &&
      !targetsByIdentity.has(
        `${instruction.targetId}:${capability.targetCapability}`
      )
    ) {
      return Object.freeze({
        status: 'blocked',
        attemptId: input.attemptId,
        issue: Object.freeze({
          code: 'invalid-program',
          message: `Behavior instruction ${instruction.id} has no capability-qualified target for ${capability.targetCapability}.`,
          instructionId: instruction.id,
          stepId: instruction.stepId,
          capabilityId: instruction.capabilityId,
        }),
        outputsByStepId: freezeOutputs(outputs),
        trace: snapshot(),
      });
    }
    if (
      !instruction.targetId &&
      capability.targetCapability !== 'behavior:scenario:manual'
    ) {
      return Object.freeze({
        status: 'blocked',
        attemptId: input.attemptId,
        issue: Object.freeze({
          code: 'invalid-program',
          message: `Behavior instruction ${instruction.id} requires a target with ${capability.targetCapability}.`,
          instructionId: instruction.id,
          stepId: instruction.stepId,
          capabilityId: instruction.capabilityId,
        }),
        outputsByStepId: freezeOutputs(outputs),
        trace: snapshot(),
      });
    }
    if (instruction.capabilityId === 'scenario.manual') continue;
    const adapter = input.registry.get(instruction.capabilityId);
    if (!adapter) {
      return Object.freeze({
        status: 'blocked',
        attemptId: input.attemptId,
        issue: Object.freeze({
          code: 'missing-capability',
          message: `Behavior runtime capability is not registered: ${instruction.capabilityId}.`,
          instructionId: instruction.id,
          stepId: instruction.stepId,
          capabilityId: instruction.capabilityId,
        }),
        outputsByStepId: freezeOutputs(outputs),
        trace: snapshot(),
      });
    }
    if (adapter.owner !== capability.owner) {
      return Object.freeze({
        status: 'blocked',
        attemptId: input.attemptId,
        issue: Object.freeze({
          code: 'capability-owner-mismatch',
          message: `Behavior capability ${instruction.capabilityId} belongs to ${capability.owner}, not ${adapter.owner}.`,
          instructionId: instruction.id,
          stepId: instruction.stepId,
          capabilityId: instruction.capabilityId,
        }),
        outputsByStepId: freezeOutputs(outputs),
        trace: snapshot(),
      });
    }
  }

  const defaultSignal: BehaviorRuntimeCancellationSignal = Object.freeze({
    aborted: false,
  });
  const signal = input.signal ?? defaultSignal;
  const pending = new Map(
    input.program.instructions.map((instruction) => [
      instruction.id,
      instruction,
    ])
  );
  const completed = new Set<string>();
  const requestedConcurrency = input.maximumConcurrency ?? 8;
  const maximumConcurrency =
    Number.isFinite(requestedConcurrency) && requestedConcurrency > 0
      ? Math.max(1, Math.trunc(requestedConcurrency))
      : 8;

  while (pending.size) {
    if (signal.aborted) {
      return Object.freeze({
        status: 'cancelled',
        attemptId: input.attemptId,
        reason: typeof signal.reason === 'string' ? signal.reason : 'Cancelled',
        outputsByStepId: freezeOutputs(outputs),
        trace: snapshot(),
      });
    }
    const ready = [...pending.values()]
      .filter((instruction) =>
        instruction.dependencyInstructionIds.every((dependencyId) =>
          completed.has(dependencyId)
        )
      )
      .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
      .slice(0, maximumConcurrency);
    if (!ready.length) {
      return Object.freeze({
        status: 'blocked',
        attemptId: input.attemptId,
        issue: Object.freeze({
          code: 'invalid-program',
          message: 'Behavior Program contains a dependency cycle.',
        }),
        outputsByStepId: freezeOutputs(outputs),
        trace: snapshot(),
      });
    }

    const invokeInstruction = async (
      instruction: BehaviorScenarioProgram['instructions'][number]
    ) => {
      const source = sourcesByInstruction.get(instruction.id)!;
      const debugDecision = await input.debugger?.beforeInstruction({
        attemptId: input.attemptId,
        instructionId: instruction.id,
        stepId: instruction.stepId,
        source,
      });
      if (debugDecision === 'cancel') {
        return Object.freeze({
          instruction,
          source,
          result: Object.freeze({
            status: 'cancelled' as const,
            reason: 'Cancelled by the Behavior debugger.',
          }),
        });
      }
      appendTrace({
        kind: 'instruction-started',
        instructionId: instruction.id,
        stepId: instruction.stepId,
        ...(instruction.capabilityId
          ? { capabilityId: instruction.capabilityId }
          : {}),
        source,
      });
      if (!instruction.capabilityId) {
        return Object.freeze({
          instruction,
          source,
          result: Object.freeze({
            status: 'succeeded' as const,
          }),
        });
      }
      if (instruction.capabilityId === 'scenario.manual') {
        return Object.freeze({
          instruction,
          source,
          result: Object.freeze({
            status: 'succeeded' as const,
          }),
        });
      }
      const observation = observationsByStep.get(instruction.stepId);
      const adapter = input.registry.get(instruction.capabilityId)!;
      try {
        const result = await adapter.invoke(
          Object.freeze({
            invocationId:
              input.controls?.identifiers.next('action') ??
              `${input.attemptId}:${instruction.id}`,
            attemptId: input.attemptId,
            mode: runtimeMode(instruction.operation),
            workspaceRevision: input.program.workspaceRevision,
            programDigest: input.program.programDigest,
            instructionId: instruction.id,
            stepId: instruction.stepId,
            operation: instruction.operation,
            capabilityId: instruction.capabilityId,
            ...(instruction.input !== undefined
              ? { input: instruction.input }
              : {}),
            ...(observation?.expected !== undefined
              ? { expected: observation.expected }
              : {}),
            ...(instruction.targetId
              ? {
                  target: targetsByIdentity.get(
                    `${instruction.targetId}:${manifestByCapability.get(instruction.capabilityId)!.targetCapability}`
                  )!,
                }
              : {}),
            source,
            signal,
            ...(input.controls ? { controls: input.controls } : {}),
            readStepOutput(stepId) {
              return outputs.get(stepId);
            },
          })
        );
        return Object.freeze({ instruction, source, result });
      } catch {
        return Object.freeze({
          instruction,
          source,
          result: Object.freeze({
            status: 'failed' as const,
            error: Object.freeze({
              code: 'capability-threw',
              safeMessage: CAPABILITY_THROW_SAFE_MESSAGE,
            }),
          }),
        });
      }
    };
    const outcomes = input.controls
      ? await (async () => {
          const scheduled: Awaited<ReturnType<typeof invokeInstruction>>[] = [];
          ready.forEach((instruction) => {
            input.controls!.scheduler.enqueue({
              id: instruction.id,
              lane: instruction.operation.split(':', 1)[0] || 'scenario',
              readyAt: input.controls!.clock.now(),
              run: async () => {
                scheduled.push(await invokeInstruction(instruction));
              },
            });
          });
          while (scheduled.length < ready.length) {
            const result = await input.controls!.scheduler.runNext();
            if (result.status !== 'completed') {
              throw new Error(
                'Deterministic scheduler stopped before the Behavior wave completed.'
              );
            }
          }
          return scheduled;
        })()
      : await Promise.all(ready.map(invokeInstruction));

    for (const { instruction, source, result } of outcomes.sort((left, right) =>
      compareUnicodeCodePoints(left.instruction.id, right.instruction.id)
    )) {
      if (result.status === 'cancelled') {
        await input.debugger?.afterInstruction?.({
          attemptId: input.attemptId,
          instructionId: instruction.id,
          stepId: instruction.stepId,
          source,
          status: 'cancelled',
        });
        appendTrace({
          kind: 'instruction-cancelled',
          instructionId: instruction.id,
          stepId: instruction.stepId,
          ...(instruction.capabilityId
            ? { capabilityId: instruction.capabilityId }
            : {}),
          source,
        });
        return Object.freeze({
          status: 'cancelled',
          attemptId: input.attemptId,
          ...(result.reason ? { reason: result.reason } : {}),
          outputsByStepId: freezeOutputs(outputs),
          trace: snapshot(),
        });
      }
      if (result.status === 'failed') {
        await input.debugger?.afterInstruction?.({
          attemptId: input.attemptId,
          instructionId: instruction.id,
          stepId: instruction.stepId,
          source,
          status: 'failed',
        });
        appendTrace({
          kind: 'instruction-failed',
          instructionId: instruction.id,
          stepId: instruction.stepId,
          ...(instruction.capabilityId
            ? { capabilityId: instruction.capabilityId }
            : {}),
          source,
          errorCode: result.error.code,
        });
        return Object.freeze({
          status: 'failed',
          attemptId: input.attemptId,
          issue: Object.freeze({
            code: 'capability-failed',
            message: result.error.safeMessage,
            instructionId: instruction.id,
            stepId: instruction.stepId,
            ...(instruction.capabilityId
              ? { capabilityId: instruction.capabilityId }
              : {}),
          }),
          outputsByStepId: freezeOutputs(outputs),
          trace: snapshot(),
        });
      }

      let output: BehaviorJsonValue | undefined;
      if ('output' in result && result.output !== undefined) {
        output = readBehaviorJsonValue(result.output);
        if (output === undefined) {
          appendTrace({
            kind: 'instruction-failed',
            instructionId: instruction.id,
            stepId: instruction.stepId,
            ...(instruction.capabilityId
              ? { capabilityId: instruction.capabilityId }
              : {}),
            source,
            errorCode: 'invalid-output',
          });
          return Object.freeze({
            status: 'failed',
            attemptId: input.attemptId,
            issue: Object.freeze({
              code: 'invalid-output',
              message: `Behavior capability ${instruction.capabilityId ?? instruction.operation} returned an invalid or oversized value.`,
              instructionId: instruction.id,
              stepId: instruction.stepId,
              ...(instruction.capabilityId
                ? { capabilityId: instruction.capabilityId }
                : {}),
            }),
            outputsByStepId: freezeOutputs(outputs),
            trace: snapshot(),
          });
        }
        outputs.set(instruction.stepId, output);
      }

      const observation = observationsByStep.get(instruction.stepId);
      if (observation) {
        for (const assertion of observation.assertions) {
          const assertionResult = evaluateAssertion(assertion, output);
          if (assertionResult !== 'passed') {
            const unsupported = assertionResult === 'unsupported';
            appendTrace({
              kind: 'instruction-failed',
              instructionId: instruction.id,
              stepId: instruction.stepId,
              ...(instruction.capabilityId
                ? { capabilityId: instruction.capabilityId }
                : {}),
              source,
              errorCode: unsupported
                ? 'unsupported-assertion'
                : 'assertion-failed',
            });
            return Object.freeze({
              status: 'failed',
              attemptId: input.attemptId,
              issue: Object.freeze({
                code: unsupported
                  ? 'unsupported-assertion'
                  : 'assertion-failed',
                message: unsupported
                  ? `Behavior assertion ${assertion.id} requires an unavailable assertion adapter.`
                  : `Behavior assertion ${assertion.id} failed.`,
                instructionId: instruction.id,
                stepId: instruction.stepId,
                ...(instruction.capabilityId
                  ? { capabilityId: instruction.capabilityId }
                  : {}),
              }),
              outputsByStepId: freezeOutputs(outputs),
              trace: snapshot(),
            });
          }
        }
      }

      appendTrace({
        kind: 'instruction-completed',
        instructionId: instruction.id,
        stepId: instruction.stepId,
        ...(instruction.capabilityId
          ? { capabilityId: instruction.capabilityId }
          : {}),
        source,
        ...(output !== undefined
          ? { outputDigest: digestBehaviorValue(output) }
          : {}),
      });
      await input.debugger?.afterInstruction?.({
        attemptId: input.attemptId,
        instructionId: instruction.id,
        stepId: instruction.stepId,
        source,
        status: 'completed',
      });
      pending.delete(instruction.id);
      completed.add(instruction.id);
    }
  }

  return Object.freeze({
    status: 'completed',
    attemptId: input.attemptId,
    outputsByStepId: freezeOutputs(outputs),
    trace: snapshot(),
  });
};
