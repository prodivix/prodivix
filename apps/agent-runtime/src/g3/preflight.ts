import {
  decodeVerificationPlan,
  type VerificationPlan,
} from '@prodivix/verification';
import {
  validateWorkspaceSnapshot,
  workspaceVerificationPartitionRevisions,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  exactDriverRecord,
  decodeDriverAuthority,
  driverIdentity,
} from '#src/g3/contract.js';
import { assertDriverPlan } from '#src/g3/registry.js';
import { compileDriverSnapshot } from '#src/g3/staticAttempt.js';
import { compileDriverScenario } from '#src/g3/scenario.js';
import {
  readDriverControls,
  readDriverBrowserProfile,
  readDriverBaseline,
} from '#src/g3/material.js';
import type { G3DriverConfiguration } from '#src/g3/config.js';

export const decodeDriverPreflight = (
  value: unknown
): Readonly<{
  workspace: WorkspaceSnapshot;
  plan: VerificationPlan;
  wire: Record<string, unknown>;
}> => {
  const wire = exactDriverRecord(value, [
    'contract',
    'taskId',
    'agentRunId',
    'authority',
    'workspace',
    'plan',
  ]);
  const plan = decodeVerificationPlan(wire.plan);
  if (
    wire.contract !== 'prodivix.agent-runtime-g3-preflight' ||
    !plan.ok ||
    !isPlainObject(wire.workspace) ||
    !validateWorkspaceSnapshot(wire.workspace as unknown as WorkspaceSnapshot)
      .valid
  )
    throw new Error('G3 preflight inputs are invalid.');
  driverIdentity(wire.taskId);
  driverIdentity(wire.agentRunId);
  decodeDriverAuthority(wire.authority);
  const workspace = wire.workspace as WorkspaceSnapshot;
  if (
    workspace.id !== plan.value.workspaceId ||
    workspace.workspaceRev !== plan.value.targetRevision
  )
    throw new Error('G3 preflight target differs from the Plan.');
  return { workspace, plan: plan.value, wire };
};
export const inspectDriverMaterials = (
  config: G3DriverConfiguration,
  workspace: WorkspaceSnapshot,
  plan: VerificationPlan
): void => {
  assertDriverPlan(config, plan);
  if (
    workspace.id !== plan.workspaceId ||
    workspace.workspaceRev !== plan.targetRevision ||
    !sameCanonicalJson(
      workspaceVerificationPartitionRevisions(workspace),
      plan.targetPartitionRevisions
    )
  )
    throw new Error('G3 Plan differs from its exact Workspace partitions.');
  for (const cell of plan.cells) {
    if (cell.requirement !== 'required') continue;
    const controls = readDriverControls(workspace, cell);
    const snapshot = compileDriverSnapshot({ workspace }, cell);
    const scenario = compileDriverScenario(
      workspace,
      cell,
      snapshot.contentDigest
    );
    if (
      ['e2e', 'visual', 'accessibility', 'performance', 'security'].includes(
        cell.checkKind
      )
    ) {
      if (!config.chromium || cell.browserEngine !== 'chromium' || !scenario)
        throw new Error('G3 Browser resources or Scenario are unavailable.');
      readDriverBrowserProfile(workspace, cell);
      const baseline = readDriverBaseline(workspace, cell);
      if (cell.checkKind === 'visual' && !baseline)
        throw new Error('G3 visual check has no canonical baseline.');
      if (
        controls.fixtures.length &&
        (controls.fixtures.length !== 1 ||
          controls.fixtures[0]!.fixtures.some(
            (fixture) =>
              fixture.target.kind !== 'auth-session' ||
              fixture.outcome.kind !== 'result'
          ))
      )
        throw new Error(
          'G3 Browser fixture transport requires adopted auth-session result material.'
        );
    }
  }
};
