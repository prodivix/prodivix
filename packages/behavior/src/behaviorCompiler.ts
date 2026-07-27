import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { digestBehaviorValue } from './behaviorCanonical';
import type {
  BehaviorAssertion,
  BehaviorJsonValue,
  BehaviorObservation,
  BehaviorScenario,
  BehaviorScenarioProgram,
  BehaviorSourceRef,
  BehaviorStep,
} from './behavior.types';
import type {
  BehaviorRegisteredDescriptor,
  BehaviorRegistry,
} from './behaviorRegistry';
import {
  resolveBehaviorSemanticTarget,
  type BehaviorSemanticIndexView,
  type BehaviorTargetResolution,
} from './behaviorSemanticTarget';

export type BehaviorCompileIssue = Readonly<{
  code:
    | 'invalid-revision'
    | 'missing-descriptor'
    | 'unsupported-descriptor'
    | 'target-ambiguous'
    | 'target-missing'
    | 'target-incompatible'
    | 'fixture-digest-missing'
    | 'baseline-digest-missing'
    | 'control-profile-digest-missing'
    | 'source-trace-missing'
    | 'invalid-control-flow';
  path: string;
  message: string;
  stepId?: string;
}>;

export type CompileBehaviorScenarioInput = Readonly<{
  scenario: BehaviorScenario;
  scenarioDocumentId: string;
  workspaceRevision: number;
  semanticIndex: BehaviorSemanticIndexView;
  executableSnapshotDigest: string;
  compilerDigest: string;
  registry: BehaviorRegistry;
  controlProfileDigest?: string;
  fixtureSetDigests?: readonly string[];
  baselineSetDigests?: readonly string[];
}>;

export type CompileBehaviorScenarioResult =
  | Readonly<{
      status: 'ready';
      program: BehaviorScenarioProgram;
      relocations: readonly Readonly<{
        stepId: string;
        source: BehaviorSourceRef;
      }>[];
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly BehaviorCompileIssue[];
    }>;

const isDigest = (value: string | undefined): value is string =>
  /^sha256-[a-f0-9]{64}$/.test(value ?? '');

const sortedUnique = (values: Iterable<string>): readonly string[] =>
  Object.freeze([...new Set(values)].sort(compareUnicodeCodePoints));

const descriptorForObservation = (
  registry: BehaviorRegistry,
  observation: BehaviorObservation
): BehaviorRegisteredDescriptor | null => {
  const candidates = registry.findByTargetCapability(
    'observation',
    observation.target.capability
  );
  return (
    candidates.find(({ descriptor }) => descriptor.kind === observation.kind) ??
    candidates.find(({ descriptor }) =>
      descriptor.kind.endsWith(`.${observation.kind}`)
    ) ??
    (candidates.length === 1 ? candidates[0]! : null)
  );
};

const targetIssue = (
  resolution: Exclude<
    BehaviorTargetResolution,
    { status: 'exact' | 'relocated' }
  >,
  path: string,
  stepId?: string
): BehaviorCompileIssue => {
  if (resolution.status === 'ambiguous') {
    return {
      code: 'target-ambiguous',
      path,
      message: `Behavior target is ambiguous: ${resolution.candidateSymbolIds.join(', ')}.`,
      ...(stepId ? { stepId } : {}),
    };
  }
  if (resolution.status === 'incompatible') {
    return {
      code: 'target-incompatible',
      path,
      message: `Behavior target ${resolution.semanticSymbolId} no longer provides ${resolution.target.capability}.`,
      ...(stepId ? { stepId } : {}),
    };
  }
  return {
    code: 'target-missing',
    path,
    message: `Behavior target ${resolution.target.id} is missing.`,
    ...(stepId ? { stepId } : {}),
  };
};

type MutableInstruction = {
  id: string;
  stepId: string;
  dependencyInstructionIds: readonly string[];
  operation: string;
  capabilityId?: string;
  targetId?: string;
  input?: BehaviorJsonValue;
};

type MutableObservation = {
  stepId: string;
  kind: BehaviorObservation['kind'];
  targetId: string;
  expected?: BehaviorJsonValue;
  assertionIds: readonly string[];
  assertions: readonly BehaviorAssertion[];
  automatonDigest: string;
};

