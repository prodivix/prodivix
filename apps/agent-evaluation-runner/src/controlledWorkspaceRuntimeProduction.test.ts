import {
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  planAgentModelEvaluationAttempts,
  type AgentEvaluationVerificationAttemptGrantReceipt,
} from '@prodivix/ai';
import {
  computeVerificationArtifactContentDigest,
  createVerificationEvidenceVerifiedView,
  digestVerificationValue,
  encodeVerificationPlan,
  type VerificationAdapter,
  type VerificationAdapterArtifactAttemptCoordinates,
  type VerificationAdapterArtifactStagingRequest,
  type VerificationAdapterPrepareInput,
  type VerificationAdapterStagedArtifactRef,
  type VerificationEvidence,
  type VerificationEvidenceManifest,
} from '@prodivix/verification';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { describe, expect, it } from 'vitest';
import { createV8EvaluationPlan } from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import { createAgentEvaluationControlledWorkspaceDomainPlan } from './controlledWorkspaceRuntimeOwners';
import { evaluateAgentEvaluationControlledWorkspaceG3 } from './controlledWorkspaceRuntimeOwners';
import {
  createProductionAgentEvaluationControlledWorkspaceG3Authority,
  type AgentEvaluationControlledWorkspaceG3CellRuntimeAuthority,
} from './controlledWorkspaceRuntimeProduction';
import type { AgentEvaluationVerificationEvidenceBridge } from './evaluationVerificationEvidenceBridge';
import type {
  AgentEvaluationVerificationAttemptGrantIssueInput,
  AgentEvaluationVerificationAttemptGrantIssuer,
} from './verificationAttemptGrantClient';

const startedAt = '2026-08-08T00:00:01.000Z';
const completedAt = '2026-08-08T00:00:02.000Z';
const issuedAt = completedAt;
const closureAt = '2026-08-08T00:00:03.000Z';
const grantIssuedAt = '2026-08-08T00:00:00.500Z';

const testFixture = () => {
  const plan = createV8EvaluationPlan();
  const material = getG4V8PublicEvaluationCaseMaterials().find((candidate) =>
    candidate.invocation.blocks.some(
      (block) =>
        block.kind === 'workspace-fixture' &&
        block.fixture.expectedOutcome.proposal.status === 'ready' &&
        block.fixture.expectedOutcome.transaction.expectedCommandCount > 0
    )
  );
  if (!material) throw new TypeError('Missing ready public Workspace fixture.');
  const fixtureBlock = material.invocation.blocks.find(
    (block) => block.kind === 'workspace-fixture'
  );
  if (fixtureBlock?.kind !== 'workspace-fixture') {
    throw new TypeError('Missing Workspace fixture block.');
  }
  const descriptor = planAgentModelEvaluationAttempts(plan).find(
    (candidate) => candidate.caseId === material.caseId
  );
  if (!descriptor) throw new TypeError('Missing attempt descriptor.');
  return Object.freeze({
    plan,
    material,
    fixture: fixtureBlock.fixture,
    descriptor,
  });
};

