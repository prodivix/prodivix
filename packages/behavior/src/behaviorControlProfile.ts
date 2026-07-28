import {
  DETERMINISTIC_RANDOM_ALGORITHM,
  createDeterministicRuntimeControlPlan,
  type DeterministicRuntimeControlPlan,
  type DeterministicRuntimeFixture,
  type DeterministicRuntimePlanCell,
} from '@prodivix/runtime-core';
import { digestBehaviorValue } from './behaviorCanonical';
import {
  normalizeBehaviorControlProfile,
  normalizeBehaviorFixtureSet,
} from './behaviorCodec';
import type {
  BehaviorControlProfile,
  BehaviorFixture,
  BehaviorFixtureSet,
  BehaviorScenarioProgram,
} from './behavior.types';

export const BEHAVIOR_DETERMINISTIC_CONTROL_PRESET_ID =
  'prodivix.deterministic.default';

export const BEHAVIOR_DETERMINISTIC_CONTROL_PRESET: BehaviorControlProfile =
  Object.freeze({
    id: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET_ID,
    name: 'Deterministic default',
    clock: Object.freeze({
      mode: 'virtual',
      epoch: '2026-01-01T00:00:00.000Z',
      tickMs: 1,
    }),
    timezone: 'UTC',
    random: Object.freeze({
      algorithm: DETERMINISTIC_RANDOM_ALGORITHM,
      seed: 'prodivix-deterministic-random',
    }),
    identifiers: Object.freeze({
      seed: 'prodivix-deterministic-identifiers',
      namespaces: Object.freeze([
        'attempt',
        'step',
        'action',
        'operation',
      ] as const),
    }),
    scheduler: Object.freeze({
      strategy: 'deterministic',
      seed: 'prodivix-deterministic-scheduler',
      maximumTurns: 10_000,
    }),
    network: Object.freeze({
      mode: 'fixture-only',
      undeclaredRequest: 'reject',
    }),
    storage: Object.freeze({
      bootstrapFixtureIds: Object.freeze([]),
      cleanup: 'required',
    }),
    rendering: Object.freeze({
      devicePixelRatio: 1,
      animationClock: 'virtual',
      fontReadiness: 'required',
    }),
    serviceWorker: Object.freeze({
      mode: 'disabled',
      cache: 'empty',
    }),
    settle: Object.freeze({
      conditions: Object.freeze([
        'render-stable',
        'declared-effects-complete',
        'font-ready',
      ] as const),
      maximumFrames: 8,
    }),
    budgets: Object.freeze({
      totalMs: 30_000,
      stepMs: 5_000,
      settleMs: 2_000,
      networkMs: 5_000,
      animationMs: 5_000,
    }),
  });

export type CreateBehaviorDeterministicControlPlanInput = Readonly<{
  program: BehaviorScenarioProgram;
  profile: BehaviorControlProfile;
  fixtureSets: readonly BehaviorFixtureSet[];
  cell: DeterministicRuntimePlanCell;
  maximumConcurrency?: number;
  required?: boolean;
}>;

export type BehaviorControlPlanIssue = Readonly<{
  code:
    | 'profile-digest-mismatch'
    | 'fixture-digest-mismatch'
    | 'fixture-only-required'
    | 'random-algorithm-unsupported'
    | 'identifier-namespace-missing';
  path: string;
  message: string;
}>;

export type CreateBehaviorDeterministicControlPlanResult =
  | Readonly<{
      status: 'ready';
      plan: DeterministicRuntimeControlPlan;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly BehaviorControlPlanIssue[];
    }>;

export const digestBehaviorControlProfile = (
  profile: BehaviorControlProfile
): string => digestBehaviorValue(normalizeBehaviorControlProfile(profile));

export const digestBehaviorFixtureSet = (
  fixtureSet: BehaviorFixtureSet
): string => digestBehaviorValue(normalizeBehaviorFixtureSet(fixtureSet));

