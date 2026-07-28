import {
  compareBehaviorReplayRecords,
  createBehaviorDeterministicControlPlan,
  createBehaviorRuntimeCapabilityRegistry,
  executeBehaviorReplayAttempt,
  type BehaviorReplayAttemptResult,
  type BehaviorReplayDivergence,
  type BehaviorReplayRecord,
  type BehaviorRuntimeCapabilityRegistry,
} from '@prodivix/behavior';
import {
  EMPTY_BROWSER_RUNTIME_RESIDUAL,
  createBrowserDeterministicReplayProvider,
} from '@prodivix/runtime-browser';
import {
  createCiDeterministicRuntimeProvider,
  createExportDeterministicRuntimeProvider,
  digestDeterministicRuntimeValue,
  type DeterministicRuntimePlanCell,
  type DeterministicRuntimeProvider,
} from '@prodivix/runtime-core';
import { createRemoteDeterministicReplayProvider } from '@prodivix/runtime-remote';
import {
  GOLDEN_G3_REPLAY_CONTROL_PROFILE,
  runGoldenG3BehaviorCompositionSurface,
  type GoldenG3BehaviorCompositionMotionMode,
  type GoldenG3BehaviorCompositionSurface,
} from './goldenG3BehaviorCompositionFixture';

export type GoldenG3ReplaySurface = 'browser' | 'remote' | 'export' | 'ci';
export type GoldenG3ReplayTarget = 'react-vite' | 'vue-vite';
export type GoldenG3ReplayDrift = 'random' | 'schedule' | 'network';

export type GoldenG3ReplayCellResult = Readonly<{
  surface: GoldenG3ReplaySurface;
  target: GoldenG3ReplayTarget;
  motion: GoldenG3BehaviorCompositionMotionMode;
  records: readonly BehaviorReplayRecord[];
}>;

export type GoldenG3ReplayMatrixResult = Readonly<{
  cells: readonly GoldenG3ReplayCellResult[];
  semanticDigestByMotion: Readonly<
    Record<GoldenG3BehaviorCompositionMotionMode, string>
  >;
}>;

const TOOLCHAIN_DIGEST = digestDeterministicRuntimeValue({
  runtime: 'g3-v3',
  behavior: 'current',
  targetCompiler: 'controlled-react-vue',
});

const implementationDigest = (surface: GoldenG3ReplaySurface): string =>
  digestDeterministicRuntimeValue({
    provider: `golden-${surface}`,
    implementation: 1,
  });

const createCell = (
  surface: GoldenG3ReplaySurface,
  target: GoldenG3ReplayTarget,
  motion: GoldenG3BehaviorCompositionMotionMode
): DeterministicRuntimePlanCell =>
  Object.freeze({
    id: `${target}:${surface}:${motion}`,
    frameworkTarget: target,
    surface,
    browserEngine: surface === 'ci' ? 'chromium' : 'chromium',
    viewport: Object.freeze({ width: 1280, height: 720 }),
    colorScheme: 'light',
    motion,
    locale: 'en-US',
  });

const createProvider = (
  surface: GoldenG3ReplaySurface
): DeterministicRuntimeProvider => {
  const digest = implementationDigest(surface);
  if (surface === 'browser') {
    return createBrowserDeterministicReplayProvider({
      implementationDigest: digest,
      host: Object.freeze({
        reset: () => undefined,
        apply: ({ expectedControlDigest }) =>
          Object.freeze({
            appliedControlDigest: expectedControlDigest,
            fontReady: true,
          }),
        probe: () => EMPTY_BROWSER_RUNTIME_RESIDUAL,
        cleanup: () => undefined,
      }),
    });
  }
  if (surface === 'remote') {
    return createRemoteDeterministicReplayProvider({
      implementationDigest: digest,
      transport: Object.freeze({
        reset: () => undefined,
        apply: ({ expectedControlDigest }) =>
          Object.freeze({
            appliedControlDigest: expectedControlDigest,
            fontReady: true,
          }),
        probe: () => EMPTY_BROWSER_RUNTIME_RESIDUAL,
        cleanup: () => undefined,
      }),
    });
  }
  if (surface === 'export') {
    return createExportDeterministicRuntimeProvider({
      implementationDigest: digest,
    });
  }
  return createCiDeterministicRuntimeProvider({
    implementationDigest: digest,
  });
};

const domainSurface = (
  surface: GoldenG3ReplaySurface
): GoldenG3BehaviorCompositionSurface =>
  surface === 'export' ? 'export' : surface === 'ci' ? 'ci' : 'preview';

const withInjectedDrift = (
  registry: BehaviorRuntimeCapabilityRegistry,
  drift: GoldenG3ReplayDrift | undefined,
  attemptIndex: number
): BehaviorRuntimeCapabilityRegistry => {
  if (!drift || attemptIndex === 0) return registry;
  const result = createBehaviorRuntimeCapabilityRegistry(
    registry.adapters.map((adapter) =>
      adapter.capabilityId !== 'data.dispatch'
        ? adapter
        : Object.freeze({
            ...adapter,
            async invoke(invocation) {
              if (drift === 'schedule') {
                invocation.controls?.scheduler.enqueue({
                  id: `injected-schedule-drift-${attemptIndex}`,
                  lane: 'drift',
                  readyAt: invocation.controls.clock.now(),
                  run: () => undefined,
                });
              }
              if (drift === 'network') {
                await invocation.controls?.network.dispatch({
                  kind: 'live-egress',
                  resourceId: 'forbidden-external-origin',
                  inputDigest: digestDeterministicRuntimeValue({
                    request: 'drift',
                  }),
                });
              }
              const outcome = await adapter.invoke(invocation);
              if (drift !== 'random' || outcome.status !== 'succeeded') {
                return outcome;
              }
              return Object.freeze({
                status: 'succeeded' as const,
                output: Object.freeze({
                  value: outcome.output ?? null,
                  uncontrolledRandomProjection: attemptIndex,
                }),
              });
            },
          })
    )
  );
  if (!result.ok) {
    throw new Error(
      `Golden replay drift registry is invalid: ${JSON.stringify(result.issues)}`
    );
  }
  return result.registry;
};

