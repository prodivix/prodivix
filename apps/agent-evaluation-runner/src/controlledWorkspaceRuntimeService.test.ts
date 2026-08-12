import {
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationWorkspaceFixtureMaterial,
  type CanonicalDigest,
} from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS } from './authorityTransportDeadline';
import {
  createAgentEvaluationControlledWorkspaceGrant,
  type AgentEvaluationControlledWorkspaceAuthorizationInput,
  type AgentEvaluationControlledWorkspaceCheckpoint,
} from './controlledWorkspaceRuntime';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
  createAgentEvaluationControlledWorkspaceServiceAcknowledgement,
  createEnvironmentAgentEvaluationControlledWorkspaceService,
  type AgentEvaluationControlledWorkspaceServiceRequest,
} from './controlledWorkspaceRuntimeService';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';

const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const token = 'controlled-workspace-service-token-00000000000000000000';
const digest = (label: string): CanonicalDigest =>
  digestAgentCanonicalValue({ label });

const materialFixture = (): Readonly<{
  material: AgentEvaluationCaseMaterial;
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
}> => {
  const material = getG4V8PublicEvaluationCaseMaterials()[0]!;
  const block = material.invocation.blocks.find(
    (candidate) => candidate.kind === 'workspace-fixture'
  );
  if (block?.kind !== 'workspace-fixture') {
    throw new TypeError('Missing public Workspace fixture.');
  }
  return Object.freeze({ material, fixture: block.fixture });
};

const environment = (planDigest: CanonicalDigest): NodeJS.ProcessEnv => ({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: 'namespace.g4',
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
  PRODIVIX_TEST_PLAN_DIGEST: planDigest,
});

const authorization = (
  planDigest: CanonicalDigest,
  material: AgentEvaluationCaseMaterial,
  fixture: AgentEvaluationWorkspaceFixtureMaterial
): AgentEvaluationControlledWorkspaceAuthorizationInput =>
  Object.freeze({
    planDigest,
    attemptId: 'evaluation-attempt:controlled-workspace-service',
    descriptorDigest: digest('descriptor'),
    caseId: material.caseId,
    materialDigest: material.materialDigest,
    access: material.access,
    fixture,
    toolRegistryDigest: digestAgentCanonicalValue(material.invocation.tools),
    actionRegistryDigest: fixture.actionRegistryDigest,
    toolIds: Object.freeze(
      material.invocation.tools.map(({ toolId }) => toolId)
    ),
    actionIds: Object.freeze(
      fixture.actionRegistry.map(({ actionId }) => actionId)
    ),
    targetRefs: fixture.targetRefs,
  });

const grantFor = (
  input: AgentEvaluationControlledWorkspaceAuthorizationInput
) =>
  createAgentEvaluationControlledWorkspaceGrant({
    grantId: 'grant.controlled-workspace-service',
    authorityId: 'authority.controlled-workspace-service',
    planDigest: input.planDigest,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    caseId: input.caseId,
    materialDigest: input.materialDigest,
    fixtureDigest: input.fixture.fixtureDigest,
    baseSnapshotDigest: input.fixture.workspaceSnapshotDigest,
    toolRegistryDigest: input.toolRegistryDigest,
    actionRegistryDigest: input.actionRegistryDigest,
    allowedToolIds: input.toolIds,
    allowedActionIds: input.actionIds,
    allowedTargetRefs: input.targetRefs,
    generation: 1,
    maximumUses: 4,
    issuedAt: '2026-08-08T00:00:00.000Z',
    expiresAt: '2026-08-08T00:15:00.000Z',
  });

const checkpoint = (
  grantDigest: CanonicalDigest,
  attemptId: string,
  label: string
): AgentEvaluationControlledWorkspaceCheckpoint => {
  const base = Object.freeze({
    checkpointRef: `checkpoint.${label}`,
    attemptId,
    grantDigest,
    generation: 1,
    snapshotDigest: digest(`snapshot:${label}`),
    securePersistenceReceiptDigest: digest(`persistence:${label}`),
  });
  return Object.freeze({
    ...base,
    checkpointDigest: digestAgentCanonicalValue(base),
  });
};

const requestFrom = (init?: RequestInit) =>
  JSON.parse(
    String(init?.body)
  ) as AgentEvaluationControlledWorkspaceServiceRequest;

