import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  planAgentModelEvaluationAttempts,
  type AgentEvaluationCaseMaterial,
} from '@prodivix/ai';
import {
  digestVerificationValue,
  type VerificationPlanCell,
} from '@prodivix/verification';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY } from './controlledWorkspaceG3CellAdapter';
import { createProductionControlledWorkspaceTransactionG3Authority } from './productionControlledWorkspaceG3EnvironmentAuthority';
import type { CreateProductionControlledWorkspaceG3SandboxPortInput } from './productionControlledWorkspaceG3SandboxPort';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';

const mocked = vi.hoisted(() => ({
  sandboxInput: undefined as
    CreateProductionControlledWorkspaceG3SandboxPortInput | undefined,
  evaluate: vi.fn(),
}));
vi.mock('./productionControlledWorkspaceG3SandboxPort', async (original) => ({
  ...(await original<
    typeof import('./productionControlledWorkspaceG3SandboxPort')
  >()),
  createProductionAgentEvaluationControlledWorkspaceG3SandboxPort: (
    input: CreateProductionControlledWorkspaceG3SandboxPortInput
  ) => {
    mocked.sandboxInput = input;
    return {};
  },
}));
vi.mock('./controlledWorkspaceG3CellRuntime', () => ({
  createProductionAgentEvaluationControlledWorkspaceG3CellRuntimeAuthority:
    () => ({}),
}));
vi.mock('./controlledWorkspaceRuntimeProduction', () => ({
  createProductionAgentEvaluationControlledWorkspaceG3Authority: () => ({}),
}));
vi.mock('./controlledWorkspaceRuntimeOwners', () => ({
  evaluateAgentEvaluationControlledWorkspaceG3: mocked.evaluate,
}));

