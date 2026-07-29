import { describe, expect, it, vi } from 'vitest';
import { computeVerificationArtifactContentDigest } from './verificationArtifactDescriptor';
import {
  VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
  VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
} from './verificationCheckReportCodec';
import { createVerificationBehaviorAssertionReceipt } from './verificationBehaviorAssertionReceipt';
import { executeVerificationAdapterLifecycle } from './verificationAdapterLifecycle';
import { createHarness, sha } from './verificationAdapterLifecycle.testSupport';
import type {
  VerificationAdapter,
  VerificationAdapterFactory,
  VerificationAdapterPrepareInput,
} from './verificationAdapterRuntime.types';

describe('Verification adapter lifecycle executor', () => {
  it('runs the exact factory/preflight/prepare/execute/cleanup order', async () => {
    const harness = createHarness();
    const result = await executeVerificationAdapterLifecycle(
      harness.lifecycleInput
    );
    expect(result).toMatchObject({
      status: 'reported',
      cleanup: { status: 'clean' },
    });
    expect(harness.calls).toEqual([
      'factory',
      'preflight',
      'prepare',
      'execute',
      'cleanup',
    ]);
    expect(harness.cleanupInputs).toHaveLength(1);
    expect(harness.cleanupInputs[0]).toMatchObject({ cause: 'success' });
    expect(harness.cleanupInputs[0]!.abortSignal.aborted).toBe(false);
    expect(harness.retireAttempt).not.toHaveBeenCalled();
    expect(harness.rawRead).toHaveBeenCalledTimes(1);
  });

  it('adds the two Core-owned security observations only after clean cleanup', async () => {
    const harness = createHarness({ checkKind: 'security' });
    const result = await executeVerificationAdapterLifecycle(
      harness.lifecycleInput
    );
    expect(result).toMatchObject({
      status: 'reported',
      report: {
        checkKind: 'security',
        payload: {
          observedRuleIds: VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
        },
      },
      cleanup: { status: 'clean' },
    });
    expect(harness.calls).toEqual([
      'factory',
      'preflight',
      'prepare',
      'execute',
      'cleanup',
    ]);
    expect(harness.retireAttempt).not.toHaveBeenCalled();
  });

  it.each([
    ['attempt', { attemptId: 'attempt:forged' }],
    ['cell', { cellId: 'cell:forged' }],
    ['Scenario', { scenarioId: 'scenario:forged' }],
    ['Snapshot', { executableSnapshotDigest: sha('forged-snapshot') }],
    ['Scenario Program', { scenarioProgramDigest: sha('forged-program') }],
    ['Control Profile', { controlProfileDigest: sha('forged-control') }],
    ['Fixture Set', { fixtureSetDigests: [sha('forged-fixture')] }],
  ])(
    'rejects and retires a canonically re-signed Behavior receipt with %s coordinate drift',
    async (_label, receiptDrift) => {
      const harness = createHarness({ checkKind: 'security' });
      const originalFactory = harness.lifecycleInput.factory;
      const result = await executeVerificationAdapterLifecycle({
        ...harness.lifecycleInput,
        factory: (context) => {
          const adapter = originalFactory(context);
          return {
            ...adapter,
            execute: async (invocation, sink) => {
              const report = await adapter.execute(invocation, sink);
              if (report.payload.kind !== 'security') {
                throw new Error('Expected the security lifecycle harness.');
              }
              return {
                ...report,
                payload: {
                  ...report.payload,
                  behaviorAssertionReceipt:
                    createVerificationBehaviorAssertionReceipt({
                      ...report.payload.behaviorAssertionReceipt,
                      ...receiptDrift,
                    }),
                },
              };
            },
          };
        },
      });
      expect(result).toMatchObject({
        status: 'failed',
        failureClass: 'contract-mismatch',
        reasonCode: 'VER-4001',
      });
      expect(harness.cleanupInputs).toHaveLength(1);
      expect(harness.retireAttempt).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ['missing', VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS.slice(1)],
    [
      'extra',
      [
        ...VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
        'security.cleanup-residual',
      ],
    ],
    [
      'fake',
      [
        ...VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS.slice(0, -1),
        'security.fake-rule',
      ],
    ],
  ] as const)(
    'rejects and retires a security adapter with %s observations',
    async (_label, observedRuleIds) => {
      const harness = createHarness({ checkKind: 'security' });
      const originalFactory = harness.lifecycleInput.factory;
      const result = await executeVerificationAdapterLifecycle({
        ...harness.lifecycleInput,
        factory: (context) => {
          const adapter = originalFactory(context);
          return {
            ...adapter,
            execute: async (invocation, sink) => {
              const report = await adapter.execute(invocation, sink);
              if (report.payload.kind !== 'security') {
                throw new Error('Expected the security lifecycle harness.');
              }
              return {
                ...report,
                payload: {
                  kind: 'security',
                  observedRuleIds,
                  findings: [],
                  behaviorAssertionReceipt:
                    report.payload.behaviorAssertionReceipt,
                },
              };
            },
          };
        },
      });
      expect(result).toMatchObject({
        status: 'failed',
        failureClass: 'contract-mismatch',
        reasonCode: 'VER-4001',
      });
      expect(harness.cleanupInputs).toHaveLength(1);
      expect(harness.retireAttempt).toHaveBeenCalledTimes(1);
    }
  );

  it('never publishes a final security report after residual cleanup', async () => {
    const harness = createHarness({
      checkKind: 'security',
      cleanup: {
        status: 'residual',
        residualCanaryIds: ['canary:security-cleanup'],
        diagnosticCodes: [],
      },
    });
    const result = await executeVerificationAdapterLifecycle(
      harness.lifecycleInput
    );
    expect(result).toMatchObject({
      status: 'failed',
      failureClass: 'security-denial',
      reasonCode: 'security.cleanup-residual',
    });
    expect(result).not.toHaveProperty('report');
    expect(harness.retireAttempt).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unsupported', 'unsupported-capability'],
    ['blocked', 'fixture-control'],
  ] as const)(
    'returns explicit %s preflight and still cleans exactly once',
    async (status, failureClass) => {
      const harness = createHarness({
        preflight: {
          status,
          reasonCode: `preflight:${status}`,
          message: `Adapter is ${status}.`,
        },
      });
      await expect(
        executeVerificationAdapterLifecycle(harness.lifecycleInput)
      ).resolves.toMatchObject({ status, failureClass });
      expect(harness.calls).toEqual(['factory', 'preflight', 'cleanup']);
      expect(harness.cleanupInputs).toHaveLength(1);
      expect(harness.cleanupInputs[0]).toMatchObject({
        cause: 'preflight-failed',
      });
      expect(harness.retireAttempt).toHaveBeenCalledTimes(1);
    }
  );

  it('cleans exactly once after prepare and execute throws', async () => {
    const prepare = createHarness({
      prepareError: new Error('prepare failed'),
    });
    await expect(
      executeVerificationAdapterLifecycle(prepare.lifecycleInput)
    ).resolves.toMatchObject({ status: 'failed' });
    expect(prepare.cleanupInputs).toHaveLength(1);
    expect(prepare.cleanupInputs[0]).toMatchObject({ cause: 'prepare-failed' });

    const execute = createHarness({
      execute: async () => {
        execute.calls.push('execute');
        throw new Error('execute failed');
      },
    });
    await expect(
      executeVerificationAdapterLifecycle(execute.lifecycleInput)
    ).resolves.toMatchObject({ status: 'failed' });
    expect(execute.cleanupInputs).toHaveLength(1);
    expect(execute.cleanupInputs[0]).toMatchObject({ cause: 'execute-failed' });
  });

  it('returns Core staged refs and never lets the adapter report opaque staging ids', async () => {
    let prepareInput: VerificationAdapterPrepareInput | undefined;
    const harness = createHarness({
      execute: async (invocation, sink) => {
        const bytes = new Uint8Array([9, 9]);
        const staged = await prepareInput!.context.artifactStaging.stage(
          {
            id: 'artifact:trace',
            kind: 'trace',
            mediaType: 'application/json',
            bytes,
          },
          prepareInput!.context.abortSignal
        );
        expect(staged).toMatchObject({
          status: 'staged',
          stagingArtifactId: 'opaque:artifact:trace',
        });
        sink.emit({
          kind: 'artifact',
          eventId: 'event:trace',
          artifactId: 'artifact:trace',
          digest: computeVerificationArtifactContentDigest(bytes),
        });
        return {
          format: 'prodivix.verification-check-report-candidate',
          version: 1,
          cellId: invocation.cellId,
          attemptId: invocation.attemptId,
          checkKind: 'diagnostics',
          inputDigest: invocation.inputDigest,
          adapter: harness.registration.identity,
          tool: harness.registration.tool!,
          terminal: { status: 'completed', complete: true, exitCode: 0 },
          payload: { kind: 'diagnostics', findings: [] },
          artifacts: [
            {
              id: 'artifact:trace',
              kind: 'trace',
              digest: computeVerificationArtifactContentDigest(bytes),
              size: bytes.byteLength,
              mediaType: 'application/json',
            },
          ],
          diagnosticCodes: [],
        };
      },
    });
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
      status: 'reported',
      stagedArtifacts: [
        {
          id: 'artifact:trace',
          stagingArtifactId: 'opaque:artifact:trace',
        },
      ],
    });
  });

  it.each([
    [
      {
        status: 'residual',
        residualCanaryIds: ['canary:leak'],
        diagnosticCodes: [],
      } as const,
      'security-denial',
    ],
    [
      {
        status: 'failed',
        residualCanaryIds: [],
        diagnosticCodes: ['VER-4002'],
      } as const,
      'adapter-infrastructure',
    ],
  ])(
    'fails closed and discards staging when cleanup is $0',
    async (cleanup, failureClass) => {
      const harness = createHarness({ cleanup });
      await expect(
        executeVerificationAdapterLifecycle(harness.lifecycleInput)
      ).resolves.toMatchObject({ status: 'failed', failureClass });
      expect(harness.cleanupInputs).toHaveLength(1);
      expect(harness.retireAttempt).toHaveBeenCalledTimes(1);
    }
  );

  it('rechecks terminal event violations after cleanup before accepting a report', async () => {
    const harness = createHarness();
    const originalFactory = harness.lifecycleInput.factory;
    let emitAfterTerminal = (): void => undefined;
    const result = await executeVerificationAdapterLifecycle({
      ...harness.lifecycleInput,
      factory: (context) => {
        const adapter = originalFactory(context);
        return {
          ...adapter,
          execute: async (invocation, sink) => {
            const report = await adapter.execute(invocation, sink);
            emitAfterTerminal = () => {
              sink.emit({
                kind: 'diagnostic',
                eventId: 'event:late',
                code: 'VER-4001',
              });
            };
            return report;
          },
          cleanup: async (input) => {
            emitAfterTerminal();
            return adapter.cleanup(input);
          },
        };
      },
    });
    expect(result).toMatchObject({
      status: 'failed',
      failureClass: 'contract-mismatch',
      reasonCode: 'VER-4001',
    });
    expect(harness.retireAttempt).toHaveBeenCalledTimes(1);
    expect(harness.cleanupInputs).toHaveLength(1);
  });

  it('permanently fences a detached event after the terminal acknowledgement', async () => {
    const harness = createHarness();
    const originalFactory = harness.lifecycleInput.factory;
    let detachedReceipt:
      | ReturnType<Parameters<VerificationAdapter['execute']>[1]['emit']>
      | undefined;
    vi.useFakeTimers();
    try {
      const result = await executeVerificationAdapterLifecycle({
        ...harness.lifecycleInput,
        factory: (context) => {
          const adapter = originalFactory(context);
          return {
            ...adapter,
            execute: async (invocation, sink) => {
              const report = await adapter.execute(invocation, sink);
              setTimeout(() => {
                detachedReceipt = sink.emit({
                  kind: 'diagnostic',
                  eventId: 'event:detached',
                  code: 'VER-4001',
                });
              }, 0);
              return report;
            },
          };
        },
      });
      expect(result).toMatchObject({ status: 'reported' });
      expect(detachedReceipt).toBeUndefined();
      vi.runOnlyPendingTimers();
      expect(detachedReceipt).toEqual({
        status: 'rejected',
        reason: 'terminal',
      });
      expect(result.events).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [
      'throwing subscribe',
      {
        aborted: false,
        subscribe: () => {
          throw new Error('subscribe failed');
        },
      },
    ],
    [
      'non-function unsubscribe',
      {
        aborted: false,
        subscribe: (() => 42) as unknown as (
          listener: (reason?: string) => void
        ) => () => void,
      },
    ],
    [
      'throwing unsubscribe',
      {
        aborted: false,
        subscribe: () => () => {
          throw new Error('unsubscribe failed');
        },
      },
    ],
  ])(
    'fails closed, cleans, and retires for a %s abort port',
    async (_name, abortSignal) => {
      const harness = createHarness();
      const result = await executeVerificationAdapterLifecycle({
        ...harness.lifecycleInput,
        context: {
          ...harness.lifecycleInput.context,
          abortSignal,
        },
      });
      expect(result).toMatchObject({
        status: 'failed',
        failureClass: 'contract-mismatch',
        reasonCode: 'VER-4001',
      });
      expect(harness.cleanupInputs).toHaveLength(1);
      expect(harness.retireAttempt).toHaveBeenCalledTimes(1);
    }
  );

  it('does not start prepare after the absolute attempt deadline is exhausted', async () => {
    const harness = createHarness({ maximumDurationMs: 10 });
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(11);
    try {
      await expect(
        executeVerificationAdapterLifecycle(harness.lifecycleInput)
      ).resolves.toMatchObject({
        status: 'timed-out',
        failureClass: 'timeout',
      });
    } finally {
      now.mockRestore();
    }
    expect(harness.calls).toEqual(['factory', 'preflight', 'cleanup']);
    expect(harness.retireAttempt).toHaveBeenCalledTimes(1);
  });

  it.each(['local', 'export', 'ci'] as const)(
    'single-flights duplicate exact %s attempts in Core',
    async (providerKind) => {
      let releaseExecute!: () => void;
      const executeGate = new Promise<void>((resolve) => {
        releaseExecute = resolve;
      });
      const harness = createHarness();
      const originalFactory = harness.lifecycleInput.factory;
      const lifecycleInput = {
        ...harness.lifecycleInput,
        providerKind,
        factory: ((context) => {
          const adapter = originalFactory(context);
          return {
            ...adapter,
            execute: async (invocation, sink) => {
              await executeGate;
              return adapter.execute(invocation, sink);
            },
          };
        }) as VerificationAdapterFactory,
      };
      const first = executeVerificationAdapterLifecycle(lifecycleInput);
      const second = executeVerificationAdapterLifecycle(lifecycleInput);
      await Promise.resolve();
      expect(harness.calls.filter((call) => call === 'factory')).toHaveLength(
        1
      );
      releaseExecute();
      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult).toEqual(secondResult);
      expect(firstResult).toMatchObject({ status: 'reported' });
      expect(harness.cleanupInputs).toHaveLength(1);
    }
  );

  it('rejects registry/context drift before creating an adapter', async () => {
    const harness = createHarness();
    await expect(
      executeVerificationAdapterLifecycle({
        ...harness.lifecycleInput,
        context: {
          ...harness.lifecycleInput.context,
          registrySnapshotDigest: sha('forged-registry'),
        },
      })
    ).rejects.toThrow(/registry snapshot drifted/u);
    expect(harness.calls).toEqual([]);
  });
});
