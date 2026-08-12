import {
  createAgentEvaluationAttemptAuthorityOwnerReceipt,
  createAgentEvaluationAttemptAuthorityResponseProjection,
  createAgentEvaluationProviderCapabilityObservationReceipt,
  digestAgentCanonicalValue,
  type AgentModelEvaluationAttemptDescriptor,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESPONSE_FORMAT,
  AGENT_EVALUATION_ATTEMPT_AUTHORITY_VERSION,
  AGENT_EVALUATION_CAPABILITY_AUTHORITY_DEFAULT_TIMEOUT_MS,
  AGENT_EVALUATION_GRADING_AUTHORITY_DEFAULT_TIMEOUT_MS,
  createAgentEvaluationAttemptAuthorityRequest,
  decodeAgentEvaluationAttemptAuthorityResponse,
  resolveAgentEvaluationAttemptAuthorityOperationTimeoutMs,
  type AgentEvaluationAttemptAuthorityBinding,
  type AgentEvaluationAttemptAuthorityResponse,
} from './productionAttemptAuthorityClient';

const planDigest = digestAgentCanonicalValue({ plan: 'attempt-authority' });
const descriptorDigest = digestAgentCanonicalValue({
  descriptor: 'attempt-authority',
});
const grantSetDigest = digestAgentCanonicalValue({ grants: ['cell.a'] });
const descriptor = Object.freeze({
  planDigest,
  attemptId: 'attempt.authority.test',
  descriptorDigest,
}) as AgentModelEvaluationAttemptDescriptor;
const binding = Object.freeze({
  namespaceId: 'namespace.g4-evaluation.test',
  planDigest,
  repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
  attemptId: descriptor.attemptId,
  descriptorDigest,
  shardLeaseOwnerId: 'worker.g4-evaluation.test',
  shardLeaseGeneration: 4,
  verificationGrantGeneration: 3,
  verificationAttemptGrantReceiptSetDigest: grantSetDigest,
}) satisfies AgentEvaluationAttemptAuthorityBinding;
const capabilityOutput = Object.freeze({
  outcome: 'failed' as const,
  specificReceipts: Object.freeze([]),
});
const assessmentPayload = Object.freeze({
  terminalTurnIndex: 1,
  terminalInvocationId: 'invocation.authority.assessment',
  material: Object.freeze({
    materialDigest: digestAgentCanonicalValue('material'),
  }),
  capabilityDescriptor: Object.freeze({
    descriptorDigest: digestAgentCanonicalValue('capability-descriptor'),
  }),
});
const executeRequestDigest = digestAgentCanonicalValue({
  providerRequest: 'execute',
});
const executeObservation =
  createAgentEvaluationProviderCapabilityObservationReceipt(
    {
      observationReceiptId: 'observation.authority.execute',
      planDigest,
      repositoryCommit: binding.repositoryCommit,
      attemptId: binding.attemptId,
      descriptorDigest,
      turnIndex: 0,
      invocationId: 'invocation.authority.execute',
      requestDigest: executeRequestDigest,
      responseDigest: digestAgentCanonicalValue({ response: 'execute' }),
      protocolFamily: 'openai-responses',
      providerConfigurationId: 'provider.authority.execute',
      modelLineageDigest: digestAgentCanonicalValue({ model: 'execute' }),
      adapterDigest: digestAgentCanonicalValue({ adapter: 'execute' }),
      dispatchIntentDigest: digestAgentCanonicalValue({ dispatch: 'execute' }),
      transportReceiptDigest: digestAgentCanonicalValue({
        transport: 'execute',
      }),
      resultSpoolReceiptDigest: digestAgentCanonicalValue({ spool: 'execute' }),
      normalizedEventSetDigest: digestAgentCanonicalValue({
        normalized: 'execute',
      }),
      facts: Object.freeze([]),
      factAuthorities: Object.freeze([]),
      observedAt: '2026-08-08T12:00:00.000Z',
    },
    {
      protectedMaterialCanaries: Object.freeze(['protected-canary.execute']),
      secretCanaries: Object.freeze(['secret-canary.execute']),
    }
  );

