import {
  createAgentClaimLease,
  decodeAgentControlFact,
  encodeAgentControlFact,
  encodeAgentProposalFact,
  type AgentRunSnapshot,
  type AgentWorkspaceRevisionVector,
  decodeAgentTaskAdmission,
  digestAgentCanonicalValue,
  decodeAgentProductLedgerBundle,
  encodeAgentVerificationFact,
  encodeAgentTaskOutput,
} from '@prodivix/ai';
import { isPlainObject } from '@prodivix/shared/safety';
import { decodeWorkspaceAgentRepairFailure } from '@prodivix/workspace-sync';
import {
  decodeWorkspaceSnapshot,
  WORKSPACE_AGENT_ACTION_REGISTRY,
} from '@prodivix/workspace';
import type { AgentRuntimeConfiguration } from '#src/config.js';
import type {
  AgentRuntimePorts,
  RuntimeDispatchClaim,
  RuntimeTask,
} from '#src/ports.js';
import { type AgentRuntimeAdmissionResult } from '#src/admission.js';
import {
  abortableRuntimeTransport,
  readBoundedRuntimeJSON,
  AgentRuntimeServiceError,
} from '#src/transport.js';
import {
  decodeVerificationRunSnapshot,
  encodeVerificationPlan,
  encodeVerificationRunSnapshot,
  encodeVerificationRunEvent,
  decodeVerificationEvidenceManifest,
  projectVerificationEvidenceManifest,
  decodeVerificationEvidenceVerifiedView,
  encodeVerificationClosure,
} from '@prodivix/verification';

const snapshot = (wire: unknown): AgentRunSnapshot => {
  const fact = decodeAgentControlFact(wire);
  if (!fact.ok || fact.value.factType !== 'run-snapshot')
    throw new Error('Agent runtime snapshot response is invalid.');
  return fact.value.value;
};

