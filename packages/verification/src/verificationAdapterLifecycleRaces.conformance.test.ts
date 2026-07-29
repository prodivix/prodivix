import { describe, expect, it, vi } from 'vitest';
import { computeVerificationArtifactContentDigest } from './verificationArtifactDescriptor';
import { executeVerificationAdapterLifecycle } from './verificationAdapterLifecycle';
import { createHarness, sha } from './verificationAdapterLifecycle.testSupport';
import { createVerificationBehaviorAssertionReceipt } from './verificationBehaviorAssertionReceipt';
import { VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS } from './verificationCheckReportCodec';
import type {
  VerificationAdapterFactory,
  VerificationAdapterPrepareInput,
} from './verificationAdapterRuntime.types';

describe('Verification adapter lifecycle cancellation and retirement races', () => {
  it('uses live cancellation and an independent non-aborted cleanup signal', async () => {
    const harness = createHarness();
    let liveSignal:
      VerificationAdapterPrepareInput['context']['abortSignal'] | undefined;
    const lifecycleInput = {
      ...harness.lifecycleInput,
      factory: ((factoryContext) => {
        const adapter = createHarness().lifecycleInput.factory(factoryContext);
        return {
          ...adapter,
          prepare: async (input) => {
            liveSignal = input.context.abortSignal;
            return adapter.prepare(input);
          },
          execute: async () => {
            harness.calls.push('execute');
            const pending = new Promise<never>((_resolve, reject) => {
              liveSignal!.subscribe(() => reject(new Error('cancelled')));
            });
            queueMicrotask(() => harness.externalAbort.abort('user-cancelled'));
            return pending;
          },
          cleanup: async (input) => {
            harness.calls.push('cleanup');
            harness.cleanupInputs.push(input);
            return {
              status: 'clean',
              residualCanaryIds: [],
              diagnosticCodes: [],
            };
          },
        };
      }) as VerificationAdapterFactory,
    };
    const result = await executeVerificationAdapterLifecycle(lifecycleInput);
    expect(result).toMatchObject({
      status: 'cancelled',
      failureClass: 'cancelled',
    });
    expect(harness.cleanupInputs).toHaveLength(1);
    expect(harness.cleanupInputs[0]!.abortSignal.aborted).toBe(false);
  });

  it('times out the attempt budget but still runs bounded cleanup once', async () => {
    const harness = createHarness({ maximumDurationMs: 10 });
    let liveSignal:
      VerificationAdapterPrepareInput['context']['abortSignal'] | undefined;
    const originalFactory = harness.lifecycleInput.factory;
    const lifecycleInput = {
      ...harness.lifecycleInput,
      factory: ((context) => {
        const adapter = originalFactory(context);
        return {
          ...adapter,
          prepare: async (input) => {
            liveSignal = input.context.abortSignal;
            return adapter.prepare(input);
          },
          execute: async () =>
            new Promise<never>((_resolve, reject) => {
              liveSignal!.subscribe(() => reject(new Error('timed out')));
            }),
        };
      }) as VerificationAdapterFactory,
    };
    const result = await executeVerificationAdapterLifecycle(lifecycleInput);
    expect(result).toMatchObject({
      status: 'timed-out',
      failureClass: 'timeout',
    });
    expect(harness.cleanupInputs).toHaveLength(1);
    expect(harness.cleanupInputs[0]).toMatchObject({ cause: 'timed-out' });
    expect(harness.cleanupInputs[0]!.abortSignal.aborted).toBe(false);
  });

  it('fails security-closed when a timed-out adapter never becomes quiescent', async () => {
    vi.useFakeTimers();
    let markExecuteStarted!: () => void;
    const executeStarted = new Promise<void>((resolve) => {
      markExecuteStarted = resolve;
    });
    const harness = createHarness({
      checkKind: 'security',
      maximumDurationMs: 100,
      execute: async () => {
        markExecuteStarted();
        return new Promise<never>(() => undefined);
      },
    });
    try {
      const result = executeVerificationAdapterLifecycle(
        harness.lifecycleInput
      );
      await executeStarted;
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toMatchObject({
        status: 'failed',
        failureClass: 'security-denial',
        cleanup: {
          status: 'residual',
          residualCanaryIds: ['canary:attempt-quiescence'],
        },
      });
      expect(harness.retireAttempt).toHaveBeenCalledTimes(1);
      expect(harness.cleanupInputs).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['prepare', 'execute'] as const)(
    'waits for a late timed-out %s continuation before cleanup',
    async (phase) => {
      const harness = createHarness({ maximumDurationMs: 10 });
      const originalFactory = harness.lifecycleInput.factory;
      let lateContinuationSettled = false;
      const lifecycleInput = {
        ...harness.lifecycleInput,
        factory: ((context) => {
          const adapter = originalFactory(context);
          const waitUntilAborted = async <T>(
            value: T,
            signal: VerificationAdapterPrepareInput['context']['abortSignal']
          ): Promise<T> =>
            new Promise<T>((resolve) => {
              signal.subscribe(() => {
                queueMicrotask(() => {
                  lateContinuationSettled = true;
                  resolve(value);
                });
              });
            });
          let liveSignal:
            | VerificationAdapterPrepareInput['context']['abortSignal']
            | undefined;
          return {
            ...adapter,
            prepare: async (input) => {
              liveSignal = input.context.abortSignal;
              const prepared = await adapter.prepare(input);
              return phase === 'prepare'
                ? waitUntilAborted(prepared, liveSignal)
                : prepared;
            },
            execute: async (invocation, sink) => {
              const report = await adapter.execute(invocation, sink);
              return phase === 'execute'
                ? waitUntilAborted(report, liveSignal!)
                : report;
            },
            cleanup: async (input) => {
              expect(lateContinuationSettled).toBe(true);
              return adapter.cleanup(input);
            },
          };
        }) as VerificationAdapterFactory,
      };
      await expect(
        executeVerificationAdapterLifecycle(lifecycleInput)
      ).resolves.toMatchObject({
        status: 'timed-out',
        failureClass: 'timeout',
        cleanup: { status: 'clean' },
      });
      expect(harness.cleanupInputs).toHaveLength(1);
      expect(harness.retireAttempt).toHaveBeenCalledTimes(1);
    }
  );

  it('fails as cleanup residual and attempt-discards when a raw stage ignores abort', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let cancelAfterStageStarts = (): void => {
      throw new Error('Raw staging cancellation was not configured.');
    };
    let prepareInput: VerificationAdapterPrepareInput | undefined;
    const artifactBytes = new Uint8Array([8, 8]);
    const harness = createHarness({
      maximumDurationMs: 5_000,
      stage: async ({ artifact: { id, mediaType, bytes } }) => {
        cancelAfterStageStarts();
        await gate;
        return {
          status: 'staged',
          stagingArtifactId: `opaque:${id}`,
          digest: computeVerificationArtifactContentDigest(bytes),
          size: bytes.byteLength,
          mediaType,
        };
      },
      execute: async (invocation) => {
        void prepareInput!.context.artifactStaging.stage(
          {
            id: 'artifact:late',
            kind: 'trace',
            mediaType: 'application/json',
            bytes: artifactBytes,
          },
          prepareInput!.context.abortSignal
        );
        return {
          format: 'prodivix.verification-check-report-candidate',
          version: 1,
          cellId: invocation.cellId,
          attemptId: invocation.attemptId,
          checkKind: 'security',
          inputDigest: invocation.inputDigest,
          adapter: harness.registration.identity,
          tool: harness.registration.tool!,
          terminal: { status: 'completed', complete: true, exitCode: 0 },
          payload: {
            kind: 'security',
            observedRuleIds: VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
            findings: [],
            behaviorAssertionReceipt:
              createVerificationBehaviorAssertionReceipt({
                attemptId: invocation.attemptId,
                cellId: invocation.cellId,
                scenarioId: harness.lifecycleInput.cell.scenarioId!,
                executableSnapshotDigest:
                  harness.lifecycleInput.context.executableSnapshotDigest,
                scenarioProgramDigest:
                  harness.lifecycleInput.context.scenarioProgramDigest!,
                controlProfileDigest:
                  harness.lifecycleInput.context.controlProfileDigest,
                fixtureSetDigests:
                  harness.lifecycleInput.context.fixtureSetDigests,
                targetLeaseBindingDigest: sha(
                  'lifecycle-security-target-lease'
                ),
                runtimeFixtureBindingDigest: sha(
                  'lifecycle-security-runtime-fixture'
                ),
                blackBoxAssertionSetDigest: sha(
                  'lifecycle-security-black-box-assertions'
                ),
              }),
          },
          artifacts: [],
          diagnosticCodes: [],
        };
      },
    });
    cancelAfterStageStarts = () =>
      harness.externalAbort.abort('raw-stage-did-not-quiesce');
    const originalFactory = harness.lifecycleInput.factory;
    const lifecycleInput = {
      ...harness.lifecycleInput,
      factory: ((context) => {
        const adapter = originalFactory(context);
        return {
          ...adapter,
          prepare: async (input) => {
            prepareInput = input;
            return adapter.prepare(input);
          },
        };
      }) as VerificationAdapterFactory,
    };
    const result = await executeVerificationAdapterLifecycle(lifecycleInput);
    expect(result).toMatchObject({
      status: 'failed',
      failureClass: 'security-denial',
      cleanup: { status: 'residual' },
    });
    expect(harness.retireAttempt).toHaveBeenCalledTimes(1);
    release();
    await gate;
    await Promise.resolve();
  }, 15_000);
});