const responseFor = (
  request: ReturnType<typeof createAgentEvaluationAttemptAuthorityRequest>
): AgentEvaluationAttemptAuthorityResponse => {
  const response =
    request.operation === 'grade-and-persist'
      ? Object.freeze({
          metricObservations: Object.freeze([]),
          gradingDigest: digestAgentCanonicalValue({ grading: 'bounded' }),
        })
      : request.operation === 'execute-tool'
        ? (() => {
            const result = Object.freeze({ status: 'bounded' as const });
            return Object.freeze({
              executionAuthorityKind: 'observation-control' as const,
              outcome: 'supported' as const,
              result,
              resultDigest: digestAgentCanonicalValue(result),
              continuationReceiptDigest: digestAgentCanonicalValue({
                continuation: request.requestDigest,
              }),
              specificReceipts: Object.freeze([]),
            });
          })()
        : capabilityOutput;
  const executePayload = request.payload as Readonly<{
    executionAuthorityKind: 'observation-control';
    invocationId: string;
    turnIndex: number;
    toolId: string;
    toolCallId: string;
    providerToolCallId: string;
    requestDigest: string;
    providerCapabilityObservationReceipt: typeof executeObservation;
  }>;
  const authorityReceipt = createAgentEvaluationAttemptAuthorityOwnerReceipt({
    serviceKind: request.serviceKind,
    operation: request.operation,
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    attemptId: request.attemptId,
    descriptorDigest: request.descriptorDigest,
    shardLeaseOwnerId: request.shardLeaseOwnerId,
    shardLeaseGeneration: request.shardLeaseGeneration,
    verificationGrantGeneration: request.verificationGrantGeneration,
    verificationAttemptGrantReceiptSetDigest:
      request.verificationAttemptGrantReceiptSetDigest,
    requestDigest: request.requestDigest,
    responseProjection: createAgentEvaluationAttemptAuthorityResponseProjection(
      request.serviceKind,
      request.operation,
      response,
      request.operation === 'execute-tool'
        ? {
            bindingKind: 'execute-tool',
            executionAuthorityKind: executePayload.executionAuthorityKind,
            invocationId: executePayload.invocationId,
            turnIndex: executePayload.turnIndex,
            toolId: executePayload.toolId,
            toolCallId: executePayload.toolCallId,
            providerToolCallId: executePayload.providerToolCallId,
            providerRequestDigest: executePayload.requestDigest,
            providerCapabilityObservationReceiptDigest:
              executePayload.providerCapabilityObservationReceipt.receiptDigest,
          }
        : request.operation === 'assess-capability'
          ? {
              bindingKind: 'assess-capability',
              terminalTurnIndex: assessmentPayload.terminalTurnIndex,
              terminalInvocationId: assessmentPayload.terminalInvocationId,
              materialDigest: assessmentPayload.material.materialDigest,
              capabilityDescriptorDigest:
                assessmentPayload.capabilityDescriptor.descriptorDigest,
            }
          : undefined
    ),
    ownerImplementationDigest: digestAgentCanonicalValue({
      owner: request.serviceKind,
    }),
    completedAt: '2026-08-08T12:00:00.000Z',
  });
  return Object.freeze({
    format: AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_ATTEMPT_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    operation: request.operation,
    requestDigest: request.requestDigest,
    shardLeaseOwnerId: request.shardLeaseOwnerId,
    shardLeaseGeneration: request.shardLeaseGeneration,
    verificationGrantGeneration: request.verificationGrantGeneration,
    verificationAttemptGrantReceiptSetDigest:
      request.verificationAttemptGrantReceiptSetDigest,
    replayed: false,
    authorityReceipt,
    response,
  });
};

