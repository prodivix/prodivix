import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  digestAgentCapabilityProbeProfile,
  digestAgentCanonicalValue,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  createAgentEvaluationOwnerAuthorityDurability,
  createAgentEvaluationOwnerAuthorityResourceRetirementReceipt,
  createProductionAgentEvaluationOwnerAuthoritySidecar,
  type AgentEvaluationOwnerAuthorityRequest,
  type AgentEvaluationProductionFullAttemptOwnerAuthorityPorts,
  type AgentEvaluationProductionPreplanOwnerAuthorityPorts,
} from './productionOwnerAuthoritySidecar';
import { createFileAgentEvaluationOwnerAuthorityReplayJournal } from './productionOwnerAuthoritySidecarJournal';
import {
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_HEALTH_FORMAT,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_OPERATION,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ROUTE_BINDING,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION,
  createAgentEvaluationRuntimeFactSourceRegistrationRequest,
  decodeAgentEvaluationRuntimeFactSourceRegistrationAuthorityResult,
  digestAgentEvaluationRuntimeFactSourceOwnerAdmission,
  digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck,
  digestAgentEvaluationRuntimeFactSourceRegistrationStage,
  type AgentEvaluationRuntimeFactSourceOwnerHealth,
  type AgentEvaluationRuntimeFactSourceRegistrationAuthorityResult,
  type AgentEvaluationRuntimeFactSourceRegistrationRequest,
} from './runtimeFactSourceRegistration';

const serviceToken = 'runtime-source-registration-token-012345';
const forbiddenCanary = 'runtime-source-registration-forbidden-canary';
const registrationAuthorityIssuerId = 'prodivix.g4-model-evaluation-ledger';
const registrationOwnerAuthorityId =
  'runtime-fact-source.registration-owner.test';
const registrationOwnerImplementationDigest = digestAgentCanonicalValue(
  'runtime-fact-source.registration-owner.implementation'
);
const checkedAt = '2026-08-09T04:00:00.000Z';
const expiresAt = '2026-08-10T04:00:00.000Z';
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

const temporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'runtime-source-register-'));
  directories.push(directory);
  return directory;
};

const requestFixture =
  (): AgentEvaluationRuntimeFactSourceRegistrationRequest =>
    createAgentEvaluationRuntimeFactSourceRegistrationRequest({
      namespaceId: 'evaluation.namespace.runtime-source-registration',
      repositoryCommit: 'b'.repeat(40),
      sourceAuthorityKind: 'shared-durable-capability',
      sourceKind: 'sealed-provider-response-metadata',
      sourceAuthorityId: 'runtime-source.provider-background-job.test',
      sourceAuthorityImplementationDigest: digestAgentCanonicalValue(
        'runtime-source.provider-background-job.implementation'
      ),
      routeBinding: 'provider.background-job.runtime.execute',
      capabilityProfileId: 'g4-provider-background-job',
      capabilityProfileDigest: digestAgentCapabilityProbeProfile(
        'g4-provider-background-job'
      ),
      capabilityId: 'provider.background-job',
      protocolFamily: 'openai-responses',
      providerConfigurationId: 'provider.runtime-source-registration.test',
      modelId: 'model.runtime-source-registration.test',
      modelLineageDigest: digestAgentCanonicalValue(
        'model-lineage.runtime-source-registration'
      ),
      adapterDigest: digestAgentCanonicalValue(
        'adapter.runtime-source-registration'
      ),
      minimumExpiresAt: expiresAt,
    });

const resultFor = (
  request: AgentEvaluationRuntimeFactSourceRegistrationRequest,
  stageDigest: string
): AgentEvaluationRuntimeFactSourceRegistrationAuthorityResult => {
  const healthBase = Object.freeze({
    format: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_HEALTH_FORMAT,
    version: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION,
    requestDigest: request.requestDigest,
    sourceAuthorityId: request.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      request.sourceAuthorityImplementationDigest,
    sourceKind: request.sourceKind,
    routeBinding: request.routeBinding,
    status: 'ready' as const,
    checkedAt,
    expiresAt,
  });
  const ownerHealth = Object.freeze({
    ...healthBase,
    healthDigest: digestAgentCanonicalValue(healthBase),
  }) satisfies AgentEvaluationRuntimeFactSourceOwnerHealth;
  return decodeAgentEvaluationRuntimeFactSourceRegistrationAuthorityResult(
    Object.freeze({
      ownerHealth,
      ownerAdmissionDigest:
        digestAgentEvaluationRuntimeFactSourceOwnerAdmission(
          request.requestDigest,
          ownerHealth.healthDigest,
          stageDigest
        ),
    }),
    request,
    stageDigest
  );
};

