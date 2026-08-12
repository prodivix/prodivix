import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  planAgentModelEvaluationAttempts,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  createVerificationAdapterRegistrySnapshot,
  type VerificationAdapterRegistration,
} from '@prodivix/verification';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { afterEach, describe, expect, it } from 'vitest';
import { createV8EvaluationPlan } from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import {
  createAgentEvaluationControlledWorkspaceDomainPlan,
  createAgentEvaluationControlledWorkspaceG3PlanProjection,
} from './controlledWorkspaceRuntimeOwners';
import {
  createAgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult,
  createAgentEvaluationControlledWorkspaceG3AdmissionRequest,
  decodeAgentEvaluationControlledWorkspaceG3AdmissionRequest,
  digestAgentEvaluationControlledWorkspaceG3AdmissionStage,
  type AgentEvaluationControlledWorkspaceG3AdmissionRequest,
} from './controlledWorkspaceG3AdmissionClient';
import type { AgentEvaluationControlledWorkspaceG3AdmissionInput } from './controlledWorkspaceRuntimeProduction';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  createAgentEvaluationOwnerAuthorityDurability,
  createAgentEvaluationOwnerAuthorityResourceRetirementReceipt,
  createProductionAgentEvaluationOwnerAuthoritySidecar,
  type AgentEvaluationOwnerAuthorityRequest,
  type AgentEvaluationProductionFullAttemptOwnerAuthorityPorts,
} from './productionOwnerAuthoritySidecar';
import { createFileAgentEvaluationOwnerAuthorityReplayJournal } from './productionOwnerAuthoritySidecarJournal';

const now = '2026-08-08T00:00:00.000Z';
const serviceToken = 'g3-admission-sidecar-token-0123456789';
const canary = 'g3-admission-sidecar-canary-value';
const ownerImplementationDigest = digestAgentCanonicalValue({
  owner: 'production-g3-cell-admission.test',
});
const runtimeAuthorityDigest = digestAgentCanonicalValue({
  runtime: 'observed-chromium.test',
});
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

const temporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'g3-admission-sidecar-'));
  directories.push(directory);
  return directory;
};