describe('production attempt authority wire', () => {
  it('allocates bounded operation deadlines for capability and grading owners', () => {
    expect(
      resolveAgentEvaluationAttemptAuthorityOperationTimeoutMs(
        'capability-runtime'
      )
    ).toBe(AGENT_EVALUATION_CAPABILITY_AUTHORITY_DEFAULT_TIMEOUT_MS);
    expect(
      resolveAgentEvaluationAttemptAuthorityOperationTimeoutMs(
        'attempt-grading'
      )
    ).toBe(AGENT_EVALUATION_GRADING_AUTHORITY_DEFAULT_TIMEOUT_MS);
    expect(() =>
      resolveAgentEvaluationAttemptAuthorityOperationTimeoutMs(
        'attempt-grading',
        180_000
      )
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
      })
    );
  });

  it('binds the full descriptor, lease authority, grant generation, and grant set', () => {
    const request = createAgentEvaluationAttemptAuthorityRequest(
      'capability-runtime',
      'assess-capability',
      binding,
      descriptor,
      assessmentPayload
    );
    const decoded = decodeAgentEvaluationAttemptAuthorityResponse(
      responseFor(request),
      request
    );

    expect(decoded.authorityReceipt.receiptDigest).toBe(
      responseFor(request).authorityReceipt.receiptDigest
    );
    expect(request.descriptor).toEqual(descriptor);
  });

  it('changes the request authority when either lease owner or grant set changes', () => {
    const payload = assessmentPayload;
    const request = createAgentEvaluationAttemptAuthorityRequest(
      'capability-runtime',
      'assess-capability',
      binding,
      descriptor,
      payload
    );
    const staleOwner = createAgentEvaluationAttemptAuthorityRequest(
      'capability-runtime',
      'assess-capability',
      Object.freeze({ ...binding, shardLeaseOwnerId: 'worker.stale' }),
      descriptor,
      payload
    );
    const swappedGrantSet = createAgentEvaluationAttemptAuthorityRequest(
      'capability-runtime',
      'assess-capability',
      Object.freeze({
        ...binding,
        verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
          grants: ['cell.b'],
        }),
      }),
      descriptor,
      payload
    );

    expect(staleOwner.requestDigest).not.toBe(request.requestDigest);
    expect(swappedGrantSet.requestDigest).not.toBe(request.requestDigest);
  });

  it('rejects a stale generation or swapped grant-set response', () => {
    const request = createAgentEvaluationAttemptAuthorityRequest(
      'attempt-grading',
      'grade-and-persist',
      binding,
      descriptor,
      Object.freeze({ grading: 'bounded' })
    );
    const response = responseFor(request);

    for (const drifted of [
      Object.freeze({
        ...response,
        shardLeaseGeneration: response.shardLeaseGeneration - 1,
      }),
      Object.freeze({
        ...response,
        verificationGrantGeneration: response.verificationGrantGeneration - 1,
      }),
      Object.freeze({
        ...response,
        verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
          grants: ['cell.swapped'],
        }),
      }),
    ]) {
      expect(() =>
        decodeAgentEvaluationAttemptAuthorityResponse(drifted, request)
      ).toThrowError(
        expect.objectContaining({
          code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
        })
      );
    }
  });

  it('rejects a swapped execute continuation against the durable projection', () => {
    const payload = Object.freeze({
      executionAuthorityKind: 'observation-control' as const,
      invocationId: 'invocation.authority.execute',
      turnIndex: 0,
      toolId: 'provider.retrieval.search',
      toolCallId: 'tool-call.authority.execute',
      providerToolCallId: 'provider-tool-call.authority.execute',
      requestDigest: executeRequestDigest,
      providerCapabilityObservationReceipt: executeObservation,
    });
    const request = createAgentEvaluationAttemptAuthorityRequest(
      'capability-runtime',
      'execute-tool',
      binding,
      descriptor,
      payload
    );
    const response = responseFor(request);
    const raw = response.response as Readonly<{
      continuationReceiptDigest: string;
    }>;

    expect(() =>
      decodeAgentEvaluationAttemptAuthorityResponse(
        Object.freeze({
          ...response,
          response: Object.freeze({
            ...(response.response as object),
            continuationReceiptDigest: digestAgentCanonicalValue({
              continuation: 'swapped',
            }),
          }),
        }),
        request
      )
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
      })
    );
    expect(raw.continuationReceiptDigest).toBe(
      response.authorityReceipt.responseProjection.operation === 'execute-tool'
        ? response.authorityReceipt.responseProjection.continuationReceiptDigest
        : undefined
    );
  });

  it('rejects a same-attempt assessment projected from a prior terminal turn', () => {
    const request = createAgentEvaluationAttemptAuthorityRequest(
      'capability-runtime',
      'assess-capability',
      binding,
      descriptor,
      assessmentPayload
    );
    const response = responseFor(request);
    const priorProjection =
      createAgentEvaluationAttemptAuthorityResponseProjection(
        'capability-runtime',
        'assess-capability',
        response.response,
        {
          bindingKind: 'assess-capability',
          terminalTurnIndex: assessmentPayload.terminalTurnIndex - 1,
          terminalInvocationId: 'invocation.authority.prior-turn',
          materialDigest: assessmentPayload.material.materialDigest,
          capabilityDescriptorDigest:
            assessmentPayload.capabilityDescriptor.descriptorDigest,
        }
      );
    const authority = response.authorityReceipt;
    const priorAuthority = createAgentEvaluationAttemptAuthorityOwnerReceipt({
      serviceKind: authority.serviceKind,
      operation: authority.operation,
      namespaceId: authority.namespaceId,
      planDigest: authority.planDigest,
      repositoryCommit: authority.repositoryCommit,
      attemptId: authority.attemptId,
      descriptorDigest: authority.descriptorDigest,
      shardLeaseOwnerId: authority.shardLeaseOwnerId,
      shardLeaseGeneration: authority.shardLeaseGeneration,
      verificationGrantGeneration: authority.verificationGrantGeneration,
      verificationAttemptGrantReceiptSetDigest:
        authority.verificationAttemptGrantReceiptSetDigest,
      requestDigest: authority.requestDigest,
      responseProjection: priorProjection,
      ownerImplementationDigest: authority.ownerImplementationDigest,
      completedAt: authority.completedAt,
    });

    expect(() =>
      decodeAgentEvaluationAttemptAuthorityResponse(
        Object.freeze({ ...response, authorityReceipt: priorAuthority }),
        request
      )
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
      })
    );
  });
});