type CompilerState = {
  issues: BehaviorCompileIssue[];
  instructions: MutableInstruction[];
  observations: MutableObservation[];
  sourceTrace: Array<{ instructionId: string; source: BehaviorSourceRef }>;
  targetManifest: Map<
    string,
    {
      targetId: string;
      semanticSymbolId: string;
      capability: string;
      source: BehaviorSourceRef;
      instanceScope?: BehaviorObservation['target']['instanceScope'];
    }
  >;
  capabilities: Map<string, BehaviorRegisteredDescriptor>;
  relocations: Array<{ stepId: string; source: BehaviorSourceRef }>;
  terminalInstructionIdsByStep: Map<string, readonly string[]>;
};

const addCapability = (
  state: CompilerState,
  entry: BehaviorRegisteredDescriptor
): void => {
  state.capabilities.set(`${entry.category}:${entry.descriptor.kind}`, entry);
};

const resolveTarget = (
  input: CompileBehaviorScenarioInput,
  state: CompilerState,
  stepId: string,
  path: string,
  target: BehaviorObservation['target'],
  authoredSource?: BehaviorSourceRef
):
  | (Extract<BehaviorTargetResolution, { status: 'exact' | 'relocated' }> &
      Readonly<{ programTargetId: string }>)
  | null => {
  const resolution = resolveBehaviorSemanticTarget({
    target,
    index: input.semanticIndex,
    authoredSource,
  });
  if (resolution.status === 'relocated') {
    state.relocations.push({ stepId, source: resolution.source });
  }
  if (
    resolution.status === 'ambiguous' ||
    resolution.status === 'missing' ||
    resolution.status === 'incompatible'
  ) {
    state.issues.push(targetIssue(resolution, path, stepId));
    return null;
  }
  const programTargetId = target.instanceScope
    ? `target-${digestBehaviorValue({
        semanticSymbolId: resolution.semanticSymbolId,
        instanceScope: target.instanceScope,
      }).slice('sha256-'.length)}`
    : resolution.semanticSymbolId;
  const manifestKey = `${programTargetId}:${target.capability}`;
  state.targetManifest.set(manifestKey, {
    targetId: programTargetId,
    semanticSymbolId: resolution.semanticSymbolId,
    capability: target.capability,
    source: resolution.source,
    ...(target.instanceScope ? { instanceScope: target.instanceScope } : {}),
  });
  return Object.freeze({ ...resolution, programTargetId });
};

const addInstruction = (
  state: CompilerState,
  instruction: Omit<MutableInstruction, 'id'>,
  source: BehaviorSourceRef
): string => {
  const id = `instruction:${String(state.instructions.length).padStart(6, '0')}:${instruction.stepId}`;
  state.instructions.push({ id, ...instruction });
  state.sourceTrace.push({ instructionId: id, source });
  return id;
};

const compileObservation = (
  input: CompileBehaviorScenarioInput,
  state: CompilerState,
  step: Extract<BehaviorStep, { kind: 'observation' }>,
  dependencies: readonly string[],
  path: string
): readonly string[] => {
  const descriptor = descriptorForObservation(input.registry, step.observation);
  if (!descriptor) {
    state.issues.push({
      code: 'missing-descriptor',
      path: `${path}/observation/kind`,
      message: `No Behavior observation descriptor provides ${step.observation.target.capability}.`,
      stepId: step.id,
    });
    return dependencies;
  }
  if (descriptor.descriptor.determinism === 'unsupported') {
    state.issues.push({
      code: 'unsupported-descriptor',
      path: `${path}/observation/kind`,
      message: `Behavior observation ${descriptor.descriptor.kind} is unsupported.`,
      stepId: step.id,
    });
    return dependencies;
  }
  const resolved = resolveTarget(
    input,
    state,
    step.id,
    `${path}/observation/target`,
    step.observation.target,
    step.source
  );
  if (!resolved) return dependencies;
  addCapability(state, descriptor);
  const instructionId = addInstruction(
    state,
    {
      stepId: step.id,
      dependencyInstructionIds: sortedUnique(dependencies),
      operation: `observe:${descriptor.descriptor.kind}`,
      capabilityId: descriptor.descriptor.kind,
      targetId: resolved.programTargetId,
    },
    resolved.source
  );
  const assertions = Object.freeze([...step.assertions]);
  state.observations.push({
    stepId: step.id,
    kind: step.observation.kind,
    targetId: resolved.programTargetId,
    ...(step.observation.expected !== undefined
      ? { expected: step.observation.expected }
      : {}),
    assertionIds: Object.freeze(assertions.map(({ id }) => id)),
    assertions,
    automatonDigest: digestBehaviorValue({
      kind: step.observation.kind,
      targetId: resolved.programTargetId,
      expected: step.observation.expected,
      assertions,
    }),
  });
  return Object.freeze([instructionId]);
};

