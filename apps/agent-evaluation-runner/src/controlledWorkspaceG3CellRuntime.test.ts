import {
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  planAgentModelEvaluationAttempts,
  type AgentEvaluationWorkspaceFixtureMaterial,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  computeVerificationArtifactContentDigest,
  createVerificationAdapterRegistrySnapshot,
  executeVerificationAdapterLifecycle,
  type VerificationAdapterStagedArtifactRef,
} from '@prodivix/verification';
import {
  createExecutableProjectSnapshot,
  decodeExecutableProjectSnapshotArtifact,
  encodeExecutableProjectSnapshotArtifact,
  EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST,
} from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { describe, expect, it } from 'vitest';
import { createV8EvaluationPlan } from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import {
  AGENT_EVALUATION_G3_SANDBOX_ADAPTER_REGISTRATION,
  AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_MEDIA_TYPE,
  AGENT_EVALUATION_G3_SANDBOX_REPLAY_MEDIA_TYPE,
  createAgentEvaluationControlledWorkspaceG3ReplayRecord,
  createAgentEvaluationControlledWorkspaceG3SandboxBinding,
  createAgentEvaluationControlledWorkspaceG3SandboxLease,
  type AgentEvaluationControlledWorkspaceG3ReplayRecord,
  type AgentEvaluationControlledWorkspaceG3SandboxBindInput,
  type AgentEvaluationControlledWorkspaceG3SandboxBinding,
  type AgentEvaluationControlledWorkspaceG3SandboxPort,
} from './controlledWorkspaceG3CellAdapter';
import { createProductionAgentEvaluationControlledWorkspaceG3CellRuntimeAuthority } from './controlledWorkspaceG3CellRuntime';
import {
  createAgentEvaluationControlledWorkspaceDomainPlan,
  evaluateAgentEvaluationControlledWorkspaceG3,
  type AgentEvaluationG3ExecutionEvidenceAuthorityInput,
} from './controlledWorkspaceRuntimeOwners';

const startedAt = '2026-08-08T00:00:01.000Z';
const completedAt = '2026-08-08T00:00:02.000Z';
const issuedAt = completedAt;

const fixtureMaterial = () => {
  const releasePlan = createV8EvaluationPlan();
  const material = getG4V8PublicEvaluationCaseMaterials().find((candidate) =>
    candidate.invocation.blocks.some(
      (block) =>
        block.kind === 'workspace-fixture' &&
        block.fixture.expectedOutcome.proposal.status === 'ready' &&
        block.fixture.expectedOutcome.transaction.expectedCommandCount > 0
    )
  );
  if (!material) throw new TypeError('Missing G4 Workspace fixture.');
  const block = material.invocation.blocks.find(
    (candidate) => candidate.kind === 'workspace-fixture'
  );
  if (block?.kind !== 'workspace-fixture') {
    throw new TypeError('Missing G4 Workspace fixture block.');
  }
  const descriptor = planAgentModelEvaluationAttempts(releasePlan).find(
    (candidate) => candidate.caseId === material.caseId
  );
  if (!descriptor) throw new TypeError('Missing G4 attempt descriptor.');
  return Object.freeze({
    releasePlan,
    descriptor,
    fixture: block.fixture,
  });
};

