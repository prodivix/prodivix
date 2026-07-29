import { describe, expect, it, vi } from 'vitest';
import { computeVerificationArtifactContentDigest } from './verificationArtifactDescriptor';
import { createVerificationArtifactStagingController } from './verificationAdapterArtifactStaging';
import { createVerificationEventSinkController } from './verificationAdapterEventSink';
import { createVerificationInputResolverController } from './verificationAdapterInputResolver';
import { createVerificationAbortController } from './verificationAdapterLifecycle';
import { digestVerificationValue } from './verificationCanonical';
import type {
  PreparedVerificationInvocation,
  VerificationAdapterArtifactRetirementPort,
  VerificationAdapterArtifactStagingTransportPort,
  VerificationAdapterInputRef,
} from './verificationAdapterRuntime.types';

const sha = (value: string): string => digestVerificationValue(value);

const invocation: PreparedVerificationInvocation = Object.freeze({
  invocationId: 'invocation:ports',
  planDigest: sha('plan'),
  cellId: 'cell:ports',
  adapterId: 'adapter:ports',
  attemptId: 'attempt:ports',
  generation: 1,
  providerKind: 'local',
  inputDigest: sha('cell-input'),
  resolvedInputSetDigest: sha('resolved-input'),
  controlCapabilitySnapshotDigest: sha('controls'),
  appliedControlDigest: sha('applied'),
  confirmedCursor: 7,
  state: 'running',
});

describe('Verification Core event sink', () => {
  it('deduplicates exact events and rejects drift, budget overflow, and terminal writes', () => {
    const controller = createVerificationEventSinkController(invocation, 1);
    const event = Object.freeze({
      kind: 'progress' as const,
      eventId: 'event:progress',
      messageKey: 'verification.progress',
      completed: 0,
      total: 1,
    });
    expect(controller.sink.emit(event)).toEqual({
      status: 'accepted',
      sequence: 8,
    });
    expect(controller.sink.emit(event)).toEqual({
      status: 'accepted',
      sequence: 8,
    });
    expect(controller.sink.emit({ ...event, completed: 1 })).toMatchObject({
      status: 'rejected',
      reason: 'duplicate-drift',
    });
    expect(
      controller.sink.emit({
        kind: 'diagnostic',
        eventId: 'event:other',
        code: 'VER-4001',
      })
    ).toMatchObject({
      status: 'rejected',
      reason: 'budget-exceeded',
    });
    controller.close();
    expect(controller.sink.emit(event)).toMatchObject({
      status: 'rejected',
      reason: 'terminal',
    });
    expect(controller.snapshot()).toHaveLength(1);
    expect(controller.violation()).toBe('duplicate-drift');
  });
});

describe('Verification Core abort signal', () => {
  it('isolates throwing listeners and still settles every subscriber', () => {
    const controller = createVerificationAbortController();
    const settled = vi.fn();
    controller.signal.subscribe(() => {
      throw new Error('listener failed');
    });
    controller.signal.subscribe(settled);

    expect(() => controller.abort('test-abort')).not.toThrow();
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBe('test-abort');
    expect(settled).toHaveBeenCalledOnce();
    expect(() =>
      controller.signal.subscribe(() => {
        throw new Error('late listener failed');
      })
    ).not.toThrow();
  });
});

