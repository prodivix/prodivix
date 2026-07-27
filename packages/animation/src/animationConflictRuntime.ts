import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';

export type AnimationRuntimePropertyKind =
  'number' | 'transform' | 'filter' | 'string' | 'shader';

export type AnimationConflictMode = 'replace' | 'queue' | 'add' | 'reject';

export type AnimationRuntimePropertyDescriptor = Readonly<{
  propertyId: string;
  kind: AnimationRuntimePropertyKind;
  supportedModes: readonly AnimationConflictMode[];
}>;

export type AnimationSemanticEffectTarget = Readonly<{
  targetId: string;
  targetDocumentId: string;
  targetNodeId: string;
  propertyId: string;
}>;

export type AnimationConflictValue = number | string | readonly number[];

export type AnimationConflictContributor = Readonly<{
  ownerId: string;
  generation: number;
  priority: number;
  mode: AnimationConflictMode;
}>;

export type AnimationConflictRuntimeAdapter = Readonly<{
  commit(
    input: Readonly<{
      target: AnimationSemanticEffectTarget;
      property: AnimationRuntimePropertyDescriptor;
      value: AnimationConflictValue | null;
      contributors: readonly AnimationConflictContributor[];
    }>
  ): void | Promise<void>;
}>;

export type AnimationConflictIssue = Readonly<{
  code:
    | 'target-unresolved'
    | 'property-unsupported'
    | 'mode-unsupported'
    | 'value-invalid'
    | 'conflict-rejected'
    | 'generation-stale'
    | 'queue-budget-exceeded'
    | 'lease-released';
  safeMessage: string;
}>;

export type AnimationConflictLease = Readonly<{
  ownerId: string;
  generation: number;
  target: AnimationSemanticEffectTarget;
  property: AnimationRuntimePropertyDescriptor;
  apply(
    value: AnimationConflictValue
  ): Promise<
    | Readonly<{ ok: true }>
    | Readonly<{ ok: false; issue: AnimationConflictIssue }>
  >;
  release(): Promise<void>;
}>;

export type AnimationConflictCoordinator = Readonly<{
  acquire(
    input: Readonly<{
      targetId: string;
      propertyId: string;
      ownerId: string;
      generation: number;
      priority?: number;
      mode: AnimationConflictMode;
    }>
  ): Promise<
    | Readonly<{ ok: true; lease: AnimationConflictLease }>
    | Readonly<{ ok: false; issue: AnimationConflictIssue }>
  >;
  snapshot(): readonly Readonly<{
    targetId: string;
    propertyId: string;
    contributors: readonly AnimationConflictContributor[];
    queued: number;
  }>[];
}>;

export type AnimationRuntimePropertyRegistry = Readonly<{
  get(propertyId: string): AnimationRuntimePropertyDescriptor | null;
}>;

export const createAnimationRuntimePropertyRegistry = (
  descriptors: readonly AnimationRuntimePropertyDescriptor[]
): AnimationRuntimePropertyRegistry => {
  const byId = new Map<string, AnimationRuntimePropertyDescriptor>();
  for (const descriptor of [...descriptors].sort((left, right) =>
    compareUnicodeCodePoints(left.propertyId, right.propertyId)
  )) {
    if (
      !descriptor.propertyId.trim() ||
      byId.has(descriptor.propertyId) ||
      descriptor.supportedModes.length === 0
    ) {
      throw new TypeError(
        'Animation runtime properties require unique identity and modes.'
      );
    }
    byId.set(
      descriptor.propertyId,
      Object.freeze({
        ...descriptor,
        supportedModes: Object.freeze([...new Set(descriptor.supportedModes)]),
      })
    );
  }
  return Object.freeze({
    get(propertyId: string) {
      return byId.get(propertyId) ?? null;
    },
  });
};

type ActiveContribution = {
  token: symbol;
  contributor: AnimationConflictContributor;
  value?: AnimationConflictValue;
  active: boolean;
};

type QueuedAcquisition = Readonly<{
  input: Parameters<AnimationConflictCoordinator['acquire']>[0];
  resolve(
    result: Awaited<ReturnType<AnimationConflictCoordinator['acquire']>>
  ): void;
}>;

type TargetState = {
  target: AnimationSemanticEffectTarget;
  property: AnimationRuntimePropertyDescriptor;
  active: ActiveContribution[];
  queue: QueuedAcquisition[];
};

