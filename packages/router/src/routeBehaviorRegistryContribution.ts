import {
  BEHAVIOR_EMPTY_SCHEMA_DIGEST,
  readBehaviorJsonValue,
  type BehaviorJsonValue,
  type BehaviorRegistryContribution,
  type BehaviorRegistryDescriptor,
  type BehaviorRuntimeCapabilityAdapter,
  type BehaviorRuntimeInvocation,
} from '@prodivix/behavior';
import { isSafeNavigateTo } from './routeNavigation';
import type {
  RouteLifecycleCoordinator,
  RouteNavigationKind,
} from './routeLifecycle';

const descriptor = (
  kind: string,
  targetCapability: string,
  effect: BehaviorRegistryDescriptor['effect']
): BehaviorRegistryDescriptor =>
  Object.freeze({
    kind,
    owner: 'router',
    inputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
    outputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
    targetCapability,
    runtimeZones: Object.freeze(['client', 'test'] as const),
    effect,
    cancellation: 'cooperative',
    determinism: 'controlled',
    sourceTraceResolverId: 'router.route-source',
    redactionPolicyId: 'router.public-route-data',
  });

export const ROUTE_BEHAVIOR_REGISTRY_CONTRIBUTION: BehaviorRegistryContribution =
  Object.freeze({
    contributorId: 'core.router',
    triggers: Object.freeze([
      descriptor('route.entered', 'behavior:route:lifecycle', 'read'),
      descriptor('route.left', 'behavior:route:lifecycle', 'read'),
      descriptor('route.param.changed', 'behavior:route:lifecycle', 'read'),
    ]),
    actions: Object.freeze([
      descriptor('route.navigate', 'behavior:route:navigate', 'write'),
      descriptor('route.replace', 'behavior:route:navigate', 'write'),
      descriptor('route.back', 'behavior:route:navigate', 'write'),
      descriptor('route.forward', 'behavior:route:navigate', 'write'),
    ]),
    observations: Object.freeze([
      descriptor('route.location', 'behavior:route:location', 'read'),
    ]),
  });

export type RouteBehaviorNavigationResult =
  | Readonly<{
      status: 'completed';
      location: BehaviorJsonValue;
    }>
  | Readonly<{
      status: 'cancelled';
      reason?: string;
    }>
  | Readonly<{
      status: 'failed';
      code: string;
      safeMessage: string;
    }>;

export type RouteBehaviorRuntimePort = Readonly<{
  navigate(
    input: Readonly<{
      invocationId: string;
      path?: string;
      kind: RouteNavigationKind;
      target: NonNullable<BehaviorRuntimeInvocation['target']>;
      signal: BehaviorRuntimeInvocation['signal'];
    }>
  ): RouteBehaviorNavigationResult | Promise<RouteBehaviorNavigationResult>;
  readLocation(
    input: Readonly<{
      target: NonNullable<BehaviorRuntimeInvocation['target']>;
      workspaceRevision: number;
    }>
  ): BehaviorJsonValue | Promise<BehaviorJsonValue>;
}>;

/**
 * Keeps navigation semantics behind the Router owner while Behavior schedules
 * only the provider-neutral capability invocation.
 */
