import { resolve } from 'node:path';
import {
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  digestBehaviorControlProfile,
} from '@prodivix/behavior';
import { createEmptyPirDocument } from '@prodivix/pir';
import { BUILD_VERIFICATION_ADAPTER_REGISTRATION } from '@prodivix/verification-adapters';
import {
  createVerificationRunSnapshot,
  digestVerificationValue,
  encodeVerificationPlan,
  encodeVerificationRunSnapshot,
  type VerificationPlan,
  type VerificationPlanCell,
} from '@prodivix/verification';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { createDriverRegistry } from '#src/g3/registry.js';
import type { G3DriverConfiguration } from '#src/g3/config.js';

export const driverServiceFixture = (
  stateDirectory: string,
  runId = 'verification:ordinary'
) => {
  const config: G3DriverConfiguration = {
    repositoryRoot: resolve('../..'),
    stateDirectory,
    backendURL: 'http://127.0.0.1:1',
    backendCredentialEnvironmentVariable: 'G3_BACKEND_CREDENTIAL',
    driverCredentialEnvironmentVariable: 'G3_DRIVER_CREDENTIAL',
    providerId: 'prodivix.agent-runtime-g3',
    port: 9001,
    maximumConcurrentRuns: 1,
    adapterIds: [BUILD_VERIFICATION_ADAPTER_REGISTRATION.descriptor.id],
    attestation: {
      keyId: 'ordinary-g3-key',
      issuer: 'prodivix',
      audience: 'prodivix',
      subject: 'ordinary-g3',
      policyGeneration: 1,
      privateKeyEnvironmentVariable: 'G3_PRIVATE_KEY',
    },
  };
  const workspace: WorkspaceSnapshot = {
    id: 'workspace:ordinary',
    workspaceRev: 1,
    routeRev: 1,
    opSeq: 1,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: ['page-node'],
      },
      'page-node': {
        id: 'page-node',
        kind: 'doc',
        name: 'page.pir.json',
        parentId: 'root',
        docId: 'page',
      },
    },
    docsById: {
      page: {
        id: 'page',
        type: 'pir-page',
        path: '/page.pir.json',
        contentRev: 1,
        metaRev: 1,
        content: createEmptyPirDocument(),
      },
    },
    routeManifest: {
      version: '1',
      root: { id: 'route-root', pageDocId: 'page' },
    },
  };
  const registry = createDriverRegistry(config);
  const digest = digestVerificationValue('ordinary-service-contract-test');
  const cell: VerificationPlanCell = {
    id: 'cell:build',
    checkId: 'check:build',
    checkKind: 'build',
    targetId: 'target:build',
    targetPolicy: {
      authority: 'verification-policy',
      policyDigest: digest,
      semanticTargetId: 'target:build',
      capture: 'allowed',
    },
    frameworkTarget: 'react-vite',
    surface: 'export',
    viewport: { id: 'desktop', width: 1280, height: 720 },
    colorScheme: 'light',
    motion: 'full',
    locale: 'en-US',
    controlProfileRef: {
      kind: 'preset',
      presetId: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET.id,
      digest: digestBehaviorControlProfile(
        BEHAVIOR_DETERMINISTIC_CONTROL_PRESET
      ),
    },
    adapter: BUILD_VERIFICATION_ADAPTER_REGISTRATION.identity,
    requirement: 'required',
    policyRuleIds: ['rule:build'],
    appliedExemptionIds: [],
    retryPolicy: {
      id: 'retry:once',
      maximumAttempts: 1,
      retryableOutcomes: [],
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    },
    evidenceRequirements: {
      acceptedTrust: ['remote-attested'],
      maximumAgeMs: 60000,
      requireAttestation: true,
      requireCompatibleIdentity: true,
      requiredArtifactKinds: ['build-log'],
    },
    resources: [],
    inputKinds: ['executable-snapshot'],
    artifactKinds: ['build-log'],
    estimatedCost: { durationMs: 30000, artifactBytes: 1024, computeUnits: 1 },
    preflight: { status: 'supported' },
    dependencyCellIds: [],
    inputDigest: digest,
  };
  const base: Omit<VerificationPlan, 'planDigest'> = {
    status: 'ready',
    workspaceId: workspace.id,
    targetRevision: 1,
    targetPartitionRevisions: {
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 1,
      documentRevisions: { page: { contentRev: 1, metaRev: 1 } },
    },
    scenarioRegistryDigest: digest,
    policyRevision: 1,
    policyDigest: digest,
    retentionRequest: {
      successful: 'change',
      failed: 'session',
      protectReleaseEvidence: false,
    },
    policyEvaluationInstant: '2026-10-01T00:00:00.000Z',
    impactDigest: digest,
    semanticSchemaDigest: digest,
    providerSetDigest: digest,
    compilerDigest: digest,
    plannerDigest: digest,
    adapterRegistryDigest: registry.snapshotDigest,
    cells: [cell],
    issues: [],
    explanations: [
      {
        cellId: cell.id,
        checkId: cell.checkId,
        targetId: cell.targetId,
        status: 'selected',
        impactPathIds: [],
        policyRuleIds: ['rule:build'],
        messages: ['Required.'],
      },
    ],
    budget: {
      cells: 1,
      cellsByCheckKind: {
        diagnostics: 0,
        build: 1,
        unit: 0,
        integration: 0,
        e2e: 0,
        visual: 0,
        accessibility: 0,
        performance: 0,
        security: 0,
      },
      targetExpansions: 1,
      browserExpansions: 0,
      closureEvidenceRecords: 1,
      totalMs: 30000,
      artifactBytes: 1024,
      estimatedComputeUnits: 1,
      maximumParallelism: 1,
      overBudgetDimensions: [],
    },
  };
  const plan: VerificationPlan = {
    ...base,
    planDigest: digestVerificationValue(base),
  };
  const run = createVerificationRunSnapshot({
    runId,
    plan,
    surface: 'export',
    scope: 'required',
    providerId: config.providerId,
    origin: 'cli',
    selectedCellIds: [cell.id],
    attemptIdByCellId: { [cell.id]: 'attempt:build' },
    createdAt: '2026-10-01T00:00:01.000Z',
  });
  const authority = {
    leaseId: 'lease:ordinary',
    holderId: 'worker:ordinary',
    generation: 1,
    observedAt: '2026-10-01T00:00:02.000Z',
  };
  const execution = {
    contract: 'prodivix.agent-runtime-g3-execution',
    taskId: 'task:ordinary',
    agentRunId: 'agent-run:ordinary',
    authority,
    workspace,
    plan: encodeVerificationPlan(plan),
    run: encodeVerificationRunSnapshot(run),
  };
  const preflight = {
    contract: 'prodivix.agent-runtime-g3-preflight',
    taskId: execution.taskId,
    agentRunId: execution.agentRunId,
    authority,
    workspace,
    plan: execution.plan,
  };
  return { config, workspace, registry, plan, run, cell, execution, preflight };
};
