import { isSafeNavigateTo } from './routeNavigation';

export interface RouteLifecycleDataRecord {
  readonly [key: string]: RouteLifecycleData;
}

export type RouteLifecycleData =
  | null
  | boolean
  | number
  | string
  | readonly RouteLifecycleData[]
  | RouteLifecycleDataRecord;

export type RouteNavigationKind =
  'push' | 'replace' | 'back' | 'forward' | 'deep-link';

export type RouteLifecycleCancellationSignal = Readonly<{
  readonly aborted: boolean;
  readonly reason?: string;
}>;

export type RouteLifecycleMatch = Readonly<{
  routeNodeId: string;
  path: string;
  params: Readonly<Record<string, string>>;
  search: Readonly<Record<string, string | readonly string[]>>;
  pageDocumentId?: string;
  outletId: string;
  transition?: Readonly<{
    leaveCompositionId?: string;
    enterCompositionId?: string;
    handoffMarkerId: string;
    sharedHandoffId?: string;
  }>;
}>;

export type RouteLifecycleScopeLease = Readonly<{
  scopeId: string;
  activate(): void | Promise<void>;
  restore(): void | Promise<void>;
  dispose(): void | Promise<void>;
}>;

export type RouteLifecycleTransitionHandle = Readonly<{
  waitForMarker(markerId: string): Promise<'reached' | 'missing' | 'cancelled'>;
  completion: Promise<'completed' | 'cancelled' | 'failed'>;
  cancel(reason: string): void | Promise<void>;
}>;

export type RouteLifecycleObservation = Readonly<{
  sequence: number;
  generation: number;
  kind:
    | 'navigation-started'
    | 'guard-completed'
    | 'loader-completed'
    | 'scopes-prepared'
    | 'transition-started'
    | 'handoff-reached'
    | 'outlet-committed'
    | 'navigation-completed'
    | 'navigation-cancelled'
    | 'navigation-blocked'
    | 'navigation-failed';
  fromPath?: string;
  toPath: string;
  routeNodeId?: string;
  navigationKind: RouteNavigationKind;
  reasonCode?: string;
}>;

export type RouteLifecyclePorts = Readonly<{
  resolve(
    input: Readonly<{
      path: string;
      kind: RouteNavigationKind;
      generation: number;
      signal: RouteLifecycleCancellationSignal;
    }>
  ): RouteLifecycleMatch | null | Promise<RouteLifecycleMatch | null>;
  guard(
    input: Readonly<{
      from: RouteLifecycleMatch | null;
      to: RouteLifecycleMatch;
      generation: number;
      signal: RouteLifecycleCancellationSignal;
    }>
  ):
    | Readonly<{ status: 'allowed' }>
    | Readonly<{ status: 'blocked'; reasonCode: string }>
    | Promise<
        | Readonly<{ status: 'allowed' }>
        | Readonly<{ status: 'blocked'; reasonCode: string }>
      >;
  load(
    input: Readonly<{
      match: RouteLifecycleMatch;
      generation: number;
      signal: RouteLifecycleCancellationSignal;
    }>
  ):
    | Readonly<{ status: 'ready'; data?: RouteLifecycleData }>
    | Readonly<{ status: 'failed'; reasonCode: string }>
    | Promise<
        | Readonly<{ status: 'ready'; data?: RouteLifecycleData }>
        | Readonly<{ status: 'failed'; reasonCode: string }>
      >;
  scopes: Readonly<{
    prepare(
      input: Readonly<{
        role: 'outgoing' | 'incoming';
        match: RouteLifecycleMatch;
        generation: number;
        data?: RouteLifecycleData;
        signal: RouteLifecycleCancellationSignal;
      }>
    ): RouteLifecycleScopeLease | Promise<RouteLifecycleScopeLease>;
  }>;
  transitions: Readonly<{
    start(
      input: Readonly<{
        role: 'leave' | 'enter';
        compositionId: string;
        match: RouteLifecycleMatch;
        generation: number;
        sharedHandoffId?: string;
        signal: RouteLifecycleCancellationSignal;
      }>
    ): RouteLifecycleTransitionHandle | Promise<RouteLifecycleTransitionHandle>;
  }>;
  outlet: Readonly<{
    commit(
      input: Readonly<{
        from: RouteLifecycleMatch | null;
        to: RouteLifecycleMatch;
        outgoingScope: RouteLifecycleScopeLease | null;
        incomingScope: RouteLifecycleScopeLease;
        data?: RouteLifecycleData;
        generation: number;
      }>
    ): void | Promise<void>;
  }>;
  observations?: Readonly<{
    publish(observation: RouteLifecycleObservation): void | Promise<void>;
  }>;
}>;