export const createRouteBehaviorRuntimeAdapters = (
  port: RouteBehaviorRuntimePort
): readonly BehaviorRuntimeCapabilityAdapter[] => {
  const createNavigateAdapter = (
    capabilityId:
      'route.navigate' | 'route.replace' | 'route.back' | 'route.forward',
    kind: RouteNavigationKind
  ): BehaviorRuntimeCapabilityAdapter =>
    Object.freeze({
      capabilityId,
      owner: 'router',
      async invoke(invocation) {
        const pathRequired =
          capabilityId === 'route.navigate' || capabilityId === 'route.replace';
        if (
          !invocation.target ||
          (pathRequired &&
            (typeof invocation.input !== 'string' ||
              !isSafeNavigateTo(invocation.input))) ||
          (!pathRequired &&
            invocation.input !== undefined &&
            (typeof invocation.input !== 'string' ||
              !isSafeNavigateTo(invocation.input)))
        ) {
          return Object.freeze({
            status: 'failed',
            error: Object.freeze({
              code: 'route-navigation-input-invalid',
              safeMessage:
                'Route navigation requires a safe typed path and semantic target.',
            }),
          });
        }
        const result = await port.navigate({
          invocationId: invocation.invocationId,
          ...(typeof invocation.input === 'string'
            ? { path: invocation.input }
            : {}),
          kind,
          target: invocation.target,
          signal: invocation.signal,
        });
        if (result.status === 'cancelled') {
          return Object.freeze({
            status: 'cancelled',
            ...(result.reason ? { reason: result.reason } : {}),
          });
        }
        if (result.status === 'failed') {
          return Object.freeze({
            status: 'failed',
            error: Object.freeze({
              code: result.code,
              safeMessage: result.safeMessage,
            }),
          });
        }
        const location = readBehaviorJsonValue(result.location);
        return location === undefined
          ? Object.freeze({
              status: 'failed' as const,
              error: Object.freeze({
                code: 'route-location-invalid',
                safeMessage:
                  'Router returned an invalid or oversized location value.',
              }),
            })
          : Object.freeze({
              status: 'succeeded' as const,
              output: location,
            });
      },
    });

  const observeLocation: BehaviorRuntimeCapabilityAdapter = Object.freeze({
    capabilityId: 'route.location',
    owner: 'router',
    async invoke(invocation) {
      if (!invocation.target) {
        return Object.freeze({
          status: 'failed',
          error: Object.freeze({
            code: 'route-location-target-missing',
            safeMessage:
              'Route location observation requires a semantic target.',
          }),
        });
      }
      const location = readBehaviorJsonValue(
        await port.readLocation({
          target: invocation.target,
          workspaceRevision: invocation.workspaceRevision,
        })
      );
      return location === undefined
        ? Object.freeze({
            status: 'failed' as const,
            error: Object.freeze({
              code: 'route-location-invalid',
              safeMessage:
                'Router returned an invalid or oversized location value.',
            }),
          })
        : Object.freeze({
            status: 'succeeded' as const,
            output: location,
          });
    },
  });

  return Object.freeze([
    createNavigateAdapter('route.navigate', 'push'),
    createNavigateAdapter('route.replace', 'replace'),
    createNavigateAdapter('route.back', 'back'),
    createNavigateAdapter('route.forward', 'forward'),
    observeLocation,
  ]);
};

export const createRouteBehaviorRuntimePortFromLifecycle = (
  coordinator: RouteLifecycleCoordinator
): RouteBehaviorRuntimePort =>
  Object.freeze({
    async navigate({ path, kind, signal }) {
      if (!path) {
        return Object.freeze({
          status: 'failed' as const,
          code: 'route-history-path-unavailable',
          safeMessage:
            'The lifecycle adapter requires the resolved back/forward path.',
        });
      }
      const result = await coordinator.navigate({
        path,
        kind,
        signal: {
          get aborted() {
            return signal.aborted;
          },
          get reason() {
            return signal.aborted ? 'behavior-cancelled' : undefined;
          },
        },
      });
      if (result.status === 'cancelled') {
        return Object.freeze({
          status: 'cancelled' as const,
          reason: result.reasonCode,
        });
      }
      if (result.status !== 'completed') {
        return Object.freeze({
          status: 'failed' as const,
          code: `route-${result.status}`,
          safeMessage: `Route lifecycle stopped with ${result.reasonCode}.`,
        });
      }
      return Object.freeze({
        status: 'completed' as const,
        location: Object.freeze({
          path: result.location.path,
          routeNodeId: result.location.routeNodeId,
          params: result.location.params,
          search: result.location.search,
          generation: result.generation,
        }),
      });
    },
    readLocation() {
      const routeSnapshot = coordinator.snapshot();
      return routeSnapshot.current
        ? Object.freeze({
            path: routeSnapshot.current.path,
            routeNodeId: routeSnapshot.current.routeNodeId,
            params: routeSnapshot.current.params,
            search: routeSnapshot.current.search,
            generation: routeSnapshot.generation,
          })
        : null;
    },
  });