const admissionInput =
  (): AgentEvaluationControlledWorkspaceG3AdmissionInput => {
    const evaluationPlan = createV8EvaluationPlan();
    const material = getG4V8PublicEvaluationCaseMaterials().find((candidate) =>
      candidate.invocation.blocks.some(
        (block) =>
          block.kind === 'workspace-fixture' &&
          block.fixture.expectedOutcome.proposal.status === 'ready' &&
          block.fixture.expectedOutcome.transaction.expectedCommandCount > 0
      )
    );
    const block = material?.invocation.blocks.find(
      (candidate) => candidate.kind === 'workspace-fixture'
    );
    const descriptor = material
      ? planAgentModelEvaluationAttempts(evaluationPlan).find(
          ({ caseId }) => caseId === material.caseId
        )
      : undefined;
    if (!material || block?.kind !== 'workspace-fixture' || !descriptor) {
      throw new TypeError('Missing G3 admission material.');
    }
    const domain = createAgentEvaluationControlledWorkspaceDomainPlan({
      caseId: descriptor.caseId,
      attemptId: descriptor.attemptId,
      fixture: block.fixture,
      issuedAt: now,
      expiresAt: '2026-08-08T00:15:00.000Z',
    });
    if (domain.status !== 'ready')
      throw new TypeError('Domain plan is blocked.');
    const baseWorkspace = block.fixture.workspaceSnapshot as WorkspaceSnapshot;
    const finalWorkspace = domain.plan.candidateSnapshot;
    const baseSnapshotDigest = digestAgentCanonicalValue(baseWorkspace);
    const finalWorkspaceSnapshotDigest =
      digestAgentCanonicalValue(finalWorkspace);
    const projection = createAgentEvaluationControlledWorkspaceG3PlanProjection(
      {
        fixture: block.fixture,
        baseWorkspace,
        finalWorkspace,
        baseSnapshotDigest,
        finalSnapshotDigest: finalWorkspaceSnapshotDigest,
      }
    );
    if (projection.status !== 'ready') {
      throw new TypeError('Verification Plan is blocked.');
    }
    const registrySnapshot = createVerificationAdapterRegistrySnapshot(
      block.fixture.verificationFixture
        .adapters as unknown as readonly VerificationAdapterRegistration[]
    );
    return Object.freeze({
      namespaceId: 'evaluation.namespace.g3-admission-sidecar',
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

const resultFor = (
  request: AgentEvaluationControlledWorkspaceG3AdmissionRequest
) =>
  createAgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult(request, {
    run: Object.freeze({
      runId: `g3-run.${request.requestDigest.slice('sha256-'.length, 47)}`,
      providerId: 'prodivix.g4.chromium-production',
      parentAttemptId: request.attemptId,
      surface: request.cell.surface,
      frameworkTarget: request.cell.frameworkTarget,
      runtimeZone: 'sandbox',
      ...(request.cell.browserEngine
        ? { browserEngine: request.cell.browserEngine }
        : {}),
      viewport: request.cell.viewport,
      devicePixelRatio: 1,
      colorScheme: request.cell.colorScheme,
      motion: request.cell.motion,
      locale: request.cell.locale,
      timezone: 'UTC',
      fontSetDigest: digestAgentCanonicalValue('observed-font-set.test'),
      sandboxImageDigest: digestAgentCanonicalValue(
        'observed-browser-image.test'
      ),
    }),
    runtimeAuthorityDigest,
    ownerImplementationDigest,
  });

const outerRequest = (
  payload: AgentEvaluationControlledWorkspaceG3AdmissionRequest,
  mode: 'stage' | 'execute' | 'reconcile',
  fences: Readonly<{ stageDigest?: string; dispatchAckDigest?: string }> = {}
): AgentEvaluationOwnerAuthorityRequest =>
  Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: 'controlled-workspace',
    mode,
    namespaceId: payload.namespaceId,
    planDigest: payload.evaluationPlanDigest,
    repositoryCommit: payload.repositoryCommit,
    operation: 'verification.cell.admit',
    routeBinding: 'g3-cell-admission',
    requestDigest: payload.requestDigest,
    attemptId: payload.attemptId,
    descriptorDigest: payload.descriptorDigest,
    generation: payload.generation,
    ownerImplementationDigest,
    ...fences,
    claimGeneration: 1,
    payload,
  });

const createPorts = (counts: {
  stage: number;
  execute: number;
  reconcile: number;
}): AgentEvaluationProductionFullAttemptOwnerAuthorityPorts => {
  const durability = createAgentEvaluationOwnerAuthorityDurability();
  const controlledWorkspace = Object.freeze({
    authorityId: 'controlled-workspace.g3-admission.test',
    implementationDigest: ownerImplementationDigest,
    durability,
    async read() {
      return Object.freeze([]);
    },
    async stage(request: AgentEvaluationOwnerAuthorityRequest) {
      counts.stage += 1;
      return digestAgentEvaluationControlledWorkspaceG3AdmissionStage(
        decodeAgentEvaluationControlledWorkspaceG3AdmissionRequest(
          request.payload
        ),
        ownerImplementationDigest
      );
    },
    async execute(request: AgentEvaluationOwnerAuthorityRequest) {
      counts.execute += 1;
      return Object.freeze([
        resultFor(
          decodeAgentEvaluationControlledWorkspaceG3AdmissionRequest(
            request.payload
          )
        ),
      ]);
    },
    async reconcile(request: AgentEvaluationOwnerAuthorityRequest) {
      counts.reconcile += 1;
      return Object.freeze({
        facts: Object.freeze([
          resultFor(
            decodeAgentEvaluationControlledWorkspaceG3AdmissionRequest(
              request.payload
            )
          ),
        ]),
        reconciled: true,
      });
    },
  });
  const generic = Object.freeze({
    authorityId: 'unused-owner.g3-admission.test',
    implementationDigest: digestAgentCanonicalValue('unused-owner'),
    durability,
    async read() {
      return Object.freeze({});
    },
    async stage() {
      return digestAgentCanonicalValue('unused-stage');
    },
    async execute() {
      return Object.freeze({});
    },
    async reconcile() {
      return Object.freeze({ response: Object.freeze({}), reconciled: true });
    },
  });
  const ports = Object.freeze({
    purpose: 'full-attempt' as const,
    controlledWorkspace,
    verificationEvidence: generic,
    providerCapability: generic,
    attemptGrading: generic,
  });
  return Object.freeze({
    ...ports,
    async close() {
      return createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(
        ports
      );
    },
  });
};

const start = async (
  stateDirectory: string,
  ports: AgentEvaluationProductionFullAttemptOwnerAuthorityPorts
) => {
  const sidecar = createProductionAgentEvaluationOwnerAuthoritySidecar({
    serviceToken,
    authorities: ports,
    journal:
      await createFileAgentEvaluationOwnerAuthorityReplayJournal(
        stateDirectory
      ),
    forbiddenCanaries: () => Object.freeze([canary, serviceToken]),
  });
  return sidecar.listen({ host: '127.0.0.1', port: 0 });
};

const post = (baseUrl: string, request: AgentEvaluationOwnerAuthorityRequest) =>
  fetch(`${baseUrl}/v1/controlled-workspace/${request.mode}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': request.requestDigest,
    },
    body: canonicalJsonText(request),
  });

describe('production owner sidecar G3 cell admission', () => {
  it('stages and executes one Backend-sealed admission with exact fences', async () => {
    const payload =
      createAgentEvaluationControlledWorkspaceG3AdmissionRequest(
        admissionInput()
      );
    const expected = resultFor(payload);
    const counts = { stage: 0, execute: 0, reconcile: 0 };
    const listener = await start(
      await temporaryDirectory(),
      createPorts(counts)
    );
    try {
      const staged = await post(
        listener.baseUrl,
        outerRequest(payload, 'stage')
      );
      expect(staged.status).toBe(200);
      expect(await staged.json()).toMatchObject({
        mode: 'stage',
        stageDigest: expected.stageDigest,
        ownerImplementationDigest,
      });
      const executed = await post(
        listener.baseUrl,
        outerRequest(payload, 'execute', {
          stageDigest: expected.stageDigest,
        })
      );
      expect(executed.status).toBe(200);
      expect(await executed.json()).toMatchObject({
        mode: 'execute',
        ...expected,
      });
      expect(counts).toEqual({ stage: 1, execute: 1, reconcile: 0 });
    } finally {
      await listener.close();
    }
  }, 15_000);

  it('reconciles on an empty host cache from exact Backend fences with execute=0', async () => {
    const payload =
      createAgentEvaluationControlledWorkspaceG3AdmissionRequest(
        admissionInput()
      );
    const expected = resultFor(payload);
    const counts = { stage: 0, execute: 0, reconcile: 0 };
    const listener = await start(
      await temporaryDirectory(),
      createPorts(counts)
    );
    try {
      const reconciled = await post(
        listener.baseUrl,
        outerRequest(payload, 'reconcile', {
          stageDigest: expected.stageDigest,
          dispatchAckDigest: expected.dispatchAckDigest,
        })
      );
      expect(reconciled.status).toBe(200);
      expect(await reconciled.json()).toMatchObject({
        mode: 'reconcile',
        reconciled: true,
        ...expected,
      });
      expect(counts).toEqual({ stage: 0, execute: 0, reconcile: 1 });
    } finally {
      await listener.close();
    }
  });

  it('rejects fake stage and acknowledgement fences before acceptance', async () => {
    const payload =
      createAgentEvaluationControlledWorkspaceG3AdmissionRequest(
        admissionInput()
      );
    const expected = resultFor(payload);
    const counts = { stage: 0, execute: 0, reconcile: 0 };
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
              stageDigest: expected.stageDigest,
              dispatchAckDigest: digestAgentCanonicalValue('fake-ack'),
            })
          )
        ).status
      ).toBe(503);
      expect(counts.execute).toBe(0);
    } finally {
      await listener.close();
    }
  });
});
