import {
  digestVerificationValue,
  normalizeVerificationCheckReport,
  type VerificationRunSnapshot,
  type VerificationRunEventInput,
} from '@prodivix/verification';
import { createDriverRegistry } from '#src/g3/registry.js';
import { cleanupControlledStaticToolchainResources } from '@prodivix/verification-adapters';
import { executeDriverStaticAttempt } from '#src/g3/staticAttempt.js';
import { executeDriverBrowserAttempt } from '#src/g3/browserAttempt.js';
import { createDriverArtifactStaging } from '#src/g3/staging.js';
import { signDriverAttestation } from '#src/g3/signer.js';
import type { DriverCoordinates, DriverExecution } from '#src/g3/contract.js';
import type {
  DriverBackendPort,
  DriverCanonicalContext,
} from '#src/g3/ports.js';
import type { G3DriverConfiguration } from '#src/g3/config.js';
import type { ProductionBrowserCanaryScannerPort } from '@prodivix/verification-browser';

type EventPayload = VerificationRunEventInput extends infer Event
  ? Event extends VerificationRunEventInput
    ? Omit<Event, 'eventId' | 'runId' | 'cursor' | 'occurredAt'>
    : never
  : never;
export const appendDriverEvent = async (
  backend: DriverBackendPort,
  context: Pick<DriverCanonicalContext, 'workspace'>,
  coordinates: DriverCoordinates,
  run: VerificationRunSnapshot,
  payload: EventPayload,
  signal: AbortSignal
): Promise<VerificationRunSnapshot> =>
  backend.event(
    context,
    coordinates,
    {
      ...payload,
      eventId: `event:${digestVerificationValue({ runId: run.runId, cursor: run.cursor + 1, payload }).slice(7)}`,
      runId: run.runId,
      cursor: run.cursor + 1,
      occurredAt: new Date().toISOString(),
    } as VerificationRunEventInput,
    signal
  );

