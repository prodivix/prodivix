import {
  BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
  createBehaviorRegistry,
  compileBehaviorScenario,
  isBehaviorScenario,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import { ANIMATION_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/animation';
import { DATA_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/data';
import { NODEGRAPH_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/nodegraph';
import { PIR_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/pir';
import { ROUTE_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/router';
import {
  createWorkspaceSemanticIndexFromSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  digestVerificationValue,
  type VerificationPlanCell,
} from '@prodivix/verification';

export const DRIVER_BEHAVIOR_COMPILER_DIGEST = digestVerificationValue({
  owner: '@prodivix/behavior',
  contract: 'compileBehaviorScenario',
  composition: 'ordinary-agent-current',
});
export const compileDriverScenario = (
  workspace: WorkspaceSnapshot,
  cell: VerificationPlanCell,
  snapshotDigest: string
):
  | Readonly<{
      program: BehaviorScenarioProgram;
      scenario: {
        id: string;
        revision: number;
        digest: string;
        programDigest: string;
      };
    }>
  | undefined => {
  if (!cell.scenarioId) return undefined;
  const documents = Object.values(workspace.docsById).filter(
    (document) =>
      document.type === 'behavior-scenario' &&
      isBehaviorScenario(document.content) &&
      document.content.id === cell.scenarioId
  );
  if (documents.length !== 1)
    throw new Error(
      'G3 Scenario must resolve exactly once in the canonical Workspace.'
    );
  const document = documents[0]!;
  if (!isBehaviorScenario(document.content))
    throw new Error('G3 Scenario is invalid.');
  const semantic = createWorkspaceSemanticIndexFromSnapshot(workspace);
  const registry = createBehaviorRegistry([
    BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
    PIR_BEHAVIOR_REGISTRY_CONTRIBUTION,
    DATA_BEHAVIOR_REGISTRY_CONTRIBUTION,
    ROUTE_BEHAVIOR_REGISTRY_CONTRIBUTION,
    NODEGRAPH_BEHAVIOR_REGISTRY_CONTRIBUTION,
    ANIMATION_BEHAVIOR_REGISTRY_CONTRIBUTION,
  ]);
  if (semantic.status !== 'ready' || !registry.ok)
    throw new Error('G3 Scenario owner composition is blocked.');
  const result = compileBehaviorScenario({
    scenario: document.content,
    scenarioDocumentId: document.id,
    workspaceRevision: workspace.workspaceRev,
    semanticIndex: semantic.index,
    executableSnapshotDigest: snapshotDigest,
    compilerDigest: DRIVER_BEHAVIOR_COMPILER_DIGEST,
    registry: registry.registry,
    controlProfileDigest: cell.controlProfileRef.digest,
    fixtureSetDigests: cell.fixtureSetRef?.digest
      ? [cell.fixtureSetRef.digest]
      : [],
    baselineSetDigests: cell.baselineSetRef?.digest
      ? [cell.baselineSetRef.digest]
      : [],
  });
  if (result.status !== 'ready')
    throw new Error('G3 Scenario compilation is blocked.');
  return {
    program: result.program,
    scenario: {
      id: document.content.id,
      revision: document.contentRev,
      digest: digestVerificationValue(document.content),
      programDigest: result.program.programDigest,
    },
  };
};
