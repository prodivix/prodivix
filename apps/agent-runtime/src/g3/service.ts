import { createServer, type Server, type IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { digestAgentCanonicalValue } from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { createExecutionSecretLeakGuard } from '@prodivix/runtime-core';
import { cleanupControlledStaticToolchainResources } from '@prodivix/verification-adapters';
import {
  createProductionBrowserCanaryScanner,
  createProductionChromiumRuntimeAuthority,
} from '@prodivix/verification-browser';
import { digestVerificationValue } from '@prodivix/verification';
import { createDriverBackendPort } from '#src/g3/backend.js';
import { checkG3DriverResources } from '#src/g3/resources.js';
import { createDriverRegistry } from '#src/g3/registry.js';
import {
  decodeDriverPreflight,
  inspectDriverMaterials,
} from '#src/g3/preflight.js';
import {
  decodeDriverExecution,
  digestDriverExecutionRequest,
  decodeDriverCancellation,
  type DriverCoordinates,
  type DriverExecution,
} from '#src/g3/contract.js';
import { DriverJournal, type DriverJournalRecord } from '#src/g3/journal.js';
import {
  runDriverExecution,
  cancelDriverRun,
  appendDriverEvent,
} from '#src/g3/runner.js';
import type {
  DriverBackendPort,
  DriverCanonicalContext,
} from '#src/g3/ports.js';
import type { G3DriverConfiguration } from '#src/g3/config.js';
import { assertDriverSigningCredential } from '#src/g3/signer.js';

export type DriverServicePorts = Readonly<{
  backend?: DriverBackendPort;
  resources?: (config: G3DriverConfiguration) => Promise<void>;
  execute?: typeof runDriverExecution;
  cleanup?: (scope: string) => Promise<void>;
  environment?: NodeJS.ProcessEnv;
}>;
type Job = {
  request: DriverExecution;
  context: DriverCanonicalContext;
  coordinates: DriverCoordinates;
  controller: AbortController;
  record: DriverJournalRecord;
  done: Promise<void>;
  clean: boolean;
};
const maximumRequestBytes = 64 * 1024 * 1024;
const readBody = async (request: IncomingMessage): Promise<unknown> => {
  if (
    request.headers['content-type'] !== 'application/json' ||
    request.headers['content-encoding'] !== undefined
  )
    throw new Error('G3 body encoding is invalid.');
  const length = request.headers['content-length'];
  if (
    length &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(length) ||
      Number(length) > maximumRequestBytes)
  )
    throw new Error('G3 body exceeds its limit.');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    bytes += chunk.length;
    if (bytes > maximumRequestBytes || chunks.length >= 100000)
      throw new Error('G3 body exceeds its limit.');
    chunks.push(chunk);
  }
  return JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(
      Buffer.concat(chunks, bytes)
    )
  );
};
const authorize = (
  request: IncomingMessage,
  credential: string | undefined
): boolean => {
  const expected = credential
    ? Buffer.from(`Bearer ${credential}`, 'utf8')
    : Buffer.alloc(0);
  const actual = Buffer.from(request.headers.authorization ?? '', 'utf8');
  try {
    return (
      expected.length >= 15 &&
      expected.length <= 8192 &&
      actual.length === expected.length &&
      timingSafeEqual(actual, expected)
    );
  } finally {
    expected.fill(0);
    actual.fill(0);
  }
};

