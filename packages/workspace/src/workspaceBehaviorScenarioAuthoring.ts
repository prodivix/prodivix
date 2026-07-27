import {
  adoptBehaviorRecorderDraft,
  resolveBehaviorSemanticTarget,
  type BehaviorRecorderDraft,
  type BehaviorScenario,
  type BehaviorSemanticIndexView,
  type BehaviorStep,
  type BehaviorTargetResolution,
  type BehaviorTrigger,
} from '@prodivix/behavior';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type { WorkspaceOperation } from './workspaceOperation';
import type { WorkspaceSnapshot } from './types';
import {
  createWorkspaceBehaviorVerificationDocumentCommand,
  createWorkspaceBehaviorVerificationDocumentUpdateCommand,
  createWorkspaceBehaviorVerificationTransaction,
  selectWorkspaceBehaviorVerificationDocument,
} from './workspaceBehaviorVerificationDocument';

export type WorkspaceBehaviorScenarioMutation =
  | Readonly<{ kind: 'rename'; name: string }>
  | Readonly<{ kind: 'set-entry'; entry: BehaviorTrigger }>
  | Readonly<{ kind: 'insert-step'; index: number; step: BehaviorStep }>
  | Readonly<{ kind: 'update-step'; stepId: string; step: BehaviorStep }>
  | Readonly<{ kind: 'move-step'; stepId: string; index: number }>
  | Readonly<{ kind: 'remove-step'; stepId: string }>
  | Readonly<{ kind: 'replace-scenario'; scenario: BehaviorScenario }>
  | Readonly<{
      kind: 'adopt-recorder';
      draft: BehaviorRecorderDraft;
      selectedEventIds: readonly string[];
    }>;

export type WorkspaceBehaviorScenarioImpactPreview = Readonly<{
  addedStepIds: readonly string[];
  updatedStepIds: readonly string[];
  removedStepIds: readonly string[];
  targetResolutions: readonly Readonly<{
    stepId: string;
    status: BehaviorTargetResolution['status'];
  }>[];
}>;

export type WorkspaceBehaviorScenarioAuthoringPlan = Readonly<{
  before: BehaviorScenario;
  after: BehaviorScenario;
  operation: WorkspaceOperation;
  impact: WorkspaceBehaviorScenarioImpactPreview;
}>;

export type WorkspaceBehaviorScenarioAuthoringResult =
  | Readonly<{ status: 'ready'; plan: WorkspaceBehaviorScenarioAuthoringPlan }>
  | Readonly<{
      status: 'blocked';
      reason:
        | 'revision-conflict'
        | 'scenario-missing'
        | 'invalid-mutation'
        | 'recorder-unresolved';
    }>;

const nestedSteps = (steps: readonly BehaviorStep[]): readonly BehaviorStep[] =>
  steps.flatMap((step) =>
    step.kind === 'parallel' ? [step, ...nestedSteps(step.steps)] : [step]
  );

const stepMap = (
  scenario: BehaviorScenario
): ReadonlyMap<string, BehaviorStep> =>
  new Map(nestedSteps(scenario.steps).map((step) => [step.id, step]));

const applyMutation = (
  scenario: BehaviorScenario,
  mutation: Exclude<
    WorkspaceBehaviorScenarioMutation,
    { kind: 'adopt-recorder' }
  >
): BehaviorScenario | null => {
  if (mutation.kind === 'rename') {
    const name = mutation.name.trim();
    return name ? Object.freeze({ ...scenario, name }) : null;
  }
  if (mutation.kind === 'set-entry') {
    return mutation.entry.id === scenario.entry.id
      ? Object.freeze({ ...scenario, entry: mutation.entry })
      : null;
  }
  if (mutation.kind === 'replace-scenario') {
    return mutation.scenario.id === scenario.id ? mutation.scenario : null;
  }
  const steps = [...scenario.steps];
  if (mutation.kind === 'insert-step') {
    if (
      mutation.index < 0 ||
      mutation.index > steps.length ||
      stepMap(scenario).has(mutation.step.id)
    ) {
      return null;
    }
    steps.splice(mutation.index, 0, mutation.step);
  } else {
    const currentIndex = steps.findIndex(({ id }) => id === mutation.stepId);
    if (currentIndex < 0) return null;
    if (mutation.kind === 'update-step') {
      if (mutation.step.id !== mutation.stepId) return null;
      steps[currentIndex] = mutation.step;
    } else if (mutation.kind === 'move-step') {
      if (mutation.index < 0 || mutation.index >= steps.length) return null;
      const [step] = steps.splice(currentIndex, 1);
      steps.splice(mutation.index, 0, step!);
    } else {
      steps.splice(currentIndex, 1);
    }
  }
  return Object.freeze({ ...scenario, steps: Object.freeze(steps) });
};

