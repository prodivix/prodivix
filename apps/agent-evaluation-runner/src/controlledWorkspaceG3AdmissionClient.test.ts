import {
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  planAgentModelEvaluationAttempts,
} from '@prodivix/ai';
import {
  createVerificationAdapterRegistrySnapshot,
  digestVerificationValue,
  type VerificationAdapterRegistration,
} from '@prodivix/verification';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { describe, expect, it } from 'vitest';
import { createV8EvaluationPlan } from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import {
  createAgentEvaluationControlledWorkspaceDomainPlan,
  createAgentEvaluationControlledWorkspaceG3PlanProjection,
} from './controlledWorkspaceRuntimeOwners';
import {
  AGENT_EVALUATION_G3_CELL_ADMISSION_RESPONSE_FORMAT,
  AGENT_EVALUATION_G3_CELL_ADMISSION_VERSION,
  createEnvironmentAgentEvaluationControlledWorkspaceG3AdmissionAuthority,
  type AgentEvaluationControlledWorkspaceG3AdmissionRequest,
} from './controlledWorkspaceG3AdmissionClient';
import type { AgentEvaluationControlledWorkspaceG3AdmissionInput } from './controlledWorkspaceRuntimeProduction';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';

const now = '2026-08-08T00:00:00.000Z';
const serviceToken = 'owner-admission-token-0123456789ab';
const forbiddenCanary = 'admission-forbidden-canary';

const fixture = (): AgentEvaluationControlledWorkspaceG3AdmissionInput => {
  const evaluationPlan = createV8EvaluationPlan();
  const material = getG4V8PublicEvaluationCaseMaterials().find((candidate) =>
    candidate.invocation.blocks.some(
      (block) =>
        block.kind === 'workspace-fixture' &&
        block.fixture.expectedOutcome.proposal.status === 'ready' &&
        block.fixture.expectedOutcome.transaction.expectedCommandCount > 0
    )
  );
  if (!material) throw new TypeError('Missing ready Workspace material.');
  const block = material.invocation.blocks.find(
    (candidate) => candidate.kind === 'workspace-fixture'
  );
  if (block?.kind !== 'workspace-fixture') {
    throw new TypeError('Missing Workspace fixture.');
  }
  const descriptor = planAgentModelEvaluationAttempts(evaluationPlan).find(
    ({ caseId }) => caseId === material.caseId
  );
  if (!descriptor) throw new TypeError('Missing descriptor.');
  const domain = createAgentEvaluationControlledWorkspaceDomainPlan({
    caseId: descriptor.caseId,
    attemptId: descriptor.attemptId,
    fixture: block.fixture,
    issuedAt: now,
    expiresAt: '2026-08-08T00:15:00.000Z',
  });
  if (domain.status !== 'ready') throw new TypeError('Domain plan is blocked.');
  const baseWorkspace = block.fixture.workspaceSnapshot as WorkspaceSnapshot;
  const finalWorkspace = domain.plan.candidateSnapshot;
  const baseSnapshotDigest = digestAgentCanonicalValue(baseWorkspace);
  const finalWorkspaceSnapshotDigest =
    digestAgentCanonicalValue(finalWorkspace);
  const projection = createAgentEvaluationControlledWorkspaceG3PlanProjection({
    fixture: block.fixture,
    baseWorkspace,
    finalWorkspace,
    baseSnapshotDigest,
    finalSnapshotDigest: finalWorkspaceSnapshotDigest,
  });
  if (projection.status !== 'ready') {
    throw new TypeError('Verification Plan is blocked.');
  }
  const registrySnapshot = createVerificationAdapterRegistrySnapshot(
    block.fixture.verificationFixture
      .adapters as unknown as readonly VerificationAdapterRegistration[]
  );
  return Object.freeze({
    namespaceId: 'evaluation.namespace.admission.test',
    evaluationPlanDigest: evaluationPlan.planDigest,
    repositoryCommit: evaluationPlan.repositoryCommit,
    projectId: finalWorkspace.id,
    descriptor,
    generation: 1,
    fixture: block.fixture,
    finalWorkspaceSnapshotDigest,
    plan: projection.plan,
    registrySnapshot,
    cell: projection.plan.cells[0]!,
  });
};

const stageDigestFor = (
  request: AgentEvaluationControlledWorkspaceG3AdmissionRequest,
  ownerImplementationDigest: string
) =>
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-g3-cell-admission-dispatch-stage',
    version: 1,
    serviceKind: 'controlled-workspace',
    operation: 'verification.cell.admit',
    routeBinding: 'g3-cell-admission',
    namespaceId: request.namespaceId,
    evaluationPlanDigest: request.evaluationPlanDigest,
    repositoryCommit: request.repositoryCommit,
    attemptId: request.attemptId,
    descriptorDigest: request.descriptorDigest,
    generation: request.generation,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
  });