const outerRequest = (
  payload: AgentEvaluationRuntimeFactSourceRegistrationRequest,
  mode: 'stage' | 'execute' | 'reconcile',
  input: Readonly<{
    stageDigest?: string;
    dispatchAckDigest?: string;
    sealedOwnerHealth?: AgentEvaluationRuntimeFactSourceOwnerHealth;
    issuerId?: string;
    ownerImplementationDigest?: string | null;
  }> = {}
): AgentEvaluationOwnerAuthorityRequest =>
  Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: 'provider-capability',
    mode,
    namespaceId: payload.namespaceId,
    repositoryCommit: payload.repositoryCommit,
    operation: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_OPERATION,
    routeBinding:
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ROUTE_BINDING,
    requestDigest: payload.requestDigest,
    ...(input.ownerImplementationDigest === null
      ? {}
      : {
          ownerImplementationDigest:
            input.ownerImplementationDigest ??
            registrationOwnerImplementationDigest,
        }),
    registrationAuthorityIssuerId:
      input.issuerId ?? registrationAuthorityIssuerId,
    ...(input.stageDigest ? { stageDigest: input.stageDigest } : {}),
    ...(input.dispatchAckDigest
      ? { dispatchAckDigest: input.dispatchAckDigest }
      : {}),
    ...(input.sealedOwnerHealth
      ? { sealedOwnerHealth: input.sealedOwnerHealth }
      : {}),
    claimGeneration: 1,
    payload,
  });

const createPorts = (counts: { execute: number; reconcile: number }) => {
  const unused = (family: string) =>
    Object.freeze({
      authorityId: `${family}.runtime-source-registration.test`,
      implementationDigest: digestAgentCanonicalValue(family),
      async execute(): Promise<never> {
        throw new TypeError(`unexpected ${family} execute`);
      },
    });
  const runtimeFactSourceRegistration = Object.freeze({
    authorityId: registrationOwnerAuthorityId,
    implementationDigest: registrationOwnerImplementationDigest,
    async execute(input: {
      request: AgentEvaluationRuntimeFactSourceRegistrationRequest;
      stageDigest: string;
    }) {
      counts.execute += 1;
      return resultFor(input.request, input.stageDigest);
    },
    async reconcile(input: {
      request: AgentEvaluationRuntimeFactSourceRegistrationRequest;
      stageDigest: string;
    }) {
      counts.reconcile += 1;
      return resultFor(input.request, input.stageDigest);
    },
  });
  const authorityPorts = Object.freeze({
    purpose: 'preplan' as const,
    capabilityProbe: unused('capability-probe'),
    capabilityProbeProviderResource: unused('provider-resource'),
    capabilityProbeProviderResourceCleanup: unused('provider-resource-cleanup'),
    runtimeFactSourceRegistration,
  });
  return Object.freeze({
    ...authorityPorts,
    async close() {
      return createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(
        authorityPorts
      );
    },
  }) satisfies AgentEvaluationProductionPreplanOwnerAuthorityPorts;
};

const createFullAttemptPorts = (calls: { value: number }) => {
  const durability = createAgentEvaluationOwnerAuthorityDurability();
  const base = (authorityId: string) =>
    Object.freeze({
      authorityId,
      implementationDigest: digestAgentCanonicalValue(authorityId),
      durability,
      async stage(request: AgentEvaluationOwnerAuthorityRequest) {
        calls.value += 1;
        return request.stageDigest!;
      },
      async execute() {
        calls.value += 1;
        return Object.freeze({});
      },
      async reconcile() {
        calls.value += 1;
        return Object.freeze({ response: null, reconciled: false });
      },
    });
  const controlled = base('controlled.full-purpose.test');
  const verification = base('verification.full-purpose.test');
  const identityPorts = Object.freeze({
    purpose: 'full-attempt' as const,
    controlledWorkspace: Object.freeze({
      ...controlled,
      async read() {
        calls.value += 1;
        return Object.freeze([]);
      },
      async execute() {
        calls.value += 1;
        return Object.freeze([]);
      },
      async reconcile() {
        calls.value += 1;
        return Object.freeze({ facts: Object.freeze([]), reconciled: false });
      },
    }),
    verificationEvidence: Object.freeze({
      ...verification,
      async read() {
        calls.value += 1;
        return Object.freeze({});
      },
    }),
    providerCapability: base('provider.full-purpose.test'),
    attemptGrading: base('grading.full-purpose.test'),
  });
  return Object.freeze({
    ...identityPorts,
    async close() {
      return createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(
        identityPorts
      );
    },
  }) satisfies AgentEvaluationProductionFullAttemptOwnerAuthorityPorts;
};

