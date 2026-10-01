import { digestAgentCanonicalValue } from '@prodivix/ai';
import {
  sameCanonicalJson,
  canonicalJsonText,
} from '@prodivix/shared/canonical';
import {
  decodeVerificationPlan,
  decodeVerificationRunSnapshot,
  encodeVerificationPlan,
  encodeVerificationRunEvent,
  createVerificationRunEvent,
  encodeVerificationEvidenceCandidate,
  normalizeVerificationEvidenceStatement,
  type VerificationEvidenceStatement,
} from '@prodivix/verification';
import { decodeWorkspaceSnapshot } from '@prodivix/workspace';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  abortableRuntimeTransport,
  readBoundedRuntimeJSON,
  AgentRuntimeServiceError,
} from '#src/transport.js';
import {
  driverDigest,
  driverIdentity,
  exactDriverRecord,
  digestDriverExecutionRequest,
  type DriverCoordinates,
} from '#src/g3/contract.js';
import type { G3DriverConfiguration } from '#src/g3/config.js';
import type {
  DriverBackendPort,
  DriverCanonicalContext,
  DriverCancellationContext,
  DriverPromotion,
} from '#src/g3/ports.js';

const promotion = (value: unknown): DriverPromotion => {
  const record = exactDriverRecord(
    value,
    ['promotionId', 'evidenceId', 'state', 'createdAt', 'deadline'],
    [
      'uploadCapability',
      'attestationNonce',
      'attestationStatement',
      'attestationStatementDigest',
    ]
  );
  if (
    typeof record.state !== 'string' ||
    typeof record.createdAt !== 'string' ||
    typeof record.deadline !== 'string' ||
    ['uploadCapability', 'attestationNonce'].some(
      (key) =>
        record[key] !== undefined &&
        (typeof record[key] !== 'string' ||
          (record[key] as string).length > 8192)
    )
  )
    throw new TypeError('G3 promotion receipt is invalid.');
  return {
    promotionId: driverIdentity(record.promotionId),
    evidenceId: driverIdentity(record.evidenceId),
    state: record.state,
    ...(record.uploadCapability === undefined
      ? {}
      : { uploadCapability: record.uploadCapability as string }),
    ...(record.attestationNonce === undefined
      ? {}
      : { attestationNonce: record.attestationNonce as string }),
    ...(record.attestationStatement === undefined
      ? {}
      : {
          attestationStatement: normalizeVerificationEvidenceStatement(
            record.attestationStatement as VerificationEvidenceStatement
          ),
        }),
    ...(record.attestationStatementDigest === undefined
      ? {}
      : {
          attestationStatementDigest: driverDigest(
            record.attestationStatementDigest
          ),
        }),
  };
};
const decodeContext = (value: unknown): DriverCancellationContext => {
  const record = exactDriverRecord(value, [
    'workspace',
    'plan',
    'run',
    'requestDigest',
    'projectId',
    'started',
  ]);
  const run = decodeVerificationRunSnapshot(record.run);
  const plan =
    record.plan === null ? null : decodeVerificationPlan(record.plan);
  if (
    !run.ok ||
    typeof record.started !== 'boolean' ||
    (record.started && (!plan || !plan.ok)) ||
    (!record.started && plan !== null)
  )
    throw new TypeError('G3 canonical context is invalid.');
  const workspace = decodeWorkspaceSnapshot(record.workspace).workspace;
  if (
    run.value.workspaceId !== workspace.id ||
    (plan?.ok &&
      (plan.value.planDigest !== run.value.planDigest ||
        plan.value.workspaceId !== workspace.id))
  )
    throw new TypeError('G3 canonical context coordinates drifted.');
  return {
    started: record.started,
    workspace,
    plan: plan?.ok ? plan.value : null,
    run: run.value,
    requestDigest: driverDigest(record.requestDigest),
    projectId: driverIdentity(record.projectId),
  };
};

