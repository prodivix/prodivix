import { generateKeyPairSync } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ENVIRONMENT_NAME,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
  createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary,
  digestAgentCanonicalValue,
  matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  type AgentEvaluationCapabilityEffectProviderJournalHealth,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { afterEach, describe, expect, it } from 'vitest';
import {
  composeProductionAgentEvaluationOwnerAuthorityPorts,
  createProductionAgentEvaluationOwnerAuthorityPortsFromEnvironment,
} from './productionOwnerAuthorityComposition';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  createAgentEvaluationAttemptAuthorityDispatchAckDigest,
  createAgentEvaluationAttemptAuthorityDispatchStageDigest,
  createAgentEvaluationControlledWorkspaceDirectDispatchAckDigest,
  createAgentEvaluationControlledWorkspaceDirectStageDigest,
  createAgentEvaluationOwnerAuthorityDurability,
  createAgentEvaluationOwnerAuthorityResourceRetirementReceipt,
  createProductionAgentEvaluationOwnerAuthoritySidecar,
  type AgentEvaluationOwnerAuthorityRequest,
  type AgentEvaluationAttemptAuthorityResultIngressPort,
  type AgentEvaluationProductionFullAttemptOwnerAuthorityPorts,
  type AgentEvaluationProductionPreplanOwnerAuthorityPorts,
} from './productionOwnerAuthoritySidecar';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES,
  createProductionAgentEvaluationOwnerAuthoritySidecarFromEnvironment,
} from './productionOwnerAuthoritySidecarEnvironment';
import { createFileAgentEvaluationOwnerAuthorityReplayJournal } from './productionOwnerAuthoritySidecarJournal';
import {
  productionAgentEvaluationOwnerAuthorityStartupDiagnostic,
  writeProductionAgentEvaluationOwnerAuthorityShutdownReceipt,
} from './productionOwnerAuthoritySidecarMain';
import {
  createProductionAgentEvaluationAttemptOwnerAuthorityPortsFromEnvironment as createConcreteProductionAttemptOwnerAuthorityPortsFromEnvironment,
  loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding,
} from './productionAttemptOwnerAuthorityPorts';
import { AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME } from './capabilityProbeResponseSpoolKey';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_LIST_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
} from './capabilityProbeProviderResourceCleanupClient';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import { PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME } from './productionCapabilityEffectProviderJournalClient';
import {
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_FORMAT,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_VERSION,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_RECORDS,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ENVIRONMENT_NAME,
} from './productionNativeProviderStateVaultHealthClient';
import {
  AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_ENV,
  createAgentEvaluationNativeProviderStateVaultEncryptionProfile,
  decodeAgentEvaluationRunConfigQualificationTemplate,
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';
import { AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES } from './attestationSigner';
import {
  AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_ENVIRONMENT_NAMES,
  produceAgentEvaluationFrozenConfigCommitment,
} from './productionFrozenConfigCommitment';
import {
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME,
  AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES,
} from './productionRunConfigArtifact';
import { createNodeAgentEvaluationCoordinatorFilePort } from './productionFiles';
import {
  createAgentEvaluationRuntimeFactSourceRegistrationRequest,
  digestAgentEvaluationRuntimeFactSourceRegistrationStage,
} from './runtimeFactSourceRegistration';
import { createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding } from './productionSharedEffectHostedOwner';
import { AGENT_EVALUATION_PROVIDER_DEFINITIONS } from './config';
import type {
  AgentProviderSecretResolver,
  AgentProviderSecretUseRequest,
} from './secretResolver';

const serviceToken = 'owner-authority-token-00000000000000000001';
const commit = '0123456789abcdef0123456789abcdef01234567';
const canary = 'PROTECTED-HOLDOUT-CANARY-OWNER-0001';
const directories: string[] = [];
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const qualificationTemplatePath = fileURLToPath(
  new URL(
    '../../../specs/evaluation/g4-real-model-evaluation.example.json',
    import.meta.url
  )
);
const qualificationTemplateText = await readFile(
  qualificationTemplatePath,
  'utf8'
);

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

const directory = async (): Promise<string> => {
  const value = await mkdtemp(join(tmpdir(), 'prodivix-owner-sidecar-'));
  directories.push(value);
  await writeFile(join(value, 'g4-run-config-template.json'), '{}', 'utf8');
  return value;
};

const durableDirectory = async (): Promise<string> => {
  const value = await mkdtemp(join(repositoryRoot, '.owner-sidecar-purpose-'));
  directories.push(value);
  return value;
};

const installFullAttemptFrozenHostedBinding = async (
  root: string,
  values: Map<string, string>
) => {
  const source = materializeAgentEvaluationTestProductionRunConfig(
    JSON.parse(qualificationTemplateText) as Record<string, unknown>
  );
  const config = requireProductionAgentEvaluationFrozenRunConfig(
    decodeAgentEvaluationFrozenRunConfig(source, {
      clock: () => '2026-08-08T00:00:00.000Z',
      expectedRepositoryCommit: commit,
    }),
    commit
  );
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const runConfigPath = join(
    root,
    AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME
  );
  const planPath = join(root, 'plan.json');
  const commitmentPath = join(root, 'frozen-config-commitment.json');
  const files = createNodeAgentEvaluationCoordinatorFilePort({
    maximumBytes: 16_777_216,
  });
  if (
    typeof files.createCanonicalJson !== 'function' ||
    typeof files.readCanonicalJson !== 'function'
  ) {
    throw new TypeError('Test canonical file port is unavailable.');
  }
  await files.createCanonicalJson(runConfigPath, source);
  await files.createCanonicalJson(planPath, config.plan);
  const evaluationId = 'sidecar';
  const namespaceId = `g4-${evaluationId}-${commit.slice(0, 12)}`;
  values.set(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace, namespaceId);
  values.set(
    AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_ENVIRONMENT_NAMES.outputPath,
    commitmentPath
  );
  values.set(
    AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.path,
    runConfigPath
  );
  values.set(
    AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactName,
    `g4-real-model-plan-${commit}-${evaluationId}-1`
  );
  values.set(
    AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactDigest,
    `sha256:${'a'.repeat(64)}`
  );
  values.set(
    AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunId,
    '123456789'
  );
  values.set(
    AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunAttempt,
    '1'
  );
  values.set(
    AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.authorityId,
    config.attestation.authorityId
  );
  values.set(
    AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.keyId,
    config.attestation.keyId
  );
  values.set(
    AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.publicKey,
    publicKey
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
      .toString('base64url')
  );
  values.set(
    AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey,
    privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url')
  );
  values.set(
    AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowName,
    'g4-real-model-evaluation'
  );
  values.set(
    AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunId,
    '123456789'
  );
  values.set(
    AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunAttempt,
    '1'
  );
  values.set(
    AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.jobId,
    'full_shards'
  );
  values.set(
    AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.environmentDigest,
    digestAgentCanonicalValue({ environment: 'g4-production' })
  );
  await produceAgentEvaluationFrozenConfigCommitment({
    planPath,
    outputPath: commitmentPath,
    environment: (name) => values.get(name),
    files: {
      createCanonicalJson: files.createCanonicalJson,
      readCanonicalJson: files.readCanonicalJson,
    },
  });
  return Object.freeze({ config, commitmentPath, namespaceId });
};

const ownerEnvironment = (stateDirectory: string): NodeJS.ProcessEnv => ({
  [AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.baseUrl]:
    'http://127.0.0.1:8791',
  [AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.serviceToken]:
    serviceToken,
  [AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.stateDirectory]:
    stateDirectory,
  [AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.purpose]: 'full-attempt',
  [AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.runConfigTemplatePath]:
    join(stateDirectory, 'g4-run-config-template.json'),
  [AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.shutdownReceiptPath]:
    join(stateDirectory, 'shutdown-receipt.json'),
  [AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.secretCanaries]:
    canonicalJsonText(['secret-canary-owner-0001']),
  [AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.protectedHoldoutCanaries]:
    canonicalJsonText([canary]),
});

const common = Object.freeze({
  format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  version: 1 as const,
  namespaceId: 'evaluation.namespace.test',
  planDigest: digestAgentCanonicalValue('sidecar-plan'),
  repositoryCommit: commit,
  routeBinding: 'operations/claim',
  requestDigest: digestAgentCanonicalValue('sidecar-request'),
  claimGeneration: 1,
  payload: Object.freeze({ value: 'bounded' }),
});

const ownerImplementationDigest = (
  authorityId: string,
  implementationIdentity = 'v1'
) =>
  digestAgentCanonicalValue({
    authorityId,
    implementationIdentity,
  });

const controlledFactsFor = (
  request: Pick<AgentEvaluationOwnerAuthorityRequest, 'operation'>,
  leaked?: string
) =>
  Object.freeze([
    Object.freeze({
      status: 'owner-ack',
      operation: request.operation,
      ...(leaked ? { leaked } : {}),
    }),
  ]);

const controlledRequest = (
  overrides: Partial<AgentEvaluationOwnerAuthorityRequest> = {},
  implementationIdentity = 'v1'
): AgentEvaluationOwnerAuthorityRequest => {
  const implementationDigest = ownerImplementationDigest(
    'controlled-workspace.owner',
    implementationIdentity
  );
  const base = Object.freeze({
    ...common,
    serviceKind: 'controlled-workspace' as const,
    mode: 'execute' as const,
    operation: 'operation.claim',
    ownerImplementationDigest: implementationDigest,
    ...overrides,
  }) as AgentEvaluationOwnerAuthorityRequest;
  const stageDigest =
    base.stageDigest ??
    createAgentEvaluationControlledWorkspaceDirectStageDigest(
      base,
      implementationDigest
    );
  const staged = Object.freeze({ ...base, stageDigest });
  if (staged.mode !== 'reconcile') return staged;
  const facts = controlledFactsFor(staged);
  return Object.freeze({
    ...staged,
    dispatchAckDigest:
      staged.dispatchAckDigest ??
      createAgentEvaluationControlledWorkspaceDirectDispatchAckDigest(
        staged,
        facts,
        implementationDigest,
        stageDigest
      ),
  });
};

const attemptRequest = (
  overrides: Partial<AgentEvaluationOwnerAuthorityRequest> = {},
  implementationIdentity = 'v1'
): AgentEvaluationOwnerAuthorityRequest => {
  const base = Object.freeze({
    ...common,
    serviceKind: 'provider-capability' as const,
    mode: 'execute' as const,
    operation: 'tool.execute',
    routeBinding: 'capability-runtime/execute-tool',
    attemptId: 'evaluation-attempt.sidecar',
    descriptorDigest: digestAgentCanonicalValue('sidecar-descriptor'),
    shardLeaseOwnerId: 'worker.sidecar',
    shardLeaseGeneration: 3,
    verificationGrantGeneration: 3,
    verificationAttemptGrantReceiptSetDigest:
      digestAgentCanonicalValue('sidecar-grant-set'),
    providerCapabilityObservationReceiptSetDigest: digestAgentCanonicalValue(
      []
    ),
    ownerImplementationDigest: ownerImplementationDigest(
      overrides.serviceKind === 'attempt-grading'
        ? 'attempt-grading.owner'
        : 'provider-capability.owner',
      implementationIdentity
    ),
    ...overrides,
  }) as AgentEvaluationOwnerAuthorityRequest;
  return Object.freeze({
    ...base,
    ...(base.mode === 'stage'
      ? {}
      : {
          stageDigest: createAgentEvaluationAttemptAuthorityDispatchStageDigest(
            base,
            ownerImplementationDigest(
              base.serviceKind === 'attempt-grading'
                ? 'attempt-grading.owner'
                : 'provider-capability.owner',
              implementationIdentity
            )
          ),
        }),
  });
};

type PortState = {
  stageCalls: number;
  executeCalls: number;
  reconcileCalls: number;
  closeCalls: number;
  crashBeforeDispatch: boolean;
  crashAfterEffect: boolean;
  leakCanary: boolean;
  responses: Map<string, unknown>;
};

const createPorts = (
  state: PortState,
  implementationIdentity = 'v1'
): AgentEvaluationProductionFullAttemptOwnerAuthorityPorts => {
  const durability = createAgentEvaluationOwnerAuthorityDurability();
  const key = (request: AgentEvaluationOwnerAuthorityRequest) =>
    `${request.serviceKind}\u0000${request.requestDigest}`;
  const output = (request: AgentEvaluationOwnerAuthorityRequest): unknown =>
    request.serviceKind === 'controlled-workspace'
      ? controlledFactsFor(request, state.leakCanary ? canary : undefined)
      : Object.freeze({
          status: 'owner-ack',
          operation: request.operation,
          ...(state.leakCanary ? { leaked: canary } : {}),
        });
  const base = (authorityId: string) =>
    Object.freeze({
      authorityId,
      implementationDigest: ownerImplementationDigest(
        authorityId,
        implementationIdentity
      ),
      durability,
      async stage(request: AgentEvaluationOwnerAuthorityRequest) {
        state.stageCalls += 1;
        if (state.crashBeforeDispatch) {
          state.crashBeforeDispatch = false;
          throw new Error('simulated crash before durable dispatch');
        }
        return request.serviceKind === 'provider-capability' ||
          request.serviceKind === 'attempt-grading'
          ? createAgentEvaluationAttemptAuthorityDispatchStageDigest(
              request,
              ownerImplementationDigest(authorityId, implementationIdentity)
            )
          : digestAgentCanonicalValue({
              kind: 'owner-staging-receipt',
              authorityId,
              requestDigest: request.requestDigest,
              claimGeneration: request.claimGeneration,
            });
      },
      async execute(request: AgentEvaluationOwnerAuthorityRequest) {
        state.executeCalls += 1;
        const result = output(request);
        state.responses.set(key(request), result);
        if (state.crashAfterEffect) {
          state.crashAfterEffect = false;
          throw new Error('simulated acknowledgement loss');
        }
        return result;
      },
      async reconcile(request: AgentEvaluationOwnerAuthorityRequest) {
        state.reconcileCalls += 1;
        const result = state.responses.get(key(request));
        return Object.freeze({
          response: result ?? output(request),
          reconciled: result !== undefined,
        });
      },
    });
  const controlledBase = base('controlled-workspace.owner');
  const verificationBase = base('verification-evidence.owner');
  const ports = {
    purpose: 'full-attempt' as const,
    controlledWorkspace: Object.freeze({
      ...controlledBase,
      async read(request: AgentEvaluationOwnerAuthorityRequest) {
        return output(request) as readonly unknown[];
      },
      async execute(request: AgentEvaluationOwnerAuthorityRequest) {
        return (await controlledBase.execute(request)) as readonly unknown[];
      },
      async reconcile(request: AgentEvaluationOwnerAuthorityRequest) {
        const reconciled = await controlledBase.reconcile(request);
        return Object.freeze({
          facts: reconciled.response as readonly unknown[],
          reconciled: reconciled.reconciled,
        });
      },
    }),
    verificationEvidence: Object.freeze({
      ...verificationBase,
      async read(request: AgentEvaluationOwnerAuthorityRequest) {
        return output(request);
      },
    }),
    providerCapability: base('provider-capability.owner'),
    attemptGrading: base('attempt-grading.owner'),
  };
  return Object.freeze({
    ...ports,
    async close() {
      state.closeCalls += 1;
      return createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(
        ports
      );
    },
  });
};

const createPreplanPorts = (calls: { value: number }) => {
  const port = (authorityId: string) =>
    Object.freeze({
      authorityId,
      implementationDigest: ownerImplementationDigest(authorityId),
      async execute(): Promise<never> {
        calls.value += 1;
        throw new TypeError(`unexpected ${authorityId} execute`);
      },
    });
  const identityPorts = Object.freeze({
    purpose: 'preplan' as const,
    capabilityProbe: port('capability-probe.preplan.test'),
    capabilityProbeProviderResource: port('provider-resource.preplan.test'),
    capabilityProbeProviderResourceCleanup: port(
      'provider-resource-cleanup.preplan.test'
    ),
    runtimeFactSourceRegistration: Object.freeze({
      ...port('runtime-registration.preplan.test'),
      async reconcile(): Promise<undefined> {
        calls.value += 1;
        return undefined;
      },
    }),
  });
  return Object.freeze({
    ...identityPorts,
    async close() {
      return createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(
        identityPorts
      );
    },
  }) satisfies AgentEvaluationProductionPreplanOwnerAuthorityPorts;
};

const createState = (): PortState => ({
  stageCalls: 0,
  executeCalls: 0,
  reconcileCalls: 0,
  closeCalls: 0,
  crashBeforeDispatch: false,
  crashAfterEffect: false,
  leakCanary: false,
  responses: new Map(),
});

const post = async (
  baseUrl: string,
  path: string,
  request: AgentEvaluationOwnerAuthorityRequest
): Promise<Response> => {
  const body = canonicalJsonText(request);
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': request.requestDigest,
    },
    body,
  });
};