/** The service composes public production owners; its HTTP ACK only admits dispatch. */
export const createG3DriverService = async (
  config: G3DriverConfiguration,
  ports: DriverServicePorts = {}
): Promise<Readonly<{ server: Server; close(): Promise<void> }>> => {
  const environment = ports.environment ?? process.env;
  const resources = ports.resources ?? checkG3DriverResources;
  const backend =
    ports.backend ?? createDriverBackendPort(config, { environment });
  const cleanup =
    ports.cleanup ??
    (async (scope) => {
      await cleanupControlledStaticToolchainResources({ resourceScope: scope });
    });
  const execute = ports.execute ?? runDriverExecution;
  const journal = new DriverJournal(config.stateDirectory);
  const jobs = new Map<string, Job>();
  const admitting = new Set<string>();
  const cancelling = new Set<string>();
  const registry = createDriverRegistry(config);
  const canaries = (): readonly string[] => {
    const names = [
      config.backendCredentialEnvironmentVariable,
      config.driverCredentialEnvironmentVariable,
      config.attestation.privateKeyEnvironmentVariable,
    ];
    const values = names.map((name) => environment[name]);
    if (
      values.some(
        (value) =>
          typeof value !== 'string' || !/^[\x21-\x7e]{8,4096}$/u.test(value)
      )
    )
      throw new Error('G3 server credentials are unavailable.');
    return [...new Set(values as string[])];
  };
  canaries();
  assertDriverSigningCredential(config, environment);
  const scanner = createProductionBrowserCanaryScanner({
    secretAuthorityDigest: digestVerificationValue({
      environmentReferences: [
        config.backendCredentialEnvironmentVariable,
        config.driverCredentialEnvironmentVariable,
        config.attestation.privateKeyEnvironmentVariable,
      ],
    }),
    forbiddenCanaries: canaries,
  });
  let accepting = true;
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    const timer = setTimeout(() => request.destroy(), 15000);
    timer.unref();
    try {
      if (!accepting || request.method !== 'POST' || request.url !== '/g3') {
        response.writeHead(404);
        response.end('{"code":"G3-DRIVER-UNAVAILABLE"}');
        return;
      }
      if (
        !authorize(
          request,
          environment[config.driverCredentialEnvironmentVariable]
        )
      ) {
        response.writeHead(401);
        response.end('{"code":"G3-DRIVER-UNAUTHORIZED"}');
        return;
      }
      const body = await readBody(request);
      clearTimeout(timer);
      const guard = createExecutionSecretLeakGuard({
        secretValues: canaries(),
      });
      if (!guard.inspectValue('request', body).safe)
        throw new Error(
          'G3 input contains protected or uninspectable material.'
        );
      const digest = digestAgentCanonicalValue(body);
      if (
        body &&
        typeof body === 'object' &&
        'contract' in body &&
        body.contract === 'prodivix.agent-runtime-g3-preflight'
      ) {
        const input = decodeDriverPreflight(body);
        inspectDriverMaterials(config, input.workspace, input.plan);
        await resources(config);
        if (config.chromium)
          await createProductionChromiumRuntimeAuthority(config.chromium);
        response.end(
          canonicalJsonText({
            accepted: true,
            requestDigest: digest,
            providerId: config.providerId,
            adapterRegistryDigest: registry.snapshotDigest,
            checkKinds: [
              ...new Set(
                registry.entries.flatMap((entry) => entry.descriptor.checkKinds)
              ),
            ],
            resourcesReady: true,
          })
        );
        return;
      }
      if (
        body &&
        typeof body === 'object' &&
        'contract' in body &&
        body.contract === 'prodivix.agent-runtime-g3-cancellation'
      ) {
        const cancellation = decodeDriverCancellation(body);
        if (cancelling.has(cancellation.verificationRunId))
          throw new Error('G3 cleanup is already in progress.');
        cancelling.add(cancellation.verificationRunId);
        try {
          const job = jobs.get(cancellation.verificationRunId);
          if (
            job &&
            (job.request.taskId !== cancellation.taskId ||
              job.request.agentRunId !== cancellation.agentRunId ||
              job.request.plan.planDigest !== cancellation.planDigest)
          )
            throw new Error('G3 cancellation coordinates drifted.');
          const stored =
            job?.record ?? (await journal.read(cancellation.verificationRunId));
          let context = await backend.cancel(
            cancellation,
            new AbortController().signal,
            stored?.requestDigest
          );
          job?.controller.abort();
          if (job) {
            await job.done;
            context = await backend.cancel(
              cancellation,
              new AbortController().signal,
              stored?.requestDigest
            );
          }
          if (context.started && !stored)
            throw new Error('G3 cancellation has no local resource authority.');
          const after = job?.record ?? stored;
          if (after?.browserActive)
            throw new Error(
              'G3 Browser resources have no confirmed retirement.'
            );
          for (const scope of after?.resourceScopes ?? []) await cleanup(scope);
          const coordinates: DriverCoordinates = {
            taskId: cancellation.taskId,
            agentRunId: cancellation.agentRunId,
            verificationRunId: cancellation.verificationRunId,
            planDigest: cancellation.planDigest,
            requestDigest: context.requestDigest,
            ...(cancellation.authority
              ? { authority: cancellation.authority }
              : {}),
            ...(cancellation.cancellationCommandId
              ? { cancellationCommandId: cancellation.cancellationCommandId }
              : {}),
          };
          await cancelDriverRun(
            backend,
            context,
            coordinates,
            context.run,
            new AbortController().signal
          );
          const completedAt = after?.completedAt ?? new Date().toISOString();
          const cleanRecord: DriverJournalRecord = {
            requestDigest: context.requestDigest,
            state: 'clean',
            resourceScopes: after?.resourceScopes ?? [],
            browserActive: false,
            completedAt,
          };
          await journal.write(cancellation.verificationRunId, cleanRecord);
          if (job) job.record = cleanRecord;
          await backend.cleanup(
            cancellation.workspaceId,
            coordinates,
            true,
            new AbortController().signal,
            completedAt
          );
          if (job) job.clean = true;
          response.end(
            canonicalJsonText({
              accepted: true,
              requestDigest: digest,
              verificationRunId: cancellation.verificationRunId,
              planDigest: cancellation.planDigest,
              providerId: config.providerId,
            })
          );
          return;
        } finally {
          cancelling.delete(cancellation.verificationRunId);
        }
      }
      const input = decodeDriverExecution(body);
      const commitment = digestDriverExecutionRequest(input);
      if (input.run.providerId !== config.providerId)
        throw new Error('G3 provider drifted.');
      inspectDriverMaterials(config, input.workspace, input.plan);
      const existing = jobs.get(input.run.runId);
      if (existing) {
        if (existing.coordinates.requestDigest !== commitment)
          throw new Error('G3 dispatch identity was reused.');
      } else {
        if (jobs.size >= 256) {
          const completed = [...jobs.entries()].find(([, job]) => job.clean);
          if (completed) jobs.delete(completed[0]);
        }
        if (
          admitting.has(input.run.runId) ||
          [...jobs.values()].filter((job) => !job.clean).length +
            admitting.size >=
            config.maximumConcurrentRuns ||
          jobs.size + admitting.size >= 256
        )
          throw new Error('G3 concurrency exceeds its budget.');
        admitting.add(input.run.runId);
        try {
          const stored = await journal.read(input.run.runId);
          if (stored) {
            if (
              stored.requestDigest === commitment &&
              stored.state === 'clean' &&
              !stored.browserActive
            ) {
              response.end(
                canonicalJsonText({
                  accepted: true,
                  requestDigest: digest,
                  verificationRunId: input.run.runId,
                  planDigest: input.plan.planDigest,
                  providerId: config.providerId,
                })
              );
              return;
            }
            throw new Error(
              'G3 dispatch replay requires cleanup of its durable resource record.'
            );
          }
          await resources(config);
          if (!accepting) throw new Error('G3 driver is draining.');
          const context = await backend.context(
            input,
            new AbortController().signal
          );
          if (!accepting) throw new Error('G3 driver is draining.');
          const coordinates: DriverCoordinates = {
            taskId: input.taskId,
            agentRunId: input.agentRunId,
            authority: input.authority,
            verificationRunId: input.run.runId,
            planDigest: input.plan.planDigest,
            requestDigest: commitment,
          };
          const record: DriverJournalRecord = {
            requestDigest: commitment,
            state: 'executing',
            resourceScopes: [],
            browserActive: false,
          };
          await journal.write(input.run.runId, record, true);
          if (!accepting) throw new Error('G3 driver is draining.');
          const job: Job = {
            request: input,
            context,
            coordinates,
            controller: new AbortController(),
            record,
            done: Promise.resolve(),
            clean: false,
          };
          jobs.set(input.run.runId, job);
          job.done = (async () => {
            try {
              await execute({
                config,
                request: input,
                context,
                coordinates,
                backend,
                scanner,
                canaries,
                signal: job.controller.signal,
                recordResourceScope: async (scope) => {
                  job.record = {
                    ...job.record,
                    resourceScopes: [...job.record.resourceScopes, scope],
                  };
                  await journal.write(input.run.runId, job.record);
                },
                recordBrowserActive: async (active) => {
                  job.record = { ...job.record, browserActive: active };
                  await journal.write(input.run.runId, job.record);
                },
              });
              if (job.record.browserActive)
                throw new Error(
                  'G3 Browser resources have no confirmed retirement.'
                );
              for (const scope of job.record.resourceScopes)
                await cleanup(scope);
              const completedAt = new Date().toISOString();
              job.record = { ...job.record, state: 'clean', completedAt };
              await journal.write(input.run.runId, job.record);
              await backend.cleanup(
                input.workspace.id,
                coordinates,
                true,
                new AbortController().signal,
                completedAt
              );
              job.clean = true;
            } catch {
              job.record = { ...job.record, state: 'uncertain' };
              await journal.write(input.run.runId, job.record);
              if (!job.controller.signal.aborted) {
                try {
                  if (job.record.browserActive)
                    throw new Error(
                      'G3 Browser resources have no confirmed retirement.'
                    );
                  for (const scope of job.record.resourceScopes)
                    await cleanup(scope);
                  const current = await backend.context(
                    input,
                    new AbortController().signal
                  );
                  if (['queued', 'running'].includes(current.run.status))
                    await appendDriverEvent(
                      backend,
                      current,
                      coordinates,
                      current.run,
                      {
                        kind: 'run-interrupted',
                        reasonCode: 'VER-ORDINARY-G3-EXECUTION',
                      },
                      new AbortController().signal
                    );
                  const completedAt = new Date().toISOString();
                  job.record = { ...job.record, state: 'clean', completedAt };
                  await journal.write(input.run.runId, job.record);
                  await backend.cleanup(
                    input.workspace.id,
                    coordinates,
                    true,
                    new AbortController().signal,
                    completedAt
                  );
                  job.clean = true;
                } catch {
                  /* An uncertain resource/owner state stays blocked for cancellation retry. */
                }
              }
            }
          })().catch(() => {});
        } finally {
          admitting.delete(input.run.runId);
        }
      }
      response.end(
        canonicalJsonText({
          accepted: true,
          requestDigest: digest,
          verificationRunId: input.run.runId,
          planDigest: input.plan.planDigest,
          providerId: config.providerId,
        })
      );
    } catch {
      if (!response.headersSent) response.writeHead(503);
      response.end('{"code":"G3-DRIVER-BLOCKED"}');
    } finally {
      clearTimeout(timer);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 32;
  return {
    server,
    async close() {
      accepting = false;
      for (const job of jobs.values()) job.controller.abort();
      await Promise.all([...jobs.values()].map((job) => job.done));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};