const createAuthorityInput = async (): Promise<{
  authorityInput: AgentEvaluationG3ExecutionEvidenceAuthorityInput;
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
  snapshotBytes: Uint8Array;
  executableArtifact: ReturnType<
    typeof encodeExecutableProjectSnapshotArtifact
  >;
}> => {
  const { releasePlan, descriptor, fixture } = fixtureMaterial();
  const domain = createAgentEvaluationControlledWorkspaceDomainPlan({
    caseId: descriptor.caseId,
    attemptId: descriptor.attemptId,
    fixture,
    issuedAt: '2026-08-08T00:00:00.000Z',
    expiresAt: '2026-08-08T00:15:00.000Z',
  });
  if (domain.status !== 'ready') {
    throw new TypeError('G4 Workspace domain plan is unavailable.');
  }
  let captured: AgentEvaluationG3ExecutionEvidenceAuthorityInput | undefined;
  await evaluateAgentEvaluationControlledWorkspaceG3({
    evaluationNamespaceId: 'namespace.g4',
    evaluationPlanDigest: releasePlan.planDigest,
    repositoryCommit: releasePlan.repositoryCommit,
    projectId: 'project.g4',
    caseId: descriptor.caseId,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
    controlledWorkspaceGrantDigest: digestAgentCanonicalValue(
      'controlled-workspace-grant'
    ),
    grantGeneration: 1,
    fixture,
    baseWorkspace: fixture.workspaceSnapshot as WorkspaceSnapshot,
    finalWorkspace: domain.plan.candidateSnapshot,
    baseSnapshotRef: 'workspace-snapshot://g4/base',
    baseSnapshotDigest: fixture.workspaceSnapshotDigest,
    finalSnapshotRef: 'workspace-snapshot://g4/final',
    finalSnapshotDigest: digestAgentCanonicalValue(
      domain.plan.candidateSnapshot
    ),
    operationReceiptDigests: Object.freeze([
      digestAgentCanonicalValue('operation'),
    ]),
    commandReceiptDigests: Object.freeze([
      digestAgentCanonicalValue('command'),
    ]),
    transactionReceiptDigests: Object.freeze([
      digestAgentCanonicalValue('transaction'),
    ]),
    evidenceAuthority: Object.freeze({
      collect: async (
        input: AgentEvaluationG3ExecutionEvidenceAuthorityInput
      ) => {
        captured = input;
        throw new TypeError('capture-only');
      },
    }),
  });
  if (!captured) throw new TypeError('G3 authority input was not captured.');
  const cell = captured.plan.cells[0]!;
  const framework = cell.frameworkTarget === 'react-vite' ? 'react' : 'vue';
  const sourcePath = framework === 'react' ? 'src/main.tsx' : 'src/main.ts';
  const executableSnapshot = createExecutableProjectSnapshot({
    workspace: Object.freeze({
      workspaceId: 'workspace-g4-controlled-cell',
      snapshotId: 'snapshot-g4-controlled-cell',
      partitionRevisions: Object.freeze({ workspace: '1' }),
    }),
    target: Object.freeze({
      presetId: cell.frameworkTarget,
      framework,
      runtime: 'vite',
    }),
    files: Object.freeze([
      Object.freeze({
        path: 'package.json',
        contents: '{"private":true}',
      }),
      Object.freeze({
        path: sourcePath,
        contents: 'export const controlledWorkspaceG3 = true;',
      }),
    ]),
    dependencyPlan: Object.freeze({ manifestFilePath: 'package.json' }),
    entrypoints: Object.freeze([
      Object.freeze({ kind: 'preview' as const, path: sourcePath }),
    ]),
    capabilityRequirements: Object.freeze({
      preview: Object.freeze(['filesystem'] as const),
      build: Object.freeze(['filesystem', 'build'] as const),
      test: Object.freeze([]),
      production: Object.freeze([]),
    }),
    publicBuildConfiguration: Object.freeze([]),
    cacheHints: Object.freeze({ dependencyInstall: 'isolated' as const }),
    installCommand: Object.freeze({ command: 'pnpm', args: ['install'] }),
    previewCommand: Object.freeze({ command: 'pnpm', args: ['preview'] }),
    buildCommand: Object.freeze({ command: 'pnpm', args: ['build'] }),
    previewPlan: Object.freeze({
      mode: 'static-bundle' as const,
      command: Object.freeze({ command: 'pnpm', args: ['preview'] }),
      outputDirectoryPath: 'dist',
      entryFilePath: 'index.html',
    }),
  });
  const executableArtifact =
    encodeExecutableProjectSnapshotArtifact(executableSnapshot);
  return Object.freeze({
    authorityInput: captured,
    fixture,
    snapshotBytes: executableArtifact.bytes,
    executableArtifact,
  });
};