const responseFor = (
  request: AgentEvaluationControlledWorkspaceServiceRequest,
  facts: readonly unknown[],
  requestDigest = request.requestDigest
) =>
  new Response(
    JSON.stringify(
      createAgentEvaluationControlledWorkspaceServiceAcknowledgement({
        format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
        version: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
        operation: request.operation,
        requestDigest,
        facts,
      })
    ),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

const delayedFetchResponse = (
  delayMs: number,
  response: Response,
  signal: AbortSignal | null | undefined
): Promise<Response> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs, response);
    const abort = () => {
      clearTimeout(timeout);
      reject(new Error('delayed controlled Workspace request aborted'));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });

describe('controlled Workspace evaluation service bridge', () => {
  it('issues the distinct Workspace grant through the exact server-only route', async () => {
    const planDigest = digest('plan');
    const { material, fixture } = materialFixture();
    const input = authorization(planDigest, material, fixture);
    const grant = grantFor(input);
    const calls: string[] = [];
    const fetchMock: typeof fetch = async (url, init) => {
      calls.push(String(url));
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        `Bearer ${token}`
      );
      expect(new Headers(init?.headers).get('Idempotency-Key')).toMatch(
        /^sha256-[a-f0-9]{64}$/u
      );
      const request = requestFrom(init);
      expect(request.operation).toBe('grant.issue');
      expect(request.planDigest).toBe(planDigest);
      return responseFor(request, [grant]);
    };
    const service = createEnvironmentAgentEvaluationControlledWorkspaceService({
      planDigest,
      repositoryCommit,
      environment: environment(planDigest),
      fetch: fetchMock,
      operationTimeoutMs: AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS,
    });

    await expect(service.authorizer.issue(input)).resolves.toEqual(grant);
    expect(calls).toEqual([
      `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/namespace.g4/${planDigest}/${repositoryCommit}/controlled-workspace/grants/issue`,
    ]);
  }, 60_000);

  it('reattaches an opaque durable session and ACKs checkpoint restore exactly', async () => {
    const planDigest = digest('plan');
    const { material, fixture } = materialFixture();
    const authorizationInput = authorization(planDigest, material, fixture);
    const grant = grantFor(authorizationInput);
    const initial = checkpoint(grant.grantDigest, grant.attemptId, 'initial');
    const restored = checkpoint(grant.grantDigest, grant.attemptId, 'restored');
    const trace: string[] = [];
    const fetchMock: typeof fetch = async (_url, init) => {
      const request = requestFrom(init);
      trace.push(request.operation);
      if (request.operation === 'session.load-or-reattach') {
        const session = Object.freeze({
          sessionId: 'session.controlled-workspace-service',
          planDigest,
          attemptId: grant.attemptId,
          descriptorDigest: grant.descriptorDigest,
          caseId: grant.caseId,
          materialDigest: grant.materialDigest,
          fixtureDigest: grant.fixtureDigest,
          baseSnapshotDigest: grant.baseSnapshotDigest,
          grantDigest: grant.grantDigest,
          toolRegistryDigest: grant.toolRegistryDigest,
          actionRegistryDigest: grant.actionRegistryDigest,
          generation: grant.generation,
          isolationPolicyDigest: digest('isolation'),
          initialCheckpoint: initial,
          currentCheckpoint: initial,
        });
        return responseFor(request, [
          Object.freeze({
            status: 'reattached',
            session,
            sessionId: session.sessionId,
            attemptId: session.attemptId,
            grantDigest: session.grantDigest,
            generation: session.generation,
            currentCheckpointDigest: initial.checkpointDigest,
            attachmentReceiptDigest: digest('attachment'),
          }),
        ]);
      }
      expect(request.operation).toBe('session.restore-checkpoint');
      return responseFor(request, [
        Object.freeze({
          status: 'restored',
          checkpointDigest: restored.checkpointDigest,
          restorationReceiptDigest: digest('restoration'),
        }),
      ]);
    };
    const service = createEnvironmentAgentEvaluationControlledWorkspaceService({
      planDigest,
      repositoryCommit,
      environment: environment(planDigest),
      fetch: fetchMock,
      operationTimeoutMs: AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS,
    });
    const attachment = await service.loader.loadOrReattach({
      material,
      fixture,
      grant,
      isolationPolicyDigest: digest('isolation'),
    });
    expect(attachment.status).toBe('reattached');
    await attachment.session.restoreCheckpoint(restored);
    expect(attachment.session.currentCheckpoint).toEqual(restored);
    expect(trace).toEqual([
      'session.load-or-reattach',
      'session.restore-checkpoint',
    ]);
  });

  it('rejects a drifted service ACK before exposing any fact', async () => {
    const planDigest = digest('plan');
    const { material, fixture } = materialFixture();
    const input = authorization(planDigest, material, fixture);
    const grant = grantFor(input);
    const service = createEnvironmentAgentEvaluationControlledWorkspaceService({
      planDigest,
      repositoryCommit,
      environment: environment(planDigest),
      fetch: async (_url, init) =>
        responseFor(requestFrom(init), [grant], digest('drifted-request')),
      operationTimeoutMs: AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS,
    });

    await expect(service.authorizer.issue(input)).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });

  it('uses 120+5 seconds for ordinary writes, 170+5 for build artifacts, and 30 seconds for reads', async () => {
    vi.useFakeTimers();
    try {
      const planDigest = digest('plan:delayed-operations');
      const { material, fixture } = materialFixture();
      const input = authorization(planDigest, material, fixture);
      const grant = grantFor(input);
      const initial = checkpoint(grant.grantDigest, grant.attemptId, 'timeout');
      const session = Object.freeze({
        sessionId: 'session.controlled-workspace-timeout',
        planDigest,
        attemptId: grant.attemptId,
        descriptorDigest: grant.descriptorDigest,
        caseId: grant.caseId,
        materialDigest: grant.materialDigest,
        fixtureDigest: grant.fixtureDigest,
        baseSnapshotDigest: grant.baseSnapshotDigest,
        grantDigest: grant.grantDigest,
        toolRegistryDigest: grant.toolRegistryDigest,
        actionRegistryDigest: grant.actionRegistryDigest,
        generation: grant.generation,
        isolationPolicyDigest: digest('isolation:timeout'),
        initialCheckpoint: initial,
        currentCheckpoint: initial,
      });
      const attachment = Object.freeze({
        status: 'loaded',
        session,
        sessionId: session.sessionId,
        attemptId: session.attemptId,
        grantDigest: session.grantDigest,
        generation: session.generation,
        currentCheckpointDigest: initial.checkpointDigest,
        attachmentReceiptDigest: digest('attachment:timeout'),
      });
      const artifact = Object.freeze({
        artifactKind: 'verification-plan' as const,
        artifactRef: 'artifact.controlled-workspace-timeout',
        artifactDigest: digest('artifact:timeout'),
        byteLength: 1,
        persistenceReceiptDigest: digest('artifact-persistence:timeout'),
      });
      let delayMs = 31_000;
      const service =
        createEnvironmentAgentEvaluationControlledWorkspaceService({
          planDigest,
          repositoryCommit,
          environment: environment(planDigest),
          operationTimeoutMs: AGENT_EVALUATION_AUTHORITY_OPERATION_TIMEOUT_MS,
          fetch: async (_url, init) => {
            const request = requestFrom(init);
            return delayedFetchResponse(
              delayMs,
              responseFor(
                request,
                request.operation === 'grant.issue'
                  ? [grant]
                  : request.operation === 'session.load-or-reattach'
                    ? [attachment]
                    : request.operation === 'session.artifact.resolve'
                      ? [artifact]
                      : []
              ),
              init?.signal
            );
          },
        });

      const beyondThirtySeconds = service.authorizer.issue(input);
      await vi.advanceTimersByTimeAsync(31_000);
      await expect(beyondThirtySeconds).resolves.toEqual(grant);

      delayMs = 125_001;
      const beyondOperationDeadline = service.authorizer.issue(input);
      const operationDeadlineRejection = expect(
        beyondOperationDeadline
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted,
      });
      await vi.advanceTimersByTimeAsync(125_000);
      await operationDeadlineRejection;

      delayMs = 1;
      const loaded = service.loader.loadOrReattach({
        material,
        fixture,
        grant,
        isolationPolicyDigest: digest('isolation:timeout'),
      });
      await vi.advanceTimersByTimeAsync(1);
      const loadedSession = (await loaded).session;

      delayMs = 125_001;
      const buildBeyondOrdinaryDeadline =
        loadedSession.resolveArtifact(artifact);
      await vi.advanceTimersByTimeAsync(125_001);
      await expect(buildBeyondOrdinaryDeadline).resolves.toEqual(artifact);

      delayMs = 175_001;
      const beyondBuildDeadline = loadedSession.resolveArtifact(artifact);
      const buildDeadlineRejection = expect(
        beyondBuildDeadline
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted,
      });
      await vi.advanceTimersByTimeAsync(175_000);
      await buildDeadlineRejection;

      delayMs = 30_001;
      const delayedRead = service.loader.listOrphanedSessions();
      const shortDeadlineRejection = expect(delayedRead).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted,
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await shortDeadlineRejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