const responseFor = (
  request: AgentEvaluationControlledWorkspaceG3AdmissionRequest,
  mutate?: (response: Record<string, unknown>) => void
) => {
  const ownerImplementationDigest = digestAgentCanonicalValue(
    'production-g3-cell-admission-owner'
  );
  const runtimeAuthorityDigest = digestAgentCanonicalValue(
    'observed-production-chromium-runtime'
  );
  const stageDigest = stageDigestFor(request, ownerImplementationDigest);
  const run = Object.freeze({
    runId: `g3-run.${request.requestDigest.slice(7, 47)}`,
    providerId: 'prodivix.g4.chromium-production',
    parentAttemptId: request.attemptId,
    surface: request.cell.surface,
    frameworkTarget: request.cell.frameworkTarget,
    runtimeZone: 'sandbox',
    browserEngine: request.cell.browserEngine,
    viewport: request.cell.viewport,
    devicePixelRatio: 1,
    colorScheme: request.cell.colorScheme,
    motion: request.cell.motion,
    locale: request.cell.locale,
    timezone: 'UTC',
    fontSetDigest: digestAgentCanonicalValue('observed-font-set'),
    sandboxImageDigest: digestAgentCanonicalValue('observed-sandbox-image'),
  });
  const ownerAdmissionDigest = digestAgentCanonicalValue({
    requestDigest: request.requestDigest,
    run,
    runtimeAuthorityDigest,
    ownerImplementationDigest,
    stageDigest,
  });
  const dispatchAckDigest = digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-g3-cell-admission-dispatch-ack',
    version: 1,
    namespaceId: request.namespaceId,
    evaluationPlanDigest: request.evaluationPlanDigest,
    repositoryCommit: request.repositoryCommit,
    attemptId: request.attemptId,
    descriptorDigest: request.descriptorDigest,
    generation: request.generation,
    requestDigest: request.requestDigest,
    run,
    runtimeAuthorityDigest,
    ownerImplementationDigest,
    ownerAdmissionDigest,
    stageDigest,
  });
  const base: Record<string, unknown> = {
    format: AGENT_EVALUATION_G3_CELL_ADMISSION_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_G3_CELL_ADMISSION_VERSION,
    requestDigest: request.requestDigest,
    run,
    runtimeAuthorityDigest,
    ownerImplementationDigest,
    ownerAdmissionDigest,
    stageDigest,
    dispatchAckDigest,
  };
  mutate?.(base);
  return Object.freeze({
    ...base,
    admissionReceiptDigest: digestAgentCanonicalValue(base),
  });
};

const environmentFor = (
  input: AgentEvaluationControlledWorkspaceG3AdmissionInput
) =>
  Object.freeze({
    [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
      AGENT_EVALUATION_LEDGER_BASE_URL,
    [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: input.namespaceId,
    [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
      input.repositoryCommit,
    [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: serviceToken,
  });

describe('controlled Workspace G3 cell admission client', () => {
  it('accepts only the exact 8790-sealed runtime identity before dispatch', async () => {
    const input = fixture();
    let observedRequest:
      AgentEvaluationControlledWorkspaceG3AdmissionRequest | undefined;
    const requestDigests: string[] = [];
    const authority =
      createEnvironmentAgentEvaluationControlledWorkspaceG3AdmissionAuthority({
        evaluationPlanDigest: input.evaluationPlanDigest,
        repositoryCommit: input.repositoryCommit,
        environment: environmentFor(input),
        forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
        fetch: async (_url, init) => {
          expect(init?.method).toBe('POST');
          expect(init?.cache).toBe('no-store');
          expect(init?.credentials).toBe('omit');
          expect(String(init?.body)).not.toContain(serviceToken);
          expect(String(init?.body)).not.toContain(forbiddenCanary);
          observedRequest = JSON.parse(
            String(init?.body)
          ) as AgentEvaluationControlledWorkspaceG3AdmissionRequest;
          requestDigests.push(observedRequest.requestDigest);
          expect(observedRequest.cellDigest).toBe(
            digestVerificationValue(observedRequest.cell)
          );
          expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(
            observedRequest.requestDigest
          );
          return new Response(canonicalJsonText(responseFor(observedRequest)), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      });
    const admission = await authority.admit(input);
    const acknowledgedReplay = await authority.admit(input);
    expect(observedRequest).toBeDefined();
    expect(acknowledgedReplay).toEqual(admission);
    expect(new Set(requestDigests)).toEqual(
      new Set([observedRequest!.requestDigest])
    );
    expect(admission.run.parentAttemptId).toBe(input.descriptor.attemptId);
    expect(admission.run.fontSetDigest).toBe(
      digestAgentCanonicalValue('observed-font-set')
    );
  }, 15_000);

  it.each([
    'stageDigest',
    'dispatchAckDigest',
    'ownerAdmissionDigest',
  ] as const)(
    'rejects a recomputed response carrying a fake %s fence',
    async (field) => {
      const input = fixture();
      const authority =
        createEnvironmentAgentEvaluationControlledWorkspaceG3AdmissionAuthority(
          {
            evaluationPlanDigest: input.evaluationPlanDigest,
            repositoryCommit: input.repositoryCommit,
            environment: environmentFor(input),
            forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
            fetch: async (_url, init) => {
              const request = JSON.parse(
                String(init?.body)
              ) as AgentEvaluationControlledWorkspaceG3AdmissionRequest;
              return new Response(
                canonicalJsonText(
                  responseFor(request, (response) => {
                    response[field] = digestAgentCanonicalValue(
                      `fake-${field}`
                    );
                  })
                ),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                }
              );
            },
          }
        );
      await expect(authority.admit(input)).rejects.toThrow(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
      );
    }
  );

  it('rejects an invalid optional operating-system identity', async () => {
    const input = fixture();
    const authority =
      createEnvironmentAgentEvaluationControlledWorkspaceG3AdmissionAuthority({
        evaluationPlanDigest: input.evaluationPlanDigest,
        repositoryCommit: input.repositoryCommit,
        environment: environmentFor(input),
        forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
        fetch: async (_url, init) => {
          const request = JSON.parse(
            String(init?.body)
          ) as AgentEvaluationControlledWorkspaceG3AdmissionRequest;
          return new Response(
            canonicalJsonText(
              responseFor(request, (response) => {
                response.run = Object.freeze({
                  ...(response.run as Record<string, unknown>),
                  operatingSystemIdentity: Object.freeze({ invalid: true }),
                });
              })
            ),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        },
      });
    await expect(authority.admit(input)).rejects.toThrow(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
    );
  });
});