type PortOptions = Readonly<{
  canary?: string;
  crashAfterDurableExecutionOnce?: boolean;
  identityDrift?: boolean;
  artifactDigestDrift?: boolean;
  semanticDigestDrift?: boolean;
}>;

const createPort = (
  snapshotBytes: Uint8Array,
  options: PortOptions = {}
): AgentEvaluationControlledWorkspaceG3SandboxPort &
  Readonly<{ executionCount(): number }> => {
  const artifacts = new Map<string, Uint8Array>();
  const replays = new Map<
    CanonicalDigest,
    AgentEvaluationControlledWorkspaceG3ReplayRecord
  >();
  let executions = 0;
  let crashPending = options.crashAfterDurableExecutionOnce === true;
  const decodedSnapshot =
    decodeExecutableProjectSnapshotArtifact(snapshotBytes);
  const bindingFor = (
    input: AgentEvaluationControlledWorkspaceG3SandboxBindInput
  ): AgentEvaluationControlledWorkspaceG3SandboxBinding =>
    createAgentEvaluationControlledWorkspaceG3SandboxBinding({
      bindingId: `binding:${input.cell.id}`,
      authorityInputDigest: input.authorityInputDigest,
      evaluationPlanDigest: input.evaluationPlanDigest,
      repositoryCommit: input.repositoryCommit,
      projectId: input.projectId,
      caseId: input.caseId,
      attemptId: input.attemptId,
      generation: input.generation,
      planDigest: input.planDigest,
      registrySnapshotDigest: input.registrySnapshotDigest,
      cellId: input.cell.id,
      ...(input.cell.scenarioId ? { scenarioId: input.cell.scenarioId } : {}),
      adapter: options.identityDrift
        ? Object.freeze({
            ...input.adapter,
            toolchainDigest: digestAgentCanonicalValue('drifted-toolchain'),
          })
        : input.adapter,
      tool: AGENT_EVALUATION_G3_SANDBOX_ADAPTER_REGISTRATION.tool!,
      runtimeAuthorityId: 'runtime.g4.sidecar',
      runtimeImplementationDigest: digestAgentCanonicalValue(
        'runtime.g4.sidecar.v1'
      ),
      artifactSourceAuthorityDigest: digestAgentCanonicalValue(
        'artifact.g4.sidecar.v1'
      ),
      attestationAuthorityDigest: digestAgentCanonicalValue(
        'attestation.g4.sidecar.v1'
      ),
      providerKind: 'remote',
      runtimeEnvironmentDigest: digestAgentCanonicalValue({
        browser: 'chromium',
        workspace: input.finalSnapshotDigest,
      }),
      ...(input.cell.scenarioId
        ? {
            scenarioProgramDigest: digestAgentCanonicalValue({
              scenarioId: input.cell.scenarioId,
              compiler: 'production-sidecar',
            }),
          }
        : {}),
      controlCapabilitySnapshotDigest: digestAgentCanonicalValue({
        capabilities: ['agent-evaluation.controlled-workspace-runtime'],
      }),
      appliedControlDigest: digestAgentCanonicalValue({
        controlProfileDigest: input.cell.controlProfileRef.digest,
      }),
      finalWorkspaceSnapshotDigest: input.finalSnapshotDigest,
      compilerProjectionReceiptDigest: digestAgentCanonicalValue({
        finalWorkspaceSnapshotDigest: input.finalSnapshotDigest,
        frameworkTarget: input.cell.frameworkTarget,
      }),
      executableSnapshot: Object.freeze({
        id: `input:${input.cell.id}`,
        sourceRef: `compiler-projection:${input.cell.id}`,
        artifactDigest: options.artifactDigestDrift
          ? digestAgentCanonicalValue('drifted-executable-artifact')
          : decodedSnapshot.artifactDigest,
        semanticSnapshotDigest: options.semanticDigestDrift
          ? digestAgentCanonicalValue('drifted-executable-semantic-snapshot')
          : decodedSnapshot.snapshot.contentDigest,
        size: snapshotBytes.byteLength,
        mediaType: AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_MEDIA_TYPE,
        codecSchemaDigest: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST,
      }),
      run: Object.freeze({
        runId: `run:${input.cell.id}`,
        providerId: 'provider.g4.sidecar',
        sessionId: `session:${input.cell.id}`,
        parentAttemptId: input.attemptId,
        surface: input.cell.surface,
        frameworkTarget: input.cell.frameworkTarget,
        runtimeZone: 'sandbox',
        browserEngine: input.cell.browserEngine,
        viewport: input.cell.viewport,
        devicePixelRatio: 1,
        colorScheme: input.cell.colorScheme,
        motion: input.cell.motion,
        locale: input.cell.locale,
        timezone: 'UTC',
        fontSetDigest: digestAgentCanonicalValue('fonts.g4.sidecar'),
        sandboxImageDigest: digestAgentCanonicalValue('sandbox-image.v1'),
      }),
    });

  const port: AgentEvaluationControlledWorkspaceG3SandboxPort = {
    bind: async (input) => bindingFor(input),
    readExecutableSnapshot: async () => new Uint8Array(snapshotBytes),
    prepare: async ({
      binding,
      attemptId,
      generation,
      resolvedInputSetDigest,
    }) =>
      createAgentEvaluationControlledWorkspaceG3SandboxLease({
        leaseId: `lease:${binding.cellId}`,
        bindingDigest: binding.bindingDigest,
        invocationId: `invocation:${binding.bindingDigest.slice(7)}`,
        attemptId,
        generation,
        resolvedInputSetDigest,
        executionId: `execution:${binding.cellId}`,
        sessionId: binding.run.sessionId,
        confirmedCursor: 0,
      }),
    execute: async ({ binding, lease }) => {
      let replay = replays.get(binding.bindingDigest);
      if (!replay) {
        executions += 1;
        replay = createAgentEvaluationControlledWorkspaceG3ReplayRecord({
          bindingDigest: binding.bindingDigest,
          leaseReceiptDigest: lease.leaseReceiptDigest,
          planDigest: binding.planDigest,
          cellId: binding.cellId,
          attemptId: binding.attemptId,
          generation: binding.generation,
          resolvedInputSetDigest: lease.resolvedInputSetDigest,
          executableSnapshotArtifactDigest:
            binding.executableSnapshot.artifactDigest,
          executableSnapshotSemanticDigest:
            binding.executableSnapshot.semanticSnapshotDigest,
          executableSnapshotMediaType: binding.executableSnapshot.mediaType,
          executableSnapshotCodecSchemaDigest:
            binding.executableSnapshot.codecSchemaDigest,
          runtimeEnvironmentDigest: binding.runtimeEnvironmentDigest,
          controlCapabilitySnapshotDigest:
            binding.controlCapabilitySnapshotDigest,
          appliedControlDigest: binding.appliedControlDigest,
          startedAt,
          completedAt,
          durationMs: 1_000,
          assertions: Object.freeze([
            Object.freeze({
              assertionId: options.canary ?? 'assertion:workspace-closure',
              status: 'passed',
              diagnosticCodes: Object.freeze([]),
            }),
          ]),
          runtimeReceiptDigests: Object.freeze([
            digestAgentCanonicalValue({
              bindingDigest: binding.bindingDigest,
              kind: 'real-sandbox-execution',
            }),
          ]),
        });
        replays.set(binding.bindingDigest, replay);
      }
      if (crashPending) {
        crashPending = false;
        throw new TypeError('simulated-ack-loss-after-durable-execution');
      }
      return replay;
    },
    cleanup: async () =>
      Object.freeze({
        status: 'clean' as const,
        residualCanaryIds: Object.freeze([]),
        diagnosticCodes: Object.freeze([]),
      }),
    stageArtifact: async ({ request }) => {
      const digest = computeVerificationArtifactContentDigest(
        request.artifact.bytes
      );
      const stagingArtifactId = `staged:${digest.slice(7)}`;
      artifacts.set(stagingArtifactId, new Uint8Array(request.artifact.bytes));
      return Object.freeze({
        status: 'staged' as const,
        stagingArtifactId,
        digest,
        size: request.artifact.bytes.byteLength,
        mediaType: request.artifact.mediaType,
      });
    },
    retireArtifacts: async ({ attempt }) => {
      artifacts.clear();
      return Object.freeze({ status: 'retired' as const, ...attempt });
    },
    readArtifact: async ({ artifact }) => {
      const bytes = artifacts.get(artifact.stagingArtifactId);
      if (!bytes) throw new TypeError('missing-artifact');
      return new Uint8Array(bytes);
    },
    complete: async ({ binding }) =>
      Object.freeze({
        timing: Object.freeze({
          startedAt,
          completedAt,
          durationMs: 1_000,
        }),
        artifacts: Object.freeze([
          Object.freeze({
            id: `artifact:g4-replay-${binding.bindingDigest.slice(7)}`,
            path: `g4/replay/${binding.bindingDigest.slice(7)}.json`,
          }),
        ]),
        sourceTraces: Object.freeze([
          Object.freeze({
            sourceRef: Object.freeze({
              kind: 'verification-plan-cell' as const,
              planDigest: binding.planDigest,
              cellId: binding.cellId,
            }),
          }),
        ]),
        dependencyLockDigest: digestAgentCanonicalValue(
          'dependency-lock.g4.sidecar'
        ),
        provenance: Object.freeze({
          origin: 'remote' as const,
          producerId: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
          providerId: binding.run.providerId,
          issuedAt,
          expiresAt: '2026-08-08T00:10:00.000Z',
        }),
        redaction: Object.freeze({
          policyId: 'redaction.g4.sidecar',
          scannerSetDigest: digestAgentCanonicalValue('scanners.g4.sidecar'),
          droppedFieldCounts: Object.freeze({}),
        }),
        ...(binding.scenarioProgramDigest
          ? {
              scenario: Object.freeze({
                id: binding.scenarioId!,
                revision: 1,
                digest: digestAgentCanonicalValue('scenario.g4.sidecar'),
                programDigest: binding.scenarioProgramDigest,
              }),
            }
          : {}),
      }),
    signAttestation: async ({ attestationStatementDigest }) =>
      Object.freeze({
        authority: 'sidecar-ed25519',
        statementDigest: attestationStatementDigest,
      }),
  };
  return Object.freeze({
    ...port,
    executionCount: () => executions,
  });
};

