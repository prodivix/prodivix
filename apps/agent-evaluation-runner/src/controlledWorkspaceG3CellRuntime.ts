import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  computeVerificationArtifactContentDigest,
  digestVerificationValue,
  matchVerificationAdapterRegistryEntry,
  type VerificationAbortSignal,
  type VerificationAdapterArtifactAttemptCoordinates,
  type VerificationAdapterArtifactStagingRequest,
  type VerificationAdapterArtifactStagingResult,
  type VerificationAdapterInputRef,
  type VerificationAdapterLifecycleResult,
  type VerificationAdapterStagedArtifactRef,
} from '@prodivix/verification';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY,
  AGENT_EVALUATION_G3_SANDBOX_REPLAY_MEDIA_TYPE,
  assertProductionAgentEvaluationG3SandboxBinding,
  assertProductionAgentEvaluationG3SandboxCanaryClean,
  assertProductionAgentEvaluationG3SandboxCompletion,
  createProductionAgentEvaluationSandboxAdapterFactory,
  type AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource,
  type AgentEvaluationControlledWorkspaceG3SandboxBindInput,
  type AgentEvaluationControlledWorkspaceG3SandboxPort,
} from './controlledWorkspaceG3CellAdapter';
import type {
  AgentEvaluationControlledWorkspaceG3CellRuntimeAuthority,
  AgentEvaluationControlledWorkspaceG3CellRuntimeBinding,
} from './controlledWorkspaceRuntimeProduction';

export const AGENT_EVALUATION_CONTROLLED_WORKSPACE_G3_CELL_RUNTIME_AUTHORITY_ID =
  'g4-evaluation-controlled-workspace-g3-cell-runtime' as const;
export const AGENT_EVALUATION_CONTROLLED_WORKSPACE_G3_CELL_RUNTIME_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    packageName: '@prodivix/agent-evaluation-runner',
    owner: 'production-g4-evaluation-cell-runtime-authority',
    version: 1,
    adapter: AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY,
    lifecycle: 'core-owned-verification-adapter-lifecycle',
    artifact: 'content-addressed-sidecar-staging',
    attestation: 'server-only-sidecar-authority',
  });

export type CreateProductionAgentEvaluationControlledWorkspaceG3CellRuntimeAuthorityInput =
  Readonly<{
    port: AgentEvaluationControlledWorkspaceG3SandboxPort;
    forbiddenCanaries?: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
    createAbortSignal?: (
      input: AgentEvaluationControlledWorkspaceG3SandboxBindInput
    ) => VerificationAbortSignal;
  }>;

const fail = (message: string): never => {
  throw new TypeError(
    `G4_CONTROLLED_WORKSPACE_G3_CELL_RUNTIME_UNAVAILABLE: ${message}`
  );
};

const passiveAbortSignal = (): VerificationAbortSignal =>
  Object.freeze({
    aborted: false,
    subscribe: () => () => undefined,
  });

const canonicalAbortSignal = (
  signal: VerificationAbortSignal
): VerificationAbortSignal => {
  if (
    typeof signal !== 'object' ||
    signal === null ||
    typeof signal.aborted !== 'boolean' ||
    typeof signal.subscribe !== 'function' ||
    (signal.reason !== undefined && typeof signal.reason !== 'string')
  ) {
    return fail('Abort authority is invalid.');
  }
  return signal;
};

const reportedReplayArtifact = (
  lifecycle: Extract<VerificationAdapterLifecycleResult, { status: 'reported' }>
): VerificationAdapterStagedArtifactRef => {
  if (
    lifecycle.stagedArtifacts.length !== 1 ||
    lifecycle.stagedArtifacts[0]?.kind !== 'replay-record' ||
    lifecycle.stagedArtifacts[0]?.mediaType !==
      AGENT_EVALUATION_G3_SANDBOX_REPLAY_MEDIA_TYPE ||
    !isAgentCanonicalDigest(lifecycle.stagedArtifacts[0]?.digest)
  ) {
    return fail('Lifecycle did not produce one exact bounded ReplayRecord.');
  }
  return lifecycle.stagedArtifacts[0];
};

/**
 * Binds every G3 Plan cell to a real, disposable Workspace/Chromium sidecar
 * lease. All adapter, artifact, and attestation capabilities stay scoped to
 * the exact authority input and attempt generation.
 */