export const createAgentRuntimeHttpPorts = (
  config: AgentRuntimeConfiguration,
  options: {
    environment?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
  } = {}
): AgentRuntimePorts => {
  const fetcher = options.fetch ?? fetch;
  const environment = options.environment ?? process.env;
  const base = new URL(config.backendURL);
  base.pathname = '/api/internal/agent/runtime/';
  const call = async (
    path: string,
    method: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> => {
    const credential = environment[config.bearerEnvironmentVariable];
    if (!credential || /[\r\n]/u.test(credential))
      throw new Error('Agent runtime worker credential is unavailable.');
    const headers = new Headers({
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, 15_000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try {
      const response = await abortableRuntimeTransport(
        fetcher(new URL(path, base), {
          method,
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          redirect: 'error',
          signal: controller.signal,
        }),
        controller.signal
      );
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new AgentRuntimeServiceError(response.status);
      }
      const value: unknown = await readBoundedRuntimeJSON(
        response,
        controller.signal
      );
      if (!isPlainObject(value))
        throw new Error('Agent runtime service response is invalid.');
      return value;
    } finally {
      headers.delete('Authorization');
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
  const runPath = (workspaceId: string, runId: string) =>
    `workspaces/${encodeURIComponent(workspaceId)}/runs/${encodeURIComponent(runId)}`;
  const verificationSnapshot = (wire: unknown) => {
    const fact = decodeVerificationRunSnapshot(wire);
    if (!fact.ok)
      throw new Error('Agent runtime VerificationRun response is invalid.');
    return fact.value;
  };
  const leaseResponse = (value: unknown) => {
    if (
      !isPlainObject(value) ||
      typeof value.runId !== 'string' ||
      typeof value.leaseId !== 'string' ||
      typeof value.holderId !== 'string' ||
      typeof value.acquiredAt !== 'string' ||
      typeof value.expiresAt !== 'string' ||
      typeof value.generation !== 'number'
    )
      throw new Error('Agent runtime lease response is invalid.');
    return createAgentClaimLease({
      runId: value.runId,
      leaseId: value.leaseId,
      holderId: value.holderId,
      acquiredAt: value.acquiredAt,
      expiresAt: value.expiresAt,
      generation: value.generation,
    });
  };
  return {
    async publishTaskOutput(input, signal) {
      await call(
        `${runPath(input.workspaceId, input.runId)}/task-outputs`,
        'POST',
        { ...input.authority, output: encodeAgentTaskOutput(input.output) },
        signal
      );
    },
    async listAdmissionChallenges(signal) {
      const result = await call(
        'admission-challenges',
        'GET',
        undefined,
        signal
      );
      if (!Array.isArray(result.items) || result.items.length > 20)
        throw new Error('Agent runtime admission page is invalid.');
      return result.items.map((item) => {
        if (
          !isPlainObject(item) ||
          typeof item.admissionId !== 'string' ||
          typeof item.challengeDigest !== 'string' ||
          typeof item.actorAuthorizationDigest !== 'string' ||
          typeof item.observedAt !== 'string' ||
          typeof item.expiresAt !== 'string'
        )
          throw new Error('Agent runtime admission challenge is invalid.');
        const task = decodeAgentControlFact(item.task);
        if (!task.ok || task.value.factType !== 'task-record')
          throw new Error('Agent runtime admission Task is invalid.');
        if (
          item.challengeDigest !==
          digestAgentCanonicalValue({
            admissionId: item.admissionId,
            taskDigest: task.value.value.taskDigest,
            actorAuthorizationDigest: item.actorAuthorizationDigest,
            observedAt: item.observedAt,
            expiresAt: item.expiresAt,
          })
        )
          throw new Error('Agent runtime admission challenge digest drifted.');
        return {
          admissionId: item.admissionId,
          challengeDigest: item.challengeDigest,
          actorAuthorizationDigest: item.actorAuthorizationDigest,
          observedAt: item.observedAt,
          expiresAt: item.expiresAt,
          task: task.value.value,
          workspace: decodeWorkspaceSnapshot(item.workspace).workspace,
        };
      });
    },
    async completeAdmission(input, signal) {
      const { admissionId, task, ...facts } = input;
      await call(
        `admission-challenges/${encodeURIComponent(admissionId)}/result`,
        'POST',
        {
          ...facts,
          task: encodeAgentControlFact({
            factType: 'task-record',
            value: task,
          }),
        },
        signal
      );
    },
    async listTasks(signal) {
      const result = await call('tasks?limit=20', 'GET', undefined, signal);
      if (!Array.isArray(result.items) || result.items.length > 20)
        throw new Error('Agent runtime Task page is invalid.');
      return result.items.map((item): RuntimeTask => {
        if (!isPlainObject(item) || typeof item.workspaceId !== 'string')
          throw new Error('Agent runtime Task item is invalid.');
        const task = decodeAgentControlFact(item.task);
        if (
          !task.ok ||
          task.value.factType !== 'task-record' ||
          task.value.value.spec.workspaceId !== item.workspaceId
        )
          throw new Error('Agent runtime Task fact is invalid.');
        return {
          workspaceId: item.workspaceId,
          task: task.value.value,
          ...(item.run ? { run: snapshot(item.run) } : {}),
        };
      });
    },
    async readContext(input, signal) {
      const result = await call(
        `workspaces/${encodeURIComponent(input.workspaceId)}/tasks/${encodeURIComponent(input.task.spec.taskId)}/context`,
        'GET',
        undefined,
        signal
      );
      const task = decodeAgentControlFact(result.task);
      if (
        !task.ok ||
        task.value.factType !== 'task-record' ||
        !isPlainObject(result.workspace)
      )
        throw new Error('Agent runtime Context response is invalid.');
      let admission: AgentRuntimeAdmissionResult | undefined;
      if (result.admission !== undefined) {
        const decoded = decodeAgentTaskAdmission(result.admission, {
          requestedTask: task.value.value,
        });
        if (
          !decoded.ok ||
          decoded.value.status !== 'admitted' ||
          !('task' in decoded.value)
        )
          throw new Error('Agent runtime admission fact is invalid.');
        admission = decoded.value;
      }
      return {
        task: task.value.value,
        workspace: decodeWorkspaceSnapshot(result.workspace).workspace,
        ...(admission ? { admission } : {}),
        ...(result.repair === undefined
          ? {}
          : { repair: decodeWorkspaceAgentRepairFailure(result.repair) }),
      };
    },
    async createRun(input, signal) {
      return snapshot(
        (
          await call(
            `workspaces/${encodeURIComponent(input.workspaceId)}/runs`,
            'POST',
            {
              snapshot: encodeAgentControlFact({
                factType: 'run-snapshot',
                value: input.snapshot,
              }),
              event: encodeAgentControlFact({
                factType: 'run-event',
                value: input.event,
              }),
            },
            signal
          )
        ).snapshot
      );
    },
    async startRun(input, signal) {
      return snapshot(
        (
          await call(
            `${runPath(input.workspaceId, input.snapshot.run.runId)}/start`,
            'POST',
            {
              expectedCursor: input.previous.cursor,
              expectedSnapshotDigest: input.previous.snapshotDigest,
              snapshot: encodeAgentControlFact({
                factType: 'run-snapshot',
                value: input.snapshot,
              }),
              event: encodeAgentControlFact({
                factType: 'run-event',
                value: input.event,
              }),
            },
            signal
          )
        ).snapshot
      );
    },
    async consumeCancellation(input, signal) {
      return snapshot(
        (
          await call(
            `${runPath(input.workspaceId, input.snapshot.run.runId)}/cancellations`,
            'POST',
            {
              commandId: input.commandId,
              expectedCursor: input.previous.cursor,
              expectedSnapshotDigest: input.previous.snapshotDigest,
              snapshot: encodeAgentControlFact({
                factType: 'run-snapshot',
                value: input.snapshot,
              }),
              event: encodeAgentControlFact({
                factType: 'run-event',
                value: input.event,
              }),
            },
            signal
          )
        ).snapshot
      );
    },
    async claimLease(input, signal) {
      const { workspaceId, runId, ...body } = input;
      return leaseResponse(
        (
          await call(
            `${runPath(workspaceId, runId)}/lease`,
            'POST',
            body,
            signal
          )
        ).lease
      );
    },
    async renewLease(input, signal) {
      return leaseResponse(
        (
          await call(
            `${runPath(input.workspaceId, input.runId)}/lease`,
            'PUT',
            { ...input.authority, expiresAt: input.expiresAt },
            signal
          )
        ).lease
      );
    },
    async transition(input, signal) {
      return snapshot(
        (
          await call(
            `${runPath(input.workspaceId, input.snapshot.run.runId)}/transitions`,
            'POST',
            {
              ...input.authority,
              expectedCursor: input.previous.cursor,
              expectedSnapshotDigest: input.previous.snapshotDigest,
              snapshot: encodeAgentControlFact({
                factType: 'run-snapshot',
                value: input.snapshot,
              }),
              event: encodeAgentControlFact({
                factType: 'run-event',
                value: input.event,
              }),
            },
            signal
          )
        ).snapshot
      );
    },
    async claimDispatch(input, signal) {
      const result = await call(
        `${runPath(input.workspaceId, input.runId)}/dispatch-claims`,
        'POST',
        {
          ...input.authority,
          operationId: input.operationId,
          expiresAt: input.expiresAt,
        },
        signal
      );
      const value = result.claim;
      if (
        !isPlainObject(value) ||
        typeof value.operationId !== 'string' ||
        typeof value.dispatchState !== 'string' ||
        typeof value.reconciliationRequired !== 'boolean' ||
        typeof value.replayed !== 'boolean'
      )
        throw new Error('Agent runtime dispatch claim is invalid.');
      return value as unknown as RuntimeDispatchClaim;
    },
    async markDispatched(input, signal) {
      const { leaseId, holderId, generation, operationId, expiresAt } =
        input.claim;
      await call(
        `${runPath(input.workspaceId, input.runId)}/dispatches`,
        'POST',
        {
          leaseId,
          holderId,
          generation,
          operationId,
          expiresAt,
          observedAt: input.observedAt,
        },
        signal
      );
    },
    async publishProposal(input, signal) {
      await call(
        `${runPath(input.workspaceId, input.runId)}/proposals`,
        'POST',
        {
          ...input.authority,
          proposal: encodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, {
            factType: 'proposal',
            value: input.proposal,
          }),
        },
        signal
      );
    },
    async publishPreview(input, signal) {
      await call(
        `${runPath(input.workspaceId, input.runId)}/preview`,
        'POST',
        {
          ...input.authority,
          planning: encodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, {
            factType: 'planning',
            value: input.planning,
          }),
          preview: encodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, {
            factType: 'preview',
            value: input.preview,
          }),
        },
        signal
      );
    },
    async readProduct(input, signal) {
      const payload = await call(
        `${runPath(input.workspaceId, input.runId)}/product`,
        'GET',
        undefined,
        signal
      );
      const result = decodeAgentProductLedgerBundle(
        WORKSPACE_AGENT_ACTION_REGISTRY,
        payload
      );
      if (!result.ok)
        throw new Error('Agent runtime product ledger is invalid.');
      if (!isPlainObject(payload.ledger))
        throw new Error('Agent runtime product ledger envelope is invalid.');
      return {
        view: result.value,
        currentRevision: payload.ledger
          .currentRevision as AgentWorkspaceRevisionVector,
        actorAuthorized: payload.ledger.actorAuthorized === true,
      };
    },
    async commitWorkspace(input, signal) {
      return call(
        `${runPath(input.workspaceId, input.runId)}/workspace-commits`,
        'POST',
        {
          ...input.authority,
          receipt: encodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, {
            factType: 'workspace-mutation-receipt',
            value: input.receipt,
          }),
          request: input.request,
        },
        signal
      );
    },
    async publishMutation(input, signal) {
      await call(
        `${runPath(input.workspaceId, input.runId)}/workspace-mutations`,
        'POST',
        {
          ...input.authority,
          receipt: encodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, {
            factType: 'workspace-mutation-receipt',
            value: input.receipt,
          }),
        },
        signal
      );
    },
    async createVerificationRun(input, signal) {
      return verificationSnapshot(
        (
          await call(
            `${runPath(input.workspaceId, input.runId)}/verification-runs`,
            'POST',
            {
              ...input.authority,
              request: encodeVerificationRunSnapshot(input.request),
              ...(input.plan
                ? { plan: encodeVerificationPlan(input.plan) }
                : {}),
            },
            signal
          )
        ).run
      );
    },
    async readVerificationRun(input, signal) {
      const result = await call(
        `${runPath(input.workspaceId, input.runId)}/verification-runs/${encodeURIComponent(input.verificationRunId)}?afterCursor=0`,
        'GET',
        undefined,
        signal
      );
      if (!isPlainObject(result.run))
        throw new Error('Agent runtime VerificationRun record is invalid.');
      return verificationSnapshot(result.run.snapshot);
    },
    async appendVerificationEvent(input, signal) {
      return verificationSnapshot(
        (
          await call(
            `${runPath(input.workspaceId, input.runId)}/verification-runs/${encodeURIComponent(input.verificationRunId)}/events`,
            'POST',
            {
              ...input.authority,
              event: encodeVerificationRunEvent(input.event),
            },
            signal
          )
        ).run
      );
    },
    async readVerificationEvidence(input, signal) {
      const result = await call(
        `${runPath(input.workspaceId, input.runId)}/verification-runs/${encodeURIComponent(input.verificationRunId)}/evidence/${encodeURIComponent(input.evidenceId)}`,
        'GET',
        undefined,
        signal
      );
      const fact = decodeVerificationEvidenceManifest(result.manifest);
      if (!fact.ok)
        throw new Error(
          'Agent runtime canonical Evidence manifest is invalid.'
        );
      return projectVerificationEvidenceManifest(fact.value);
    },
    async readVerificationView(input, signal) {
      const result = await call(
        `${runPath(input.workspaceId, input.runId)}/verified-evidence-view?workspaceRevision=${input.workspaceRevision}&planDigest=${encodeURIComponent(input.planDigest)}`,
        'GET',
        undefined,
        signal
      );
      if (!isPlainObject(result.verifiedEvidenceView))
        throw new Error('Agent runtime canonical Evidence view is invalid.');
      const fact = decodeVerificationEvidenceVerifiedView({
        ...result.verifiedEvidenceView,
        wireVersion: 1,
      });
      if (!fact.ok)
        throw new Error('Agent runtime canonical Evidence view is invalid.');
      return fact.value;
    },
    async publishVerificationBinding(input, signal) {
      await call(
        `${runPath(input.workspaceId, input.runId)}/verification-bindings`,
        'POST',
        {
          ...input.authority,
          binding: encodeAgentVerificationFact({
            factType: 'committed-plan-binding',
            value: input.binding,
          }),
        },
        signal
      );
    },
    async publishVerificationClosure(input, signal) {
      await call(
        `${runPath(input.workspaceId, input.runId)}/verification-closures`,
        'POST',
        {
          ...input.authority,
          receipt: encodeAgentVerificationFact({
            factType: 'verification-closure-receipt',
            value: input.receipt,
          }),
        },
        signal
      );
    },
    async publishRepairFailure(input, signal) {
      await call(
        `${runPath(input.workspaceId, input.runId)}/g3-failure-material`,
        'POST',
        {
          ...input.authority,
          closureReceiptId: input.closureReceiptId,
          closure: encodeVerificationClosure(input.closure),
        },
        signal
      );
    },
  };
};