const runLifecycle = async (
  authorityInput: AgentEvaluationG3ExecutionEvidenceAuthorityInput,
  port: AgentEvaluationControlledWorkspaceG3SandboxPort,
  canaries: readonly string[] = Object.freeze([])
) => {
  const registrySnapshot = createVerificationAdapterRegistrySnapshot([
    AGENT_EVALUATION_G3_SANDBOX_ADAPTER_REGISTRATION,
  ]);
  expect(registrySnapshot.snapshotDigest).toBe(
    authorityInput.adapterRegistryDigest
  );
  const cell = authorityInput.plan.cells[0]!;
  const authority =
    createProductionAgentEvaluationControlledWorkspaceG3CellRuntimeAuthority({
      port,
      forbiddenCanaries: () => canaries,
    });
  const binding = await authority.bind({
    authorityInput,
    registrySnapshot,
    cell,
  });
  const lifecycle = await executeVerificationAdapterLifecycle({
    factory: binding.factory,
    registrySnapshot,
    planDigest: authorityInput.plan.planDigest,
    cell,
    attemptId: authorityInput.attemptId,
    generation: authorityInput.grantGeneration,
    providerKind: binding.providerKind,
    context: binding.context,
    artifactRetirement: binding.artifactRetirement,
  });
  return Object.freeze({ binding, lifecycle });
};

