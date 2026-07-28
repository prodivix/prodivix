import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import type { ExecutionValue } from './execution.types';
import type {
  DeterministicAttemptFence,
  DeterministicScheduler,
} from './deterministicScheduler';

export const DETERMINISTIC_RUNTIME_CONTROL_IDS = Object.freeze([
  'logical-clock',
  'timezone',
  'scoped-random',
  'deterministic-identifiers',
  'canonical-scheduler',
  'fixture-network',
  'storage-isolation',
  'service-worker-isolation',
  'viewport',
  'device-pixel-ratio',
  'color-scheme',
  'motion',
  'locale',
  'font-readiness',
  'semantic-settle',
] as const);

export const DETERMINISTIC_RANDOM_ALGORITHM = 'xoshiro256ss';

export type DeterministicRuntimeControlId =
  (typeof DETERMINISTIC_RUNTIME_CONTROL_IDS)[number];

export type DeterministicRuntimeControlStatus =
  'supported' | 'emulated' | 'partially-controlled' | 'unsupported';

export type DeterministicRuntimeControlDeclaration = Readonly<{
  controlId: DeterministicRuntimeControlId;
  status: DeterministicRuntimeControlStatus;
  implementationDigest: string;
  reason?: string;
}>;

export type DeterministicRuntimeCapabilitySnapshot = Readonly<{
  providerId: string;
  providerVersion: string;
  implementationDigest: string;
  controls: readonly DeterministicRuntimeControlDeclaration[];
  snapshotDigest: string;
}>;

export type DeterministicRuntimePlanCell = Readonly<{
  id: string;
  frameworkTarget: string;
  surface: 'browser' | 'remote' | 'export' | 'ci';
  browserEngine: 'chromium' | 'firefox' | 'webkit' | 'none';
  viewport: Readonly<{ width: number; height: number }>;
  colorScheme: 'light' | 'dark';
  motion: 'full' | 'reduced';
  locale: string;
}>;

export type DeterministicRuntimeFixture = Readonly<{
  id: string;
  target: Readonly<{
    kind: 'data-operation' | 'server-function' | 'storage' | 'auth-session';
    resourceId: string;
  }>;
  inputDigest: string;
  attempt?: number;
  page?: string;
  outcome:
    | Readonly<{ kind: 'result'; value: ExecutionValue; delayMs?: number }>
    | Readonly<{
        kind: 'fault';
        fault: 'error' | 'timeout' | 'disconnect' | 'retry-after' | 'status';
        delayMs?: number;
        status?: number;
        retryAfterMs?: number;
      }>;
}>;

export type DeterministicRuntimeControlPlan = Readonly<{
  profileId: string;
  profileDigest: string;
  fixtureSetDigests: readonly string[];
  clock: Readonly<{
    epoch: string;
    tickMs: number;
    maximumVirtualDurationMs: number;
  }>;
  timezone: string;
  random: Readonly<{ algorithm: string; seed: string }>;
  identifiers: Readonly<{
    seed: string;
    namespaces: readonly ('attempt' | 'step' | 'action' | 'operation')[];
  }>;
  scheduler: Readonly<{
    seed: string;
    maximumTurns: number;
    maximumConcurrency: number;
  }>;
  network: Readonly<{
    mode: 'fixture-only' | 'isolated-live-read';
    undeclaredRequest: 'reject';
    fixtures: readonly DeterministicRuntimeFixture[];
  }>;
  storage: Readonly<{
    bootstrapFixtureIds: readonly string[];
    cleanup: 'required';
  }>;
  rendering: Readonly<{
    devicePixelRatio: number;
    animationClock: 'virtual';
    fontReadiness: 'required' | 'bounded';
  }>;
  serviceWorker: Readonly<{
    mode: 'disabled' | 'isolated';
    cache: 'empty' | 'fixture';
  }>;
  settle: Readonly<{
    conditions: readonly (
      | 'render-stable'
      | 'declared-effects-complete'
      | 'font-ready'
      | 'animation-marker'
      | 'barrier'
    )[];
    maximumFrames: number;
  }>;
  budgets: Readonly<{
    totalMs: number;
    stepMs: number;
    settleMs: number;
    networkMs: number;
    animationMs: number;
  }>;
  cell: DeterministicRuntimePlanCell;
  controlDigest: string;
}>;