const changedIds = (
  before: BehaviorScenario,
  after: BehaviorScenario
): Pick<
  WorkspaceBehaviorScenarioImpactPreview,
  'addedStepIds' | 'updatedStepIds' | 'removedStepIds'
> => {
  const beforeById = stepMap(before);
  const afterById = stepMap(after);
  const addedStepIds = [...afterById.keys()].filter(
    (id) => !beforeById.has(id)
  );
  const removedStepIds = [...beforeById.keys()].filter(
    (id) => !afterById.has(id)
  );
  const updatedStepIds = [...afterById.entries()]
    .filter(
      ([id, step]) =>
        beforeById.has(id) && !sameCanonicalJson(beforeById.get(id), step)
    )
    .map(([id]) => id);
  return {
    addedStepIds: Object.freeze(addedStepIds.sort(compareUnicodeCodePoints)),
    updatedStepIds: Object.freeze(
      updatedStepIds.sort(compareUnicodeCodePoints)
    ),
    removedStepIds: Object.freeze(
      removedStepIds.sort(compareUnicodeCodePoints)
    ),
  };
};

const targetResolutions = (
  scenario: BehaviorScenario,
  index?: BehaviorSemanticIndexView
): WorkspaceBehaviorScenarioImpactPreview['targetResolutions'] => {
  if (!index) return Object.freeze([]);
  const entry = scenario.entry.target
    ? [
        Object.freeze({
          stepId: scenario.entry.id,
          status: resolveBehaviorSemanticTarget({
            target: scenario.entry.target,
            index,
          }).status,
        }),
      ]
    : [];
  return Object.freeze(
    [
      ...entry,
      ...nestedSteps(scenario.steps).flatMap((step) => {
        const target =
          step.kind === 'action'
            ? step.action.target
            : step.kind === 'observation'
              ? step.observation.target
              : step.kind === 'barrier'
                ? step.observation?.target
                : undefined;
        if (!target) return [];
        return [
          Object.freeze({
            stepId: step.id,
            status: resolveBehaviorSemanticTarget({
              target,
              index,
              authoredSource: step.source,
            }).status,
          }),
        ];
      }),
    ].sort((left, right) => compareUnicodeCodePoints(left.stepId, right.stepId))
  );
};

export const createWorkspaceBehaviorScenario = (
  id: string,
  name: string,
  controlProfileDigest: string,
  initialStep: BehaviorStep
): BehaviorScenario =>
  Object.freeze({
    id,
    name: name.trim() || 'Untitled scenario',
    criticality: 'standard',
    tags: Object.freeze([]),
    entry: Object.freeze({
      id: 'entry',
      domain: 'scenario',
      event: 'manual',
    }),
    steps: Object.freeze([initialStep]),
    fixtureRefs: Object.freeze([]),
    controlProfileRef: Object.freeze({
      kind: 'preset',
      presetId: 'deterministic-default',
      digest: controlProfileDigest,
    }),
    baselineRefs: Object.freeze([]),
    timeoutPolicy: Object.freeze({
      totalMs: 30_000,
      stepMs: 5_000,
      settleMs: 1_000,
    }),
  });