const createGrantReceipt = (
  input: AgentEvaluationVerificationAttemptGrantIssueInput
): AgentEvaluationVerificationAttemptGrantReceipt => {
  const plan = input.verificationPlan;
  const cell = plan.cells.find(({ id }) => id === input.cellId)!;
  const verificationPlan = encodeVerificationPlan(plan);
  const requestBase = Object.freeze({
    format: 'prodivix.agent-evaluation-verification-attempt-grant-issue',
    version: 1,
    namespaceId: input.namespaceId,
    evaluationPlanDigest: input.evaluationPlanDigest,
    repositoryCommit: input.repositoryCommit,
    evaluationAttemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    capabilityDescriptorDigest: input.descriptor.capabilityDescriptorDigest,
    caseId: input.descriptor.caseId,
    descriptor: input.descriptor,
    generation: input.generation,
    workspaceId: plan.workspaceId,
    workspaceRevision: plan.targetRevision,
    projectId: input.projectId,
    verificationPlanDigest: plan.planDigest,
    verificationPlan,
    cellId: input.cellId,
    run: input.run,
    trustCeiling: input.trustCeiling,
    expiresAt: input.expiresAt,
  });
  const issuanceBindingDigest = digestAgentCanonicalValue({
    namespaceId: input.namespaceId,
    evaluationPlanDigest: input.evaluationPlanDigest,
    repositoryCommit: input.repositoryCommit,
    evaluationAttemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    capabilityDescriptorDigest: input.descriptor.capabilityDescriptorDigest,
    caseId: input.descriptor.caseId,
    generation: input.generation,
    workspaceId: plan.workspaceId,
    workspaceRevision: plan.targetRevision,
    projectId: input.projectId,
    verificationPlanDigest: plan.planDigest,
    cellId: input.cellId,
  });
  const grantBase = Object.freeze({
    format: 'prodivix.verification-attempt-grant',
    version: 1,
    workspaceId: plan.workspaceId,
    projectId: input.projectId,
    workspaceRevision: plan.targetRevision,
    partitionRevisionsDigest: digestVerificationValue(
      plan.targetPartitionRevisions
    ),
    policyRevision: plan.policyRevision,
    policyDigest: plan.policyDigest,
    policyEvaluationInstant: plan.policyEvaluationInstant,
    impactDigest: plan.impactDigest,
    planDigest: plan.planDigest,
    cellId: cell.id,
    checkId: cell.checkId,
    checkKind: cell.checkKind,
    targetId: cell.targetId,
    attemptId: input.descriptor.attemptId,
    runId: input.run.runId,
    providerId: input.run.providerId,
    ...(input.run.jobId ? { jobId: input.run.jobId } : {}),
    ...(input.run.sessionId ? { sessionId: input.run.sessionId } : {}),
    producerId: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
    trustCeiling: input.trustCeiling,
    retentionRequest: plan.retentionRequest,
    maximumClosureEvidenceRecords: plan.budget.closureEvidenceRecords,
    issuedBy: `g4-evaluation.${issuanceBindingDigest.slice(7)}`,
    issuedAt: grantIssuedAt,
    expiresAt: input.expiresAt,
  });
  const grantDigest = digestAgentCanonicalValue(grantBase);
  const receiptBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-verification-attempt-grant-receipt' as const,
    version: 1 as const,
    namespaceId: input.namespaceId,
    evaluationPlanDigest: input.evaluationPlanDigest,
    repositoryCommit: input.repositoryCommit,
    evaluationAttemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    capabilityDescriptorDigest: input.descriptor.capabilityDescriptorDigest,
    caseId: input.descriptor.caseId,
    generation: input.generation,
    verificationPlanDigest: plan.planDigest,
    cellId: input.cellId,
    requestDigest: digestAgentCanonicalValue(requestBase),
    issuanceBindingDigest,
    grant: Object.freeze({
      grantId: `attempt-grant-${grantDigest.slice(7)}`,
      grantDigest,
      workspaceId: grantBase.workspaceId,
      projectId: grantBase.projectId,
      workspaceRevision: grantBase.workspaceRevision,
      partitionRevisionsDigest: grantBase.partitionRevisionsDigest,
      policyRevision: grantBase.policyRevision,
      policyDigest: grantBase.policyDigest,
      policyEvaluationInstant: grantBase.policyEvaluationInstant,
      impactDigest: grantBase.impactDigest,
      verificationPlanDigest: grantBase.planDigest,
      cellId: grantBase.cellId,
      checkId: grantBase.checkId,
      checkKind: grantBase.checkKind,
      targetId: grantBase.targetId,
      attemptId: grantBase.attemptId,
      runId: grantBase.runId,
      providerId: grantBase.providerId,
      ...(grantBase.jobId ? { jobId: grantBase.jobId } : {}),
      ...(grantBase.sessionId ? { sessionId: grantBase.sessionId } : {}),
      producerId: grantBase.producerId,
      trustCeiling: grantBase.trustCeiling,
      retentionRequest: grantBase.retentionRequest,
      maximumClosureEvidenceRecords: grantBase.maximumClosureEvidenceRecords,
      issuedBy: grantBase.issuedBy,
      issuedAt: grantBase.issuedAt,
      expiresAt: grantBase.expiresAt,
    }),
  });
  return Object.freeze({
    ...receiptBase,
    receiptDigest: digestAgentCanonicalValue(receiptBase),
  });
};