describe('production controlled Workspace G3 cell runtime', () => {
  it('runs the frozen real sandbox adapter lifecycle and materializes a bounded ReplayRecord', async () => {
    const { authorityInput, snapshotBytes, executableArtifact } =
      await createAuthorityInput();
    const port = createPort(snapshotBytes);
    const { binding, lifecycle } = await runLifecycle(authorityInput, port);
    expect(executableArtifact.artifactDigest).not.toBe(
      executableArtifact.semanticDigest
    );
    expect(binding.context.inputRefs[0]?.digest).toBe(
      executableArtifact.artifactDigest
    );
    expect(binding.context.executableSnapshotDigest).toBe(
      executableArtifact.semanticDigest
    );
    expect(lifecycle.status).toBe('reported');
    if (lifecycle.status !== 'reported') return;
    expect(lifecycle.report.payload.kind).toBe('integration');
    expect(lifecycle.report.terminal).toEqual({
      status: 'completed',
      complete: true,
      exitCode: 0,
    });
    expect(lifecycle.stagedArtifacts).toHaveLength(1);
    expect(lifecycle.stagedArtifacts[0]?.mediaType).toBe(
      AGENT_EVALUATION_G3_SANDBOX_REPLAY_MEDIA_TYPE
    );
    const artifact = lifecycle
      .stagedArtifacts[0] as VerificationAdapterStagedArtifactRef;
    const bytes = await binding.artifactSource.read(artifact);
    expect(computeVerificationArtifactContentDigest(bytes)).toBe(
      artifact.digest
    );
    const completion = await binding.complete(lifecycle);
    expect(completion.provenance.origin).toBe('remote');
    expect(port.executionCount()).toBe(1);
  }, 60_000);

  it('replays the durable sandbox result after an execute ACK-loss crash without repeating the effect', async () => {
    const { authorityInput, snapshotBytes } = await createAuthorityInput();
    const port = createPort(snapshotBytes, {
      crashAfterDurableExecutionOnce: true,
    });
    const first = await runLifecycle(authorityInput, port);
    expect(first.lifecycle.status).toBe('failed');
    const replayed = await runLifecycle(authorityInput, port);
    expect(replayed.lifecycle.status).toBe('reported');
    expect(port.executionCount()).toBe(1);
  });

  it('rejects descriptor, capability, or toolchain identity drift before adapter dispatch', async () => {
    const { authorityInput, snapshotBytes } = await createAuthorityInput();
    const port = createPort(snapshotBytes, { identityDrift: true });
    await expect(runLifecycle(authorityInput, port)).rejects.toThrow(
      'Sandbox binding authority drifted'
    );
    expect(port.executionCount()).toBe(0);
  });

  it.each([
    ['raw artifact', { artifactDigestDrift: true }],
    ['semantic snapshot', { semanticDigestDrift: true }],
  ] as const)(
    'rejects %s digest drift before sandbox execution',
    async (_label, options) => {
      const { authorityInput, snapshotBytes } = await createAuthorityInput();
      const port = createPort(snapshotBytes, options);
      const result = await runLifecycle(authorityInput, port);
      expect(result.lifecycle.status).toBe('failed');
      expect(port.executionCount()).toBe(0);
    }
  );

  it('rejects Secret and protected-holdout canaries in replay output and retires staged authority', async () => {
    const { authorityInput, snapshotBytes } = await createAuthorityInput();
    const canary = 'G4_PROTECTED_HOLDOUT_CANARY_890123';
    const port = createPort(snapshotBytes, { canary });
    const result = await runLifecycle(authorityInput, port, [canary]);
    expect(result.lifecycle.status).toBe('failed');
    expect(port.executionCount()).toBe(1);
  });
});
