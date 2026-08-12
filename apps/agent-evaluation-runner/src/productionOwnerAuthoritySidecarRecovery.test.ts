import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digestAgentCanonicalValue } from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  createAgentEvaluationAttemptAuthorityDispatchAckDigest,
  createAgentEvaluationAttemptAuthorityDispatchStageDigest,
  createAgentEvaluationOwnerAuthorityDurability,
  createAgentEvaluationOwnerAuthorityResourceRetirementReceipt,
  createProductionAgentEvaluationOwnerAuthoritySidecar,
  type AgentEvaluationOwnerAuthorityRequest,
  type AgentEvaluationProductionOwnerAuthorityPorts,
} from './productionOwnerAuthoritySidecar';
import { createFileAgentEvaluationOwnerAuthorityReplayJournal } from './productionOwnerAuthoritySidecarJournal';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

const attemptImplementationDigest = digestAgentCanonicalValue({
  subject: 'recovery-owner',
});
const requestBase = Object.freeze({
  format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  serviceKind: 'provider-capability',
  mode: 'execute',
  namespaceId: 'evaluation-namespace:recovery-test',
  planDigest: digestAgentCanonicalValue({ subject: 'recovery-plan' }),
  repositoryCommit: 'a'.repeat(40),
  operation: 'tool.execute',
  routeBinding: '/capability-runtime/execute-tool',
  requestDigest: digestAgentCanonicalValue({ subject: 'recovery-request' }),
  attemptId: 'evaluation-attempt:recovery-test',
  descriptorDigest: digestAgentCanonicalValue({
    subject: 'recovery-descriptor',
  }),
  shardLeaseOwnerId: 'runner.owner.recovery-test',
  shardLeaseGeneration: 7,
  verificationGrantGeneration: 11,
  verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
    subject: 'recovery-verification-grant-set',
  }),
  providerCapabilityObservationReceiptSetDigest: digestAgentCanonicalValue([]),
  ownerImplementationDigest: attemptImplementationDigest,
  claimGeneration: 1,
  payload: Object.freeze({ operation: 'provider.background-job.poll' }),
}) satisfies AgentEvaluationOwnerAuthorityRequest;
const request = Object.freeze({
  ...requestBase,
  stageDigest: createAgentEvaluationAttemptAuthorityDispatchStageDigest(
    requestBase,
    attemptImplementationDigest
  ),
}) satisfies AgentEvaluationOwnerAuthorityRequest;