/** Every callback is independently lease/cancellation authorized by Backend. */
export const createDriverBackendPort = (
  config: G3DriverConfiguration,
  options: { fetch?: typeof fetch; environment?: NodeJS.ProcessEnv } = {}
): DriverBackendPort => {
  const fetcher = options.fetch ?? fetch;
  const environment = options.environment ?? process.env;
  const root = new URL(config.backendURL);
  const grantExpirations = new Map<string, string>();
  const path = (workspaceId: string, runId: string, suffix: string) =>
    `/api/internal/agent/runtime/workspaces/${encodeURIComponent(workspaceId)}/runs/${encodeURIComponent(runId)}/g3-driver/${suffix}`;
  const refresh = (coordinates: DriverCoordinates): DriverCoordinates => ({
    ...coordinates,
    ...(coordinates.authority
      ? {
          authority: {
            ...coordinates.authority,
            observedAt: new Date().toISOString(),
          },
        }
      : {}),
  });
  const call = async (
    workspaceId: string,
    runId: string,
    suffix: string,
    signal: AbortSignal,
    body: unknown,
    extras: Record<string, string> = {},
    bytes?: Uint8Array
  ): Promise<Record<string, unknown>> => {
    const credential = environment[config.backendCredentialEnvironmentVariable];
    if (!credential || credential.length < 8 || /[\r\n]/u.test(credential))
      throw new Error('G3 callback credential is unavailable.');
    const headers = new Headers({
      Authorization: `Bearer ${credential}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...extras,
    });
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(abort, 15000);
    try {
      const response = await abortableRuntimeTransport(
        fetcher(new URL(path(workspaceId, runId, suffix), root), {
          method: bytes ? 'PUT' : 'POST',
          headers,
          body: bytes ? Buffer.from(bytes) : canonicalJsonText(body),
          redirect: 'error',
          signal: controller.signal,
        }),
        controller.signal
      );
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new AgentRuntimeServiceError(response.status);
      }
      return exactDriverRecord(
        await readBoundedRuntimeJSON(response, controller.signal),
        [],
        [
          'workspace',
          'plan',
          'run',
          'requestDigest',
          'projectId',
          'started',
          'grant',
          'promotionBase',
          'promotion',
          'artifact',
          'record',
          'replayed',
          'cleaned',
          'verificationRunId',
          'assetDocumentId',
          'digest',
          'mediaType',
          'contents',
        ]
      );
    } finally {
      headers.delete('Authorization');
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  };
  return {
    async context(request, signal) {
      const requestDigest = digestDriverExecutionRequest(request);
      const result = decodeContext(
        await call(
          request.workspace.id,
          request.agentRunId,
          'context',
          signal,
          {
            taskId: request.taskId,
            agentRunId: request.agentRunId,
            authority: {
              ...request.authority,
              observedAt: new Date().toISOString(),
            },
            verificationRunId: request.run.runId,
            planDigest: request.plan.planDigest,
            requestDigest,
            plan: encodeVerificationPlan(request.plan),
          }
        )
      );
      if (
        !result.started ||
        !result.plan ||
        result.requestDigest !== requestDigest ||
        !sameCanonicalJson(result.workspace, request.workspace) ||
        !sameCanonicalJson(result.plan, request.plan) ||
        result.run.providerId !== config.providerId ||
        result.run.runId !== request.run.runId ||
        result.run.planDigest !== request.plan.planDigest
      )
        throw new TypeError(
          'G3 dispatch differs from its canonical owner context.'
        );
      return result as DriverCanonicalContext;
    },
    async acquire(context, coordinates, cellId, attemptId, run, signal) {
      const key = canonicalJsonText({
        verificationRunId: coordinates.verificationRunId,
        cellId,
        attemptId,
      });
      let expiresAt = grantExpirations.get(key);
      if (!expiresAt) {
        if (grantExpirations.size >= 20000)
          throw new Error('G3 grant cache exceeds its budget.');
        expiresAt = new Date(Date.now() + 300000).toISOString();
        grantExpirations.set(key, expiresAt);
      }
      const result = exactDriverRecord(
        await call(
          context.workspace.id,
          coordinates.agentRunId,
          'attempts',
          signal,
          {
            ...refresh(coordinates),
            cellId,
            attemptId,
            run,
            producerId: 'prodivix.agent-runtime-g3',
            trustCeiling: 'remote-attested',
            expiresAt,
          }
        ),
        ['grant', 'promotionBase']
      );
      const grant = exactDriverRecord(result.grant, [
        'id',
        'grantDigest',
        'planDigest',
        'cellId',
        'attemptId',
        'issuedAt',
        'expiresAt',
      ]);
      driverIdentity(grant.id);
      driverDigest(grant.grantDigest);
      if (
        grant.planDigest !== coordinates.planDigest ||
        grant.cellId !== cellId ||
        grant.attemptId !== attemptId ||
        typeof grant.expiresAt !== 'string' ||
        typeof grant.issuedAt !== 'string' ||
        new Date(grant.issuedAt).toISOString() !== grant.issuedAt ||
        new Date(grant.expiresAt).toISOString() !== grant.expiresAt ||
        Date.parse(grant.expiresAt) <= Date.now() ||
        Date.parse(grant.issuedAt) > Date.now() + 5000
      )
        throw new TypeError('G3 attempt grant coordinates drifted.');
      return { issuedAt: grant.issuedAt, expiresAt: grant.expiresAt };
    },
    async event(context, coordinates, event, signal) {
      const result = exactDriverRecord(
        await call(
          context.workspace.id,
          coordinates.agentRunId,
          coordinates.cancellationCommandId ? 'cancel/events' : 'events',
          signal,
          {
            ...refresh(coordinates),
            event: encodeVerificationRunEvent(
              createVerificationRunEvent(event)
            ),
          }
        ),
        ['run'],
        ['replayed']
      );
      const decoded = decodeVerificationRunSnapshot(result.run);
      if (
        !decoded.ok ||
        decoded.value.runId !== coordinates.verificationRunId ||
        decoded.value.planDigest !== coordinates.planDigest
      )
        throw new TypeError('G3 event acknowledgement is invalid.');
      return decoded.value;
    },
    async promote(context, coordinates, candidate, signal) {
      const result = exactDriverRecord(
        await call(
          context.workspace.id,
          coordinates.agentRunId,
          'promotions',
          signal,
          {
            ...refresh(coordinates),
            candidate: encodeVerificationEvidenceCandidate(candidate),
          },
          { 'Idempotency-Key': candidate.promotion.idempotencyKey }
        ),
        ['promotion']
      );
      return promotion(result.promotion);
    },
    async upload(
      context,
      coordinates,
      receipt,
      artifactId,
      mediaType,
      bytes,
      signal
    ) {
      if (!receipt.uploadCapability)
        throw new Error('G3 upload capability is unavailable.');
      await call(
        context.workspace.id,
        coordinates.agentRunId,
        `promotions/${encodeURIComponent(receipt.promotionId)}/artifacts/${encodeURIComponent(artifactId)}`,
        signal,
        undefined,
        {
          'Content-Type': mediaType,
          'X-Prodivix-Verification-Capability': receipt.uploadCapability,
          'X-Prodivix-Agent-G3-Coordinates': canonicalJsonText(
            refresh(coordinates)
          ),
        },
        bytes
      );
    },
    async finalize(context, coordinates, receipt, attestation, signal) {
      if (!receipt.uploadCapability)
        throw new Error('G3 finalize capability is unavailable.');
      const result = await call(
        context.workspace.id,
        coordinates.agentRunId,
        `promotions/${encodeURIComponent(receipt.promotionId)}/finalize`,
        signal,
        { ...refresh(coordinates), ...(attestation ? { attestation } : {}) },
        { 'X-Prodivix-Verification-Capability': receipt.uploadCapability }
      );
      if (result.promotion !== undefined)
        return { promotion: promotion(result.promotion) };
      const record = exactDriverRecord(result.record, [
        'evidence',
        'artifacts',
        'verifiedView',
        'activeProtections',
      ]);
      if (
        !isPlainObject(record.evidence) ||
        !isPlainObject(record.evidence.run) ||
        record.evidence.id !== receipt.evidenceId ||
        record.evidence.run.runId !== coordinates.verificationRunId ||
        record.evidence.run.providerId !== config.providerId ||
        record.evidence.planDigest !== coordinates.planDigest
      )
        throw new TypeError('G3 promotion owner acknowledgement is invalid.');
      driverDigest(record.evidence.manifestDigest);
      return { evidenceId: driverIdentity(record.evidence.id) };
    },
    async cancel(request, signal, executionRequestDigest) {
      return decodeContext(
        await call(request.workspaceId, request.agentRunId, 'context', signal, {
          taskId: request.taskId,
          agentRunId: request.agentRunId,
          verificationRunId: request.verificationRunId,
          planDigest: request.planDigest,
          requestDigest:
            executionRequestDigest ?? digestAgentCanonicalValue(request.wire),
          ...(request.authority
            ? {
                authority: {
                  ...request.authority,
                  observedAt: new Date().toISOString(),
                },
              }
            : {}),
          ...(request.cancellationCommandId
            ? { cancellationCommandId: request.cancellationCommandId }
            : {}),
        })
      );
    },
    async cleanup(workspaceId, coordinates, clean, signal, completedAt) {
      if (!clean) throw new Error('G3 resources have not quiesced.');
      const receipt = exactDriverRecord(
        await call(workspaceId, coordinates.agentRunId, 'cleanup', signal, {
          ...refresh(coordinates),
          contract: 'prodivix.agent-runtime-g3-cleanup',
          providerId: config.providerId,
          resourcesClean: true,
          completedAt,
        }),
        ['cleaned', 'verificationRunId', 'requestDigest'],
        ['started']
      );
      if (
        receipt.cleaned !== true ||
        receipt.verificationRunId !== coordinates.verificationRunId ||
        receipt.requestDigest !== coordinates.requestDigest ||
        (receipt.started !== undefined && receipt.started !== false)
      )
        throw new TypeError('G3 cleanup owner acknowledgement is invalid.');
    },
    async asset(context, coordinates, cellId, baseline, signal) {
      const receipt = exactDriverRecord(
        await call(
          context.workspace.id,
          coordinates.agentRunId,
          `assets/${encodeURIComponent(baseline.asset.assetDocumentId)}`,
          signal,
          {
            ...refresh(coordinates),
            cellId,
            baselineEntryId: baseline.id,
            assetDigest: baseline.asset.digest,
          }
        ),
        ['assetDocumentId', 'digest', 'mediaType', 'contents']
      );
      if (
        receipt.assetDocumentId !== baseline.asset.assetDocumentId ||
        receipt.digest !== baseline.asset.digest ||
        receipt.mediaType !== 'image/png' ||
        baseline.asset.mediaType !== 'image/png' ||
        typeof receipt.contents !== 'string' ||
        receipt.contents.length > 12 * 1024 * 1024 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
          receipt.contents
        )
      )
        throw new TypeError('G3 baseline asset receipt is invalid.');
      const bytes = Buffer.from(receipt.contents, 'base64');
      if (bytes.toString('base64') !== receipt.contents)
        throw new TypeError('G3 baseline asset bytes are invalid.');
      return new Uint8Array(bytes);
    },
  };
};