const toRuntimeFixture = (
  fixture: BehaviorFixture
): DeterministicRuntimeFixture =>
  Object.freeze({
    id: fixture.id,
    target: Object.freeze({ ...fixture.target }),
    inputDigest: fixture.inputDigest,
    ...(fixture.attempt === undefined ? {} : { attempt: fixture.attempt }),
    ...(fixture.page === undefined ? {} : { page: fixture.page }),
    outcome:
      fixture.outcome.kind === 'result'
        ? Object.freeze({
            kind: 'result' as const,
            value: fixture.outcome.value,
          })
        : Object.freeze({
            kind: 'fault' as const,
            fault: fixture.outcome.fault,
            ...(fixture.outcome.delayMs === undefined
              ? {}
              : { delayMs: fixture.outcome.delayMs }),
            ...(fixture.outcome.fault === 'retry-after' &&
            fixture.outcome.delayMs !== undefined
              ? { retryAfterMs: fixture.outcome.delayMs }
              : {}),
          }),
  });

/**
 * Resolves the Workspace profile and fixtures into the provider projection.
 * Program/profile/fixture drift blocks before any runtime effect can start.
 */
export const createBehaviorDeterministicControlPlan = (
  input: CreateBehaviorDeterministicControlPlanInput
): CreateBehaviorDeterministicControlPlanResult => {
  const profile = normalizeBehaviorControlProfile(input.profile);
  const profileDigest = digestBehaviorControlProfile(profile);
  const issues: BehaviorControlPlanIssue[] = [];
  if (profileDigest !== input.program.controlProfileDigest) {
    issues.push({
      code: 'profile-digest-mismatch',
      path: '/controlProfileDigest',
      message:
        'Behavior Program and resolved control profile digests do not match.',
    });
  }
  const fixtureDigests = input.fixtureSets.map(digestBehaviorFixtureSet);
  if (
    fixtureDigests.length !== input.program.fixtureSetDigests.length ||
    fixtureDigests.some(
      (digest, index) => digest !== input.program.fixtureSetDigests[index]
    )
  ) {
    issues.push({
      code: 'fixture-digest-mismatch',
      path: '/fixtureSetDigests',
      message:
        'Behavior Program and resolved fixture set digests do not match.',
    });
  }
  if ((input.required ?? true) && profile.network.mode !== 'fixture-only') {
    issues.push({
      code: 'fixture-only-required',
      path: '/network/mode',
      message:
        'Required deterministic replay rejects isolated live network reads.',
    });
  }
  if (profile.random.algorithm !== DETERMINISTIC_RANDOM_ALGORITHM) {
    issues.push({
      code: 'random-algorithm-unsupported',
      path: '/random/algorithm',
      message: `Behavior replay does not implement ${profile.random.algorithm}.`,
    });
  }
  const requiredNamespaces = [
    'attempt',
    'step',
    'action',
    'operation',
  ] as const;
  const missingNamespace = requiredNamespaces.find(
    (namespace) => !profile.identifiers.namespaces.includes(namespace)
  );
  if (missingNamespace) {
    issues.push({
      code: 'identifier-namespace-missing',
      path: '/identifiers/namespaces',
      message: `Behavior control profile is missing the ${missingNamespace} identifier namespace.`,
    });
  }
  if (issues.length) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze(issues),
    });
  }

  const maximumConcurrency = Math.max(
    1,
    Math.min(64, Math.trunc(input.maximumConcurrency ?? 8))
  );
  return Object.freeze({
    status: 'ready',
    plan: createDeterministicRuntimeControlPlan({
      profileId: profile.id,
      profileDigest,
      fixtureSetDigests: Object.freeze(fixtureDigests),
      clock: Object.freeze({
        epoch: profile.clock.epoch,
        tickMs: profile.clock.tickMs,
        maximumVirtualDurationMs: profile.budgets.totalMs,
      }),
      timezone: profile.timezone,
      random: profile.random,
      identifiers: profile.identifiers,
      scheduler: Object.freeze({
        seed: profile.scheduler.seed,
        maximumTurns: profile.scheduler.maximumTurns,
        maximumConcurrency,
      }),
      network: Object.freeze({
        mode: profile.network.mode,
        undeclaredRequest: profile.network.undeclaredRequest,
        fixtures: Object.freeze(
          input.fixtureSets.flatMap(({ fixtures }) =>
            fixtures.map(toRuntimeFixture)
          )
        ),
      }),
      storage: profile.storage,
      rendering: profile.rendering,
      serviceWorker: profile.serviceWorker,
      settle: profile.settle,
      budgets: profile.budgets,
      cell: input.cell,
    }),
  });
};
