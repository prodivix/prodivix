import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  DETERMINISTIC_RUNTIME_CONTROL_IDS,
  DETERMINISTIC_RANDOM_ALGORITHM,
  createDeterministicRuntimeCapabilitySnapshot,
  digestDeterministicRuntimeValue,
  preflightDeterministicRuntimeControls,
  readDeterministicRuntimeIdentity,
  readDeterministicRuntimeNonNegativeInteger,
  type CreateControlledSurfaceRuntimeProviderInput,
  type CreateDeterministicRuntimeProviderInput,
  type DeterministicClockPort,
  type DeterministicFixtureNetworkEvent,
  type DeterministicFixtureNetworkPort,
  type DeterministicFixtureRequest,
  type DeterministicIdentifierPort,
  type DeterministicIsolationCanary,
  type DeterministicIsolationResidual,
  type DeterministicRandomPort,
  type DeterministicRandomStream,
  type DeterministicRuntimeAttemptStartResult,
  type DeterministicRuntimeControlDeclaration,
  type DeterministicRuntimeControlPlan,
  type DeterministicRuntimeProvider,
  type DeterministicRuntimePreflightResult,
  type DeterministicRuntimeSession,
} from './deterministicRuntimeControl';
import {
  createDeterministicAttemptFence,
  createDeterministicScheduler,
  type DeterministicSchedulerClockPort,
} from './deterministicScheduler';

type RuntimeLogicalClock = DeterministicClockPort &
  DeterministicSchedulerClockPort;

const createClock = (
  plan: DeterministicRuntimeControlPlan
): RuntimeLogicalClock => {
  const epochMs = Date.parse(plan.clock.epoch);
  let logicalTime = 0;
  const advanceTo = (target: number): number => {
    const next = readDeterministicRuntimeNonNegativeInteger(
      target,
      'Clock target'
    );
    if (next < logicalTime) {
      throw new Error('Deterministic clock cannot move backwards.');
    }
    if (next > plan.clock.maximumVirtualDurationMs) {
      throw new Error('Deterministic clock virtual duration exceeded.');
    }
    logicalTime = next;
    return logicalTime;
  };
  return Object.freeze({
    now: () => logicalTime,
    wallTime: () => new Date(epochMs + logicalTime).toISOString(),
    advanceBy(durationMs) {
      const duration = readDeterministicRuntimeNonNegativeInteger(
        durationMs,
        'Clock advancement'
      );
      if (duration > plan.clock.maximumVirtualDurationMs - logicalTime) {
        throw new Error('Deterministic clock virtual duration exceeded.');
      }
      return advanceTo(logicalTime + duration);
    },
    deadline(durationMs) {
      const duration = readDeterministicRuntimeNonNegativeInteger(
        durationMs,
        'Clock deadline'
      );
      return duration > plan.clock.maximumVirtualDurationMs - logicalTime
        ? plan.clock.maximumVirtualDurationMs
        : logicalTime + duration;
    },
    advanceTo,
  });
};

const UINT64_MASK = (1n << 64n) - 1n;
const FLOAT53_DENOMINATOR = 0x20_0000_0000_0000;

const rotateLeft64 = (value: bigint, shift: bigint): bigint =>
  ((value << shift) | (value >> (64n - shift))) & UINT64_MASK;

const readUint64BigEndian = (bytes: Uint8Array, offset: number): bigint => {
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index] ?? 0);
  }
  return value;
};

const createXoshiro256StarStar = (
  seed: string,
  scope: string
): DeterministicRandomStream => {
  const digest = sha256(utf8ToBytes(`${seed}\u0000${scope}`));
  const state = [
    readUint64BigEndian(digest, 0),
    readUint64BigEndian(digest, 8),
    readUint64BigEndian(digest, 16),
    readUint64BigEndian(digest, 24),
  ];
  const hasEntropy = state.some((value) => value !== 0n);
  if (!hasEntropy) state[0] = 1n;
  const nextUint64 = (): bigint => {
    const result =
      (rotateLeft64((state[1]! * 5n) & UINT64_MASK, 7n) * 9n) & UINT64_MASK;
    const shifted = (state[1]! << 17n) & UINT64_MASK;
    state[2] = state[2]! ^ state[0]!;
    state[3] = state[3]! ^ state[1]!;
    state[1] = state[1]! ^ state[2]!;
    state[0] = state[0]! ^ state[3]!;
    state[2] = state[2]! ^ shifted;
    state[3] = rotateLeft64(state[3]!, 45n);
    return result;
  };
  return Object.freeze({
    nextUint32: () => Number(nextUint64() >> 32n),
    nextFloat: () => Number(nextUint64() >> 11n) / FLOAT53_DENOMINATOR,
  });
};