export const createProductionAgentEvaluationControlledWorkspaceG3CellRuntimeAuthority =
  (
    options: CreateProductionAgentEvaluationControlledWorkspaceG3CellRuntimeAuthorityInput
  ): AgentEvaluationControlledWorkspaceG3CellRuntimeAuthority => {
    const canaries = options.forbiddenCanaries ?? (() => Object.freeze([]));
    const createAbortSignal = options.createAbortSignal ?? passiveAbortSignal;
    const authority: AgentEvaluationControlledWorkspaceG3CellRuntimeAuthority =
      {
        async bind({ authorityInput, registrySnapshot, cell }) {
          const entry = matchVerificationAdapterRegistryEntry(
            registrySnapshot,
            cell.adapter
          );
          if (
            !entry ||
            !sameCanonicalJson(
              cell.adapter,
              AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY
            ) ||
            entry.descriptor.id !==
              AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY.adapterId ||
            entry.descriptorDigest !==
              AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY.descriptorDigest ||
            entry.capabilityDigest !==
              AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY.capabilityDigest ||
            entry.descriptor.implementation.toolchainDigest !==
              AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY.toolchainDigest ||
            registrySnapshot.snapshotDigest !==
              authorityInput.adapterRegistryDigest ||
            authorityInput.plan.status !== 'ready'
          ) {
            return fail('Frozen adapter registration or Plan cell drifted.');
          }
          const bindInput = Object.freeze({
            authorityInputDigest: authorityInput.authorityInputDigest,
            evaluationPlanDigest: authorityInput.evaluationPlanDigest,
            repositoryCommit: authorityInput.repositoryCommit,
            projectId: authorityInput.projectId,
            caseId: authorityInput.caseId,
            attemptId: authorityInput.attemptId,
            generation: authorityInput.grantGeneration,
            planDigest: authorityInput.plan.planDigest as CanonicalDigest,
            registrySnapshotDigest:
              registrySnapshot.snapshotDigest as CanonicalDigest,
            cell,
            adapter: cell.adapter,
            finalSnapshotRef: authorityInput.sandbox.finalSnapshotRef,
            finalSnapshotDigest: authorityInput.sandbox.finalSnapshotDigest,
            finalRevision: authorityInput.sandbox.finalRevision,
          }) satisfies AgentEvaluationControlledWorkspaceG3SandboxBindInput;
          const binding = assertProductionAgentEvaluationG3SandboxBinding(
            await options.port.bind(bindInput),
            bindInput
          );
          assertProductionAgentEvaluationG3SandboxCanaryClean(
            binding,
            canaries
          );
          const abortSignal = canonicalAbortSignal(
            createAbortSignal(bindInput)
          );
          const inputRef = Object.freeze({
            id: binding.executableSnapshot.id,
            kind: 'executable-snapshot' as const,
            digest: binding.executableSnapshot.artifactDigest,
            size: binding.executableSnapshot.size,
            mediaType: binding.executableSnapshot.mediaType,
          });
          const runtimeBinding: AgentEvaluationControlledWorkspaceG3CellRuntimeBinding =
            Object.freeze({
              runtimeAuthorityId: binding.runtimeAuthorityId,
              runtimeImplementationDigest: binding.runtimeImplementationDigest,
              finalWorkspaceSnapshotDigest:
                binding.finalWorkspaceSnapshotDigest,
              compilerProjectionReceiptDigest:
                binding.compilerProjectionReceiptDigest,
              artifactSourceAuthorityDigest:
                binding.artifactSourceAuthorityDigest,
              attestationAuthorityDigest: binding.attestationAuthorityDigest,
              factory: createProductionAgentEvaluationSandboxAdapterFactory({
                binding,
                port: options.port,
                forbiddenCanaries: canaries,
              }),
              providerKind: binding.providerKind,
              context: Object.freeze({
                registrySnapshotDigest: registrySnapshot.snapshotDigest,
                adapter: binding.adapter,
                runtimeZone: 'sandbox',
                runtimeEnvironmentDigest: binding.runtimeEnvironmentDigest,
                inputDigest: cell.inputDigest,
                executableSnapshotDigest:
                  binding.executableSnapshot.semanticSnapshotDigest,
                ...(binding.scenarioProgramDigest
                  ? { scenarioProgramDigest: binding.scenarioProgramDigest }
                  : {}),
                controlProfileDigest: cell.controlProfileRef.digest!,
                fixtureSetDigests: cell.fixtureSetRef?.digest
                  ? Object.freeze([cell.fixtureSetRef.digest])
                  : Object.freeze([]),
                ...(cell.baselineSetRef?.digest
                  ? { baselineSetDigest: cell.baselineSetRef.digest }
                  : {}),
                controlCapabilityIds: Object.freeze([
                  'agent-evaluation.controlled-workspace-runtime',
                ]),
                controlCapabilitySnapshotDigest:
                  binding.controlCapabilitySnapshotDigest,
                appliedControlDigest: binding.appliedControlDigest,
                inputRefs: Object.freeze([inputRef]),
                inputResolver: Object.freeze({
                  read: async (
                    requested: VerificationAdapterInputRef,
                    signal: VerificationAbortSignal
                  ) => {
                    if (!sameCanonicalJson(requested, inputRef)) {
                      return fail('Executable snapshot reference drifted.');
                    }
                    const bytes = await options.port.readExecutableSnapshot({
                      binding,
                      signal,
                    });
                    assertProductionAgentEvaluationG3SandboxCanaryClean(
                      bytes,
                      canaries
                    );
                    if (
                      !(bytes instanceof Uint8Array) ||
                      bytes.byteLength !== inputRef.size ||
                      computeVerificationArtifactContentDigest(bytes) !==
                        inputRef.digest
                    ) {
                      return fail('Executable snapshot bytes drifted.');
                    }
                    return new Uint8Array(bytes);
                  },
                }),
                artifactStaging: Object.freeze({
                  stage: async (
                    request: VerificationAdapterArtifactStagingRequest,
                    signal: VerificationAbortSignal
                  ) => {
                    if (
                      request.planDigest !== authorityInput.plan.planDigest ||
                      request.cellId !== cell.id ||
                      request.attemptId !== authorityInput.attemptId ||
                      request.generation !== authorityInput.grantGeneration ||
                      request.artifact.kind !== 'replay-record' ||
                      request.artifact.mediaType !==
                        AGENT_EVALUATION_G3_SANDBOX_REPLAY_MEDIA_TYPE
                    ) {
                      return fail('Artifact staging coordinates drifted.');
                    }
                    assertProductionAgentEvaluationG3SandboxCanaryClean(
                      request.artifact.bytes,
                      canaries
                    );
                    const staged = await options.port.stageArtifact({
                      binding,
                      request,
                      signal,
                    });
                    assertProductionAgentEvaluationG3SandboxCanaryClean(
                      staged,
                      canaries
                    );
                    if (
                      staged.status === 'staged' &&
                      (staged.digest !==
                        computeVerificationArtifactContentDigest(
                          request.artifact.bytes
                        ) ||
                        staged.size !== request.artifact.bytes.byteLength ||
                        staged.mediaType !== request.artifact.mediaType)
                    ) {
                      return fail('Artifact staging receipt drifted.');
                    }
                    return staged as VerificationAdapterArtifactStagingResult;
                  },
                }),
                abortSignal,
              }),
              artifactRetirement: Object.freeze({
                retireAttempt: async (
                  attempt: VerificationAdapterArtifactAttemptCoordinates,
                  signal: VerificationAbortSignal
                ) => {
                  if (
                    attempt.planDigest !== authorityInput.plan.planDigest ||
                    attempt.cellId !== cell.id ||
                    attempt.attemptId !== authorityInput.attemptId ||
                    attempt.generation !== authorityInput.grantGeneration
                  ) {
                    return fail('Artifact retirement coordinates drifted.');
                  }
                  const retired = await options.port.retireArtifacts({
                    binding,
                    attempt,
                    signal,
                  });
                  assertProductionAgentEvaluationG3SandboxCanaryClean(
                    retired,
                    canaries
                  );
                  return retired;
                },
              }),
              artifactSource: Object.freeze({
                read: async (
                  artifact: VerificationAdapterStagedArtifactRef
                ) => {
                  if (
                    artifact.kind !== 'replay-record' ||
                    artifact.mediaType !==
                      AGENT_EVALUATION_G3_SANDBOX_REPLAY_MEDIA_TYPE
                  ) {
                    return fail('Artifact source reference drifted.');
                  }
                  const bytes = await options.port.readArtifact({
                    binding,
                    artifact,
                  });
                  assertProductionAgentEvaluationG3SandboxCanaryClean(
                    bytes,
                    canaries
                  );
                  if (
                    !(bytes instanceof Uint8Array) ||
                    bytes.byteLength !== artifact.size ||
                    computeVerificationArtifactContentDigest(bytes) !==
                      artifact.digest
                  ) {
                    return fail('Artifact source bytes drifted.');
                  }
                  return new Uint8Array(bytes);
                },
              }),
              attestationAuthority: Object.freeze({
                sign: async (
                  input: Parameters<
                    AgentEvaluationControlledWorkspaceG3CellRuntimeBinding['attestationAuthority']['sign']
                  >[0]
                ) => {
                  const proof = await options.port.signAttestation({
                    binding,
                    ...input,
                  });
                  assertProductionAgentEvaluationG3SandboxCanaryClean(
                    proof,
                    canaries
                  );
                  return proof;
                },
              }),
              run: binding.run,
              complete: async (lifecycle) => {
                const replayArtifact = reportedReplayArtifact(lifecycle);
                const completion =
                  assertProductionAgentEvaluationG3SandboxCompletion(
                    await options.port.complete({
                      binding,
                      replayArtifactDigest:
                        replayArtifact.digest as CanonicalDigest,
                      lifecycleDigest: digestVerificationValue(
                        lifecycle
                      ) as CanonicalDigest,
                    }),
                    canaries
                  );
                if (
                  completion.provenance.origin !== 'remote' ||
                  completion.provenance.providerId !== binding.run.providerId ||
                  (cell.scenarioId === undefined) !==
                    (completion.scenario === undefined) ||
                  (completion.scenario !== undefined &&
                    (completion.scenario.id !== cell.scenarioId ||
                      completion.scenario.programDigest !==
                        binding.scenarioProgramDigest))
                ) {
                  return fail('Completion provenance or Scenario drifted.');
                }
                return completion;
              },
            });
          return runtimeBinding;
        },
      };
    return Object.freeze(authority);
  };