const compileStepList = (
  input: CompileBehaviorScenarioInput,
  state: CompilerState,
  steps: readonly BehaviorStep[],
  initialDependencies: readonly string[],
  path: string,
  startIndex = 0
): readonly string[] => {
  let dependencies = initialDependencies;
  steps.forEach((step, index) => {
    const stepPath = `${path}/${startIndex + index}`;
    if (step.kind === 'action') {
      const descriptor = input.registry.get('action', step.action.capabilityId);
      if (!descriptor) {
        state.issues.push({
          code: 'missing-descriptor',
          path: `${stepPath}/action/capabilityId`,
          message: `Unknown Behavior action descriptor: ${step.action.capabilityId}.`,
          stepId: step.id,
        });
        return;
      }
      if (descriptor.descriptor.determinism === 'unsupported') {
        state.issues.push({
          code: 'unsupported-descriptor',
          path: `${stepPath}/action/capabilityId`,
          message: `Behavior action ${step.action.capabilityId} is unsupported.`,
          stepId: step.id,
        });
        return;
      }
      if (
        descriptor.descriptor.targetCapability !==
          step.action.target.capability ||
        !descriptor.descriptor.runtimeZones.includes(step.action.runtimeZone) ||
        descriptor.descriptor.effect !== step.action.effect ||
        descriptor.descriptor.cancellation !== step.action.cancellation
      ) {
        state.issues.push({
          code: 'target-incompatible',
          path: `${stepPath}/action`,
          message: `Behavior action ${step.action.capabilityId} does not match its registered capability contract.`,
          stepId: step.id,
        });
        return;
      }
      const resolved = resolveTarget(
        input,
        state,
        step.id,
        `${stepPath}/action/target`,
        step.action.target,
        step.source
      );
      if (!resolved) return;
      addCapability(state, descriptor);
      const instructionId = addInstruction(
        state,
        {
          stepId: step.id,
          dependencyInstructionIds: sortedUnique(dependencies),
          operation: step.action.kind,
          capabilityId: step.action.capabilityId,
          targetId: resolved.programTargetId,
          ...(step.action.input !== undefined
            ? { input: step.action.input }
            : {}),
        },
        resolved.source
      );
      state.terminalInstructionIdsByStep.set(
        step.id,
        Object.freeze([instructionId])
      );
      dependencies = Object.freeze([instructionId]);
      return;
    }
    if (step.kind === 'observation') {
      dependencies = compileObservation(
        input,
        state,
        step,
        dependencies,
        stepPath
      );
      state.terminalInstructionIdsByStep.set(step.id, dependencies);
      return;
    }
    if (step.kind === 'parallel') {
      if (!step.steps.length) {
        state.issues.push({
          code: 'invalid-control-flow',
          path: `${stepPath}/steps`,
          message: 'Behavior parallel steps require at least one branch.',
          stepId: step.id,
        });
        return;
      }
      const branchDependencies = step.steps.flatMap((branch, branchIndex) =>
        compileStepList(
          input,
          state,
          Object.freeze([branch]),
          dependencies,
          `${stepPath}/steps`,
          branchIndex
        )
      );
      dependencies = sortedUnique(branchDependencies);
      state.terminalInstructionIdsByStep.set(step.id, dependencies);
      return;
    }
    if (step.kind === 'barrier') {
      const participantDependencies = step.participantStepIds.flatMap(
        (participantStepId) =>
          state.terminalInstructionIdsByStep.get(participantStepId) ?? []
      );
      const missingParticipant = step.participantStepIds.find(
        (participantStepId) =>
          !state.terminalInstructionIdsByStep.has(participantStepId)
      );
      if (missingParticipant || !participantDependencies.length) {
        state.issues.push({
          code: 'invalid-control-flow',
          path: `${stepPath}/participantStepIds`,
          message: missingParticipant
            ? `Behavior barrier references an unavailable prior step: ${missingParticipant}.`
            : 'Behavior barrier requires at least one participant.',
          stepId: step.id,
        });
        return;
      }
      const barrierDependencies = sortedUnique(participantDependencies);
      if (step.observation) {
        dependencies = compileObservation(
          input,
          state,
          Object.freeze({
            id: step.id,
            kind: 'observation',
            failureMode: step.failureMode,
            ...(step.label ? { label: step.label } : {}),
            ...(step.source ? { source: step.source } : {}),
            observation: step.observation,
            assertions: Object.freeze([]),
          }),
          barrierDependencies,
          stepPath
        );
      } else {
        const source =
          step.source ??
          Object.freeze({
            workspaceDocumentId: input.scenarioDocumentId,
            path: `${stepPath}`,
          });
        dependencies = Object.freeze([
          addInstruction(
            state,
            {
              stepId: step.id,
              dependencyInstructionIds: barrierDependencies,
              operation: 'barrier',
            },
            source
          ),
        ]);
      }
      state.terminalInstructionIdsByStep.set(step.id, dependencies);
      return;
    }
  });
  return dependencies;
};