describe('production G3 environment material and profile composition', () => {
  beforeEach(() => {
    mocked.evaluate.mockReset();
    mocked.sandboxInput = undefined;
  });

  it('resolves the compiled browser cell by its material receipt while preserving the outer-cell promotion index', async () => {
    const document = materializeAgentEvaluationTestProductionRunConfig(
      JSON.parse(
        readFileSync(
          new URL(
            '../../../specs/evaluation/g4-real-model-evaluation.example.json',
            import.meta.url
          ),
          'utf8'
        )
      )
    );
    const commit = '0123456789abcdef0123456789abcdef01234567';
    const config = requireProductionAgentEvaluationFrozenRunConfig(
      decodeAgentEvaluationFrozenRunConfig(document, {
        clock: () => '2026-08-08T00:00:00.000Z',
        expectedRepositoryCommit: commit,
      }),
      commit
    );
    const materials = getG4V8PublicEvaluationCaseMaterials();
    const material = materials.find((entry) =>
      entry.invocation.blocks.some(
        (block) =>
          block.kind === 'workspace-fixture' &&
          block.fixture.expectedOutcome.proposal.status === 'ready' &&
          block.fixture.verificationFixture.scenarios.length > 0
      )
    )!;
    const block = material.invocation.blocks.find(
      (entry) => entry.kind === 'workspace-fixture'
    );
    if (block?.kind !== 'workspace-fixture')
      throw new Error('missing workspace fixture');
    const fixture = block.fixture;
    const descriptor = planAgentModelEvaluationAttempts(config.plan).find(
      (entry) => entry.caseId === material.caseId
    )!;
    const scenario = fixture.verificationFixture.scenarios[0] as {
      id: string;
      targetIds: readonly string[];
      controlProfileRef: VerificationPlanCell['controlProfileRef'];
    };
    const workspace = fixture.workspaceSnapshot;
    const executableSnapshotDigest = digestAgentCanonicalValue('executable');
    const outerCell = {
      id: 'cell:outer:production-composition',
      checkId: 'check:outer',
      checkKind: 'integration',
      scenarioId: scenario.id,
      targetId: scenario.targetIds[0],
      frameworkTarget: 'react-vite',
      surface: 'preview',
      browserEngine: 'chromium',
      viewport: { id: 'desktop', width: 1280, height: 720 },
      colorScheme: 'light',
      motion: 'reduced',
      locale: 'en-US',
      controlProfileRef: scenario.controlProfileRef,
      adapter: AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY,
      evidenceRequirements: {
        acceptedTrust: ['ci-attested'],
        maximumAgeMs: 60_000,
        requireAttestation: true,
        requireCompatibleIdentity: true,
        requiredArtifactKinds: ['replay-record'],
      },
      estimatedCost: {
        durationMs: 60_000,
        artifactBytes: 1_048_576,
        computeUnits: 1,
      },
    } as unknown as VerificationPlanCell;
    mocked.evaluate.mockImplementation(async () => {
      const input = mocked.sandboxInput!;
      const authorityInputDigest = digestAgentCanonicalValue('authority-input');
      await input.snapshotSource.readFinalWorkspaceSnapshot({
        authorityInputDigest,
        evaluationPlanDigest: config.plan.planDigest,
        repositoryCommit: commit,
        projectId: workspace.id,
        caseId: material.caseId,
        attemptId: descriptor.attemptId,
        generation: 1,
        finalSnapshotRef: 'snapshot.final',
        expectedSnapshotDigest: digestAgentCanonicalValue(workspace),
        expectedRevision: workspace.workspaceRev,
      });
      const compiled = await input.verificationSource.readBrowserRunMaterial({
        authorityInputDigest,
        evaluationPlanDigest: config.plan.planDigest,
        repositoryCommit: commit,
        projectId: workspace.id,
        generation: 1,
        caseId: material.caseId,
        attemptId: descriptor.attemptId,
        finalWorkspaceSnapshotDigest: digestAgentCanonicalValue(workspace),
        finalRevision: workspace.workspaceRev,
        outerCell,
        executableSnapshotDigest,
        executableSnapshotArtifactDigest: executableSnapshotDigest,
      });
      expect(compiled.cell.id).not.toBe(outerCell.id);
      const profileRequest = {
        materialReceiptDigest: compiled.receiptDigest,
        browserAttemptId: 'browser-attempt',
        generation: 1,
        cell: compiled.cell,
        executableSnapshotDigest,
        targetLeaseBindingDigest: digestVerificationValue('target-lease'),
        runtimeEnvironmentDigest: digestVerificationValue(
          'runtime-environment'
        ),
        controlCapabilitySnapshotDigest:
          digestVerificationValue('control-capability'),
        appliedControlDigest: digestVerificationValue('applied-control'),
      };
      const resolved =
        await input.verificationSource.readBrowserVerificationProfile(
          profileRequest
        );
      expect(resolved.profile.cellId).toBe(compiled.cell.id);
      expect(resolved.profile.scenarioProgramDigest).toBe(
        compiled.program.programDigest
      );
      await expect(
        input.verificationSource.readBrowserVerificationProfile({
          ...profileRequest,
          cell: { ...compiled.cell, id: outerCell.id },
        })
      ).rejects.toThrow('browser-profile-binding');
      return { status: 'tested' };
    });
    const authority = createProductionControlledWorkspaceTransactionG3Authority(
      {
        namespaceId: 'namespace.production-composition',
        config,
        repositoryRoot: resolve('.'),
        materialSource: {
          use: async (
            _request: unknown,
            consumer: (value: AgentEvaluationCaseMaterial) => Promise<unknown>
          ) => consumer(material),
        },
        previewAuthority: { reserve: async () => undefined },
        browserAuthority: { register: async () => undefined },
        evidenceBridge: { promoteCell: async () => undefined },
        attestationAuthority: { signAttestation: async () => undefined },
        verificationAttemptGrantIssuer: { issue: async () => undefined },
        forbiddenCanaries: () => [],
      } as never
    );
    await expect(
      authority.evaluate({
        namespaceId: 'namespace.production-composition',
        evaluationPlanDigest: config.plan.planDigest,
        repositoryCommit: commit,
        caseId: material.caseId,
        descriptorDigest: descriptor.descriptorDigest,
        capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
        materialDigest: material.materialDigest,
        isolationPolicyDigest: config.controlledRuntime.isolationPolicyDigest,
        fixture,
        finalWorkspace: workspace,
        finalSnapshotRef: 'snapshot.final',
        grant: {
          attemptId: descriptor.attemptId,
          descriptorDigest: descriptor.descriptorDigest,
          materialDigest: material.materialDigest,
          generation: 1,
        },
        operationReceiptDigests: [],
        commandReceiptDigests: [],
        transactionReceiptDigests: [],
      } as never)
    ).resolves.toEqual({ status: 'tested' });
  });
});