describe('Verification Core artifact staging bridge', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const digest = computeVerificationArtifactContentDigest(bytes);
  const retirementPort = (): VerificationAdapterArtifactRetirementPort => ({
    retireAttempt: async (coordinates) => ({
      status: 'retired',
      ...coordinates,
    }),
  });

  it('serializes concurrent duplicate stages and returns immutable logical mapping', async () => {
    const stage = vi.fn<
      VerificationAdapterArtifactStagingTransportPort['stage']
    >(async ({ artifact: { id, mediaType, bytes: value } }) => ({
      status: 'staged',
      stagingArtifactId: `staging:${id}`,
      digest: computeVerificationArtifactContentDigest(value),
      size: value.byteLength,
      mediaType,
    }));
    const controller = createVerificationArtifactStagingController({
      planDigest: sha('plan'),
      cellId: 'cell:staging',
      attemptId: 'attempt:staging',
      generation: 1,
      maximumArtifactBytes: 6,
      artifactKinds: ['trace'],
      signal: createVerificationAbortController().signal,
      port: { stage },
      retirementPort: retirementPort(),
    });
    const candidate = {
      id: 'artifact:trace',
      kind: 'trace' as const,
      mediaType: 'application/json',
      bytes,
    };
    const [first, second] = await Promise.all([
      controller.port.stage(
        candidate,
        createVerificationAbortController().signal
      ),
      controller.port.stage(
        candidate,
        createVerificationAbortController().signal
      ),
    ]);
    expect(first).toEqual(second);
    expect(stage).toHaveBeenCalledTimes(1);
    expect(controller.snapshot()).toEqual([
      {
        id: 'artifact:trace',
        stagingArtifactId: 'staging:artifact:trace',
        kind: 'trace',
        digest,
        size: 3,
        mediaType: 'application/json',
      },
    ]);
    await expect(
      controller.port.stage(
        { ...candidate, bytes: new Uint8Array([1, 2, 4]) },
        createVerificationAbortController().signal
      )
    ).resolves.toMatchObject({
      status: 'rejected',
      reasonCode: 'verification-staging-duplicate-drift',
    });
    expect(controller.violation()).toBe('duplicate-drift');
  });

  it('serializes aggregate budget decisions and drains unawaited in-flight staging', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stage = vi.fn<
      VerificationAdapterArtifactStagingTransportPort['stage']
    >(async ({ artifact: { id, mediaType, bytes: value } }) => {
      await gate;
      return {
        status: 'staged',
        stagingArtifactId: `staging:${id}`,
        digest: computeVerificationArtifactContentDigest(value),
        size: value.byteLength,
        mediaType,
      };
    });
    const controller = createVerificationArtifactStagingController({
      planDigest: sha('plan'),
      cellId: 'cell:staging',
      attemptId: 'attempt:staging',
      generation: 1,
      maximumArtifactBytes: 3,
      artifactKinds: ['trace'],
      signal: createVerificationAbortController().signal,
      port: { stage },
      retirementPort: retirementPort(),
    });
    const first = controller.port.stage(
      {
        id: 'artifact:first',
        kind: 'trace',
        mediaType: 'application/json',
        bytes,
      },
      createVerificationAbortController().signal
    );
    const second = controller.port.stage(
      {
        id: 'artifact:second',
        kind: 'trace',
        mediaType: 'application/json',
        bytes,
      },
      createVerificationAbortController().signal
    );
    let drained = false;
    const drain = controller.closeAndDrain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    release();
    await drain;
    expect(await first).toMatchObject({ status: 'staged' });
    expect(await second).toMatchObject({
      status: 'rejected',
      reasonCode: 'verification-staging-budget-exceeded',
    });
    expect(stage).toHaveBeenCalledTimes(1);
  });

  it('fails closed on staging receipt drift and attempt retirement drift', async () => {
    const controller = createVerificationArtifactStagingController({
      planDigest: sha('plan'),
      cellId: 'cell:staging',
      attemptId: 'attempt:staging',
      generation: 1,
      maximumArtifactBytes: 3,
      artifactKinds: ['trace'],
      signal: createVerificationAbortController().signal,
      port: {
        stage: async ({ artifact: { id, mediaType, bytes: value } }) => ({
          status: 'staged',
          stagingArtifactId: `staging:${id}`,
          digest: sha('wrong'),
          size: value.byteLength,
          mediaType,
        }),
      },
      retirementPort: {
        retireAttempt: async ({ planDigest, cellId, attemptId }) => ({
          status: 'retired',
          planDigest,
          cellId,
          attemptId,
          generation: 999,
        }),
      },
    });
    expect(
      await controller.port.stage(
        {
          id: 'artifact:trace',
          kind: 'trace',
          mediaType: 'application/json',
          bytes,
        },
        createVerificationAbortController().signal
      )
    ).toMatchObject({ status: 'rejected' });
    expect(controller.violation()).toBe('malformed-result');
    expect(
      await controller.retire(createVerificationAbortController().signal)
    ).toMatchObject({ status: 'failed' });
  });

  it('atomically retires the whole attempt before a late raw stage can persist', async () => {
    let releaseStage!: () => void;
    let markStageStarted!: () => void;
    const stageGate = new Promise<void>((resolve) => {
      releaseStage = resolve;
    });
    const stageStarted = new Promise<void>((resolve) => {
      markStageStarted = resolve;
    });
    const retiredAttempts = new Set<string>();
    const storedObjects = new Set<string>();
    const attemptKey = (coordinates: {
      planDigest: string;
      cellId: string;
      attemptId: string;
      generation: number;
    }): string =>
      [
        coordinates.planDigest,
        coordinates.cellId,
        coordinates.attemptId,
        coordinates.generation,
      ].join('\0');
    const coreSignal = createVerificationAbortController().signal;
    const controller = createVerificationArtifactStagingController({
      planDigest: sha('plan'),
      cellId: 'cell:staging',
      attemptId: 'attempt:staging',
      generation: 1,
      maximumArtifactBytes: 3,
      artifactKinds: ['trace'],
      signal: coreSignal,
      port: {
        stage: async (request) => {
          const key = attemptKey(request);
          markStageStarted();
          await stageGate;
          if (retiredAttempts.has(key)) {
            return {
              status: 'rejected',
              reasonCode: 'attempt-retired',
              message: 'Attempt generation is retired.',
            };
          }
          storedObjects.add(`${key}\0${request.artifact.id}`);
          return {
            status: 'staged',
            stagingArtifactId: `staging:${request.artifact.id}`,
            digest: computeVerificationArtifactContentDigest(
              request.artifact.bytes
            ),
            size: request.artifact.bytes.byteLength,
            mediaType: request.artifact.mediaType,
          };
        },
      },
      retirementPort: {
        retireAttempt: async (coordinates) => {
          const key = attemptKey(coordinates);
          retiredAttempts.add(key);
          for (const objectKey of [...storedObjects]) {
            if (objectKey.startsWith(`${key}\0`))
              storedObjects.delete(objectKey);
          }
          return { status: 'retired', ...coordinates };
        },
      },
    });
    const pendingStage = controller.port.stage(
      {
        id: 'artifact:late',
        kind: 'trace',
        mediaType: 'application/json',
        bytes,
      },
      createVerificationAbortController().signal
    );
    await stageStarted;
    await expect(
      controller.retire(createVerificationAbortController().signal)
    ).resolves.toMatchObject({ status: 'retired', generation: 1 });
    releaseStage();
    await expect(pendingStage).resolves.toMatchObject({
      status: 'rejected',
      reasonCode: 'verification-staging-attempt-retired',
    });
    expect(storedObjects.size).toBe(0);
    expect(controller.violation()).toBeUndefined();
  });
});