/** Only the G3 owner normalizer creates intake candidates; ACK never becomes Evidence. */
export const runDriverExecution = async (input: {
  config: G3DriverConfiguration;
  request: DriverExecution;
  context: DriverCanonicalContext;
  coordinates: DriverCoordinates;
  backend: DriverBackendPort;
  scanner: ProductionBrowserCanaryScannerPort;
  canaries(): readonly string[];
  signal: AbortSignal;
  recordResourceScope(scope: string): Promise<void>;
  recordBrowserActive(active: boolean): Promise<void>;
}): Promise<void> => {
  const { context, coordinates, backend } = input;
  let run = context.run;
  const registry = createDriverRegistry(input.config);
  if (run.status === 'queued')
    run = await appendDriverEvent(
      backend,
      context,
      coordinates,
      run,
      { kind: 'run-started' },
      input.signal
    );
  for (const state of run.cells) {
    if (input.signal.aborted) throw new Error('G3 execution cancelled.');
    if (state.status !== 'queued') continue;
    const cell = context.plan.cells.find((cell) => cell.id === state.cellId);
    if (!cell) throw new Error('G3 selected cell disappeared.');
    run = await appendDriverEvent(
      backend,
      context,
      coordinates,
      run,
      { kind: 'cell-started', cellId: cell.id, attemptId: state.attemptId },
      input.signal
    );
    const staging = createDriverArtifactStaging(input.scanner);
    const resourceScope = digestVerificationValue({
      contract: 'ordinary-g3-attempt-resource',
      verificationRunId: run.runId,
      requestDigest: coordinates.requestDigest,
      cellId: cell.id,
      attemptId: state.attemptId,
      generation: input.request.authority.generation,
    }).slice(7);
    await input.recordResourceScope(resourceScope);
    try {
      const base = {
        config: input.config,
        context: { ...context, run },
        cell,
        attemptId: state.attemptId,
        generation: input.request.authority.generation,
        registry,
        staging,
        signal: input.signal,
        resourceScope,
        authorize: (identity: Parameters<DriverBackendPort['acquire']>[4]) =>
          backend.acquire(
            context,
            coordinates,
            cell.id,
            state.attemptId,
            identity,
            input.signal
          ),
      };
      const result = [
        'e2e',
        'visual',
        'accessibility',
        'performance',
        'security',
      ].includes(cell.checkKind)
        ? await executeDriverBrowserAttempt({
            ...base,
            coordinates,
            backend,
            scanner: input.scanner,
            canaries: input.canaries,
            recordBrowserActive: input.recordBrowserActive,
          })
        : await executeDriverStaticAttempt({
            ...base,
            scannerDigest: input.scanner.authorityDigest,
          });
      const normalized = normalizeVerificationCheckReport(result.input);
      if (normalized.status !== 'ready')
        throw new Error('G3 report failed owner normalization.');
      const candidate = normalized.candidate;
      let promotion = await backend.promote(
        context,
        coordinates,
        candidate,
        input.signal
      );
      for (const artifact of candidate.artifacts) {
        const bytes = result.artifacts.get(artifact.id);
        if (!bytes) throw new Error('G3 candidate artifact is unavailable.');
        await backend.upload(
          context,
          coordinates,
          promotion,
          artifact.id,
          artifact.expectedMediaType,
          bytes,
          input.signal
        );
      }
      let final = await backend.finalize(
        context,
        coordinates,
        promotion,
        undefined,
        input.signal
      );
      if (final.promotion) {
        promotion = final.promotion;
        final = await backend.finalize(
          context,
          coordinates,
          promotion,
          signDriverAttestation(input.config, promotion, candidate),
          input.signal
        );
      }
      if (!final.evidenceId)
        throw new Error('G3 promotion has no canonical owner acknowledgement.');
      run = await appendDriverEvent(
        backend,
        context,
        coordinates,
        run,
        {
          kind: 'cell-reported',
          cellId: cell.id,
          attemptId: state.attemptId,
          outcome: candidate.result.outcome,
          candidateDigest: candidate.candidateDigest,
        },
        input.signal
      );
      run = await appendDriverEvent(
        backend,
        context,
        coordinates,
        run,
        {
          kind: 'cell-promoted',
          cellId: cell.id,
          attemptId: state.attemptId,
          candidateDigest: candidate.candidateDigest,
          evidenceId: final.evidenceId,
        },
        input.signal
      );
    } finally {
      staging.dispose();
      await cleanupControlledStaticToolchainResources({ resourceScope });
    }
  }
  await appendDriverEvent(
    backend,
    context,
    coordinates,
    run,
    { kind: 'run-completed' },
    input.signal
  );
};

export const cancelDriverRun = async (
  backend: DriverBackendPort,
  context: Pick<DriverCanonicalContext, 'workspace'>,
  coordinates: DriverCoordinates,
  initial: VerificationRunSnapshot,
  signal: AbortSignal
): Promise<void> => {
  let run = initial;
  if (
    ['completed', 'failed', 'blocked', 'cancelled', 'interrupted'].includes(
      run.status
    )
  )
    return;
  if (run.status !== 'cancelling')
    run = await appendDriverEvent(
      backend,
      context,
      coordinates,
      run,
      { kind: 'run-cancel-requested', reason: 'ordinary-agent-cancelled' },
      signal
    );
  for (const cell of run.cells)
    if (cell.status === 'running')
      run = await appendDriverEvent(
        backend,
        context,
        coordinates,
        run,
        {
          kind: 'cell-reported',
          cellId: cell.cellId,
          attemptId: cell.attemptId,
          outcome: 'cancelled',
          candidateDigest: digestVerificationValue({
            contract: 'prodivix.agent-runtime-g3-cancelled-attempt',
            verificationRunId: run.runId,
            cellId: cell.cellId,
            attemptId: cell.attemptId,
            cancellationCommandId: coordinates.cancellationCommandId ?? '',
            resourcesClean: true,
          }),
        },
        signal
      );
  await appendDriverEvent(
    backend,
    context,
    coordinates,
    run,
    { kind: 'run-completed' },
    signal
  );
};