export type RouteLifecycleNavigationResult =
  | Readonly<{
      status: 'completed';
      generation: number;
      location: RouteLifecycleMatch;
      data?: RouteLifecycleData;
      observations: readonly RouteLifecycleObservation[];
    }>
  | Readonly<{
      status: 'cancelled' | 'blocked' | 'failed';
      generation: number;
      reasonCode: string;
      observations: readonly RouteLifecycleObservation[];
    }>;

export type RouteLifecycleCoordinator = Readonly<{
  navigate(
    input: Readonly<{
      path: string;
      kind?: RouteNavigationKind;
      signal?: RouteLifecycleCancellationSignal;
    }>
  ): Promise<RouteLifecycleNavigationResult>;
  snapshot(): Readonly<{
    generation: number;
    status: 'idle' | 'navigating' | 'settled';
    current: RouteLifecycleMatch | null;
  }>;
}>;

type InternalCancellation = Readonly<{
  signal: RouteLifecycleCancellationSignal;
  abort(reason: string): void;
}>;

const createCancellation = (
  external?: RouteLifecycleCancellationSignal
): InternalCancellation => {
  let aborted = external?.aborted ?? false;
  let reason = external?.reason;
  return Object.freeze({
    signal: Object.freeze({
      get aborted() {
        return aborted || external?.aborted === true;
      },
      get reason() {
        return reason ?? external?.reason;
      },
    }),
    abort(nextReason) {
      if (aborted) return;
      aborted = true;
      reason = nextReason;
    },
  });
};

const safeReason = (reason: unknown, fallback: string): string => {
  const normalized = String(reason ?? fallback)
    .replaceAll(/[\r\n\t]+/gu, ' ')
    .trim()
    .slice(0, 256);
  return normalized || fallback;
};

/**
 * Owns one replaceable navigation generation and commits the outlet only after
 * every declared leave/enter transition reaches the same semantic handoff.
 */