const issue = (
  code: AnimationConflictIssue['code'],
  safeMessage: string
): Readonly<{ ok: false; issue: AnimationConflictIssue }> =>
  Object.freeze({
    ok: false,
    issue: Object.freeze({ code, safeMessage }),
  });

const stableContributors = (
  contributions: readonly ActiveContribution[]
): ActiveContribution[] =>
  [...contributions].sort(
    (left, right) =>
      right.contributor.priority - left.contributor.priority ||
      compareUnicodeCodePoints(
        left.contributor.ownerId,
        right.contributor.ownerId
      ) ||
      right.contributor.generation - left.contributor.generation
  );

const validValue = (
  kind: AnimationRuntimePropertyKind,
  value: AnimationConflictValue
): boolean => {
  if (kind === 'number')
    return typeof value === 'number' && Number.isFinite(value);
  if (kind === 'transform') {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 32 &&
      value.every((part) => Number.isFinite(part))
    );
  }
  return typeof value === 'string' && value.length <= 16_384;
};

const resolveValue = (state: TargetState): AnimationConflictValue | null => {
  const applied = stableContributors(state.active).filter(
    (contribution) => contribution.value !== undefined
  );
  if (applied.length === 0) return null;
  if (applied[0]!.contributor.mode !== 'add') return applied[0]!.value ?? null;
  if (state.property.kind === 'number') {
    return applied.reduce(
      (sum, contribution) => sum + (contribution.value as number),
      0
    );
  }
  const vectors = applied.map(
    (contribution) => contribution.value as readonly number[]
  );
  const width = Math.max(...vectors.map((vector) => vector.length));
  return Object.freeze(
    Array.from({ length: width }, (_, index) =>
      vectors.reduce((sum, vector) => sum + (vector[index] ?? 0), 0)
    )
  );
};

/**
 * Arbitrates target/property contributors without giving any lease permission
 * to clear another owner or a newer generation.
 */