export const createWorkspaceBehaviorScenarioCreatePlan = (
  input: Readonly<{
    workspace: WorkspaceSnapshot;
    scenario: BehaviorScenario;
    path: string;
    commandId: string;
    issuedAt: string;
  }>
): WorkspaceOperation | null => {
  const command = createWorkspaceBehaviorVerificationDocumentCommand({
    workspace: input.workspace,
    type: 'behavior-scenario',
    documentId: input.scenario.id,
    name: input.scenario.name,
    path: input.path,
    content: input.scenario,
    commandId: input.commandId,
    issuedAt: input.issuedAt,
    label: 'Create Behavior Scenario',
  });
  return command ? Object.freeze({ kind: 'command', command }) : null;
};

/**
 * Plans one reversible Scenario edit. Recorder adoption is always wrapped in
 * one transaction so review cannot leak partial Workspace changes.
 */
export const createWorkspaceBehaviorScenarioAuthoringPlan = (
  input: Readonly<{
    workspace: WorkspaceSnapshot;
    expectedWorkspaceRevision: number;
    documentId: string;
    mutation: WorkspaceBehaviorScenarioMutation;
    commandId: string;
    transactionId?: string;
    issuedAt: string;
    semanticIndex?: BehaviorSemanticIndexView;
  }>
): WorkspaceBehaviorScenarioAuthoringResult => {
  if (input.workspace.workspaceRev !== input.expectedWorkspaceRevision) {
    return Object.freeze({
      status: 'blocked',
      reason: 'revision-conflict',
    });
  }
  const read = selectWorkspaceBehaviorVerificationDocument(
    input.workspace,
    input.documentId,
    'behavior-scenario'
  );
  if (read?.status !== 'valid') {
    return Object.freeze({ status: 'blocked', reason: 'scenario-missing' });
  }
  const before = read.decodedContent;
  let after: BehaviorScenario | null;
  if (input.mutation.kind === 'adopt-recorder') {
    const adoption = adoptBehaviorRecorderDraft({
      draft: input.mutation.draft,
      scenario: before,
      workspaceRevision: input.workspace.workspaceRev,
      selectedEventIds: input.mutation.selectedEventIds,
    });
    if (adoption.status !== 'ready') {
      return Object.freeze({
        status: 'blocked',
        reason:
          adoption.status === 'blocked' && adoption.reason === 'revision-drift'
            ? 'revision-conflict'
            : 'recorder-unresolved',
      });
    }
    after = adoption.scenario;
  } else {
    after = applyMutation(before, input.mutation);
  }
  if (!after) {
    return Object.freeze({ status: 'blocked', reason: 'invalid-mutation' });
  }
  const resolutions = targetResolutions(after, input.semanticIndex);
  if (
    input.mutation.kind === 'adopt-recorder' &&
    (!input.semanticIndex ||
      resolutions.some(
        ({ status }) => status !== 'exact' && status !== 'relocated'
      ))
  ) {
    return Object.freeze({
      status: 'blocked',
      reason: 'recorder-unresolved',
    });
  }
  const command = createWorkspaceBehaviorVerificationDocumentUpdateCommand({
    workspace: input.workspace,
    documentId: input.documentId,
    type: 'behavior-scenario',
    after,
    commandId: input.commandId,
    issuedAt: input.issuedAt,
    label:
      input.mutation.kind === 'adopt-recorder'
        ? 'Adopt Behavior Recorder Draft'
        : 'Update Behavior Scenario',
  });
  if (!command) {
    return Object.freeze({ status: 'blocked', reason: 'invalid-mutation' });
  }
  let operation: WorkspaceOperation = Object.freeze({
    kind: 'command',
    command,
  });
  if (input.mutation.kind === 'adopt-recorder') {
    const transaction = createWorkspaceBehaviorVerificationTransaction(
      input.workspace.id,
      input.transactionId ?? `${input.commandId}:transaction`,
      input.issuedAt,
      [command],
      'Adopt Behavior Recorder Draft'
    );
    if (!transaction) {
      return Object.freeze({ status: 'blocked', reason: 'invalid-mutation' });
    }
    operation = Object.freeze({ kind: 'transaction', transaction });
  }
  return Object.freeze({
    status: 'ready',
    plan: Object.freeze({
      before,
      after,
      operation,
      impact: Object.freeze({
        ...changedIds(before, after),
        targetResolutions: resolutions,
      }),
    }),
  });
};