const createRandom = (
  plan: DeterministicRuntimeControlPlan
): DeterministicRandomPort => {
  const streams = new Map<string, DeterministicRandomStream>();
  if (plan.random.algorithm !== DETERMINISTIC_RANDOM_ALGORITHM) {
    throw new TypeError(
      `Unsupported deterministic random algorithm: ${plan.random.algorithm}.`
    );
  }
  return Object.freeze({
    stream(scope) {
      const normalized = readDeterministicRuntimeIdentity(
        scope,
        'Random stream scope'
      );
      const existing = streams.get(normalized);
      if (existing) return existing;
      const created = createXoshiro256StarStar(plan.random.seed, normalized);
      streams.set(normalized, created);
      return created;
    },
  });
};

const createIdentifiers = (
  plan: DeterministicRuntimeControlPlan
): DeterministicIdentifierPort => {
  const allowed = new Set(plan.identifiers.namespaces);
  const counters = new Map<string, number>();
  return Object.freeze({
    next(namespace) {
      if (!allowed.has(namespace)) {
        throw new Error(
          `Deterministic identifier namespace is undeclared: ${namespace}.`
        );
      }
      const counter = (counters.get(namespace) ?? 0) + 1;
      counters.set(namespace, counter);
      return `${namespace}-${digestDeterministicRuntimeValue({
        seed: plan.identifiers.seed,
        namespace,
        counter,
      }).slice(7, 23)}`;
    },
  });
};

const fixtureKey = (request: DeterministicFixtureRequest): string =>
  canonicalJsonText({
    kind: request.kind,
    resourceId: request.resourceId,
    inputDigest: request.inputDigest,
    attempt: request.attempt ?? null,
    page: request.page ?? null,
  });

const createNetwork = (
  plan: DeterministicRuntimeControlPlan,
  clock: DeterministicClockPort
): DeterministicFixtureNetworkPort => {
  const fixtures = new Map(
    plan.network.fixtures.map((fixture) => [
      fixtureKey({
        kind: fixture.target.kind,
        resourceId: fixture.target.resourceId,
        inputDigest: fixture.inputDigest,
        ...(fixture.attempt === undefined ? {} : { attempt: fixture.attempt }),
        ...(fixture.page === undefined ? {} : { page: fixture.page }),
      }),
      fixture,
    ])
  );
  const events: DeterministicFixtureNetworkEvent[] = [];
  let sequence = 0;
  const append = (
    request: DeterministicFixtureRequest,
    outcome: DeterministicFixtureNetworkEvent['outcome'],
    detail: Readonly<{
      fixtureId?: string;
      reason?: DeterministicFixtureNetworkEvent['reason'];
    }> = {}
  ) => {
    sequence += 1;
    events.push(
      Object.freeze({
        sequence,
        logicalTime: clock.now(),
        requestKind: request.kind,
        resourceId: request.resourceId,
        inputDigest: request.inputDigest,
        outcome,
        ...detail,
      })
    );
  };
  return Object.freeze({
    async dispatch(request) {
      if (request.kind === 'live-egress') {
        append(request, 'blocked', { reason: 'live-egress-denied' });
        return Object.freeze({
          status: 'blocked',
          reason: 'live-egress-denied',
        });
      }
      const fixture = fixtures.get(fixtureKey(request));
      if (!fixture) {
        append(request, 'blocked', { reason: 'fixture-not-found' });
        return Object.freeze({
          status: 'blocked',
          reason: 'fixture-not-found',
        });
      }
      const delayMs = fixture.outcome.delayMs ?? 0;
      if (delayMs > plan.budgets.networkMs) {
        append(request, 'fault', { fixtureId: fixture.id });
        return Object.freeze({
          status: 'fault',
          fixtureId: fixture.id,
          fault: 'timeout',
        });
      }
      if (delayMs) clock.advanceBy(delayMs);
      if (fixture.outcome.kind === 'result') {
        append(request, 'matched', { fixtureId: fixture.id });
        return Object.freeze({
          status: 'matched',
          fixtureId: fixture.id,
          value: fixture.outcome.value,
        });
      }
      append(request, 'fault', { fixtureId: fixture.id });
      return Object.freeze({
        status: 'fault',
        fixtureId: fixture.id,
        fault: fixture.outcome.fault,
        ...(fixture.outcome.status === undefined
          ? {}
          : { statusCode: fixture.outcome.status }),
        ...(fixture.outcome.retryAfterMs === undefined
          ? {}
          : { retryAfterMs: fixture.outcome.retryAfterMs }),
      });
    },
    events: () => Object.freeze([...events]),
  });
};