export type DeterministicRuntimeControlPlanInput = Omit<
  DeterministicRuntimeControlPlan,
  'controlDigest'
>;

export type DeterministicRuntimePreflightIssue = Readonly<{
  controlId:
    DeterministicRuntimeControlId | 'profile-digest' | 'capability-snapshot';
  status: 'partially-controlled' | 'unsupported' | 'mismatch';
  reason: string;
}>;

export type DeterministicRuntimePreflightResult =
  | Readonly<{
      status: 'ready';
      planDigest: string;
      capabilitySnapshotDigest: string;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly DeterministicRuntimePreflightIssue[];
    }>;

export type DeterministicClockPort = Readonly<{
  now(): number;
  wallTime(): string;
  advanceBy(durationMs: number): number;
  deadline(durationMs: number): number;
}>;

export type DeterministicRandomStream = Readonly<{
  nextUint32(): number;
  nextFloat(): number;
}>;

export type DeterministicRandomPort = Readonly<{
  stream(scope: string): DeterministicRandomStream;
}>;

export type DeterministicIdentifierPort = Readonly<{
  next(namespace: 'attempt' | 'step' | 'action' | 'operation'): string;
}>;

export type DeterministicFixtureRequest = Readonly<{
  kind:
    | 'data-operation'
    | 'server-function'
    | 'storage'
    | 'auth-session'
    | 'live-egress';
  resourceId: string;
  inputDigest: string;
  attempt?: number;
  page?: string;
}>;

export type DeterministicFixtureNetworkResult =
  | Readonly<{
      status: 'matched';
      fixtureId: string;
      value: ExecutionValue;
    }>
  | Readonly<{
      status: 'fault';
      fixtureId: string;
      fault: DeterministicRuntimeFixture['outcome'] extends infer Outcome
        ? Outcome extends Readonly<{ kind: 'fault'; fault: infer Fault }>
          ? Fault
          : never
        : never;
      statusCode?: number;
      retryAfterMs?: number;
    }>
  | Readonly<{
      status: 'blocked';
      reason: 'live-egress-denied' | 'fixture-not-found';
    }>;

export type DeterministicFixtureNetworkEvent = Readonly<{
  sequence: number;
  logicalTime: number;
  requestKind: DeterministicFixtureRequest['kind'];
  resourceId: string;
  inputDigest: string;
  outcome: 'matched' | 'fault' | 'blocked';
  fixtureId?: string;
  reason?: 'live-egress-denied' | 'fixture-not-found';
}>;

export type DeterministicFixtureNetworkPort = Readonly<{
  dispatch(
    request: DeterministicFixtureRequest
  ): Promise<DeterministicFixtureNetworkResult>;
  events(): readonly DeterministicFixtureNetworkEvent[];
}>;

export type DeterministicIsolationResidual = Readonly<{
  storage: number;
  cookies: number;
  indexedDb: number;
  cacheStorage: number;
  serviceWorkers: number;
  workers: number;
  streams: number;
  timers: number;
  effects: number;
  authSessions: number;
}>;

export type DeterministicIsolationCanary = Readonly<{
  clean: boolean;
  residual: DeterministicIsolationResidual;
}>;

export type DeterministicRuntimeAppliedControls = Readonly<{
  profileDigest: string;
  controlDigest: string;
  capabilitySnapshotDigest: string;
  cellId: string;
  namespace: string;
}>;

export type DeterministicRuntimeSession = Readonly<{
  attemptId: string;
  applied: DeterministicRuntimeAppliedControls;
  clock: DeterministicClockPort;
  random: DeterministicRandomPort;
  identifiers: DeterministicIdentifierPort;
  scheduler: DeterministicScheduler;
  network: DeterministicFixtureNetworkPort;
  fence: DeterministicAttemptFence;
  initialCanary: DeterministicIsolationCanary;
  cleanup(): Promise<DeterministicIsolationCanary>;
}>;

export type DeterministicRuntimeAttemptStartResult =
  | Readonly<{
      status: 'ready';
      session: DeterministicRuntimeSession;
    }>
  | Readonly<{
      status: 'blocked';
      code:
        | 'control-preflight-failed'
        | 'control-application-mismatch'
        | 'isolation-canary-failed'
        | 'font-readiness-failed'
        | 'provider-control-failed';
      issues?: readonly DeterministicRuntimePreflightIssue[];
      canary?: DeterministicIsolationCanary;
    }>;