const invoke = async (
  baseUrl: string,
  authorityRequest: AgentEvaluationOwnerAuthorityRequest = request
): Promise<Response> =>
  fetch(
    `${baseUrl}/v1/capability-runtime/${authorityRequest.mode === 'reconcile' ? 'reconcile' : 'execute'}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${'owner-authority-token-'.padEnd(40, 'x')}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': authorityRequest.requestDigest,
      },
      body: canonicalJsonText(authorityRequest),
    }
  );

describe('production owner authority sidecar crash recovery', () => {
  it('reconciles a durable dispatched request without executing its owner effect twice', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'prodivix-owner-authority-recovery-')
    );
    temporaryDirectories.push(directory);
    const journal =
      await createFileAgentEvaluationOwnerAuthorityReplayJournal(directory);
    const durability = createAgentEvaluationOwnerAuthorityDurability();
    const implementationDigest = attemptImplementationDigest;
    const response = Object.freeze({ outcome: 'supported' });
    let stageCalls = 0;
    let executeCalls = 0;
    let reconcileCalls = 0;
    const attemptAuthority = Object.freeze({
      authorityId: 'authority:recovery-owner',
      implementationDigest,
      durability,
      async stage(authorityRequest: AgentEvaluationOwnerAuthorityRequest) {
        stageCalls += 1;
        return authorityRequest.stageDigest!;
      },
      async execute() {
        executeCalls += 1;
        if (executeCalls === 1) {
          throw new Error('simulated crash after the owner effect');
        }
        return response;
      },
      async reconcile() {
        reconcileCalls += 1;
        return Object.freeze({ response, reconciled: true });
      },
    });
    const controlledWorkspace = Object.freeze({
      ...attemptAuthority,
      async read() {
        return Object.freeze([]);
      },
      async execute() {
        return Object.freeze([]);
      },
      async reconcile() {
        return Object.freeze({ facts: Object.freeze([]), reconciled: true });
      },
    });
    const verificationEvidence = Object.freeze({
      ...attemptAuthority,
      async read() {
        return Object.freeze({});
      },
    });
    const authorityPorts = {
      purpose: 'full-attempt' as const,
      controlledWorkspace,
      verificationEvidence,
      providerCapability: attemptAuthority,
      attemptGrading: attemptAuthority,
    };
    const authorities = Object.freeze({
      ...authorityPorts,
      async close() {
        return createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(
          authorityPorts
        );
      },
    }) satisfies AgentEvaluationProductionOwnerAuthorityPorts;
    const createSidecar = () =>
      createProductionAgentEvaluationOwnerAuthoritySidecar({
        serviceToken: 'owner-authority-token-'.padEnd(40, 'x'),
        authorities,
        journal,
        forbiddenCanaries: () => Object.freeze(['forbidden-canary-value']),
      });

    const firstListener = await createSidecar().listen({
      host: '127.0.0.1',
      port: 0,
    });
    const first = await invoke(firstListener.baseUrl);
    expect(first.status).toBe(503);
    await first.arrayBuffer();
    await firstListener.close();

    const restartedListener = await createSidecar().listen({
      host: '127.0.0.1',
      port: 0,
    });
    try {
      const recovered = await invoke(restartedListener.baseUrl);
      const recoveredBody = await recovered.json();
      expect(
        recovered.status,
        canonicalJsonText({
          body: recoveredBody,
          stageCalls,
          executeCalls,
          reconcileCalls,
        })
      ).toBe(200);
      expect(recoveredBody).toMatchObject({
        requestDigest: request.requestDigest,
        response,
        shardLeaseGeneration: request.shardLeaseGeneration,
        verificationGrantGeneration: request.verificationGrantGeneration,
      });
      expect(stageCalls).toBe(1);
      expect(executeCalls).toBe(1);
      expect(reconcileCalls).toBe(1);
    } finally {
      await restartedListener.close();
    }
  });

  it('rebuilds an empty host-local journal from the durable stage fence and only reconciles', async () => {
    const hostADirectory = await mkdtemp(
      join(tmpdir(), 'prodivix-owner-authority-host-a-')
    );
    const hostBDirectory = await mkdtemp(
      join(tmpdir(), 'prodivix-owner-authority-host-b-')
    );
    temporaryDirectories.push(hostADirectory, hostBDirectory);
    const durability = createAgentEvaluationOwnerAuthorityDurability();
    const implementationDigest = attemptImplementationDigest;
    const response = Object.freeze({ outcome: 'supported' });
    let stageCalls = 0;
    let executeCalls = 0;
    let reconcileCalls = 0;
    let durableResponse: typeof response | undefined;
    const attemptAuthority = Object.freeze({
      authorityId: 'authority:cross-host-recovery-owner',
      implementationDigest,
      durability,
      async stage(authorityRequest: AgentEvaluationOwnerAuthorityRequest) {
        stageCalls += 1;
        return authorityRequest.stageDigest!;
      },
      async execute() {
        executeCalls += 1;
        durableResponse = response;
        throw new Error('simulated host loss after the durable effect');
      },
      async reconcile() {
        reconcileCalls += 1;
        return Object.freeze({
          response: durableResponse ?? null,
          reconciled: durableResponse !== undefined,
        });
      },
    });
    const controlledWorkspace = Object.freeze({
      ...attemptAuthority,
      async read() {
        return Object.freeze([]);
      },
      async execute() {
        return Object.freeze([]);
      },
      async reconcile() {
        return Object.freeze({ facts: Object.freeze([]), reconciled: true });
      },
    });
    const verificationEvidence = Object.freeze({
      ...attemptAuthority,
      async read() {
        return Object.freeze({});
      },
    });
    const authorityPorts = {
      purpose: 'full-attempt' as const,
      controlledWorkspace,
      verificationEvidence,
      providerCapability: attemptAuthority,
      attemptGrading: attemptAuthority,
    };
    const authorities = Object.freeze({
      ...authorityPorts,
      async close() {
        return createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(
          authorityPorts
        );
      },
    }) satisfies AgentEvaluationProductionOwnerAuthorityPorts;
    const createSidecar = async (directory: string) =>
      createProductionAgentEvaluationOwnerAuthoritySidecar({
        serviceToken: 'owner-authority-token-'.padEnd(40, 'x'),
        authorities,
        journal:
          await createFileAgentEvaluationOwnerAuthorityReplayJournal(directory),
        forbiddenCanaries: () => Object.freeze(['forbidden-canary-value']),
      });

    const hostA = await (
      await createSidecar(hostADirectory)
    ).listen({
      host: '127.0.0.1',
      port: 0,
    });
    const first = await invoke(hostA.baseUrl);
    expect(first.status).toBe(503);
    await first.arrayBuffer();
    await hostA.close();

    const hostB = await (
      await createSidecar(hostBDirectory)
    ).listen({
      host: '127.0.0.1',
      port: 0,
    });
    try {
      const reconcileRequest = Object.freeze({
        ...request,
        mode: 'reconcile' as const,
        dispatchAckDigest:
          createAgentEvaluationAttemptAuthorityDispatchAckDigest(
            Object.freeze({ ...request, mode: 'reconcile' as const }),
            response,
            implementationDigest
          ),
      });
      const recovered = await invoke(hostB.baseUrl, reconcileRequest);
      const recoveredBody = await recovered.json();
      expect(
        recovered.status,
        canonicalJsonText({ recoveredBody, stageCalls, executeCalls })
      ).toBe(200);
      expect(recoveredBody).toMatchObject({
        mode: 'reconcile',
        reconciled: true,
        response,
      });
      expect(stageCalls).toBe(1);
      expect(executeCalls).toBe(1);
      expect(reconcileCalls).toBe(1);
    } finally {
      await hostB.close();
    }
  });
});