const emptyResidual = (): DeterministicIsolationResidual =>
  Object.freeze({
    storage: 0,
    cookies: 0,
    indexedDb: 0,
    cacheStorage: 0,
    serviceWorkers: 0,
    workers: 0,
    streams: 0,
    timers: 0,
    effects: 0,
    authSessions: 0,
  });

const canary = (
  residual: DeterministicIsolationResidual
): DeterministicIsolationCanary => {
  const readCount = (value: number, label: string): number =>
    readDeterministicRuntimeNonNegativeInteger(value, label);
  const normalized = Object.freeze({
    storage: readCount(residual.storage, 'Residual storage count'),
    cookies: readCount(residual.cookies, 'Residual cookie count'),
    indexedDb: readCount(residual.indexedDb, 'Residual IndexedDB count'),
    cacheStorage: readCount(
      residual.cacheStorage,
      'Residual Cache Storage count'
    ),
    serviceWorkers: readCount(
      residual.serviceWorkers,
      'Residual service worker count'
    ),
    workers: readCount(residual.workers, 'Residual worker count'),
    streams: readCount(residual.streams, 'Residual stream count'),
    timers: readCount(residual.timers, 'Residual timer count'),
    effects: readCount(residual.effects, 'Residual effect count'),
    authSessions: readCount(
      residual.authSessions,
      'Residual auth session count'
    ),
  });
  return Object.freeze({
    clean: Object.values(normalized).every((count) => count === 0),
    residual: normalized,
  });
};

const defaultDeclarations = (
  implementationDigest: string
): readonly DeterministicRuntimeControlDeclaration[] =>
  Object.freeze(
    DETERMINISTIC_RUNTIME_CONTROL_IDS.map((controlId) =>
      Object.freeze({
        controlId,
        status: 'supported' as const,
        implementationDigest,
      })
    )
  );

/**
 * Creates a provider adapter with the same preflight, reset, application,
 * cleanup, and residual-canary lifecycle used by Browser/Remote/Export/CI.
 */