export type DeterministicRuntimeProvider = Readonly<{
  descriptor: Readonly<{
    id: string;
    version: string;
    surface: DeterministicRuntimePlanCell['surface'];
  }>;
  inspect(
    plan: DeterministicRuntimeControlPlan
  ): DeterministicRuntimeCapabilitySnapshot;
  startAttempt(
    input: Readonly<{
      attemptId: string;
      plan: DeterministicRuntimeControlPlan;
    }>
  ): Promise<DeterministicRuntimeAttemptStartResult>;
}>;

export type DeterministicRuntimeProviderHooks = Readonly<{
  reset?(
    input: Readonly<{
      namespace: string;
      plan: DeterministicRuntimeControlPlan;
    }>
  ): void | Promise<void>;
  apply?(
    input: Readonly<{
      namespace: string;
      plan: DeterministicRuntimeControlPlan;
      expectedControlDigest: string;
    }>
  ):
    | Readonly<{ appliedControlDigest: string; fontReady?: boolean }>
    | Promise<
        Readonly<{
          appliedControlDigest: string;
          fontReady?: boolean;
        }>
      >;
  probe?(
    input: Readonly<{
      namespace: string;
      phase: 'after-reset' | 'after-cleanup';
    }>
  ): DeterministicIsolationResidual | Promise<DeterministicIsolationResidual>;
  cleanup?(
    input: Readonly<{
      namespace: string;
      plan: DeterministicRuntimeControlPlan;
    }>
  ): void | Promise<void>;
}>;

export type CreateDeterministicRuntimeProviderInput = Readonly<{
  id: string;
  version: string;
  surface: DeterministicRuntimePlanCell['surface'];
  implementationDigest: string;
  controls?: readonly DeterministicRuntimeControlDeclaration[];
  hooks?: DeterministicRuntimeProviderHooks;
}>;

export type CreateControlledSurfaceRuntimeProviderInput = Readonly<{
  id?: string;
  version?: string;
  implementationDigest: string;
  controls?: readonly DeterministicRuntimeControlDeclaration[];
  hooks?: DeterministicRuntimeProviderHooks;
}>;

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

export const digestDeterministicRuntimeValue = (value: unknown): string =>
  `sha256-${bytesToHex(sha256(utf8ToBytes(canonicalJsonText(value))))}`;

export const readDeterministicRuntimeIdentity = (
  value: string,
  label: string
): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || normalized.includes('\u0000')) {
    throw new TypeError(`${label} must be a bounded canonical identity.`);
  }
  return normalized;
};

const positiveInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value;
};

const enumValue = <Value extends string>(
  value: string,
  allowed: readonly Value[],
  label: string
): Value => {
  if (!allowed.includes(value as Value)) {
    throw new TypeError(`${label} is unsupported: ${value}.`);
  }
  return value as Value;
};

export const readDeterministicRuntimeNonNegativeInteger = (
  value: number,
  label: string
): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
};

const digestValue = digestDeterministicRuntimeValue;
const canonicalIdentity = readDeterministicRuntimeIdentity;
const nonNegativeInteger = readDeterministicRuntimeNonNegativeInteger;

