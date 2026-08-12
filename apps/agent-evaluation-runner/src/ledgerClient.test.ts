import {
  createAgentEvaluationProductionRunConfigArtifactBinding,
  digestAgentCanonicalValue,
} from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
  AGENT_EVALUATION_LEDGER_MAXIMUM_OPERATION_TIMEOUT_MS,
  AgentEvaluationLedgerClient,
  createEnvironmentAgentEvaluationLedgerClient,
} from './ledgerClient';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';

const token = 'ledger-token-value-0123456789-abcdef';
const scope = Object.freeze({
  namespace: 'g4-evaluation-a1b2c3',
  planDigest: digestAgentCanonicalValue('plan'),
  repositoryCommit: 'a'.repeat(40),
});

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    status,
  });

const clientWith = (
  fetchImplementation: typeof fetch,
  input: Readonly<{
    maximumRequestBytes?: number;
    maximumResponseBytes?: number;
    maximumAggregateResponseBytes?: number;
    timeoutMs?: number;
  }> = {}
) =>
  new AgentEvaluationLedgerClient(
    {
      baseUrl: AGENT_EVALUATION_LEDGER_BASE_URL,
      scope,
      ...input,
    },
    {
      environment: {
        [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
      },
      fetch: fetchImplementation,
    }
  );

describe('agent evaluation ledger client', () => {
  it('loads exact public scope without resolving the callback token', () => {
    const reads: string[] = [];
    const client = createEnvironmentAgentEvaluationLedgerClient({
      environment: (name) => {
        reads.push(name);
        return {
          [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
            AGENT_EVALUATION_LEDGER_BASE_URL,
          [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]:
            scope.namespace,
          [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
            scope.repositoryCommit,
          [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
        }[name];
      },
      fetch: vi.fn<typeof fetch>(),
      planDigest: scope.planDigest,
    });
    expect(client.scope).toEqual(scope);
    expect(reads).not.toContain(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token
    );
  });

  it('covers the frozen plan, execution, budget, authenticity, and snapshot routes', async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const authorization = new Headers(init?.headers).get('authorization');
      expect(authorization).toBe(`Bearer ${token}`);
      expect(init?.redirect).toBe('error');
      calls.push({ method: init?.method ?? 'GET', url: String(input) });
      return jsonResponse({ ok: true });
    });
    const client = clientWith(fetchImplementation);
    const fact = { value: 'safe' };
    const requestOptions = undefined;
    await client.putPlan(fact, requestOptions);
    await client.getPlan();
    await client.putAttempt('attempt-1', fact);
    await client.putAttemptCommit('evaluation-attempt:1', fact);
    await client.listPreDispatchFailureReceipts();
    await client.putPreDispatchFailureReceipt('evaluation-attempt:1', 0, fact);
    await client.getPreDispatchFailureReceipt('evaluation-attempt:1', 0);
    await client.listAttemptTurns('evaluation-attempt:1');
    await client.putTurnDispatchIntent('evaluation-attempt:1', 0, fact);
    await client.closeTurnTransport('evaluation-attempt:1', 0, fact);
    await client.getTurnResultSpool('evaluation-attempt:1', 0, {
      shardId: 'evaluation-shard:1',
      ownerId: 'evaluation-worker.1',
      leaseGeneration: 2,
      expectedTurnDigest: scope.planDigest,
    });
    await client.getAttempt('attempt-1');
    await client.listAttempts();
    await client.putCheckpoint('shard-1', 0, -1, fact);
    await client.listCheckpoints();
    await client.getLatestCheckpoint('shard-1');
    await client.putArtifact('human-review', 'review-1', fact);
    await client.getArtifact('human-review', 'review-1');
    await client.listArtifacts('human-review');
    await client.putReviewCandidate('attempt-1', fact);
    await client.getReviewCandidate('attempt-1');
    await client.listReviewCandidates();
    await client.createBlindReviewMapping('candidate-1');
    await client.getBlindReviewMappingByCandidate('candidate-1');
    await client.getBlindReviewMappingByPresentation('presentation-1');
    await client.putValidatedHumanReviewArtifact(
      fact,
      fact,
      Object.freeze([]),
      digestAgentCanonicalValue({
        validatedHumanMetricObservationDigests: [],
      })
    );
    await client.getValidatedHumanReviewArtifact();
    await client.claimLease('shard-1', fact);
    await client.renewLease('shard-1', fact);
    await client.reserveBudget(
      'reservation-1',
      0,
      '2026-08-08T01:02:03.000Z',
      fact
    );
    await client.settleBudget('reservation-1', 1, fact);
    await client.reconcileBudget(
      'reservation-2',
      2,
      'worker-loss',
      '2026-08-08T01:02:04.000Z'
    );
    await client.getBudget();
    await client.putEndpointSmokeReceipt('smoke-1', fact);
    await client.getEndpointSmokeReceipt('smoke-1');
    await client.putInvocationReceipt('attempt-1', fact);
    await client.getInvocationReceipt('attempt-1');
    await client.putSourceReceipt('source-1', fact);
    await client.getSourceReceipt('source-1');
    await client.putExecutionReceipt('attempt-1', fact);
    await client.getExecutionReceipt('attempt-1');
    await client.putAuthorityAttestation(fact);
    await client.getAuthorityAttestation();
    await client.putEvidenceRoot(fact);
    await client.getEvidenceRoot();
    await client.getStatus({
      observedAt: '2026-08-08T01:02:05.000Z',
      shardId: 'evaluation-shard:1',
    });
    await client.openEvidenceExportLease({
      runConfigArtifactBinding:
        createAgentEvaluationProductionRunConfigArtifactBinding({
          sourcePlanArtifactName: 'g4-plan-1234567-1',
          sourcePlanArtifactDigest: `sha256:${'1'.repeat(64)}`,
          sourcePlanWorkflowRunId: '1234567',
          sourcePlanWorkflowRunAttempt: 1,
          runConfigFileName: 'production-run-config.json',
          runConfigByteLength: 1_024,
          runConfigCanonicalBytesDigest: scope.planDigest,
          sourceConfigDigest: scope.planDigest,
          frozenRunDigest: scope.planDigest,
          planDigest: scope.planDigest,
          repositoryCommit: scope.repositoryCommit,
        }),
      sourceConfigDigest: scope.planDigest,
      frozenRunDigest: scope.planDigest,
    });
    await client.getEvidenceExportLease('evaluation-export-lease:1');
    await client.getEvidenceExportFamilyPage(
      'evaluation-export-lease:1',
      'attempts',
      'eyJjdXJzb3IiOiIxIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    );
    await client.openReviewLease();
    await client.getReviewLease('evaluation-review-lease:1');
    await client.getReviewLeaseFamilyPage(
      'evaluation-review-lease:1',
      'reviewCandidateRefs',
      'eyJjdXJzb3IiOiIyIn0.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
    );
    await client.putArchiveClosure(fact);
    await client.getArchiveClosure();
    await client.sealHoldoutClosure(fact);
    await client.inspectFinalization(fact);
    await client.putFinalizationIntent(fact);
    await client.getFinalizationIntent();
    await client.putFinalization(fact);
    await client.getEndpointSmokeCommit();
    await client.putEndpointSmokeCommit(fact);
    await client.reserveEndpointSmokeBudget('smoke-reservation-1', fact);
    await client.listEndpointSmokeTurns();
    await client.putEndpointSmokeDispatch('smoke-target-1', fact);
    await client.closeEndpointSmokeTransport('smoke-target-1', fact);
    await client.getEndpointSmokeResultSpool(
      'smoke-target-1',
      scope.planDigest
    );

    const prefix = `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${scope.namespace}/${scope.planDigest}/${scope.repositoryCommit}`;
    expect(calls).toEqual(
      expect.arrayContaining([
        { method: 'PUT', url: `${prefix}/plan` },
        { method: 'GET', url: `${prefix}/attempts` },
        {
          method: 'PUT',
          url: `${prefix}/attempt-commits/evaluation-attempt%3A1`,
        },
        {
          method: 'GET',
          url: `${prefix}/attempt-turns/evaluation-attempt%3A1`,
        },
        {
          method: 'GET',
          url: `${prefix}/receipts/pre-dispatch-failure`,
        },
        {
          method: 'PUT',
          url: `${prefix}/receipts/pre-dispatch-failure/evaluation-attempt%3A1/0`,
        },
        {
          method: 'GET',
          url: `${prefix}/receipts/pre-dispatch-failure/evaluation-attempt%3A1/0`,
        },
        {
          method: 'PUT',
          url: `${prefix}/attempt-turns/evaluation-attempt%3A1/0/dispatch`,
        },
        {
          method: 'PUT',
          url: `${prefix}/attempt-turns/evaluation-attempt%3A1/0/close`,
        },
        {
          method: 'GET',
          url: `${prefix}/attempt-turns/evaluation-attempt%3A1/0/result-spool?shardId=evaluation-shard%3A1&ownerId=evaluation-worker.1&leaseGeneration=2&expectedTurnDigest=${scope.planDigest}`,
        },
        {
          method: 'PUT',
          url: `${prefix}/checkpoints/shard-1/0?expectedPreviousRevision=-1`,
        },
        {
          method: 'GET',
          url: `${prefix}/artifacts?factType=human-review`,
        },
        {
          method: 'PUT',
          url: `${prefix}/review-candidates/attempt-1`,
        },
        {
          method: 'GET',
          url: `${prefix}/review-candidates/attempt-1`,
        },
        { method: 'GET', url: `${prefix}/review-candidates` },
        {
          method: 'PUT',
          url: `${prefix}/blind-review-mappings/candidates/candidate-1`,
        },
        {
          method: 'GET',
          url: `${prefix}/blind-review-mappings/candidates/candidate-1`,
        },
        {
          method: 'GET',
          url: `${prefix}/blind-review-mappings/presentations/presentation-1`,
        },
        {
          method: 'PUT',
          url: `${prefix}/validated-human-review-artifact`,
        },
        {
          method: 'GET',
          url: `${prefix}/validated-human-review-artifact`,
        },
        { method: 'POST', url: `${prefix}/leases/shard-1/claim` },
        {
          method: 'PUT',
          url: `${prefix}/budget/reservations/reservation-1?expectedRevision=0&reservedAt=2026-08-08T01%3A02%3A03.000Z`,
        },
        {
          method: 'PUT',
          url: `${prefix}/receipts/endpoint-smoke/smoke-1`,
        },
        {
          method: 'PUT',
          url: `${prefix}/budget/reconciliations/reservation-2?expectedRevision=2&reason=worker-loss&settledAt=2026-08-08T01%3A02%3A04.000Z`,
        },
        { method: 'PUT', url: `${prefix}/authority-attestation` },
        { method: 'PUT', url: `${prefix}/evidence-root` },
        {
          method: 'GET',
          url: `${prefix}/status?observedAt=2026-08-08T01%3A02%3A05.000Z&shardId=evaluation-shard%3A1`,
        },
        { method: 'POST', url: `${prefix}/export-leases` },
        {
          method: 'GET',
          url: `${prefix}/export-leases/evaluation-export-lease%3A1`,
        },
        {
          method: 'GET',
          url: `${prefix}/export-leases/evaluation-export-lease%3A1/families/attempts?cursor=eyJjdXJzb3IiOiIxIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
        },
        { method: 'POST', url: `${prefix}/review-leases` },
        {
          method: 'GET',
          url: `${prefix}/review-leases/evaluation-review-lease%3A1`,
        },
        {
          method: 'GET',
          url: `${prefix}/review-leases/evaluation-review-lease%3A1/families/reviewCandidateRefs?cursor=eyJjdXJzb3IiOiIyIn0.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB`,
        },
        { method: 'PUT', url: `${prefix}/archive-closure` },
        { method: 'GET', url: `${prefix}/archive-closure` },
        { method: 'PUT', url: `${prefix}/holdout-closure` },
        { method: 'POST', url: `${prefix}/finalization-inspection` },
        { method: 'PUT', url: `${prefix}/finalization-intent` },
        { method: 'GET', url: `${prefix}/finalization-intent` },
        { method: 'PUT', url: `${prefix}/finalization` },
        { method: 'GET', url: `${prefix}/endpoint-smoke/commit` },
        { method: 'PUT', url: `${prefix}/endpoint-smoke/commit` },
        {
          method: 'PUT',
          url: `${prefix}/endpoint-smoke/budget-reservations/smoke-reservation-1`,
        },
        { method: 'GET', url: `${prefix}/endpoint-smoke/turns` },
        {
          method: 'PUT',
          url: `${prefix}/endpoint-smoke/targets/smoke-target-1/dispatch`,
        },
        {
          method: 'PUT',
          url: `${prefix}/endpoint-smoke/targets/smoke-target-1/close`,
        },
        {
          method: 'GET',
          url: `${prefix}/endpoint-smoke/targets/smoke-target-1/result-spool?expectedSpoolReceiptDigest=${scope.planDigest}`,
        },
      ])
    );
    expect(calls).toHaveLength(66);
  });

  it('rejects a pre-aborted request before token resolution or fetch', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    let tokenReads = 0;
    const client = new AgentEvaluationLedgerClient(
      { baseUrl: AGENT_EVALUATION_LEDGER_BASE_URL, scope },
      {
        environment: (name) => {
          if (name === AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token) {
            tokenReads += 1;
            return token;
          }
          return undefined;
        },
        fetch: fetchImplementation,
      }
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.getStatus(
        { observedAt: '2026-08-08T01:02:05.000Z' },
        { signal: controller.signal }
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted,
    });
    expect(tokenReads).toBe(0);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('bounds request and response bodies', async () => {
    const requestClient = clientWith(vi.fn<typeof fetch>(), {
      maximumRequestBytes: 16,
    });
    await expect(
      requestClient.putPlan({ value: 'body-exceeds-limit' })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge,
    });

    const responseClient = clientWith(
      vi.fn<typeof fetch>(async () => jsonResponse({ value: 'too-large' })),
      { maximumResponseBytes: 8 }
    );
    await expect(responseClient.getPlan()).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge,
    });
  });

  it('allows the bounded validated-review atomic route above the ordinary request cap', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({ replayed: false })
    );
    const client = clientWith(fetchImplementation);
    const largeFact = Object.freeze({ value: 'x'.repeat(2_100_000) });

    await expect(client.putPlan(largeFact)).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge,
    });
    await expect(
      client.putValidatedHumanReviewArtifact(
        largeFact,
        { report: 'safe' },
        Object.freeze([]),
        digestAgentCanonicalValue({
          validatedHumanMetricObservationDigests: [],
        })
      )
    ).resolves.toEqual({ replayed: false });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [, init] = fetchImplementation.mock.calls[0]!;
    expect(init?.body).toBe(
      JSON.stringify({
        humanReviewReportFact: { report: 'safe' },
        validatedHumanMetricObservationSetDigest: digestAgentCanonicalValue({
          validatedHumanMetricObservationDigests: [],
        }),
        validatedHumanMetricObservations: [],
        validatedHumanReviewArtifact: largeFact,
      })
    );
  });

  it('sanitizes network failures that contain the token and URL', async () => {
    const client = clientWith(
      vi.fn<typeof fetch>(async (input) => {
        throw new Error(`${String(input)} ${token}`);
      })
    );
    let serialized = '';
    try {
      await client.getPlan();
    } catch (caught) {
      serialized = JSON.stringify(caught);
    }
    expect(serialized).toContain(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
    );
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(AGENT_EVALUATION_LEDGER_BASE_URL);
  });

  it('enforces its timeout even when an injected fetch ignores AbortSignal', async () => {
    const client = clientWith(
      vi.fn<typeof fetch>(
        () => new Promise<Response>(() => undefined)
      ) as typeof fetch,
      { timeoutMs: 5 }
    );
    await expect(client.getPlan()).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted,
    });
  });

  it('allows an explicit long-operation timeout to recover an exact replay after 30 seconds', async () => {
    vi.useFakeTimers();
    try {
      const replay = Object.freeze({
        fact: Object.freeze({ value: 'exact-replay' }),
        replayed: true,
      });
      const fetchImplementation = vi.fn<typeof fetch>(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => resolve(jsonResponse(replay)), 31_000);
          })
      );
      const result = clientWith(fetchImplementation).getPlan({
        timeoutMs: 35_000,
      });

      await vi.advanceTimersByTimeAsync(31_000);

      await expect(result).resolves.toEqual(replay);
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a request timeout above the operation cap before resolving credentials', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    let tokenReads = 0;
    const client = new AgentEvaluationLedgerClient(
      { baseUrl: AGENT_EVALUATION_LEDGER_BASE_URL, scope },
      {
        environment: (name) => {
          if (name === AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token) {
            tokenReads += 1;
            return token;
          }
          return undefined;
        },
        fetch: fetchImplementation,
      }
    );

    await expect(
      client.getPlan({
        timeoutMs: AGENT_EVALUATION_LEDGER_MAXIMUM_OPERATION_TIMEOUT_MS + 1,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    expect(tokenReads).toBe(0);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('blocks token reflection in raw and decoded JSON responses', async () => {
    const rawClient = clientWith(
      vi.fn<typeof fetch>(async () => jsonResponse({ value: token }))
    );
    await expect(rawClient.getPlan()).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
    });

    const encodedToken = [...token]
      .map(
        (character) =>
          `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
      )
      .join('');
    const decodedClient = clientWith(
      vi.fn<typeof fetch>(
        async () =>
          new Response(`{"value":"${encodedToken}"}`, {
            headers: { 'content-type': 'application/json' },
            status: 200,
          })
      )
    );
    await expect(decodedClient.getPlan()).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
    });
  });

  it('fails closed for base URL, scope, paths, media types, and redirects', async () => {
    expect(
      () =>
        new AgentEvaluationLedgerClient(
          {
            baseUrl:
              'http://localhost:8790' as typeof AGENT_EVALUATION_LEDGER_BASE_URL,
            scope,
          },
          { fetch: vi.fn<typeof fetch>() }
        )
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );
    const fetchImplementation = vi.fn<typeof fetch>(
      async () =>
        new Response('{"ok":true}', {
          headers: { 'content-type': 'application/jsonp' },
          status: 200,
        })
    );
    const client = clientWith(fetchImplementation);
    expect(() => client.getAttempt('../escape')).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );
    await expect(client.getPlan()).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });

    const redirectClient = clientWith(
      vi.fn<typeof fetch>(async () => jsonResponse({ moved: true }, 302))
    );
    await expect(redirectClient.getPlan()).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
      httpStatus: 302,
    });
  });
});