export const createDeterministicRuntimeProvider = (
  input: CreateDeterministicRuntimeProviderInput
): DeterministicRuntimeProvider => {
  const descriptor = Object.freeze({
    id: readDeterministicRuntimeIdentity(
      input.id,
      'Deterministic runtime provider id'
    ),
    version: readDeterministicRuntimeIdentity(
      input.version,
      'Deterministic runtime provider version'
    ),
    surface: input.surface,
  });
  const snapshot = createDeterministicRuntimeCapabilitySnapshot({
    providerId: descriptor.id,
    providerVersion: descriptor.version,
    implementationDigest: input.implementationDigest,
    controls: input.controls ?? defaultDeclarations(input.implementationDigest),
  });
  return Object.freeze({
    descriptor,
    inspect: () => snapshot,
    async startAttempt({ attemptId, plan }) {
      const normalizedAttemptId = readDeterministicRuntimeIdentity(
        attemptId,
        'Deterministic runtime attempt id'
      );
      if (descriptor.surface !== plan.cell.surface) {
        return Object.freeze({
          status: 'blocked',
          code: 'control-preflight-failed',
          issues: Object.freeze([
            Object.freeze({
              controlId: 'capability-snapshot' as const,
              status: 'mismatch' as const,
              reason: `Provider surface ${descriptor.surface} cannot execute plan cell ${plan.cell.surface}.`,
            }),
          ]),
        });
      }
      const capabilitySnapshot = snapshot;
      let preflight: DeterministicRuntimePreflightResult;
      try {
        preflight = preflightDeterministicRuntimeControls(
          plan,
          capabilitySnapshot
        );
      } catch {
        return Object.freeze({
          status: 'blocked',
          code: 'control-preflight-failed',
          issues: Object.freeze([
            Object.freeze({
              controlId: 'profile-digest' as const,
              status: 'mismatch' as const,
              reason: 'The deterministic control plan is invalid.',
            }),
          ]),
        });
      }
      if (preflight.status === 'blocked') {
        return Object.freeze({
          status: 'blocked',
          code: 'control-preflight-failed',
          issues: preflight.issues,
        });
      }
      const namespace = `${descriptor.id}:${normalizedAttemptId}`;
      const blockAfterCleanup = async (
        result: Extract<
          DeterministicRuntimeAttemptStartResult,
          Readonly<{ status: 'blocked' }>
        >
      ): Promise<DeterministicRuntimeAttemptStartResult> => {
        try {
          await input.hooks?.cleanup?.({ namespace, plan });
          const cleanupCanary = canary(
            (await input.hooks?.probe?.({
              namespace,
              phase: 'after-cleanup',
            })) ?? emptyResidual()
          );
          if (!cleanupCanary.clean) {
            return Object.freeze({
              status: 'blocked',
              code: 'isolation-canary-failed',
              canary: cleanupCanary,
            });
          }
          return Object.freeze(result);
        } catch {
          return Object.freeze({
            status: 'blocked',
            code: 'provider-control-failed',
          });
        }
      };
      let initialCanary: DeterministicIsolationCanary;
      try {
        await input.hooks?.reset?.({ namespace, plan });
        initialCanary = canary(
          (await input.hooks?.probe?.({
            namespace,
            phase: 'after-reset',
          })) ?? emptyResidual()
        );
      } catch {
        return blockAfterCleanup(
          Object.freeze({
            status: 'blocked',
            code: 'provider-control-failed',
          })
        );
      }
      if (!initialCanary.clean) {
        return blockAfterCleanup(
          Object.freeze({
            status: 'blocked',
            code: 'isolation-canary-failed',
            canary: initialCanary,
          })
        );
      }
      let applied: Readonly<{
        appliedControlDigest: string;
        fontReady?: boolean;
      }>;
      try {
        applied =
          (await input.hooks?.apply?.({
            namespace,
            plan,
            expectedControlDigest: plan.controlDigest,
          })) ??
          Object.freeze({
            appliedControlDigest: plan.controlDigest,
            fontReady: true,
          });
      } catch {
        return blockAfterCleanup(
          Object.freeze({
            status: 'blocked',
            code: 'provider-control-failed',
          })
        );
      }
      if (applied.appliedControlDigest !== plan.controlDigest) {
        return blockAfterCleanup(
          Object.freeze({
            status: 'blocked',
            code: 'control-application-mismatch',
          })
        );
      }
      if (
        plan.rendering.fontReadiness === 'required' &&
        applied.fontReady === false
      ) {
        return blockAfterCleanup(
          Object.freeze({
            status: 'blocked',
            code: 'font-readiness-failed',
          })
        );
      }
      const clock = createClock(plan);
      const fence = createDeterministicAttemptFence();
      let cleaned = false;
      const session: DeterministicRuntimeSession = Object.freeze({
        attemptId: normalizedAttemptId,
        applied: Object.freeze({
          profileDigest: plan.profileDigest,
          controlDigest: plan.controlDigest,
          capabilitySnapshotDigest: capabilitySnapshot.snapshotDigest,
          cellId: plan.cell.id,
          namespace,
        }),
        clock,
        random: createRandom(plan),
        identifiers: createIdentifiers(plan),
        scheduler: createDeterministicScheduler({
          maximumTurns: plan.scheduler.maximumTurns,
          maximumTasks: plan.scheduler.maximumTurns * 4,
          clock,
        }),
        network: createNetwork(plan, clock),
        fence,
        initialCanary,
        async cleanup() {
          try {
            if (!cleaned) {
              cleaned = true;
              fence.cancel();
              await input.hooks?.cleanup?.({ namespace, plan });
            }
            return canary(
              (await input.hooks?.probe?.({
                namespace,
                phase: 'after-cleanup',
              })) ?? emptyResidual()
            );
          } catch {
            return canary({
              ...emptyResidual(),
              effects: 1,
            });
          }
        },
      });
      return Object.freeze({ status: 'ready', session });
    },
  });
};

export const createExportDeterministicRuntimeProvider = (
  input: CreateControlledSurfaceRuntimeProviderInput
): DeterministicRuntimeProvider =>
  createDeterministicRuntimeProvider({
    ...input,
    id: input.id ?? 'prodivix.export.deterministic-replay',
    version: input.version ?? '1',
    surface: 'export',
  });

export const createCiDeterministicRuntimeProvider = (
  input: CreateControlledSurfaceRuntimeProviderInput
): DeterministicRuntimeProvider =>
  createDeterministicRuntimeProvider({
    ...input,
    id: input.id ?? 'prodivix.ci.deterministic-replay',
    version: input.version ?? '1',
    surface: 'ci',
  });
