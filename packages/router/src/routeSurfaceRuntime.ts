import { canonicalJsonText } from '@prodivix/shared/canonical';
import type {
  RouteLifecycleCancellationSignal,
  RouteLifecycleCoordinator,
  RouteLifecycleNavigationResult,
  RouteNavigationKind,
} from './routeLifecycle';

export type RouteExecutionSurface = 'preview' | 'export' | 'ci';

export type RouteLifecycleInvocationArtifact = Readonly<{
  mediaType: 'application/vnd.prodivix.route-navigation+json';
  text: string;
}>;

export type RouteSurfaceRuntimeAdapter = Readonly<{
  surface: RouteExecutionSurface;
  adapterId: string;
  invoke(
    input: Readonly<{
      coordinator: RouteLifecycleCoordinator;
      path: string;
      kind: RouteNavigationKind;
      signal?: RouteLifecycleCancellationSignal;
    }>
  ): Promise<
    Readonly<{
      surface: RouteExecutionSurface;
      adapterId: string;
      artifact: RouteLifecycleInvocationArtifact;
      result: RouteLifecycleNavigationResult;
    }>
  >;
}>;

export const createRouteSurfaceRuntimeAdapter = (
  surface: RouteExecutionSurface
): RouteSurfaceRuntimeAdapter => {
  const adapterId =
    surface === 'preview'
      ? 'route.preview.browser'
      : surface === 'export'
        ? 'route.export.snapshot'
        : 'route.ci.verification';
  return Object.freeze({
    surface,
    adapterId,
    async invoke(input) {
      const artifact = Object.freeze({
        mediaType: 'application/vnd.prodivix.route-navigation+json' as const,
        text: canonicalJsonText({
          path: input.path,
          kind: input.kind,
        }),
      });
      const request =
        surface === 'preview'
          ? { path: input.path, kind: input.kind }
          : (JSON.parse(artifact.text) as {
              path: string;
              kind: RouteNavigationKind;
            });
      return Object.freeze({
        surface,
        adapterId,
        artifact,
        result: await input.coordinator.navigate({
          ...request,
          ...(input.signal ? { signal: input.signal } : {}),
        }),
      });
    },
  });
};