const sortedUnique = <Value extends string>(
  values: readonly Value[],
  label: string
): readonly Value[] => {
  const normalized = values.map((value) => canonicalIdentity(value, label));
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${label} values must be unique.`);
  }
  return Object.freeze(
    normalized.sort(compareUnicodeCodePoints)
  ) as readonly Value[];
};

const normalizeCell = (
  cell: DeterministicRuntimePlanCell
): DeterministicRuntimePlanCell =>
  Object.freeze({
    id: canonicalIdentity(cell.id, 'Deterministic plan cell id'),
    frameworkTarget: canonicalIdentity(
      cell.frameworkTarget,
      'Deterministic framework target'
    ),
    surface: enumValue(
      cell.surface,
      ['browser', 'remote', 'export', 'ci'] as const,
      'Deterministic plan surface'
    ),
    browserEngine: enumValue(
      cell.browserEngine,
      ['chromium', 'firefox', 'webkit', 'none'] as const,
      'Deterministic browser engine'
    ),
    viewport: Object.freeze({
      width: positiveInteger(cell.viewport.width, 'Viewport width'),
      height: positiveInteger(cell.viewport.height, 'Viewport height'),
    }),
    colorScheme: enumValue(
      cell.colorScheme,
      ['light', 'dark'] as const,
      'Deterministic color scheme'
    ),
    motion: enumValue(
      cell.motion,
      ['full', 'reduced'] as const,
      'Deterministic motion mode'
    ),
    locale: canonicalIdentity(cell.locale, 'Deterministic locale'),
  });

const normalizeFixture = (
  fixture: DeterministicRuntimeFixture
): DeterministicRuntimeFixture => {
  if (!DIGEST_PATTERN.test(fixture.inputDigest)) {
    throw new TypeError('Runtime fixture inputDigest must be SHA-256.');
  }
  enumValue(
    fixture.outcome.kind,
    ['result', 'fault'] as const,
    'Runtime fixture outcome'
  );
  const outcome =
    fixture.outcome.kind === 'result'
      ? Object.freeze({
          kind: 'result' as const,
          value: fixture.outcome.value,
          ...(fixture.outcome.delayMs === undefined
            ? {}
            : {
                delayMs: nonNegativeInteger(
                  fixture.outcome.delayMs,
                  'Fixture delay'
                ),
              }),
        })
      : Object.freeze({
          kind: 'fault' as const,
          fault: enumValue(
            fixture.outcome.fault,
            [
              'error',
              'timeout',
              'disconnect',
              'retry-after',
              'status',
            ] as const,
            'Runtime fixture fault'
          ),
          ...(fixture.outcome.delayMs === undefined
            ? {}
            : {
                delayMs: nonNegativeInteger(
                  fixture.outcome.delayMs,
                  'Fixture fault delay'
                ),
              }),
          ...(fixture.outcome.status === undefined
            ? {}
            : {
                status: positiveInteger(
                  fixture.outcome.status,
                  'Fixture status'
                ),
              }),
          ...(fixture.outcome.retryAfterMs === undefined
            ? {}
            : {
                retryAfterMs: nonNegativeInteger(
                  fixture.outcome.retryAfterMs,
                  'Fixture retry-after'
                ),
              }),
        });
  return Object.freeze({
    id: canonicalIdentity(fixture.id, 'Runtime fixture id'),
    target: Object.freeze({
      kind: enumValue(
        fixture.target.kind,
        [
          'data-operation',
          'server-function',
          'storage',
          'auth-session',
        ] as const,
        'Runtime fixture target kind'
      ),
      resourceId: canonicalIdentity(
        fixture.target.resourceId,
        'Runtime fixture resource id'
      ),
    }),
    inputDigest: fixture.inputDigest,
    ...(fixture.attempt === undefined
      ? {}
      : {
          attempt: positiveInteger(fixture.attempt, 'Runtime fixture attempt'),
        }),
    ...(fixture.page === undefined
      ? {}
      : {
          page: canonicalIdentity(fixture.page, 'Runtime fixture page'),
        }),
    outcome,
  });
};

const runtimeFixtureMatcherKey = (
  fixture: DeterministicRuntimeFixture
): string =>
  canonicalJsonText({
    kind: fixture.target.kind,
    resourceId: fixture.target.resourceId,
    inputDigest: fixture.inputDigest,
    attempt: fixture.attempt ?? null,
    page: fixture.page ?? null,
  });

/** Canonicalizes every provider-visible control before calculating its digest. */
export const createDeterministicRuntimeControlPlan = (
  input: DeterministicRuntimeControlPlanInput
): DeterministicRuntimeControlPlan => {
  if (
    !DIGEST_PATTERN.test(input.profileDigest) ||
    input.fixtureSetDigests.some((digest) => !DIGEST_PATTERN.test(digest))
  ) {
    throw new TypeError(
      'Deterministic control plans require exact profile and fixture digests.'
    );
  }
  const epoch = new Date(input.clock.epoch);
  if (!Number.isFinite(epoch.valueOf())) {
    throw new TypeError('Deterministic clock epoch must be an ISO timestamp.');
  }
  const fixtures = input.network.fixtures
    .map(normalizeFixture)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
  if (new Set(fixtures.map(({ id }) => id)).size !== fixtures.length) {
    throw new TypeError('Runtime fixture identities must be unique.');
  }
  if (
    new Set(fixtures.map(runtimeFixtureMatcherKey)).size !== fixtures.length
  ) {
    throw new TypeError('Runtime fixture matchers must be unambiguous.');
  }
  const withoutDigest = Object.freeze({
    profileId: canonicalIdentity(
      input.profileId,
      'Deterministic control profile id'
    ),
    profileDigest: input.profileDigest,
    fixtureSetDigests: Object.freeze([...input.fixtureSetDigests]),
    clock: Object.freeze({
      epoch: epoch.toISOString(),
      tickMs: positiveInteger(input.clock.tickMs, 'Clock tick'),
      maximumVirtualDurationMs: positiveInteger(
        input.clock.maximumVirtualDurationMs,
        'Maximum virtual duration'
      ),
    }),
    timezone: canonicalIdentity(input.timezone, 'Deterministic timezone'),
    random: Object.freeze({
      algorithm: canonicalIdentity(
        input.random.algorithm,
        'Deterministic random algorithm'
      ),
      seed: canonicalIdentity(input.random.seed, 'Deterministic random seed'),
    }),
    identifiers: Object.freeze({
      seed: canonicalIdentity(
        input.identifiers.seed,
        'Deterministic identifier seed'
      ),
      namespaces: sortedUnique(
        input.identifiers.namespaces.map((namespace) =>
          enumValue(
            namespace,
            ['attempt', 'step', 'action', 'operation'] as const,
            'Deterministic identifier namespace'
          )
        ),
        'Deterministic identifier namespace'
      ),
    }),
    scheduler: Object.freeze({
      seed: canonicalIdentity(
        input.scheduler.seed,
        'Deterministic scheduler seed'
      ),
      maximumTurns: positiveInteger(
        input.scheduler.maximumTurns,
        'Scheduler turn budget'
      ),
      maximumConcurrency: positiveInteger(
        input.scheduler.maximumConcurrency,
        'Scheduler concurrency'
      ),
    }),
    network: Object.freeze({
      mode: enumValue(
        input.network.mode,
        ['fixture-only', 'isolated-live-read'] as const,
        'Deterministic network mode'
      ),
      undeclaredRequest: enumValue(
        input.network.undeclaredRequest,
        ['reject'] as const,
        'Undeclared network request policy'
      ),
      fixtures: Object.freeze(fixtures),
    }),
    storage: Object.freeze({
      bootstrapFixtureIds: sortedUnique(
        input.storage.bootstrapFixtureIds,
        'Storage bootstrap fixture id'
      ),
      cleanup: enumValue(
        input.storage.cleanup,
        ['required'] as const,
        'Storage cleanup policy'
      ),
    }),
    rendering: Object.freeze({
      devicePixelRatio: input.rendering.devicePixelRatio,
      animationClock: enumValue(
        input.rendering.animationClock,
        ['virtual'] as const,
        'Animation clock'
      ),
      fontReadiness: enumValue(
        input.rendering.fontReadiness,
        ['required', 'bounded'] as const,
        'Font readiness policy'
      ),
    }),
    serviceWorker: Object.freeze({
      mode: enumValue(
        input.serviceWorker.mode,
        ['disabled', 'isolated'] as const,
        'Service worker mode'
      ),
      cache: enumValue(
        input.serviceWorker.cache,
        ['empty', 'fixture'] as const,
        'Service worker cache policy'
      ),
    }),
    settle: Object.freeze({
      conditions: sortedUnique(
        input.settle.conditions.map((condition) =>
          enumValue(
            condition,
            [
              'render-stable',
              'declared-effects-complete',
              'font-ready',
              'animation-marker',
              'barrier',
            ] as const,
            'Deterministic settle condition'
          )
        ),
        'Deterministic settle condition'
      ),
      maximumFrames: positiveInteger(
        input.settle.maximumFrames,
        'Settle frame budget'
      ),
    }),
    budgets: Object.freeze({
      totalMs: positiveInteger(input.budgets.totalMs, 'Total budget'),
      stepMs: positiveInteger(input.budgets.stepMs, 'Step budget'),
      settleMs: positiveInteger(input.budgets.settleMs, 'Settle budget'),
      networkMs: positiveInteger(input.budgets.networkMs, 'Network budget'),
      animationMs: positiveInteger(
        input.budgets.animationMs,
        'Animation budget'
      ),
    }),
    cell: normalizeCell(input.cell),
  });
  if (
    !Number.isFinite(withoutDigest.rendering.devicePixelRatio) ||
    withoutDigest.rendering.devicePixelRatio <= 0 ||
    withoutDigest.rendering.devicePixelRatio > 8
  ) {
    throw new TypeError(
      'Device pixel ratio must be finite and between zero and eight.'
    );
  }
  if (withoutDigest.random.algorithm !== DETERMINISTIC_RANDOM_ALGORITHM) {
    throw new TypeError(
      `Unsupported deterministic random algorithm: ${withoutDigest.random.algorithm}.`
    );
  }
  return Object.freeze({
    ...withoutDigest,
    controlDigest: digestValue(withoutDigest),
  });
};

export const createDeterministicRuntimeCapabilitySnapshot = (
  input: Readonly<{
    providerId: string;
    providerVersion: string;
    implementationDigest: string;
    controls: readonly DeterministicRuntimeControlDeclaration[];
  }>
): DeterministicRuntimeCapabilitySnapshot => {
  if (!DIGEST_PATTERN.test(input.implementationDigest)) {
    throw new TypeError(
      'Runtime provider implementation identity must be a SHA-256 digest.'
    );
  }
  const controls = input.controls
    .map((control) => {
      if (!DIGEST_PATTERN.test(control.implementationDigest)) {
        throw new TypeError(
          'Runtime control implementations require SHA-256 digests.'
        );
      }
      return Object.freeze({
        controlId: enumValue(
          control.controlId,
          DETERMINISTIC_RUNTIME_CONTROL_IDS,
          'Runtime control id'
        ),
        status: enumValue(
          control.status,
          [
            'supported',
            'emulated',
            'partially-controlled',
            'unsupported',
          ] as const,
          'Runtime control status'
        ),
        implementationDigest: control.implementationDigest,
        ...(control.reason
          ? {
              reason: canonicalIdentity(
                control.reason,
                'Runtime control capability reason'
              ),
            }
          : {}),
      });
    })
    .sort((left, right) =>
      compareUnicodeCodePoints(left.controlId, right.controlId)
    );
  if (
    new Set(controls.map(({ controlId }) => controlId)).size !== controls.length
  ) {
    throw new TypeError('Runtime control declarations must be unique.');
  }
  const withoutDigest = Object.freeze({
    providerId: canonicalIdentity(input.providerId, 'Runtime provider id'),
    providerVersion: canonicalIdentity(
      input.providerVersion,
      'Runtime provider version'
    ),
    implementationDigest: input.implementationDigest,
    controls: Object.freeze(controls),
  });
  return Object.freeze({
    ...withoutDigest,
    snapshotDigest: digestValue(withoutDigest),
  });
};

export const preflightDeterministicRuntimeControls = (
  plan: DeterministicRuntimeControlPlan,
  snapshot: DeterministicRuntimeCapabilitySnapshot
): DeterministicRuntimePreflightResult => {
  const issues: DeterministicRuntimePreflightIssue[] = [];
  const expectedPlan = createDeterministicRuntimeControlPlan(plan);
  if (expectedPlan.controlDigest !== plan.controlDigest) {
    issues.push({
      controlId: 'profile-digest',
      status: 'mismatch',
      reason: 'The control plan digest does not match its canonical content.',
    });
  }
  const expectedSnapshot =
    createDeterministicRuntimeCapabilitySnapshot(snapshot);
  if (expectedSnapshot.snapshotDigest !== snapshot.snapshotDigest) {
    issues.push({
      controlId: 'capability-snapshot',
      status: 'mismatch',
      reason:
        'The provider capability snapshot digest does not match its canonical content.',
    });
  }
  const byControl = new Map(
    snapshot.controls.map((control) => [control.controlId, control])
  );
  DETERMINISTIC_RUNTIME_CONTROL_IDS.forEach((controlId) => {
    const declaration = byControl.get(controlId);
    if (
      !declaration ||
      declaration.status === 'unsupported' ||
      declaration.status === 'partially-controlled'
    ) {
      const issueStatus =
        declaration?.status === 'partially-controlled'
          ? 'partially-controlled'
          : 'unsupported';
      issues.push({
        controlId,
        status: issueStatus,
        reason:
          declaration?.reason ??
          `Provider ${snapshot.providerId} did not declare ${controlId}.`,
      });
    }
  });
  return issues.length
    ? Object.freeze({ status: 'blocked', issues: Object.freeze(issues) })
    : Object.freeze({
        status: 'ready',
        planDigest: plan.controlDigest,
        capabilitySnapshotDigest: snapshot.snapshotDigest,
      });
};