describe('production controlled Workspace G3 authority', () => {
  it('seals every cell grant before the real adapter lifecycle and closes promoted Evidence', async () => {
    const { plan, fixture, descriptor } = testFixture();
    const domain = createAgentEvaluationControlledWorkspaceDomainPlan({
      caseId: descriptor.caseId,
      attemptId: descriptor.attemptId,
      fixture,
      issuedAt: '2026-08-08T00:00:00.000Z',
      expiresAt: '2026-08-08T00:15:00.000Z',
    });
    expect(domain.status).toBe('ready');
    if (domain.status !== 'ready') return;
    const trace: string[] = [];
    const receipts: AgentEvaluationVerificationAttemptGrantReceipt[] = [];
    const issuer: AgentEvaluationVerificationAttemptGrantIssuer = {
      async list() {
        trace.push('grant-list');
        return Object.freeze([...receipts]);
      },
      async issue(input) {
        trace.push(`grant-issue:${input.cellId}`);
        const receipt = createGrantReceipt(input);
        receipts.push(receipt);
        return receipt;
      },
    };
    const stagedBytes = new Map<string, Uint8Array>();
    const runtimeAuthority: AgentEvaluationControlledWorkspaceG3CellRuntimeAuthority =
      {
        async bind({ authorityInput, registrySnapshot, cell }) {
          trace.push(`bind:${cell.id}`);
          const snapshotBytes = new TextEncoder().encode(
            canonicalJsonText({
              format: 'prodivix.test-executable-snapshot-artifact',
              snapshot: domain.plan.candidateSnapshot,
            })
          );
          expect(
            computeVerificationArtifactContentDigest(snapshotBytes)
          ).not.toBe(authorityInput.sandbox.finalSnapshotDigest);
          const replayBytes = new TextEncoder().encode(
            canonicalJsonText({ cellId: cell.id, outcome: 'passed' })
          );
          let prepared: VerificationAdapterPrepareInput | undefined;
          const adapter: VerificationAdapter = Object.freeze({
            preflight: async () => ({ status: 'supported' as const }),
            prepare: async (input) => {
              prepared = input;
              return Object.freeze({
                invocationId: `invocation:${cell.id}`,
                planDigest: input.planDigest,
                cellId: cell.id,
                adapterId: cell.adapter.adapterId,
                attemptId: input.attemptId,
                generation: input.generation,
                providerKind: input.providerKind,
                inputDigest: cell.inputDigest,
                controlCapabilitySnapshotDigest:
                  input.controlCapabilitySnapshotDigest,
                appliedControlDigest: input.appliedControlDigest,
                confirmedCursor: 0,
                state: 'running' as const,
              });
            },
            execute: async (invocation, sink) => {
              trace.push(`adapter-execute:${cell.id}`);
              const staged = await prepared!.context.artifactStaging.stage(
                {
                  id: `artifact:${cell.id}`,
                  kind: 'replay-record',
                  mediaType: 'application/json',
                  bytes: replayBytes,
                },
                prepared!.context.abortSignal
              );
              if (staged.status !== 'staged') {
                throw new TypeError('Replay artifact staging failed.');
              }
              sink.emit({
                kind: 'artifact',
                eventId: `event:${cell.id}`,
                artifactId: `artifact:${cell.id}`,
                digest: staged.digest,
              });
              return Object.freeze({
                format: 'prodivix.verification-check-report-candidate' as const,
                version: 1 as const,
                cellId: cell.id,
                attemptId: invocation.attemptId,
                checkKind: 'integration' as const,
                inputDigest: cell.inputDigest,
                adapter: cell.adapter,
                tool: registrySnapshot.entries[0]!.tool,
                terminal: Object.freeze({
                  status: 'completed' as const,
                  complete: true as const,
                  exitCode: 0,
                }),
                payload: Object.freeze({
                  kind: 'integration' as const,
                  suites: Object.freeze([
                    Object.freeze({
                      suiteId: `suite:${cell.id}`,
                      status: 'passed' as const,
                      cases: Object.freeze([
                        Object.freeze({
                          caseId: `case:${cell.id}`,
                          status: 'passed' as const,
                          diagnosticCodes: Object.freeze([]),
                        }),
                      ]),
                    }),
                  ]),
                }),
                artifacts: Object.freeze([
                  Object.freeze({
                    id: `artifact:${cell.id}`,
                    kind: 'replay-record' as const,
                    digest: staged.digest,
                    size: staged.size,
                    mediaType: staged.mediaType,
                  }),
                ]),
                diagnosticCodes: Object.freeze([]),
              });
            },
            cleanup: async () => {
              trace.push(`adapter-cleanup:${cell.id}`);
              return Object.freeze({
                status: 'clean' as const,
                residualCanaryIds: Object.freeze([]),
                diagnosticCodes: Object.freeze([]),
              });
            },
          });
          const scenarioProgramDigest = digestAgentCanonicalValue({
            scenarioId: cell.scenarioId,
          });
          return Object.freeze({
            runtimeAuthorityId: 'runtime.g4.test',
            runtimeImplementationDigest: digestAgentCanonicalValue('runtime'),
            finalWorkspaceSnapshotDigest:
              authorityInput.sandbox.finalSnapshotDigest,
            compilerProjectionReceiptDigest: digestAgentCanonicalValue({
              finalWorkspaceSnapshotDigest:
                authorityInput.sandbox.finalSnapshotDigest,
              frameworkTarget: cell.frameworkTarget,
            }),
            artifactSourceAuthorityDigest:
              digestAgentCanonicalValue('artifact-source'),
            attestationAuthorityDigest: digestAgentCanonicalValue(
              'attestation-authority'
            ),
            factory: () => adapter,
            providerKind: 'browser' as const,
            context: Object.freeze({
              registrySnapshotDigest: registrySnapshot.snapshotDigest,
              adapter: cell.adapter,
              runtimeZone: 'sandbox',
              runtimeEnvironmentDigest: digestAgentCanonicalValue(
                'runtime-environment'
              ),
              inputDigest: cell.inputDigest,
              executableSnapshotDigest:
                authorityInput.sandbox.finalSnapshotDigest,
              ...(cell.scenarioId ? { scenarioProgramDigest } : {}),
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
              controlCapabilitySnapshotDigest: digestAgentCanonicalValue(
                'control-capability-snapshot'
              ),
              appliedControlDigest:
                digestAgentCanonicalValue('applied-controls'),
              inputRefs: Object.freeze([
                Object.freeze({
                  id: `input:${cell.id}`,
                  kind: 'executable-snapshot' as const,
                  digest:
                    computeVerificationArtifactContentDigest(snapshotBytes),
                  size: snapshotBytes.byteLength,
                  mediaType: 'application/json',
                }),
              ]),
              inputResolver: Object.freeze({
                read: async () => new Uint8Array(snapshotBytes),
              }),
              artifactStaging: Object.freeze({
                stage: async ({
                  artifact,
                }: VerificationAdapterArtifactStagingRequest) => {
                  const stagingArtifactId = `staged:${artifact.id}`;
                  stagedBytes.set(
                    stagingArtifactId,
                    new Uint8Array(artifact.bytes)
                  );
                  return Object.freeze({
                    status: 'staged' as const,
                    stagingArtifactId,
                    digest: computeVerificationArtifactContentDigest(
                      artifact.bytes
                    ),
                    size: artifact.bytes.byteLength,
                    mediaType: artifact.mediaType,
                  });
                },
              }),
              abortSignal: Object.freeze({
                aborted: false,
                subscribe: () => () => undefined,
              }),
            }),
            artifactRetirement: Object.freeze({
              retireAttempt: async (
                attempt: VerificationAdapterArtifactAttemptCoordinates
              ) => Object.freeze({ status: 'retired' as const, ...attempt }),
            }),
            artifactSource: Object.freeze({
              read: async (artifact: VerificationAdapterStagedArtifactRef) =>
                new Uint8Array(stagedBytes.get(artifact.stagingArtifactId)!),
            }),
            attestationAuthority: Object.freeze({
              sign: async () => Object.freeze({ proof: 'signed-by-test' }),
            }),
            run: Object.freeze({
              runId: `run:${cell.id}`,
              providerId: 'provider.g4.remote',
              sessionId: `session:${cell.id}`,
              parentAttemptId: descriptor.attemptId,
              surface: cell.surface,
              frameworkTarget: cell.frameworkTarget,
              runtimeZone: 'sandbox',
              ...(cell.browserEngine
                ? { browserEngine: cell.browserEngine }
                : {}),
              viewport: cell.viewport,
              devicePixelRatio: 1,
              colorScheme: cell.colorScheme,
              motion: cell.motion,
              locale: cell.locale,
              timezone: 'UTC',
              fontSetDigest: digestAgentCanonicalValue('fonts'),
            }),
            complete: async () => {
              trace.push(`adapter-complete:${cell.id}`);
              return Object.freeze({
                timing: Object.freeze({
                  startedAt,
                  completedAt,
                  durationMs: 1_000,
                }),
                artifacts: Object.freeze([
                  Object.freeze({
                    id: `artifact:${cell.id}`,
                    path: `g4/${cell.id.replaceAll(':', '-')}.json`,
                  }),
                ]),
                sourceTraces: Object.freeze([
                  Object.freeze({
                    sourceRef: Object.freeze({
                      kind: 'verification-plan-cell' as const,
                      planDigest: authorityInput.plan.planDigest,
                      cellId: cell.id,
                    }),
                    label: 'Controlled Workspace evaluation cell',
                  }),
                ]),
                dependencyLockDigest:
                  digestAgentCanonicalValue('dependency-lock'),
                provenance: Object.freeze({
                  origin: 'remote' as const,
                  producerId:
                    AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
                  providerId: 'provider.g4.remote',
                  issuedAt,
                  expiresAt: '2026-08-08T00:10:00.000Z',
                }),
                redaction: Object.freeze({
                  policyId: 'redaction.g4.test',
                  scannerSetDigest: digestAgentCanonicalValue('scanners'),
                  droppedFieldCounts: Object.freeze({}),
                }),
                ...(cell.scenarioId
                  ? {
                      scenario: Object.freeze({
                        id: cell.scenarioId,
                        revision: 1,
                        digest: digestAgentCanonicalValue('scenario'),
                        programDigest: scenarioProgramDigest,
                      }),
                    }
                  : {}),
              });
            },
          });
        },
      };
    const promotedEvidence: VerificationEvidence[] = [];
    const evidenceBridge: AgentEvaluationVerificationEvidenceBridge = {
      async registerSandbox({ authority }) {
        trace.push('sandbox-register');
        const base = Object.freeze({
          format:
            'prodivix.agent-evaluation-verification-evidence-bridge' as const,
          version: 1 as const,
          kind: 'sandbox-registration' as const,
          requestDigest: digestAgentCanonicalValue('registration-request'),
          idempotencyKey: `sandbox.${authority.authorityDigest.slice(7)}`,
          registrationId: 'sandbox-registration.g4.test',
          registrationDigest: digestAgentCanonicalValue('registration'),
        });
        return Object.freeze({
          ...base,
          receiptDigest: digestAgentCanonicalValue(base),
        });
      },
      async promoteCell({ candidate }) {
        trace.push(`promote:${candidate.cellId}`);
        const manifestDigest = digestVerificationValue({
          candidateDigest: candidate.candidateDigest,
        });
        const evidence: VerificationEvidence = Object.freeze({
          id: `evidence:${candidate.cellId}`,
          projectId: candidate.projectId,
          workspaceId: candidate.workspaceId,
          workspaceRevision: candidate.workspaceRevision,
          partitionRevisions: candidate.partitionRevisions,
          executableSnapshotDigest: candidate.executableSnapshotDigest,
          ...(candidate.scenario ? { scenario: candidate.scenario } : {}),
          policyRevision: candidate.policyRevision,
          policyDigest: candidate.policyDigest,
          impactDigest: candidate.impactDigest,
          planDigest: candidate.planDigest,
          policyEvaluationInstant: candidate.policyEvaluationInstant,
          cellId: candidate.cellId,
          checkId: candidate.checkId,
          checkKind: candidate.checkKind,
          targetId: candidate.targetId,
          attemptId: candidate.attemptId,
          run: candidate.run,
          timing: candidate.timing,
          result: candidate.result,
          provenance: Object.freeze({
            trust: 'remote-attested' as const,
            producerId: candidate.provenance.producerId,
            attestationDigest: digestAgentCanonicalValue('attestation'),
            issuedAt: candidate.provenance.issuedAt,
            ...(candidate.provenance.expiresAt
              ? { expiresAt: candidate.provenance.expiresAt }
              : {}),
          }),
          toolchain: candidate.toolchain,
          normalization: candidate.normalization,
          controls: candidate.controls,
          inputs: candidate.inputs,
          artifacts: Object.freeze(
            candidate.artifacts.map((artifact) =>
              Object.freeze({
                id: artifact.id,
                path: `g4/${artifact.id.replaceAll(':', '-')}.json`,
                kind: artifact.kind,
                digest: artifact.expectedDigest,
                size: artifact.expectedSize,
                mediaType: artifact.expectedMediaType,
              })
            )
          ),
          sourceTraces: candidate.sourceTraces,
          sourceTraceDigest: candidate.sourceTraceDigest,
          dependencyLockDigest: candidate.dependencyLockDigest,
          redactionPolicyId: candidate.redaction.policyId,
          targetPolicy: candidate.redaction.targetPolicy,
          createdAt: issuedAt,
          retention: candidate.requestedRetention,
          manifestDigest,
        });
        promotedEvidence.push(evidence);
        return Object.freeze({
          evidence,
          manifest: Object.freeze({}) as VerificationEvidenceManifest,
          authorityReceiptDigests: Object.freeze([
            digestAgentCanonicalValue({
              kind: 'promotion',
              cellId: candidate.cellId,
            }),
          ]),
        });
      },
      async resolveVerifiedView() {
        trace.push('verified-view');
        const revocationRecordDigest = digestAgentCanonicalValue('revocations');
        const verifiedEvidenceView = createVerificationEvidenceVerifiedView({
          closureEvaluationInstant: closureAt,
          revocationRecordDigest,
          records: promotedEvidence.map((evidence) =>
            Object.freeze({
              evidenceId: evidence.id,
              manifestDigest: evidence.manifestDigest,
              materializedEvidenceDigest: digestVerificationValue(evidence),
              effectiveTrust: 'remote-attested' as const,
              trustStatus: 'verified' as const,
              attestationDigest: evidence.provenance.attestationDigest!,
              retentionState: 'active' as const,
              revocationRecordDigests: Object.freeze([]),
              artifacts: Object.freeze(
                evidence.artifacts.map((artifact) =>
                  Object.freeze({
                    artifactId: artifact.id,
                    digest: artifact.digest,
                    status: 'available' as const,
                  })
                )
              ),
            })
          ),
        });
        const base = Object.freeze({
          format:
            'prodivix.agent-evaluation-verification-evidence-bridge' as const,
          version: 1 as const,
          kind: 'verified-view-resolved' as const,
          requestDigest: digestAgentCanonicalValue('view-request'),
          verifiedEvidenceView,
          revokedEvidenceIds: Object.freeze([]),
        });
        return Object.freeze({
          ...base,
          receiptDigest: digestAgentCanonicalValue(base),
        });
      },
    };
    const productionAuthority =
      createProductionAgentEvaluationControlledWorkspaceG3Authority({
        namespaceId: 'namespace.g4',
        evaluationPlanDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        projectId: 'project.g4',
        descriptor,
        generation: 1,
        controlledWorkspaceGrantDigest: digestAgentCanonicalValue(
          'controlled-workspace-grant'
        ),
        sandboxPolicyDigest: digestAgentCanonicalValue('sandbox-policy'),
        fixture,
        verificationAttemptGrantIssuer: issuer,
        cellRuntimeAuthority: runtimeAuthority,
        evidenceBridge,
        now: () => '2026-08-08T00:00:00.000Z',
      });

    const result = await evaluateAgentEvaluationControlledWorkspaceG3({
      evaluationNamespaceId: 'namespace.g4',
      evaluationPlanDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
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
      operationReceiptDigests: [digestAgentCanonicalValue('operation')],
      commandReceiptDigests: [digestAgentCanonicalValue('command')],
      transactionReceiptDigests: [digestAgentCanonicalValue('transaction')],
      evidenceAuthority: productionAuthority,
    });

    if (
      result.status === 'incomplete' &&
      result.reason === 'evidence-authority-unavailable'
    ) {
      throw new Error(`production-trace:${trace.join(',')}`);
    }
    expect(result.status === 'ready' ? 'ready' : result.reason).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.closure.verdict).toBe('satisfied');
    expect(result.verificationAttemptGrantReceiptDigests).toHaveLength(
      result.plan.cells.length
    );
    const finalGrantList = trace.lastIndexOf('grant-list');
    const firstAdapterDispatch = trace.findIndex((entry) =>
      entry.startsWith('adapter-execute:')
    );
    expect(finalGrantList).toBeGreaterThanOrEqual(0);
    expect(firstAdapterDispatch).toBeGreaterThan(finalGrantList);
  }, 60_000);
});