export const createAnimationConflictCoordinator = (input: {
  properties: AnimationRuntimePropertyRegistry;
  resolveTarget(targetId: string): AnimationSemanticEffectTarget | null;
  adapter: AnimationConflictRuntimeAdapter;
  maximumQueuedPerTarget?: number;
}): AnimationConflictCoordinator => {
  const states = new Map<string, TargetState>();
  const latestGeneration = new Map<string, number>();
  const maximumQueuedPerTarget = Math.max(
    1,
    Math.trunc(input.maximumQueuedPerTarget ?? 128)
  );
  const stateKey = (targetId: string, propertyId: string): string =>
    `${targetId}\u0000${propertyId}`;
  const generationKey = (
    targetId: string,
    propertyId: string,
    ownerId: string
  ): string => `${stateKey(targetId, propertyId)}\u0000${ownerId}`;

  const commit = async (state: TargetState): Promise<void> => {
    const active = stableContributors(state.active).filter(
      (contribution) => contribution.active
    );
    state.active = active;
    await input.adapter.commit({
      target: state.target,
      property: state.property,
      value: resolveValue(state),
      contributors: Object.freeze(
        active.map((contribution) => contribution.contributor)
      ),
    });
  };

  const acquireNow = async (
    acquisition: Parameters<AnimationConflictCoordinator['acquire']>[0],
    state: TargetState
  ): Promise<Awaited<ReturnType<AnimationConflictCoordinator['acquire']>>> => {
    const generationIdentity = generationKey(
      acquisition.targetId,
      acquisition.propertyId,
      acquisition.ownerId
    );
    const latest = latestGeneration.get(generationIdentity) ?? -1;
    if (
      !Number.isSafeInteger(acquisition.generation) ||
      acquisition.generation < 0 ||
      acquisition.generation < latest
    ) {
      return issue(
        'generation-stale',
        'Animation contributor generation is stale.'
      );
    }
    const priority = acquisition.priority ?? 0;
    if (!Number.isSafeInteger(priority)) {
      return issue('value-invalid', 'Animation priority must be an integer.');
    }
    if (!state.property.supportedModes.includes(acquisition.mode)) {
      return issue(
        'mode-unsupported',
        'Animation property does not support the requested conflict mode.'
      );
    }
    const existing = state.active.filter((candidate) => candidate.active);
    if (acquisition.mode === 'reject' && existing.length > 0) {
      return issue(
        'conflict-rejected',
        'Animation target already has an active contributor.'
      );
    }
    if (acquisition.mode === 'add') {
      if (
        (state.property.kind !== 'number' &&
          state.property.kind !== 'transform') ||
        existing.some((candidate) => candidate.contributor.mode !== 'add')
      ) {
        return issue(
          'mode-unsupported',
          'Additive composition is limited to compatible numeric and transform properties.'
        );
      }
    }
    if (acquisition.mode === 'replace' && existing.length > 0) {
      const contender = Object.freeze({
        ownerId: acquisition.ownerId,
        generation: acquisition.generation,
        priority,
        mode: acquisition.mode,
      });
      const winner = stableContributors([
        ...existing,
        {
          token: Symbol('animation-contender'),
          contributor: contender,
          active: true,
        },
      ])[0]!;
      if (winner.contributor !== contender) {
        return issue(
          'conflict-rejected',
          'A higher-priority Animation contributor owns this property.'
        );
      }
      existing.forEach((candidate) => {
        candidate.active = false;
      });
      state.active = state.active.filter((candidate) => candidate.active);
    } else if (
      acquisition.mode !== 'add' &&
      acquisition.mode !== 'reject' &&
      existing.length > 0
    ) {
      return issue(
        'conflict-rejected',
        'Animation target has an incompatible active contributor.'
      );
    }

    if (acquisition.generation > latest) {
      for (const candidate of state.active) {
        if (
          candidate.contributor.ownerId === acquisition.ownerId &&
          candidate.contributor.generation < acquisition.generation
        ) {
          candidate.active = false;
        }
      }
      state.active = state.active.filter((candidate) => candidate.active);
      latestGeneration.set(generationIdentity, acquisition.generation);
    }
    const active: ActiveContribution = {
      token: Symbol('animation-conflict-lease'),
      contributor: Object.freeze({
        ownerId: acquisition.ownerId,
        generation: acquisition.generation,
        priority,
        mode: acquisition.mode,
      }),
      active: true,
    };
    state.active.push(active);

    let released = false;
    const lease: AnimationConflictLease = Object.freeze({
      ownerId: acquisition.ownerId,
      generation: acquisition.generation,
      target: state.target,
      property: state.property,
      async apply(value) {
        if (released || !active.active) {
          return issue(
            'lease-released',
            'Animation conflict lease is no longer active.'
          );
        }
        if (!validValue(state.property.kind, value)) {
          return issue(
            'value-invalid',
            'Animation value is incompatible with the property registry.'
          );
        }
        active.value = Array.isArray(value) ? Object.freeze([...value]) : value;
        await commit(state);
        return Object.freeze({ ok: true as const });
      },
      async release() {
        if (released) return;
        released = true;
        active.active = false;
        state.active = state.active.filter(
          (candidate) => candidate.active && candidate.token !== active.token
        );
        await commit(state);
        const next = state.queue.shift();
        if (next) {
          next.resolve(await acquireNow(next.input, state));
        }
      },
    });
    return Object.freeze({ ok: true as const, lease });
  };

  const coordinator: AnimationConflictCoordinator = Object.freeze({
    async acquire(acquisition) {
      const target = input.resolveTarget(acquisition.targetId);
      if (!target) {
        return issue(
          'target-unresolved',
          'Animation semantic effect target cannot be resolved.'
        );
      }
      const property = input.properties.get(acquisition.propertyId);
      if (!property || target.propertyId !== property.propertyId) {
        return issue(
          'property-unsupported',
          'Animation property is not registered for this semantic target.'
        );
      }
      const key = stateKey(acquisition.targetId, acquisition.propertyId);
      const state =
        states.get(key) ??
        ({
          target,
          property,
          active: [],
          queue: [],
        } satisfies TargetState);
      states.set(key, state);
      if (acquisition.mode === 'queue' && state.active.length > 0) {
        if (state.queue.length >= maximumQueuedPerTarget) {
          return issue(
            'queue-budget-exceeded',
            'Animation contributor queue budget is exhausted.'
          );
        }
        return new Promise((resolve) => {
          state.queue.push(Object.freeze({ input: acquisition, resolve }));
        });
      }
      return acquireNow(acquisition, state);
    },
    snapshot() {
      return Object.freeze(
        [...states.values()]
          .sort((left, right) =>
            compareUnicodeCodePoints(
              stateKey(left.target.targetId, left.property.propertyId),
              stateKey(right.target.targetId, right.property.propertyId)
            )
          )
          .map((state) =>
            Object.freeze({
              targetId: state.target.targetId,
              propertyId: state.property.propertyId,
              contributors: Object.freeze(
                stableContributors(state.active).map(
                  (contribution) => contribution.contributor
                )
              ),
              queued: state.queue.length,
            })
          )
      );
    },
  });
  return coordinator;
};