describe('Verification Core input resolver', () => {
  const bytes = new Uint8Array([5, 6, 7]);
  const ref: VerificationAdapterInputRef = Object.freeze({
    id: 'input:snapshot',
    kind: 'executable-snapshot',
    digest: computeVerificationArtifactContentDigest(bytes),
    size: bytes.byteLength,
    mediaType: 'application/octet-stream',
  });

  it('content-addresses, clones, and coalesces concurrent exact reads', async () => {
    const providerBytes = new Uint8Array(bytes);
    const read = vi.fn(async () => providerBytes);
    const signal = createVerificationAbortController().signal;
    const controller = createVerificationInputResolverController({
      refs: [ref],
      maximumBytes: bytes.byteLength,
      resolver: { read },
      signal,
    });
    const [first, second] = await Promise.all([
      controller.resolver.read(ref, signal),
      controller.resolver.read(ref, signal),
    ]);
    providerBytes[1] = 99;
    first[0] = 99;
    expect(second).toEqual(bytes);
    expect(await controller.resolver.read(ref, signal)).toEqual(bytes);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('rejects forged refs and wrong content even when an adapter catches the error', async () => {
    const forgedController = createVerificationInputResolverController({
      refs: [ref],
      maximumBytes: bytes.byteLength,
      resolver: { read: async () => new Uint8Array(bytes) },
      signal: createVerificationAbortController().signal,
    });
    await expect(
      forgedController.resolver.read(
        { ...ref, digest: sha('forged') },
        createVerificationAbortController().signal
      )
    ).rejects.toThrow(/undeclared or drifted/u);
    expect(forgedController.violation()).toBe('forged-reference');

    const driftController = createVerificationInputResolverController({
      refs: [ref],
      maximumBytes: bytes.byteLength,
      resolver: { read: async () => new Uint8Array([0, 0, 0]) },
      signal: createVerificationAbortController().signal,
    });
    await expect(
      driftController.resolver.read(
        ref,
        createVerificationAbortController().signal
      )
    ).rejects.toThrow(/content address/u);
    expect(driftController.violation()).toBe('content-drift');
  });

  it('does not misclassify expected live cancellation as transport failure', async () => {
    const abort = createVerificationAbortController();
    const controller = createVerificationInputResolverController({
      refs: [ref],
      maximumBytes: bytes.byteLength,
      resolver: {
        read: async (_input, signal) =>
          new Promise<Uint8Array>((_resolve, reject) => {
            signal.subscribe(() => reject(new Error('cancelled')));
          }),
      },
      signal: abort.signal,
    });
    const pending = controller.resolver.read(ref, abort.signal);
    abort.abort('user-cancelled');
    await expect(pending).rejects.toThrow(/cancelled/u);
    expect(controller.violation()).toBeUndefined();
  });

  it('always delegates the Core-bound signal instead of an adapter-supplied fake', async () => {
    const coreAbort = createVerificationAbortController();
    const fakeAbort = createVerificationAbortController();
    fakeAbort.abort('adapter-fake-abort');
    const rawRead = vi.fn(async (_ref, signal) => {
      expect(signal).toBe(coreAbort.signal);
      return new Uint8Array(bytes);
    });
    const resolver = createVerificationInputResolverController({
      refs: [ref],
      maximumBytes: bytes.byteLength,
      resolver: { read: rawRead },
      signal: coreAbort.signal,
    });
    await expect(
      resolver.resolver.read(ref, fakeAbort.signal)
    ).resolves.toEqual(bytes);
    expect(rawRead).toHaveBeenCalledOnce();

    const rawStage = vi.fn<
      VerificationAdapterArtifactStagingTransportPort['stage']
    >(async ({ artifact }, signal) => {
      expect(signal).toBe(coreAbort.signal);
      return {
        status: 'staged',
        stagingArtifactId: 'staging:core-signal',
        digest: computeVerificationArtifactContentDigest(artifact.bytes),
        size: artifact.bytes.byteLength,
        mediaType: artifact.mediaType,
      };
    });
    const staging = createVerificationArtifactStagingController({
      planDigest: sha('plan'),
      cellId: 'cell:signal',
      attemptId: 'attempt:signal',
      generation: 1,
      maximumArtifactBytes: bytes.byteLength,
      artifactKinds: ['trace'],
      signal: coreAbort.signal,
      port: { stage: rawStage },
      retirementPort: {
        retireAttempt: async (coordinates) => ({
          status: 'retired',
          ...coordinates,
        }),
      },
    });
    await expect(
      staging.port.stage(
        {
          id: 'artifact:signal',
          kind: 'trace',
          mediaType: 'application/json',
          bytes,
        },
        fakeAbort.signal
      )
    ).resolves.toMatchObject({ status: 'staged' });
    expect(rawStage).toHaveBeenCalledOnce();
  });
});