const start = async (
  stateDirectory: string,
  state: PortState,
  implementationIdentity = 'v1',
  attemptAuthorityResultIngress?: AgentEvaluationAttemptAuthorityResultIngressPort
) => {
  const journal =
    await createFileAgentEvaluationOwnerAuthorityReplayJournal(stateDirectory);
  const sidecar = createProductionAgentEvaluationOwnerAuthoritySidecar({
    serviceToken,
    authorities: createPorts(state, implementationIdentity),
    journal,
    forbiddenCanaries: () => Object.freeze([canary, serviceToken]),
    attemptAuthorityResultIngress,
  });
  if (sidecar.health.purpose !== 'full-attempt') {
    throw new TypeError('unexpected test sidecar purpose');
  }
  const listener = await sidecar.listen({ host: '127.0.0.1', port: 0 });
  return Object.freeze({ sidecar, health: sidecar.health, listener });
};

describe('production owner authority sidecar', () => {
  it('exposes ready health only after all four concrete authority ports are bound', async () => {
    const running = await start(await directory(), createState());
    try {
      const healthResponse = await fetch(`${running.listener.baseUrl}/healthz`);
      expect(healthResponse.status).toBe(200);
      const health = (await healthResponse.json()) as Record<string, unknown>;
      expect(Object.keys(health).sort()).toEqual(
        [
          'attemptGradingAuthorityDigest',
          'controlledWorkspaceAuthorityDigest',
          'format',
          'healthDigest',
          'providerCapabilityAuthorityDigest',
          'purpose',
          'replayJournalImplementationDigest',
          'status',
          'verificationEvidenceAuthorityDigest',
          'version',
        ].sort()
      );
      expect(health.status).toBe('ready');

      const authorityRequest = attemptRequest();
      const response = await post(
        running.listener.baseUrl,
        '/v1/capability-runtime/execute',
        authorityRequest
      );
      expect(response.status).toBe(200);
      const value = (await response.json()) as Record<string, unknown>;
      expect(value.serviceKind).toBe('provider-capability');
      expect(value.shardLeaseGeneration).toBe(3);
      expect(value.verificationGrantGeneration).toBe(3);
      expect(value.ownerImplementationDigest).toBe(
        running.health.providerCapabilityAuthorityDigest
      );
      expect(value.dispatchAckDigest).toBe(
        digestAgentCanonicalValue({
          format: 'prodivix.agent-evaluation-attempt-authority-dispatch-ack',
          version: 1,
          serviceKind: 'provider-capability',
          operation: 'tool.execute',
          namespaceId: common.namespaceId,
          planDigest: common.planDigest,
          repositoryCommit: common.repositoryCommit,
          attemptId: 'evaluation-attempt.sidecar',
          descriptorDigest: digestAgentCanonicalValue('sidecar-descriptor'),
          shardLeaseOwnerId: 'worker.sidecar',
          shardLeaseGeneration: 3,
          verificationGrantGeneration: 3,
          verificationAttemptGrantReceiptSetDigest:
            digestAgentCanonicalValue('sidecar-grant-set'),
          providerCapabilityObservationReceiptSetDigest:
            authorityRequest.providerCapabilityObservationReceiptSetDigest,
          stageDigest: authorityRequest.stageDigest,
          requestDigest: common.requestDigest,
          responseDigest: digestAgentCanonicalValue({
            status: 'owner-ack',
            operation: 'tool.execute',
          }),
          ownerImplementationDigest:
            running.health.providerCapabilityAuthorityDigest,
        })
      );
    } finally {
      await running.listener.close();
    }
  });

  it('rejects a full-attempt request on a preplan sidecar before any owner call', async () => {
    const stateDirectory = await directory();
    const calls = { value: 0 };
    const authorities = createPreplanPorts(calls);
    const sidecar = createProductionAgentEvaluationOwnerAuthoritySidecar({
      serviceToken,
      authorities,
      journal:
        await createFileAgentEvaluationOwnerAuthorityReplayJournal(
          stateDirectory
        ),
      forbiddenCanaries: () => Object.freeze([canary, serviceToken]),
    });
    const listener = await sidecar.listen({ host: '127.0.0.1', port: 0 });
    try {
      expect(
        (
          await post(
            listener.baseUrl,
            '/v1/capability-runtime/execute',
            attemptRequest()
          )
        ).status
      ).toBe(503);
      expect(calls.value).toBe(0);
    } finally {
      const receipt = await listener.close();
      expect(Object.keys(receipt.residualResourceIds).sort()).toEqual(
        [
          'capabilityProbe',
          'capabilityProbeProviderResource',
          'capabilityProbeProviderResourceCleanup',
          'runtimeFactSourceRegistration',
        ].sort()
      );
    }
  });

  it('recovers dispatched effect acknowledgement loss through reconcile without a second execute', async () => {
    const stateDirectory = await directory();
    const state = createState();
    state.crashAfterEffect = true;
    const request = controlledRequest();
    const first = await start(stateDirectory, state);
    try {
      expect(
        (
          await post(
            first.listener.baseUrl,
            '/v1/controlled-workspace/execute',
            request
          )
        ).status
      ).toBe(503);
      expect(state.stageCalls).toBe(0);
      expect(state.executeCalls).toBe(1);
    } finally {
      await first.listener.close();
    }

    const recovered = await start(stateDirectory, state);
    try {
      const reconcileRequest = controlledRequest({ mode: 'reconcile' });
      const response = await post(
        recovered.listener.baseUrl,
        '/v1/controlled-workspace/reconcile',
        reconcileRequest
      );
      expect(response.status).toBe(200);
      const value = (await response.json()) as Readonly<{
        ownerImplementationDigest: CanonicalDigest;
        stageDigest: CanonicalDigest;
        dispatchAckDigest: CanonicalDigest;
        reconciled: boolean;
      }>;
      expect(value).toMatchObject({
        ownerImplementationDigest: reconcileRequest.ownerImplementationDigest,
        stageDigest: reconcileRequest.stageDigest,
        dispatchAckDigest: reconcileRequest.dispatchAckDigest,
        reconciled: true,
      });
      expect(state.stageCalls).toBe(0);
      expect(state.executeCalls).toBe(1);
      expect(state.reconcileCalls).toBe(1);

      const replay = await post(
        recovered.listener.baseUrl,
        '/v1/controlled-workspace/reconcile',
        reconcileRequest
      );
      expect(replay.status).toBe(200);
      expect(state.executeCalls).toBe(1);
      expect(state.reconcileCalls).toBe(2);
    } finally {
      await recovered.listener.close();
    }
  });

  it('rejects missing or swapped stateless Controlled pre-effect fences before owner dispatch', async () => {
    const state = createState();
    const running = await start(await directory(), state);
    const execute = controlledRequest();
    const reconcile = controlledRequest({ mode: 'reconcile' });
    const without = (
      request: AgentEvaluationOwnerAuthorityRequest,
      key: keyof AgentEvaluationOwnerAuthorityRequest
    ): AgentEvaluationOwnerAuthorityRequest =>
      Object.freeze(
        Object.fromEntries(
          Object.entries(request).filter(([candidate]) => candidate !== key)
        )
      ) as AgentEvaluationOwnerAuthorityRequest;
    const swapped = digestAgentCanonicalValue('swapped-controlled-fence');
    const requests = [
      without(execute, 'ownerImplementationDigest'),
      without(execute, 'stageDigest'),
      Object.freeze({ ...execute, ownerImplementationDigest: swapped }),
      Object.freeze({ ...execute, stageDigest: swapped }),
      without(reconcile, 'dispatchAckDigest'),
    ];
    try {
      for (const request of requests) {
        const response = await post(
          running.listener.baseUrl,
          request.mode === 'reconcile'
            ? '/v1/controlled-workspace/reconcile'
            : '/v1/controlled-workspace/execute',
          request
        );
        expect(response.status).toBe(503);
        await response.arrayBuffer();
      }
      expect(state.stageCalls).toBe(0);
      expect(state.executeCalls).toBe(0);
      expect(state.reconcileCalls).toBe(0);
    } finally {
      await running.listener.close();
    }
  });

  it('reconciles from a fresh sidecar journal with the exact outer fence and zero execute', async () => {
    const state = createState();
    const execute = controlledRequest();
    const facts = controlledFactsFor(execute);
    state.responses.set(
      `${execute.serviceKind}\u0000${execute.requestDigest}`,
      facts
    );
    const request = controlledRequest({ mode: 'reconcile' });
    const running = await start(await directory(), state);
    try {
      const response = await post(
        running.listener.baseUrl,
        '/v1/controlled-workspace/reconcile',
        request
      );
      expect(response.status).toBe(200);
      const value = (await response.json()) as Record<string, unknown>;
      expect(Object.keys(value).sort()).toEqual(
        [
          'dispatchAckDigest',
          'facts',
          'format',
          'mode',
          'ownerImplementationDigest',
          'reconciled',
          'requestDigest',
          'serviceKind',
          'stageDigest',
          'version',
        ].sort()
      );
      expect(value).toMatchObject({
        ownerImplementationDigest: request.ownerImplementationDigest,
        stageDigest: request.stageDigest,
        dispatchAckDigest: request.dispatchAckDigest,
        reconciled: true,
      });
      expect(state.stageCalls).toBe(0);
      expect(state.executeCalls).toBe(0);
      expect(state.reconcileCalls).toBe(1);
    } finally {
      await running.listener.close();
    }
  });

  it('rejects a swapped reconcile acknowledgement after read-only recovery with zero execute', async () => {
    const state = createState();
    const execute = controlledRequest();
    state.responses.set(
      `${execute.serviceKind}\u0000${execute.requestDigest}`,
      controlledFactsFor(execute)
    );
    const request = controlledRequest({
      mode: 'reconcile',
      dispatchAckDigest: digestAgentCanonicalValue(
        'swapped-controlled-dispatch-ack'
      ),
    });
    const running = await start(await directory(), state);
    try {
      const response = await post(
        running.listener.baseUrl,
        '/v1/controlled-workspace/reconcile',
        request
      );
      expect(response.status).toBe(503);
      await response.arrayBuffer();
      expect(state.stageCalls).toBe(0);
      expect(state.executeCalls).toBe(0);
      expect(state.reconcileCalls).toBe(1);
    } finally {
      await running.listener.close();
    }
  });

  it('requires durable result ingress before dispatching a shared effect', async () => {
    const state = createState();
    const running = await start(await directory(), state);
    try {
      const response = await post(
        running.listener.baseUrl,
        '/v1/capability-runtime/execute',
        attemptRequest({
          payload: Object.freeze({ executionAuthorityKind: 'shared-effect' }),
        })
      );
      expect(response.status).toBe(503);
      await response.arrayBuffer();
      expect(state.stageCalls).toBe(0);
      expect(state.executeCalls).toBe(0);
    } finally {
      await running.listener.close();
    }
  });

  it('replays the exact sealed shared-effect result after ingress acknowledgement loss', async () => {
    const state = createState();
    const sealed: Readonly<{
      requestDigest: string;
      responseDigest: string;
    }>[] = [];
    let sealCalls = 0;
    const ingress = Object.freeze({
      async seal(
        input: Parameters<
          AgentEvaluationAttemptAuthorityResultIngressPort['seal']
        >[0]
      ) {
        sealCalls += 1;
        const responseDigest = digestAgentCanonicalValue(input.response);
        sealed.push(
          Object.freeze({
            requestDigest: input.request.requestDigest,
            responseDigest,
          })
        );
        if (sealCalls === 1) {
          throw new Error('simulated result ingress acknowledgement loss');
        }
        return Object.freeze({
          requestDigest: input.request.requestDigest,
          responseDigest,
          dispatchAckDigest:
            createAgentEvaluationAttemptAuthorityDispatchAckDigest(
              input.request,
              input.response,
              input.ownerImplementationDigest
            ),
          resultIngressReceiptDigest: digestAgentCanonicalValue({
            requestDigest: input.request.requestDigest,
            responseDigest,
          }),
          replayed: true,
        });
      },
    }) satisfies AgentEvaluationAttemptAuthorityResultIngressPort;
    const request = attemptRequest({
      payload: Object.freeze({ executionAuthorityKind: 'shared-effect' }),
    });
    const running = await start(await directory(), state, 'v1', ingress);
    try {
      const first = await post(
        running.listener.baseUrl,
        '/v1/capability-runtime/execute',
        request
      );
      expect(first.status).toBe(503);
      await first.arrayBuffer();
      expect(state.executeCalls).toBe(1);
      expect(sealCalls).toBe(1);

      const recovered = await post(
        running.listener.baseUrl,
        '/v1/capability-runtime/reconcile',
        Object.freeze({
          ...request,
          mode: 'reconcile' as const,
        })
      );
      expect(recovered.status).toBe(200);
      const recoveredValue = (await recovered.json()) as Readonly<{
        dispatchAckDigest: CanonicalDigest;
        reconciled: boolean;
      }>;
      expect(recoveredValue.reconciled).toBe(true);
      expect(recoveredValue.dispatchAckDigest).toBe(
        createAgentEvaluationAttemptAuthorityDispatchAckDigest(
          request,
          Object.freeze({ status: 'owner-ack', operation: 'tool.execute' }),
          running.health.providerCapabilityAuthorityDigest
        )
      );
      expect(state.executeCalls).toBe(1);
      expect(state.reconcileCalls).toBe(1);
      expect(sealCalls).toBe(2);
      expect(sealed[0]).toEqual(sealed[1]);

      const replay = await post(
        running.listener.baseUrl,
        '/v1/capability-runtime/execute',
        request
      );
      expect(replay.status).toBe(200);
      await replay.arrayBuffer();
      expect(state.executeCalls).toBe(1);
      expect(sealCalls).toBe(2);
    } finally {
      await running.listener.close();
    }
  });

  it('uses the Backend-sealed direct stage without invoking stateless owner staging', async () => {
    const state = createState();
    const request = controlledRequest();
    const running = await start(await directory(), state);
    try {
      const response = await post(
        running.listener.baseUrl,
        '/v1/controlled-workspace/execute',
        request
      );
      expect(response.status).toBe(200);
      const value = (await response.json()) as Readonly<{
        ownerImplementationDigest: CanonicalDigest;
        stageDigest: CanonicalDigest;
        dispatchAckDigest: CanonicalDigest;
      }>;
      expect(value.ownerImplementationDigest).toBe(
        request.ownerImplementationDigest
      );
      expect(value.stageDigest).toBe(request.stageDigest);
      expect(value.dispatchAckDigest).toBe(
        createAgentEvaluationControlledWorkspaceDirectDispatchAckDigest(
          request,
          Object.freeze([
            Object.freeze({
              status: 'owner-ack',
              operation: request.operation,
            }),
          ]),
          request.ownerImplementationDigest!,
          request.stageDigest!
        )
      );
      expect(state.stageCalls).toBe(0);
      expect(state.executeCalls).toBe(1);
      expect(state.reconcileCalls).toBe(0);
    } finally {
      await running.listener.close();
    }
  });

  it('rejects a requestDigest replay whose payload identity drifted', async () => {
    const state = createState();
    const running = await start(await directory(), state);
    try {
      const original = controlledRequest();
      expect(
        (
          await post(
            running.listener.baseUrl,
            '/v1/controlled-workspace/execute',
            original
          )
        ).status
      ).toBe(200);
      const drifted = controlledRequest({
        payload: Object.freeze({ value: 'drifted' }),
      });
      expect(
        (
          await post(
            running.listener.baseUrl,
            '/v1/controlled-workspace/execute',
            drifted
          )
        ).status
      ).toBe(503);
      expect(state.executeCalls).toBe(1);
    } finally {
      await running.listener.close();
    }
  });

  it('rejects replay through a drifted concrete owner implementation', async () => {
    const stateDirectory = await directory();
    const state = createState();
    const request = controlledRequest({}, 'implementation-v1');
    const original = await start(stateDirectory, state, 'implementation-v1');
    try {
      expect(
        (
          await post(
            original.listener.baseUrl,
            '/v1/controlled-workspace/execute',
            request
          )
        ).status
      ).toBe(200);
    } finally {
      await original.listener.close();
    }

    const drifted = await start(stateDirectory, state, 'implementation-v2');
    try {
      expect(
        (
          await post(
            drifted.listener.baseUrl,
            '/v1/controlled-workspace/execute',
            request
          )
        ).status
      ).toBe(503);
      expect(state.executeCalls).toBe(1);
    } finally {
      await drifted.listener.close();
    }
  });

  it('blocks Secret or holdout canaries before accepting an owner response', async () => {
    const state = createState();
    state.leakCanary = true;
    const running = await start(await directory(), state);
    try {
      const response = await post(
        running.listener.baseUrl,
        '/v1/controlled-workspace/execute',
        controlledRequest()
      );
      expect(response.status).toBe(503);
      expect(state.executeCalls).toBe(1);
    } finally {
      await running.listener.close();
    }
  });

  it('blocks Secret or holdout canaries before staging an owner request', async () => {
    const state = createState();
    const running = await start(await directory(), state);
    try {
      const response = await post(
        running.listener.baseUrl,
        '/v1/controlled-workspace/execute',
        controlledRequest({ payload: Object.freeze({ leaked: canary }) })
      );
      expect(response.status).toBe(503);
      expect(state.stageCalls).toBe(0);
      expect(state.executeCalls).toBe(0);
    } finally {
      await running.listener.close();
    }
  });

  it('rejects environment-selected implementation modules', async () => {
    await expect(
      createProductionAgentEvaluationOwnerAuthoritySidecarFromEnvironment({
        environment: {
          PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_MODULE:
            'D:\\untrusted\\owner-authority.js',
        },
        createAuthorities: async () => createPorts(createState()),
      })
    ).rejects.toThrow(/modules are forbidden/u);
  });

  it('rejects owner authority service tokens outside the shared ASCII contract', async () => {
    const stateDirectory = await directory();
    const environment = ownerEnvironment(stateDirectory);
    environment[
      AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.serviceToken
    ] = `${'A'.repeat(32)}\\`;
    let factoryCalls = 0;

    await expect(
      createProductionAgentEvaluationOwnerAuthoritySidecarFromEnvironment({
        environment,
        createAuthorities: async () => {
          factoryCalls += 1;
          return createPorts(createState());
        },
      })
    ).rejects.toThrow(/service token is invalid/u);
    expect(factoryCalls).toBe(0);
  });

  it('requires one exact fixed owner-authority purpose before constructing ports', async () => {
    const stateDirectory = await directory();
    let factoryCalls = 0;
    for (const purpose of [undefined, 'combined', 'full-attempt '] as const) {
      const environment = ownerEnvironment(stateDirectory);
      environment[AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.purpose] =
        purpose;
      await expect(
        createProductionAgentEvaluationOwnerAuthoritySidecarFromEnvironment({
          environment,
          createAuthorities: async () => {
            factoryCalls += 1;
            return createPorts(createState());
          },
        })
      ).rejects.toThrow(/purpose/iu);
    }
    expect(factoryCalls).toBe(0);
  });

  it('constructs full-attempt ports without reading the preplan-only probe spool key', async () => {
    const stateDirectory = await durableDirectory();
    const values = new Map<string, string>([
      [
        AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.stateDirectory,
        stateDirectory,
      ],
      [
        AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.runConfigTemplatePath,
        qualificationTemplatePath,
      ],
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace, common.namespaceId],
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit, commit],
      [
        AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl,
        AGENT_EVALUATION_LEDGER_BASE_URL,
      ],
      [
        PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME,
        'provider-runtime-journal-owner.sidecar.test',
      ],
      [
        PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ENVIRONMENT_NAME,
        'provider-vault-owner.sidecar.test',
      ],
    ]);
    await installFullAttemptFrozenHostedBinding(stateDirectory, values);
    let probeSpoolKeyReads = 0;
    const authorities =
      await createConcreteProductionAttemptOwnerAuthorityPortsFromEnvironment({
        purpose: 'full-attempt',
        environment: (name) => {
          if (
            name ===
            AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME
          ) {
            probeSpoolKeyReads += 1;
          }
          return values.get(name);
        },
        forbiddenCanaries: () => Object.freeze([canary]),
      });

    expect(probeSpoolKeyReads).toBe(0);
    expect(Object.keys(authorities).sort()).toEqual(
      ['attemptGrading', 'close', 'providerCapability', 'purpose'].sort()
    );
    await expect(authorities.close()).resolves.toMatchObject({
      status: 'clean',
      residualResourceIds: {
        attemptGrading: [],
        providerCapability: [],
      },
      residualCanaryIds: [],
    });
  }, 60_000);

  it('loads the signed hosted scope at the current retry and rejects time, namespace, and signature drift before credential use', async () => {
    const stateDirectory = await durableDirectory();
    const values = new Map<string, string>([
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit, commit],
    ]);
    const fixture = await installFullAttemptFrozenHostedBinding(
      stateDirectory,
      values
    );
    values.set(
      AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunAttempt,
      '2'
    );
    let serviceTokenReads = 0;
    let privateKeyReads = 0;
    const environment = (name: string): string | undefined => {
      if (name === AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token) {
        serviceTokenReads += 1;
      }
      if (name === AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey) {
        privateKeyReads += 1;
      }
      return values.get(name);
    };
    const loaded =
      await loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding({
        environment,
        namespaceId: fixture.namespaceId,
        clock: () => new Date('2026-08-09T00:00:00.000Z'),
      });
    expect(loaded).toMatchObject({
      scope: {
        namespaceId: fixture.namespaceId,
        repositoryCommit: commit,
        planDigest: fixture.config.plan.planDigest,
        frozenRunDigest: fixture.config.frozenRunDigest,
      },
    });
    expect(loaded.registrationIntentBindings).toHaveLength(4);

    await expect(
      loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding({
        environment,
        namespaceId: fixture.namespaceId,
        clock: () => new Date(fixture.config.plan.expiresAt),
      })
    ).rejects.toThrow();
    await expect(
      loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding({
        environment,
        namespaceId: fixture.namespaceId,
        clock: () => new Date(Date.parse(fixture.config.plan.plannedAt) - 1),
      })
    ).rejects.toThrow();
    await expect(
      loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding({
        environment,
        namespaceId: `foreign-${fixture.namespaceId}`,
        clock: () => new Date('2026-08-09T00:00:00.000Z'),
      })
    ).rejects.toThrow('hosted-namespace-binding');

    const commitment = JSON.parse(
      await readFile(fixture.commitmentPath, 'utf8')
    ) as Record<string, unknown>;
    const signature = String(commitment.signatureBase64Url);
    commitment.signatureBase64Url = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'Q' : 'A'}`;
    await writeFile(
      fixture.commitmentPath,
      canonicalJsonText(commitment),
      'utf8'
    );
    await expect(
      loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding({
        environment,
        namespaceId: fixture.namespaceId,
        clock: () => new Date('2026-08-09T00:00:00.000Z'),
      })
    ).rejects.toThrow('frozen-config-commitment-signature');
    expect(serviceTokenReads).toBe(0);
    expect(privateKeyReads).toBe(0);
  }, 120_000);

  it('rejects preplan before constructing owners when the probe spool key is absent', async () => {
    const stateDirectory = await durableDirectory();
    const values = new Map<string, string>([
      [
        AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.stateDirectory,
        stateDirectory,
      ],
      [
        AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.runConfigTemplatePath,
        qualificationTemplatePath,
      ],
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace, common.namespaceId],
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit, commit],
    ]);
    let probeSpoolKeyReads = 0;

    await expect(
      createConcreteProductionAttemptOwnerAuthorityPortsFromEnvironment({
        purpose: 'preplan',
        environment: (name) => {
          if (
            name ===
            AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME
          ) {
            probeSpoolKeyReads += 1;
          }
          return values.get(name);
        },
        forbiddenCanaries: () => Object.freeze([canary]),
      })
    ).rejects.toThrow('G4_RUNNER_SECRET_UNAVAILABLE');
    expect(probeSpoolKeyReads).toBe(1);
  });

  it('requires the preplan vault health owner while keeping both execution keys unread', async () => {
    const stateDirectory = await durableDirectory();
    const values = new Map<string, string>([
      [
        AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.stateDirectory,
        stateDirectory,
      ],
      [
        AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.runConfigTemplatePath,
        qualificationTemplatePath,
      ],
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace, common.namespaceId],
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit, commit],
      [
        AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl,
        AGENT_EVALUATION_LEDGER_BASE_URL,
      ],
      [
        AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME,
        Buffer.alloc(32, 7).toString('base64'),
      ],
      [
        PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME,
        'provider-runtime-journal-owner.preplan.test',
      ],
    ]);
    let providerJournalSpoolKeyReads = 0;
    let stateVaultKeyReads = 0;

    await expect(
      createConcreteProductionAttemptOwnerAuthorityPortsFromEnvironment({
        purpose: 'preplan',
        environment: (name) => {
          if (
            name ===
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ENVIRONMENT_NAME
          ) {
            providerJournalSpoolKeyReads += 1;
          }
          if (name === AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_ENV) {
            stateVaultKeyReads += 1;
          }
          return values.get(name);
        },
        forbiddenCanaries: () => Object.freeze([canary]),
      })
    ).rejects.toThrow('G4_PRODUCTION_STATE_VAULT_HEALTH_INVALID: composition');
    expect(providerJournalSpoolKeyReads).toBe(0);
    expect(stateVaultKeyReads).toBe(0);
  });

  it('registers all 15 default preplan sources while limiting Hosted resource health to the exact four active intents', async () => {
    const stateDirectory = await durableDirectory();
    const namespaceId = 'evaluation.namespace.hosted-preactivation';
    const now = '2026-08-09T00:00:00.000Z';
    const minimumExpiresAt = '2026-08-10T00:00:00.000Z';
    const template = decodeAgentEvaluationRunConfigQualificationTemplate(
      new TextEncoder().encode(qualificationTemplateText)
    );
    const capabilityProfileIds = Object.freeze([
      'g4-provider-background-job',
      'g4-provider-hosted-retrieval-core',
      'g4-provider-hosted-retrieval-document',
      'g4-provider-isolated-cache',
      'g4-provider-reasoning-continuation',
    ] as const);
    const sourceIdentities = Object.freeze(
      template.nativeIdentities.flatMap((identity) => {
        const protocolFamily = identity.protocolFamily;
        return capabilityProfileIds.map((capabilityProfileId) => {
          const sourceIdentity =
            identity.expectedRuntimeFactSourceIdentities[capabilityProfileId];
          if (
            sourceIdentity.capabilityProfileId !== capabilityProfileId ||
            sourceIdentity.protocolFamily !== protocolFamily
          ) {
            throw new TypeError(
              'Preplan runtime source identity projection drifted.'
            );
          }
          return Object.freeze({
            ...sourceIdentity,
            capabilityProfileId,
            protocolFamily,
          });
        });
      })
    );
    const resourceBackedHostedSources = sourceIdentities.filter(
      (identity) =>
        identity.sourceKind === 'sealed-hosted-owner-result' &&
        identity.hostedRetrievalRuntimeResourceRegistrationIntentDigest !==
          undefined
    );
    const expectedBlockedHostedSources = sourceIdentities.filter(
      (identity) =>
        identity.sourceKind === 'sealed-hosted-owner-result' &&
        identity.protocolFamily === 'anthropic-messages' &&
        identity.hostedRetrievalRuntimeResourceRegistrationIntentDigest ===
          undefined
    );
    expect(sourceIdentities).toHaveLength(15);
    expect(resourceBackedHostedSources).toHaveLength(4);
    expect(expectedBlockedHostedSources).toHaveLength(2);
    const ownerHealthBinding =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding(
        namespaceId
      );
    const storageSummary =
      createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary({
        namespaceId,
        schemaContractDigest:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
        ledgerRevision: 1,
        registrationCount: 0,
        activeResourceCount: 0,
        activeReadLeaseCount: 0,
        unfinishedCleanupCount: 0,
        overdueCount: 0,
        summarizedAt: now,
      });
    const ownerHealth =
      createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt({
        ...ownerHealthBinding,
        supportedOperations:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
        storageSummary,
        storageSummaryDigest: storageSummary.summaryDigest,
        checkedAt: now,
        expiresAt: new Date(Date.parse(now) + 125_000).toISOString(),
      });
    expect(
      matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(
        ownerHealth,
        ownerHealthBinding,
        now
      )
    ).toBe(true);
    const vaultOwnerInstanceId = 'provider-vault-owner.preactivation.test';
    const vaultAuthority =
      createAgentEvaluationNativeProviderStateVaultEncryptionProfile()
        .authority;
    expect(template.nativeProviderStateVaultEncryption.authority).toEqual(
      vaultAuthority
    );
    const vaultHealthBase = Object.freeze({
      format:
        PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_FORMAT,
      version:
        PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_VERSION,
      authority: vaultAuthority,
      vaultOwnerInstanceId,
      status: 'ready' as const,
      maximumRecords:
        PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_RECORDS,
      sealedRecordCount: 0,
      activeEncryptedRecordCount: 0,
      retiredRecordCount: 0,
      retirementCounts: Object.freeze({
        cancelled: 0,
        consumed: 0,
        expired: 0,
      }),
      overdueActiveRecordCount: 0,
      forcedExpiryTombstoneCount: 0,
      checkedAt: now,
    });
    const vaultHealth = Object.freeze({
      ...vaultHealthBase,
      healthDigest: digestAgentCanonicalValue(vaultHealthBase),
    });
    const values = new Map<string, string>([
      [
        AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.stateDirectory,
        stateDirectory,
      ],
      [
        AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.runConfigTemplatePath,
        qualificationTemplatePath,
      ],
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace, namespaceId],
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit, commit],
      [
        AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl,
        AGENT_EVALUATION_LEDGER_BASE_URL,
      ],
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token, serviceToken],
      [
        AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME,
        Buffer.alloc(32, 7).toString('base64'),
      ],
      [
        PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME,
        'provider-runtime-journal-owner.preactivation.test',
      ],
      [
        PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ENVIRONMENT_NAME,
        vaultOwnerInstanceId,
      ],
    ]);
    for (const identity of template.nativeIdentities) {
      const definition =
        AGENT_EVALUATION_PROVIDER_DEFINITIONS[identity.protocolFamily];
      values.set(definition.modelEnvironmentName, identity.model.modelId);
    }
    const rawHttpCalls: Array<Readonly<{ method: string; url: string }>> = [];
    let journalHealthReads = 0;
    let secretUses = 0;
    let hostResolutions = 0;
    const secrets: AgentProviderSecretResolver = Object.freeze({
      async use<T>(
        _request: AgentProviderSecretUseRequest,
        consumer: (material: Uint8Array) => Promise<T>
      ): Promise<T> {
        secretUses += 1;
        const material = new TextEncoder().encode('provider-secret-test');
        try {
          return await consumer(material);
        } finally {
          material.fill(0);
        }
      },
    });
    const fetchImplementation: typeof fetch = async (url, init) => {
      const requestUrl = String(url);
      rawHttpCalls.push({
        method: init?.method ?? 'GET',
        url: requestUrl,
      });
      if (requestUrl === `${AGENT_EVALUATION_LEDGER_BASE_URL}/healthz`) {
        return new Response(null, { status: 204 });
      }
      if (requestUrl.includes('/native-provider-state-vault/health')) {
        return new Response(canonicalJsonText(vaultHealth), {
          status: 200,
          headers: {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
          },
        });
      }
      if (requestUrl.includes('owner-health')) {
        return new Response(canonicalJsonText(ownerHealth), {
          status: 200,
          headers: {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
          },
        });
      }
      if (
        requestUrl.includes('/capability-probe-provider-resource-cleanups/')
      ) {
        const base = Object.freeze({
          format:
            AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_LIST_FORMAT,
          version:
            AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
          namespaceId,
          repositoryCommit: commit,
          records: Object.freeze([]),
        });
        return new Response(
          canonicalJsonText({
            ...base,
            listDigest: digestAgentCanonicalValue(base),
          }),
          {
            status: 200,
            headers: {
              'cache-control': 'no-store',
              'content-type': 'application/json; charset=utf-8',
            },
          }
        );
      }
      throw new TypeError(`Unexpected preplan HTTP request: ${requestUrl}`);
    };
    let clockTime = Date.parse(now);
    const authorities =
      await createConcreteProductionAttemptOwnerAuthorityPortsFromEnvironment({
        purpose: 'preplan',
        environment: (name) => values.get(name),
        forbiddenCanaries: () => Object.freeze([canary]),
        clock: () => new Date(clockTime++),
        fetch: fetchImplementation,
        providerRuntime: {
          journalHealth: Object.freeze({
            async readHealth() {
              journalHealthReads += 1;
              return Object.freeze(
                {}
              ) as AgentEvaluationCapabilityEffectProviderJournalHealth;
            },
          }),
          resolveHost: async () => {
            hostResolutions += 1;
            return Object.freeze(['93.184.216.34']);
          },
          secrets,
        },
      });
    try {
      if (authorities.purpose !== 'preplan') {
        throw new TypeError('Preplan owner authorities are missing.');
      }
      for (const sourceIdentity of sourceIdentities) {
        const request =
          createAgentEvaluationRuntimeFactSourceRegistrationRequest({
            namespaceId,
            repositoryCommit: commit,
            sourceAuthorityKind: sourceIdentity.kind,
            sourceKind: sourceIdentity.sourceKind,
            sourceAuthorityId: sourceIdentity.sourceAuthorityId,
            sourceAuthorityImplementationDigest:
              sourceIdentity.sourceAuthorityImplementationDigest,
            routeBinding: sourceIdentity.routeBinding,
            capabilityProfileId: sourceIdentity.capabilityProfileId,
            capabilityProfileDigest: sourceIdentity.capabilityProfileDigest,
            capabilityId: sourceIdentity.capabilityId,
            protocolFamily: sourceIdentity.protocolFamily,
            providerConfigurationId: sourceIdentity.providerConfigurationId,
            modelId: sourceIdentity.modelId,
            modelLineageDigest: sourceIdentity.modelLineageDigest,
            adapterDigest: sourceIdentity.adapterDigest,
            ...(sourceIdentity.hostedRetrievalRuntimeResourceRegistrationIntentDigest
              ? {
                  hostedRetrievalRuntimeResourceRegistrationIntentDigest:
                    sourceIdentity.hostedRetrievalRuntimeResourceRegistrationIntentDigest,
                }
              : {}),
            minimumExpiresAt,
          });
        const stageDigest =
          digestAgentEvaluationRuntimeFactSourceRegistrationStage(
            request,
            sourceIdentity.registrationAuthorityIssuerId
          );
        const callStart = rawHttpCalls.length;
        let result: Awaited<
          ReturnType<typeof authorities.runtimeFactSourceRegistration.execute>
        >;
        try {
          result = await authorities.runtimeFactSourceRegistration.execute({
            request,
            registrationAuthorityIssuerId:
              sourceIdentity.registrationAuthorityIssuerId,
            stageDigest,
          });
        } catch (caught) {
          throw new TypeError(
            `Preplan registration failed for ${sourceIdentity.protocolFamily}/${sourceIdentity.capabilityProfileId} after ${canonicalJsonText({ rawHttpCalls, journalHealthReads, secretUses, hostResolutions })}: ${caught instanceof Error ? caught.message : canonicalJsonText(caught)}.`
          );
        }
        expect(result).toMatchObject({
          ownerHealth: {
            sourceAuthorityId: sourceIdentity.sourceAuthorityId,
            status: 'ready',
            expiresAt: minimumExpiresAt,
          },
        });
        const calls = rawHttpCalls.slice(callStart);
        expect(calls[0]).toEqual({
          method: 'GET',
          url: `${AGENT_EVALUATION_LEDGER_BASE_URL}/healthz`,
        });
        if (
          sourceIdentity.sourceKind === 'sealed-hosted-owner-result' &&
          sourceIdentity.hostedRetrievalRuntimeResourceRegistrationIntentDigest
        ) {
          expect(calls).toHaveLength(2);
          expect(calls[1]?.url).toContain('owner-health');
        } else if (
          sourceIdentity.capabilityId === 'provider.background-job' ||
          sourceIdentity.capabilityId === 'provider.reasoning-continuation'
        ) {
          expect(calls).toHaveLength(2);
          expect(calls[1]?.url).toContain(
            '/native-provider-state-vault/health'
          );
        } else {
          expect(calls).toHaveLength(1);
        }
      }
      expect(
        rawHttpCalls.filter(
          ({ url }) => url === `${AGENT_EVALUATION_LEDGER_BASE_URL}/healthz`
        )
      ).toHaveLength(15);
      expect(
        rawHttpCalls.filter(({ url }) => url.includes('owner-health'))
      ).toHaveLength(4);
      expect(
        rawHttpCalls.filter(({ url }) =>
          url.includes('/native-provider-state-vault/health')
        )
      ).toHaveLength(6);
      expect({ journalHealthReads, secretUses, hostResolutions }).toEqual({
        journalHealthReads: 15,
        secretUses: 15,
        hostResolutions: 15,
      });
      expect(
        rawHttpCalls.every(({ url }) =>
          url.startsWith(AGENT_EVALUATION_LEDGER_BASE_URL)
        )
      ).toBe(true);
      expect(
        rawHttpCalls.some(({ url }) =>
          ['registration-results', 'resource-reads', '/responses'].some(
            (route) => url.includes(route)
          )
        )
      ).toBe(false);
    } finally {
      await authorities.close();
    }
  }, 30_000);

  it('requires one canonical bounded regular run-config template path without symlinks', async () => {
    const stateDirectory = await directory();
    const templatePath = join(stateDirectory, 'g4-run-config-template.json');
    const oversizedPath = join(stateDirectory, 'oversized-template.json');
    await writeFile(oversizedPath, new Uint8Array(16_777_217));
    const rejectedPaths = [
      'relative-template.json',
      stateDirectory,
      join(stateDirectory, 'missing-template.json'),
      oversizedPath,
    ];
    const symlinkPath = join(stateDirectory, 'symlink-template.json');
    try {
      await symlink(templatePath, symlinkPath, 'file');
      rejectedPaths.push(symlinkPath);
    } catch (caught) {
      if ((caught as NodeJS.ErrnoException).code !== 'EPERM') throw caught;
    }
    let factoryCalls = 0;

    for (const rejectedPath of rejectedPaths) {
      const environment = ownerEnvironment(stateDirectory);
      environment[
        AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.runConfigTemplatePath
      ] = rejectedPath;
      await expect(
        createProductionAgentEvaluationOwnerAuthoritySidecarFromEnvironment({
          environment,
          createAuthorities: async () => {
            factoryCalls += 1;
            return createPorts(createState());
          },
        })
      ).rejects.toThrow(/Run config template/u);
    }
    expect(factoryCalls).toBe(0);
  });

  it('binds an absent shutdown receipt path inside the exact state directory', async () => {
    const stateDirectory = await directory();
    const state = createState();
    const composition =
      await createProductionAgentEvaluationOwnerAuthoritySidecarFromEnvironment(
        {
          environment: ownerEnvironment(stateDirectory),
          createAuthorities: async () => createPorts(state),
        }
      );
    expect(composition.shutdownReceiptPath).toBe(
      join(stateDirectory, 'shutdown-receipt.json')
    );
    const listener = await composition.sidecar.listen({
      host: composition.host,
      port: 0,
    });
    await listener.close();
    expect(state.closeCalls).toBe(1);
  });

  it('rejects a stale shutdown receipt before constructing owner resources', async () => {
    const stateDirectory = await directory();
    const receiptPath = join(stateDirectory, 'shutdown-receipt.json');
    await writeFile(receiptPath, '{}', { encoding: 'utf8', mode: 0o600 });
    let factoryCalls = 0;
    await expect(
      createProductionAgentEvaluationOwnerAuthoritySidecarFromEnvironment({
        environment: ownerEnvironment(stateDirectory),
        createAuthorities: async () => {
          factoryCalls += 1;
          return createPorts(createState());
        },
      })
    ).rejects.toThrow(/already exists/u);
    expect(factoryCalls).toBe(0);
  });

  it('requires the concrete G3 environment before constructing owners and keeps diagnostics bounded', async () => {
    await expect(
      createProductionAgentEvaluationOwnerAuthorityPortsFromEnvironment({
        purpose: 'full-attempt',
        environment: () => undefined,
        forbiddenCanaries: () => Object.freeze([canary]),
      })
    ).rejects.toThrow(
      `G4_PRODUCTION_CONTROLLED_WORKSPACE_G3_ENVIRONMENT_INVALID: environment:${AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit}`
    );
    expect(
      productionAgentEvaluationOwnerAuthorityStartupDiagnostic(
        new TypeError(
          `G4_PRODUCTION_CONTROLLED_WORKSPACE_G3_ENVIRONMENT_INVALID: environment:${AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit}`
        )
      )
    ).toBe('G4_OWNER_AUTHORITY_SIDECAR_STARTUP_FAILED_CLOSED');
    expect(
      productionAgentEvaluationOwnerAuthorityStartupDiagnostic(
        new TypeError(
          'G4_OWNER_AUTHORITY_CONCRETE_PORTS_UNAVAILABLE: provider capability and attempt grading production owner is unavailable.'
        )
      )
    ).toContain('provider capability and attempt grading');
    expect(
      productionAgentEvaluationOwnerAuthorityStartupDiagnostic(
        new Error(`untrusted ${canary}`)
      )
    ).toBe('G4_OWNER_AUTHORITY_SIDECAR_STARTUP_FAILED_CLOSED');
  });

  it('drains and closes the authority bundle exactly once on listener shutdown', async () => {
    const state = createState();
    const running = await start(await directory(), state);
    const [first, second] = await Promise.all([
      running.listener.close(),
      running.listener.close(),
    ]);
    expect(state.closeCalls).toBe(1);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      format: 'prodivix.agent-evaluation-owner-authority-shutdown',
      status: 'clean',
      startupHealthDigest: running.sidecar.health.healthDigest,
      residualResourceIds: {
        controlledWorkspace: [],
        verificationEvidence: [],
        providerCapability: [],
        attemptGrading: [],
      },
      residualCanaryIds: [],
    });
    expect(first.receiptDigest).toBe(
      digestAgentCanonicalValue(
        Object.fromEntries(
          Object.entries(first).filter(([key]) => key !== 'receiptDigest')
        )
      )
    );
    await expect(
      fetch(`${running.listener.baseUrl}/healthz`)
    ).rejects.toThrow();
  });

  it('writes the clean shutdown receipt canonically, exclusively, and with private permissions', async () => {
    const stateDirectory = await directory();
    const running = await start(stateDirectory, createState());
    const receipt = await running.listener.close();
    const receiptPath = join(stateDirectory, 'shutdown-receipt.json');

    await writeProductionAgentEvaluationOwnerAuthorityShutdownReceipt(
      receiptPath,
      receipt
    );

    expect(await readFile(receiptPath, 'utf8')).toBe(
      canonicalJsonText(receipt)
    );
    if (process.platform !== 'win32') {
      expect((await stat(receiptPath)).mode & 0o777).toBe(0o600);
    }
    await expect(
      writeProductionAgentEvaluationOwnerAuthorityShutdownReceipt(
        receiptPath,
        receipt
      )
    ).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('composes preplan without acquiring Workspace or full-attempt owners', async () => {
    const complete = createPreplanPorts({ value: 0 });
    let workspaceFactoryCalls = 0;
    let preplanFactoryCalls = 0;
    const ports = await composeProductionAgentEvaluationOwnerAuthorityPorts(
      {
        purpose: 'preplan',
        environment: () => undefined,
        forbiddenCanaries: () => Object.freeze([canary]),
      },
      {
        createWorkspaceVerificationAuthorities: async () => {
          workspaceFactoryCalls += 1;
          throw new TypeError('unexpected Workspace preplan composition');
        },
        createAttemptAuthorities: async () => {
          preplanFactoryCalls += 1;
          return Object.freeze({
            purpose: 'preplan' as const,
            capabilityProbe: complete.capabilityProbe,
            capabilityProbeProviderResource:
              complete.capabilityProbeProviderResource,
            capabilityProbeProviderResourceCleanup:
              complete.capabilityProbeProviderResourceCleanup,
            runtimeFactSourceRegistration:
              complete.runtimeFactSourceRegistration,
            async close() {
              return Object.freeze({
                status: 'clean' as const,
                residualResourceIds: Object.freeze({
                  capabilityProbe: Object.freeze([]) as readonly [],
                  capabilityProbeProviderResource: Object.freeze(
                    []
                  ) as readonly [],
                  capabilityProbeProviderResourceCleanup: Object.freeze(
                    []
                  ) as readonly [],
                  runtimeFactSourceRegistration: Object.freeze(
                    []
                  ) as readonly [],
                }),
                residualCanaryIds: Object.freeze([]) as readonly [],
              });
            },
          });
        },
      }
    );

    expect(workspaceFactoryCalls).toBe(0);
    expect(preplanFactoryCalls).toBe(1);
    expect(Object.keys(ports).sort()).toEqual(
      [
        'capabilityProbe',
        'capabilityProbeProviderResource',
        'capabilityProbeProviderResourceCleanup',
        'close',
        'purpose',
        'runtimeFactSourceRegistration',
      ].sort()
    );
    const receipt = await ports.close();
    expect(receipt.residualResourceIds).toEqual({
      capabilityProbe: [],
      capabilityProbeProviderResource: [],
      capabilityProbeProviderResourceCleanup: [],
      runtimeFactSourceRegistration: [],
    });
  });

  it('joins independently owned Workspace/Verification and attempt lifecycles exactly once', async () => {
    const complete = createPorts(createState());
    let workspaceCloseCalls = 0;
    let attemptCloseCalls = 0;
    const ports = await composeProductionAgentEvaluationOwnerAuthorityPorts(
      {
        purpose: 'full-attempt',
        environment: () => undefined,
        forbiddenCanaries: () => Object.freeze([canary]),
      },
      {
        createWorkspaceVerificationAuthorities: async () =>
          Object.freeze({
            controlledWorkspace: complete.controlledWorkspace,
            verificationEvidence: complete.verificationEvidence,
            async close() {
              workspaceCloseCalls += 1;
              return Object.freeze({
                status: 'clean' as const,
                residualResourceIds: Object.freeze({
                  controlledWorkspace: Object.freeze([]) as readonly [],
                  verificationEvidence: Object.freeze([]) as readonly [],
                }),
                residualCanaryIds: Object.freeze([]) as readonly [],
              });
            },
          }),
        createAttemptAuthorities: async () =>
          Object.freeze({
            purpose: 'full-attempt' as const,
            providerCapability: complete.providerCapability,
            attemptGrading: complete.attemptGrading,
            async close() {
              attemptCloseCalls += 1;
              return Object.freeze({
                status: 'clean' as const,
                residualResourceIds: Object.freeze({
                  providerCapability: Object.freeze([]) as readonly [],
                  attemptGrading: Object.freeze([]) as readonly [],
                }),
                residualCanaryIds: Object.freeze([]) as readonly [],
              });
            },
          }),
      }
    );

    const [first, second] = await Promise.all([ports.close(), ports.close()]);
    expect(first).toEqual(second);
    expect(workspaceCloseCalls).toBe(1);
    expect(attemptCloseCalls).toBe(1);
    expect(first.residualResourceIds).toEqual({
      controlledWorkspace: [],
      verificationEvidence: [],
      providerCapability: [],
      attemptGrading: [],
    });
  });
});