export const createRouteLifecycleCoordinator = (
  ports: RouteLifecyclePorts
): RouteLifecycleCoordinator => {
  let generation = 0;
  let status: 'idle' | 'navigating' | 'settled' = 'idle';
  let current: RouteLifecycleMatch | null = null;
  let activeCancellation: InternalCancellation | null = null;

  const snapshot = () => Object.freeze({ generation, status, current });

  return Object.freeze({
    snapshot,
    async navigate(input) {
      const kind = input.kind ?? 'push';
      generation += 1;
      const navigationGeneration = generation;
      activeCancellation?.abort('navigation-replaced');
      const cancellation = createCancellation(input.signal);
      activeCancellation = cancellation;
      status = 'navigating';
      const observations: RouteLifecycleObservation[] = [];
      let sequence = 0;
      const publish = async (
        observation: Omit<RouteLifecycleObservation, 'sequence' | 'generation'>
      ): Promise<void> => {
        sequence += 1;
        const event = Object.freeze({
          sequence,
          generation: navigationGeneration,
          ...observation,
        });
        observations.push(event);
        await ports.observations?.publish(event);
      };
      const terminal = (
        terminalStatus: 'cancelled' | 'blocked' | 'failed',
        reasonCode: string
      ): RouteLifecycleNavigationResult => {
        if (generation === navigationGeneration) status = 'settled';
        return Object.freeze({
          status: terminalStatus,
          generation: navigationGeneration,
          reasonCode,
          observations: Object.freeze([...observations]),
        });
      };
      const cancelled = (): boolean =>
        cancellation.signal.aborted || generation !== navigationGeneration;
      const toPath = input.path.trim();
      await publish({
        kind: 'navigation-started',
        ...(current ? { fromPath: current.path } : {}),
        toPath,
        navigationKind: kind,
      });
      if (!isSafeNavigateTo(toPath) || !toPath.startsWith('/')) {
        await publish({
          kind: 'navigation-failed',
          toPath,
          navigationKind: kind,
          reasonCode: 'route-path-invalid',
        });
        return terminal('failed', 'route-path-invalid');
      }

      let outgoingScope: RouteLifecycleScopeLease | null = null;
      let incomingScope: RouteLifecycleScopeLease | null = null;
      const transitions: RouteLifecycleTransitionHandle[] = [];
      try {
        const match = await ports.resolve({
          path: toPath,
          kind,
          generation: navigationGeneration,
          signal: cancellation.signal,
        });
        if (!match) {
          await publish({
            kind: 'navigation-failed',
            toPath,
            navigationKind: kind,
            reasonCode: 'route-unmatched',
          });
          return terminal('failed', 'route-unmatched');
        }
        if (cancelled()) throw new Error('navigation-cancelled');
        const guard = await ports.guard({
          from: current,
          to: match,
          generation: navigationGeneration,
          signal: cancellation.signal,
        });
        await publish({
          kind: 'guard-completed',
          ...(current ? { fromPath: current.path } : {}),
          toPath: match.path,
          routeNodeId: match.routeNodeId,
          navigationKind: kind,
          ...(guard.status === 'blocked'
            ? { reasonCode: guard.reasonCode }
            : {}),
        });
        if (guard.status === 'blocked') {
          await publish({
            kind: 'navigation-blocked',
            ...(current ? { fromPath: current.path } : {}),
            toPath: match.path,
            routeNodeId: match.routeNodeId,
            navigationKind: kind,
            reasonCode: guard.reasonCode,
          });
          return terminal('blocked', guard.reasonCode);
        }
        const loaded = await ports.load({
          match,
          generation: navigationGeneration,
          signal: cancellation.signal,
        });
        if (loaded.status === 'failed') {
          await publish({
            kind: 'navigation-failed',
            ...(current ? { fromPath: current.path } : {}),
            toPath: match.path,
            routeNodeId: match.routeNodeId,
            navigationKind: kind,
            reasonCode: loaded.reasonCode,
          });
          return terminal('failed', loaded.reasonCode);
        }
        await publish({
          kind: 'loader-completed',
          ...(current ? { fromPath: current.path } : {}),
          toPath: match.path,
          routeNodeId: match.routeNodeId,
          navigationKind: kind,
        });
        if (cancelled()) throw new Error('navigation-cancelled');

        const outgoingMatch = current;
        [outgoingScope, incomingScope] = await Promise.all([
          outgoingMatch
            ? ports.scopes.prepare({
                role: 'outgoing',
                match: outgoingMatch,
                generation: navigationGeneration,
                signal: cancellation.signal,
              })
            : Promise.resolve(null),
          ports.scopes.prepare({
            role: 'incoming',
            match,
            generation: navigationGeneration,
            ...(loaded.data !== undefined ? { data: loaded.data } : {}),
            signal: cancellation.signal,
          }),
        ]);
        await publish({
          kind: 'scopes-prepared',
          ...(outgoingMatch ? { fromPath: outgoingMatch.path } : {}),
          toPath: match.path,
          routeNodeId: match.routeNodeId,
          navigationKind: kind,
        });
        if (cancelled()) throw new Error('navigation-cancelled');

        const transition = match.transition;
        if (outgoingMatch && transition?.leaveCompositionId) {
          transitions.push(
            await ports.transitions.start({
              role: 'leave',
              compositionId: transition.leaveCompositionId,
              match: outgoingMatch,
              generation: navigationGeneration,
              ...(transition.sharedHandoffId
                ? { sharedHandoffId: transition.sharedHandoffId }
                : {}),
              signal: cancellation.signal,
            })
          );
        }
        if (transition?.enterCompositionId) {
          transitions.push(
            await ports.transitions.start({
              role: 'enter',
              compositionId: transition.enterCompositionId,
              match,
              generation: navigationGeneration,
              ...(transition.sharedHandoffId
                ? { sharedHandoffId: transition.sharedHandoffId }
                : {}),
              signal: cancellation.signal,
            })
          );
        }
        if (transitions.length > 0) {
          await publish({
            kind: 'transition-started',
            ...(outgoingMatch ? { fromPath: outgoingMatch.path } : {}),
            toPath: match.path,
            routeNodeId: match.routeNodeId,
            navigationKind: kind,
          });
          const handoffMarkerId = transition?.handoffMarkerId;
          if (!handoffMarkerId) {
            throw new Error('route-handoff-marker-missing');
          }
          const handoff = await Promise.all(
            transitions.map((handle) => handle.waitForMarker(handoffMarkerId))
          );
          if (handoff.some((result) => result !== 'reached')) {
            throw new Error('route-handoff-not-reached');
          }
          await publish({
            kind: 'handoff-reached',
            ...(outgoingMatch ? { fromPath: outgoingMatch.path } : {}),
            toPath: match.path,
            routeNodeId: match.routeNodeId,
            navigationKind: kind,
          });
        }
        if (cancelled()) throw new Error('navigation-cancelled');

        await ports.outlet.commit({
          from: outgoingMatch,
          to: match,
          outgoingScope,
          incomingScope,
          ...(loaded.data !== undefined ? { data: loaded.data } : {}),
          generation: navigationGeneration,
        });
        await incomingScope.activate();
        await publish({
          kind: 'outlet-committed',
          ...(outgoingMatch ? { fromPath: outgoingMatch.path } : {}),
          toPath: match.path,
          routeNodeId: match.routeNodeId,
          navigationKind: kind,
        });
        if (transitions.length > 0) {
          const completed = await Promise.all(
            transitions.map((handle) => handle.completion)
          );
          if (completed.some((result) => result !== 'completed')) {
            throw new Error('route-transition-incomplete');
          }
        }
        if (cancelled()) throw new Error('navigation-cancelled');
        await outgoingScope?.dispose();
        current = match;
        status = 'settled';
        await publish({
          kind: 'navigation-completed',
          ...(outgoingMatch ? { fromPath: outgoingMatch.path } : {}),
          toPath: match.path,
          routeNodeId: match.routeNodeId,
          navigationKind: kind,
        });
        return Object.freeze({
          status: 'completed' as const,
          generation: navigationGeneration,
          location: match,
          ...(loaded.data !== undefined ? { data: loaded.data } : {}),
          observations: Object.freeze([...observations]),
        });
      } catch (error) {
        const reasonCode = cancelled()
          ? (cancellation.signal.reason ?? 'navigation-cancelled')
          : safeReason(error, 'route-lifecycle-failed');
        await Promise.all(
          transitions.map((handle) =>
            Promise.resolve(handle.cancel(reasonCode)).catch(() => undefined)
          )
        );
        if (incomingScope) {
          await Promise.resolve(incomingScope.dispose()).catch(() => undefined);
        }
        if (outgoingScope) {
          await Promise.resolve(outgoingScope.restore()).catch(() => undefined);
        }
        await publish({
          kind: cancelled() ? 'navigation-cancelled' : 'navigation-failed',
          ...(current ? { fromPath: current.path } : {}),
          toPath,
          navigationKind: kind,
          reasonCode,
        });
        return terminal(cancelled() ? 'cancelled' : 'failed', reasonCode);
      }
    },
  });
};