export const runGoldenG3ReplayAttempt = async (
  input: Readonly<{
    surface: GoldenG3ReplaySurface;
    target: GoldenG3ReplayTarget;
    motion: GoldenG3BehaviorCompositionMotionMode;
    attemptIndex: number;
    drift?: GoldenG3ReplayDrift;
    provider?: DeterministicRuntimeProvider;
  }>
): Promise<BehaviorReplayAttemptResult> => {
  let replay: BehaviorReplayAttemptResult | undefined;
  try {
    await runGoldenG3BehaviorCompositionSurface(
      domainSurface(input.surface),
      input.motion,
      async ({ program, registry }) => {
        const plan = createBehaviorDeterministicControlPlan({
          program,
          profile: GOLDEN_G3_REPLAY_CONTROL_PROFILE,
          fixtureSets: [],
          cell: createCell(input.surface, input.target, input.motion),
          maximumConcurrency: 2,
        });
        if (plan.status === 'blocked') {
          throw new Error(
            `Golden V3 control plan is blocked: ${JSON.stringify(plan.issues)}`
          );
        }
        replay = await executeBehaviorReplayAttempt({
          program,
          plan: plan.plan,
          provider: input.provider ?? createProvider(input.surface),
          registry: withInjectedDrift(
            registry,
            input.drift,
            input.attemptIndex
          ),
          attemptId: `${input.target}:${input.surface}:${input.motion}:attempt-${input.attemptIndex + 1}`,
          toolchainDigest: TOOLCHAIN_DIGEST,
        });
        if (!replay.runtime) {
          throw new Error('GOLDEN_V3_REPLAY_BLOCKED');
        }
        return replay.runtime;
      }
    );
  } catch (error) {
    if (!replay || replay.runtime) throw error;
  }
  if (!replay) {
    throw new Error('Golden V3 replay executor was not invoked.');
  }
  return replay;
};

export const runGoldenG3DeterministicReplayMatrix =
  async (): Promise<GoldenG3ReplayMatrixResult> => {
    const cells: GoldenG3ReplayCellResult[] = [];
    const referenceByMotion = new Map<
      GoldenG3BehaviorCompositionMotionMode,
      BehaviorReplayRecord
    >();
    for (const motion of ['full', 'reduced'] as const) {
      for (const target of ['react-vite', 'vue-vite'] as const) {
        for (const surface of ['browser', 'remote', 'export', 'ci'] as const) {
          const records: BehaviorReplayRecord[] = [];
          for (let attemptIndex = 0; attemptIndex < 3; attemptIndex += 1) {
            const attempt = await runGoldenG3ReplayAttempt({
              surface,
              target,
              motion,
              attemptIndex,
            });
            if (!attempt.record) {
              throw new Error(
                `Golden V3 ${target}/${surface}/${motion} did not produce a ReplayRecord.`
              );
            }
            records.push(attempt.record);
            if (records.length > 1) {
              const repeated = compareBehaviorReplayRecords(
                records[0]!,
                attempt.record
              );
              if (repeated.status === 'diverged') {
                throw new Error(
                  `Golden V3 repeat diverged: ${JSON.stringify(repeated.divergence)}`
                );
              }
            }
          }
          const reference = referenceByMotion.get(motion);
          if (reference) {
            const compatible = compareBehaviorReplayRecords(
              reference,
              records[0]!,
              {
                allowProviderCapabilityDifference: true,
                allowPlanCellDifference: true,
              }
            );
            if (compatible.status === 'diverged') {
              throw new Error(
                `Golden V3 cross-surface sequence diverged: ${JSON.stringify(compatible.divergence)}`
              );
            }
          } else {
            referenceByMotion.set(motion, records[0]!);
          }
          cells.push(
            Object.freeze({
              surface,
              target,
              motion,
              records: Object.freeze(records),
            })
          );
        }
      }
    }
    return Object.freeze({
      cells: Object.freeze(cells),
      semanticDigestByMotion: Object.freeze({
        full: referenceByMotion.get('full')!.semanticDigest,
        reduced: referenceByMotion.get('reduced')!.semanticDigest,
      }),
    });
  };

export const detectGoldenG3ReplayDrift = async (
  drift: GoldenG3ReplayDrift
): Promise<BehaviorReplayDivergence> => {
  const baseline = await runGoldenG3ReplayAttempt({
    surface: 'ci',
    target: 'react-vite',
    motion: 'full',
    attemptIndex: 0,
  });
  const drifted = await runGoldenG3ReplayAttempt({
    surface: 'ci',
    target: 'react-vite',
    motion: 'full',
    attemptIndex: 1,
    drift,
  });
  if (!baseline.record || !drifted.record) {
    throw new Error(
      `Golden ${drift} drift did not produce comparable records.`
    );
  }
  const comparison = compareBehaviorReplayRecords(
    baseline.record,
    drifted.record
  );
  if (comparison.status !== 'diverged') {
    throw new Error(`Golden ${drift} drift was not detected.`);
  }
  return comparison.divergence;
};