/**
 * Lowers a revision-bound Scenario into an immutable provider-neutral Program.
 * All required descriptors and targets are resolved before any Program exists.
 */
export const compileBehaviorScenario = (
  input: CompileBehaviorScenarioInput
): CompileBehaviorScenarioResult => {
  const issues: BehaviorCompileIssue[] = [];
  if (
    !Number.isSafeInteger(input.workspaceRevision) ||
    input.workspaceRevision < 0 ||
    input.semanticIndex.snapshotIdentity.workspaceRevisions.workspaceRev !==
      input.workspaceRevision
  ) {
    issues.push({
      code: 'invalid-revision',
      path: '/workspaceRevision',
      message:
        'Behavior compilation requires the exact Semantic Index revision.',
    });
  }
  const fixtureSetDigests = input.fixtureSetDigests ?? [];
  if (
    fixtureSetDigests.length !== input.scenario.fixtureRefs.length ||
    fixtureSetDigests.some((digest) => !isDigest(digest))
  ) {
    issues.push({
      code: 'fixture-digest-missing',
      path: '/fixtureRefs',
      message: 'Every Behavior fixture reference requires an exact digest.',
    });
  }
  const baselineSetDigests = input.baselineSetDigests ?? [];
  if (
    baselineSetDigests.length !== input.scenario.baselineRefs.length ||
    baselineSetDigests.some((digest) => !isDigest(digest))
  ) {
    issues.push({
      code: 'baseline-digest-missing',
      path: '/baselineRefs',
      message: 'Every Behavior baseline reference requires an exact digest.',
    });
  }
  const controlProfileDigest =
    input.controlProfileDigest ??
    ('digest' in input.scenario.controlProfileRef
      ? input.scenario.controlProfileRef.digest
      : undefined);
  if (!isDigest(controlProfileDigest)) {
    issues.push({
      code: 'control-profile-digest-missing',
      path: '/controlProfileRef',
      message: 'Behavior compilation requires an exact control profile digest.',
    });
  }

  const triggerKind = `${input.scenario.entry.domain}.${input.scenario.entry.event}`;
  const triggerDescriptor =
    input.registry.get('trigger', triggerKind) ??
    input.registry.get('trigger', input.scenario.entry.event);
  if (!triggerDescriptor) {
    issues.push({
      code: 'missing-descriptor',
      path: '/entry/event',
      message: `Unknown Behavior trigger descriptor: ${triggerKind}.`,
    });
  } else if (triggerDescriptor.descriptor.determinism === 'unsupported') {
    issues.push({
      code: 'unsupported-descriptor',
      path: '/entry/event',
      message: `Behavior trigger ${triggerKind} is unsupported.`,
    });
  }
  if (issues.length) {
    return Object.freeze({ status: 'blocked', issues: Object.freeze(issues) });
  }

  const state: CompilerState = {
    issues,
    instructions: [],
    observations: [],
    sourceTrace: [],
    targetManifest: new Map(),
    capabilities: new Map(),
    relocations: [],
    terminalInstructionIdsByStep: new Map(),
  };
  let triggerSource: BehaviorSourceRef = Object.freeze({
    workspaceDocumentId: input.scenarioDocumentId,
    path: '/entry',
  });
  let triggerTargetId: string | undefined;
  if (input.scenario.entry.target) {
    if (
      triggerDescriptor!.descriptor.targetCapability !==
      input.scenario.entry.target.capability
    ) {
      state.issues.push({
        code: 'target-incompatible',
        path: '/entry/target',
        message: `Behavior trigger ${triggerKind} does not match its registered target capability.`,
        stepId: input.scenario.entry.id,
      });
    } else {
      const resolved = resolveTarget(
        input,
        state,
        input.scenario.entry.id,
        '/entry/target',
        input.scenario.entry.target
      );
      if (resolved) {
        triggerSource = resolved.source;
        triggerTargetId = resolved.programTargetId;
      }
    }
  } else if (
    triggerDescriptor!.descriptor.targetCapability !==
    'behavior:scenario:manual'
  ) {
    state.issues.push({
      code: 'target-missing',
      path: '/entry/target',
      message: `Behavior trigger ${triggerKind} requires a semantic target.`,
      stepId: input.scenario.entry.id,
    });
  }
  if (state.issues.length) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze(state.issues),
    });
  }
  addCapability(state, triggerDescriptor!);
  const triggerId = addInstruction(
    state,
    {
      stepId: input.scenario.entry.id,
      dependencyInstructionIds: Object.freeze([]),
      operation: `trigger:${triggerDescriptor!.descriptor.kind}`,
      capabilityId: triggerDescriptor!.descriptor.kind,
      ...(triggerTargetId ? { targetId: triggerTargetId } : {}),
    },
    triggerSource
  );
  state.terminalInstructionIdsByStep.set(
    input.scenario.entry.id,
    Object.freeze([triggerId])
  );
  compileStepList(
    input,
    state,
    input.scenario.steps,
    Object.freeze([triggerId]),
    '/steps'
  );
  if (state.issues.length) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze(state.issues),
    });
  }

  const capabilities = [...state.capabilities.values()].sort((left, right) =>
    compareUnicodeCodePoints(
      `${left.category}:${left.descriptor.kind}`,
      `${right.category}:${right.descriptor.kind}`
    )
  );
  const capabilityManifest = Object.freeze(
    capabilities.map(({ descriptor }) =>
      Object.freeze({
        capabilityId: descriptor.kind,
        descriptorKind: descriptor.kind,
        targetCapability: descriptor.targetCapability,
        owner: descriptor.owner,
        runtimeZones: Object.freeze([...descriptor.runtimeZones]),
        effect: descriptor.effect,
        cancellation: descriptor.cancellation,
      })
    )
  );
  const targetManifest = Object.freeze(
    [...state.targetManifest.values()].sort((left, right) =>
      compareUnicodeCodePoints(
        `${left.targetId}:${left.capability}`,
        `${right.targetId}:${right.capability}`
      )
    )
  );
  const scenarioDigest = digestBehaviorValue(input.scenario);
  const semanticSnapshotDigest = digestBehaviorValue(
    input.semanticIndex.snapshotIdentity
  );
  const programWithoutDigest = {
    scenarioId: input.scenario.id,
    scenarioDigest,
    workspaceRevision: input.workspaceRevision,
    semanticSnapshotDigest,
    executableSnapshotDigest: input.executableSnapshotDigest,
    compilerDigest: input.compilerDigest,
    registryDigest: input.registry.digest,
    controlProfileDigest: controlProfileDigest!,
    fixtureSetDigests: Object.freeze([...fixtureSetDigests]),
    baselineSetDigests: Object.freeze([...baselineSetDigests]),
    requiredCapabilities: Object.freeze(
      capabilityManifest.map(({ capabilityId }) => capabilityId)
    ),
    capabilityManifest,
    targetManifest,
    instructions: Object.freeze(
      state.instructions.map((instruction) => Object.freeze(instruction))
    ),
    observations: Object.freeze(
      state.observations.map((observation) => Object.freeze(observation))
    ),
    sourceTrace: Object.freeze(
      state.sourceTrace.map((trace) => Object.freeze(trace))
    ),
    budgets: input.scenario.timeoutPolicy,
  };
  const program: BehaviorScenarioProgram = Object.freeze({
    ...programWithoutDigest,
    programDigest: digestBehaviorValue(programWithoutDigest),
  });
  return Object.freeze({
    status: 'ready',
    program,
    relocations: Object.freeze(
      state.relocations
        .sort((left, right) =>
          compareUnicodeCodePoints(left.stepId, right.stepId)
        )
        .map((relocation) => Object.freeze(relocation))
    ),
  });
};