const start = async (
  stateDirectory: string,
  ports: AgentEvaluationProductionPreplanOwnerAuthorityPorts
) => {
  const sidecar = createProductionAgentEvaluationOwnerAuthoritySidecar({
    serviceToken,
    authorities: ports,
    journal:
      await createFileAgentEvaluationOwnerAuthorityReplayJournal(
        stateDirectory
      ),
    forbiddenCanaries: () => Object.freeze([forbiddenCanary, serviceToken]),
  });
  const listener = await sidecar.listen({ host: '127.0.0.1', port: 0 });
  if (sidecar.health.purpose !== 'preplan') {
    throw new TypeError('unexpected test sidecar purpose');
  }
  return Object.freeze({ ...listener, health: sidecar.health });
};

const post = (baseUrl: string, request: AgentEvaluationOwnerAuthorityRequest) =>
  fetch(`${baseUrl}/v1/capability-runtime/${request.mode}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': request.requestDigest,
    },
    body: canonicalJsonText(request),
  });

describe('production runtime fact source registration sidecar', () => {
  it('stages and executes the exact production health owner once', async () => {
    const payload = requestFixture();
    const stageDigest = digestAgentEvaluationRuntimeFactSourceRegistrationStage(
      payload,
      registrationAuthorityIssuerId
    );
    const result = resultFor(payload, stageDigest);
    const counts = { execute: 0, reconcile: 0 };
    const listener = await start(
      await temporaryDirectory(),
      createPorts(counts)
    );
    try {
      expect(Object.keys(listener.health).sort()).toEqual(
        [
          'capabilityProbeAuthorityDigest',
          'capabilityProbeProviderResourceAuthorityDigest',
          'capabilityProbeProviderResourceCleanupAuthorityDigest',
          'format',
          'healthDigest',
          'purpose',
          'replayJournalImplementationDigest',
          'runtimeFactSourceRegistrationAuthorityDigest',
          'status',
          'version',
        ].sort()
      );
      expect(listener.health.purpose).toBe('preplan');
      const staged = await post(
        listener.baseUrl,
        outerRequest(payload, 'stage')
      );
      expect(staged.status).toBe(200);
      expect(await staged.json()).toEqual({
        format: 'prodivix.agent-evaluation-owner-authority-response',
        version: 1,
        serviceKind: 'provider-capability',
        mode: 'stage',
        requestDigest: payload.requestDigest,
        stageDigest,
      });
      const executed = await post(
        listener.baseUrl,
        outerRequest(payload, 'execute', { stageDigest })
      );
      expect(executed.status).toBe(200);
      expect(await executed.json()).toEqual({
        format: 'prodivix.agent-evaluation-owner-authority-response',
        version: 1,
        serviceKind: 'provider-capability',
        mode: 'execute',
        requestDigest: payload.requestDigest,
        ...result,
        stageDigest,
      });
      expect(counts).toEqual({ execute: 1, reconcile: 0 });
    } finally {
      await listener.close();
    }
  });

  it('reconciles an empty host cache from 8790 sealed health with execute zero', async () => {
    const payload = requestFixture();
    const stageDigest = digestAgentEvaluationRuntimeFactSourceRegistrationStage(
      payload,
      registrationAuthorityIssuerId
    );
    const result = resultFor(payload, stageDigest);
    const dispatchAckDigest =
      digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck({
        requestDigest: payload.requestDigest,
        ownerHealthDigest: result.ownerHealth.healthDigest,
        ownerAdmissionDigest: result.ownerAdmissionDigest,
        stageDigest,
        registrationAuthorityIssuerId,
      });
    const counts = { execute: 0, reconcile: 0 };
    const listener = await start(
      await temporaryDirectory(),
      createPorts(counts)
    );
    try {
      const response = await post(
        listener.baseUrl,
        outerRequest(payload, 'reconcile', {
          stageDigest,
          dispatchAckDigest,
          sealedOwnerHealth: result.ownerHealth,
        })
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        mode: 'reconcile',
        ...result,
        stageDigest,
        dispatchAckDigest,
        reconciled: true,
      });
      expect(counts).toEqual({ execute: 0, reconcile: 0 });
    } finally {
      await listener.close();
    }
  });

  it('recovers ACK loss through the durable owner reconcile path with execute zero', async () => {
    const payload = requestFixture();
    const stageDigest = digestAgentEvaluationRuntimeFactSourceRegistrationStage(
      payload,
      registrationAuthorityIssuerId
    );
    const counts = { execute: 0, reconcile: 0 };
    const listener = await start(
      await temporaryDirectory(),
      createPorts(counts)
    );
    try {
      const response = await post(
        listener.baseUrl,
        outerRequest(payload, 'reconcile', { stageDigest })
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        mode: 'reconcile',
        reconciled: true,
      });
      expect(counts).toEqual({ execute: 0, reconcile: 1 });
    } finally {
      await listener.close();
    }
  });

  it('rejects missing or swapped owner implementation, issuer, stage, ACK, and sealed-health drift before owner execution', async () => {
    const payload = requestFixture();
    const stageDigest = digestAgentEvaluationRuntimeFactSourceRegistrationStage(
      payload,
      registrationAuthorityIssuerId
    );
    const result = resultFor(payload, stageDigest);
    const dispatchAckDigest =
      digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck({
        requestDigest: payload.requestDigest,
        ownerHealthDigest: result.ownerHealth.healthDigest,
        ownerAdmissionDigest: result.ownerAdmissionDigest,
        stageDigest,
        registrationAuthorityIssuerId,
      });
    const counts = { execute: 0, reconcile: 0 };
    const listener = await start(
      await temporaryDirectory(),
      createPorts(counts)
    );
    try {
      expect(
        (
          await post(
            listener.baseUrl,
            outerRequest(payload, 'execute', {
              stageDigest,
              ownerImplementationDigest: null,
            })
          )
        ).status
      ).toBe(503);
      expect(
        (
          await post(
            listener.baseUrl,
            outerRequest(payload, 'execute', {
              stageDigest,
              ownerImplementationDigest: digestAgentCanonicalValue(
                'runtime-source-registration.swapped-implementation'
              ),
            })
          )
        ).status
      ).toBe(503);
      expect(
        (
          await post(
            listener.baseUrl,
            outerRequest(payload, 'execute', {
              stageDigest,
              issuerId: 'authority.registration.swapped',
            })
          )
        ).status
      ).toBe(503);
      expect(
        (
          await post(
            listener.baseUrl,
            outerRequest(payload, 'execute', {
              stageDigest: digestAgentCanonicalValue('fake-stage'),
            })
          )
        ).status
      ).toBe(503);
      expect(
        (
          await post(
            listener.baseUrl,
            outerRequest(payload, 'reconcile', {
              stageDigest,
              dispatchAckDigest: digestAgentCanonicalValue('fake-ack'),
              sealedOwnerHealth: result.ownerHealth,
            })
          )
        ).status
      ).toBe(503);
      const swappedHealth = Object.freeze({
        ...result.ownerHealth,
        routeBinding: 'provider.background-job.runtime.swapped',
      });
      expect(
        (
          await post(
            listener.baseUrl,
            outerRequest(payload, 'reconcile', {
              stageDigest,
              dispatchAckDigest,
              sealedOwnerHealth: swappedHealth,
            })
          )
        ).status
      ).toBe(503);
      expect(counts).toEqual({ execute: 0, reconcile: 0 });
    } finally {
      await listener.close();
    }
  });

  it('rejects a preplan registration on a full-attempt sidecar before any owner call', async () => {
    const calls = { value: 0 };
    const authorities = createFullAttemptPorts(calls);
    const sidecar = createProductionAgentEvaluationOwnerAuthoritySidecar({
      serviceToken,
      authorities,
      journal: await createFileAgentEvaluationOwnerAuthorityReplayJournal(
        await temporaryDirectory()
      ),
      forbiddenCanaries: () => Object.freeze([forbiddenCanary, serviceToken]),
    });
    const listener = await sidecar.listen({ host: '127.0.0.1', port: 0 });
    try {
      const payload = requestFixture();
      const stageDigest =
        digestAgentEvaluationRuntimeFactSourceRegistrationStage(
          payload,
          registrationAuthorityIssuerId
        );
      expect(
        (
          await post(
            listener.baseUrl,
            outerRequest(payload, 'execute', { stageDigest })
          )
        ).status
      ).toBe(503);
      expect(calls.value).toBe(0);
    } finally {
      await listener.close();
    }
  });
});
