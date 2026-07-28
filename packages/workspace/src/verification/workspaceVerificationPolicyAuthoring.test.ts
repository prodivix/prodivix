import { describe, expect, it } from 'vitest';
import type { VerificationPolicy } from '@prodivix/verification';
import {
  applyWorkspaceCommand,
  type WorkspaceCommandEnvelope,
} from '../workspaceCommand';
import type { WorkspaceSnapshot } from '../types';
import { createWorkspaceVerificationPolicyMutationCommand } from './workspaceVerificationPolicyAuthoring';

const controlProfileRef = {
  kind: 'workspace' as const,
  documentId: 'control:g3',
};

const policy: VerificationPolicy = {
  id: 'policy:g3',
  name: 'Initial policy',
  defaultRequirement: 'forbidden',
  rules: [
    {
      id: 'rule:e2e',
      requirement: 'required',
      checkKinds: ['e2e'],
      scenarioIds: [],
      scenarioTags: [],
      criticalities: [],
      impactedDomains: [],
      riskFlags: [],
      matrixProfileId: 'matrix:default',
      retryPolicyId: 'retry:default',
      evidenceTrust: 'ci-attested',
      controlProfileRef,
    },
  ],
  matrixProfiles: [
    {
      id: 'matrix:default',
      name: 'Default',
      matrix: {
        frameworkTargets: ['react-vite'],
        surfaces: ['ci'],
        browserEngines: ['chromium'],
        viewports: [{ id: 'desktop', width: 1280, height: 720 }],
        colorSchemes: ['light'],
        motions: ['reduced'],
        locales: ['en'],
      },
    },
  ],
  budgets: {
    maximumCells: 10,
    maximumCellsPerCheckKind: 10,
    maximumTargetExpansions: 2,
    maximumBrowserExpansions: 1,
    maximumClosureEvidenceRecords: 1000,
    totalMs: 10_000,
    artifactBytes: 1_000_000,
    estimatedComputeUnits: 10,
    parallelism: 2,
  },
  retryPolicies: [
    {
      id: 'retry:default',
      maximumAttempts: 1,
      retryableOutcomes: ['infrastructure-error'],
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    },
  ],
  exemptions: [],
  artifactCapture: {
    defaultCapture: 'allowed',
    targets: [],
  },
  comparison: {
    allowedMismatchFields: [],
  },
  evidenceRequirements: {
    acceptedTrust: ['ci-attested'],
    maximumAgeMs: 60_000,
    requireAttestation: true,
    requireCompatibleIdentity: true,
    requiredArtifactKinds: [],
  },
  baselinePolicy: {
    visual: 'required-when-observed',
    requireCompatibleIdentity: true,
  },
  retentionRequest: {
    successful: 'change',
    failed: 'release',
    protectReleaseEvidence: true,
  },
};

const workspace = (): WorkspaceSnapshot => ({
  id: 'workspace:g3',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['node:policy'],
    },
    'node:policy': {
      id: 'node:policy',
      kind: 'doc',
      name: 'policy.json',
      parentId: 'root',
      docId: policy.id,
    },
  },
  docsById: {
    [policy.id]: {
      id: policy.id,
      type: 'verification-policy',
      path: '/verification/policy.json',
      contentRev: 1,
      metaRev: 1,
      content: policy,
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route:root' },
  },
});

const reverseCommand = (
  command: WorkspaceCommandEnvelope
): WorkspaceCommandEnvelope => ({
  ...command,
  id: `${command.id}:reverse`,
  forwardOps: command.reverseOps,
  reverseOps: command.forwardOps,
});

describe('Workspace VerificationPolicy authoring', () => {
  it('emits one reversible core.verification Command', () => {
    const initial = workspace();
    const command = createWorkspaceVerificationPolicyMutationCommand({
      workspace: initial,
      documentId: policy.id,
      mutation: { kind: 'rename-policy', name: 'Release policy' },
      commandId: 'command:rename-policy',
      issuedAt: '2026-07-28T00:00:00.000Z',
    });
    expect(command).toMatchObject({
      namespace: 'core.verification',
      type: 'document.update',
      domainHint: 'verification',
    });
    if (!command) return;
    const applied = applyWorkspaceCommand(initial, command);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.snapshot.docsById[policy.id]?.content).toMatchObject({
      name: 'Release policy',
    });
    const undone = applyWorkspaceCommand(
      applied.snapshot,
      reverseCommand(command)
    );
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.snapshot.docsById[policy.id]?.content).toEqual(policy);
  });

  it('canonicalizes rules by stable id because array order has no semantics', () => {
    const command = createWorkspaceVerificationPolicyMutationCommand({
      workspace: workspace(),
      documentId: policy.id,
      mutation: {
        kind: 'add-rule',
        rule: {
          ...policy.rules[0]!,
          id: 'rule:accessibility',
          checkKinds: ['accessibility'],
        },
      },
      commandId: 'command:add-rule',
      issuedAt: '2026-07-28T00:00:00.000Z',
    });
    expect(command).not.toBeNull();
    if (!command) return;
    const applied = applyWorkspaceCommand(workspace(), command);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const content = applied.snapshot.docsById[policy.id]
      ?.content as VerificationPolicy;
    expect(content.rules.map((rule) => rule.id)).toEqual([
      'rule:accessibility',
      'rule:e2e',
    ]);
  });

  it('rejects duplicate ids and invalid referenced Policy state', () => {
    const duplicate = createWorkspaceVerificationPolicyMutationCommand({
      workspace: workspace(),
      documentId: policy.id,
      mutation: { kind: 'add-rule', rule: policy.rules[0]! },
      commandId: 'command:duplicate',
      issuedAt: '2026-07-28T00:00:00.000Z',
    });
    expect(duplicate).toBeNull();

    const invalid = createWorkspaceVerificationPolicyMutationCommand({
      workspace: workspace(),
      documentId: policy.id,
      mutation: {
        kind: 'remove-rule',
        ruleId: 'missing',
      },
      commandId: 'command:missing',
      issuedAt: '2026-07-28T00:00:00.000Z',
    });
    expect(invalid).toBeNull();
  });
});
