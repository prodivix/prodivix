import {
  createSemanticId,
  type AuthoringContext,
  type CodeSlotBindingProjection,
  type CodeSlotContract,
  type CodeSlotKind,
  type CodeSlotProvider,
} from '@prodivix/authoring';
import { flattenRouteManifest } from './routeCore';
import type {
  WorkspaceRouteCodeReference,
  WorkspaceRouteManifest,
} from './routeTypes';

type RouteRuntimeSlotKey = 'loader' | 'action' | 'guard';

const ROUTE_RUNTIME_SLOTS: readonly Readonly<{
  key: RouteRuntimeSlotKey;
  field: 'loaderRef' | 'actionRef' | 'guardRef';
  kind: CodeSlotKind;
  outputTypeRef: string;
}>[] = Object.freeze([
  {
    key: 'loader',
    field: 'loaderRef',
    kind: 'route-loader',
    outputTypeRef: 'SerializableRouteLoaderData',
  },
  {
    key: 'action',
    field: 'actionRef',
    kind: 'route-action',
    outputTypeRef: 'RouteActionResult',
  },
  {
    key: 'guard',
    field: 'guardRef',
    kind: 'route-guard',
    outputTypeRef: 'RouteGuardResult',
  },
]);

export const createRouteRuntimeCodeSlotId = (
  routeNodeId: string,
  key: RouteRuntimeSlotKey
): string => `route.${routeNodeId}.${key}`;

export const createRouteRuntimeCodeReferenceId = (
  workspaceId: string,
  routeNodeId: string,
  key: RouteRuntimeSlotKey,
  reference: WorkspaceRouteCodeReference
): string =>
  createSemanticId(
    reference.symbolId
      ? 'route-runtime-symbol-reference'
      : reference.exportName
        ? 'route-runtime-export-reference'
        : 'route-runtime-artifact-reference',
    workspaceId,
    routeNodeId,
    key
  );

const createSlot = (
  routeNodeId: string,
  slot: (typeof ROUTE_RUNTIME_SLOTS)[number]
): CodeSlotContract => ({
  id: createRouteRuntimeCodeSlotId(routeNodeId, slot.key),
  ownerRef: { kind: 'route', routeId: routeNodeId },
  kind: slot.kind,
  inputTypeRef:
    slot.key === 'action'
      ? 'RouteRuntimeContext + RouteSubmitPayload'
      : 'RouteRuntimeContext',
  outputTypeRef: slot.outputTypeRef,
  capabilityIds: ['route-runtime', `route-${slot.key}`],
  defaultPlacement: ['inspector', 'code-editor', 'issues-panel'],
});

const matchesContext = (
  context: AuthoringContext,
  routeNodeId: string,
  artifactId?: string
): boolean =>
  (!context.targetRef ||
    (context.targetRef.kind === 'route' &&
      context.targetRef.routeId === routeNodeId)) &&
  (!context.artifactId || context.artifactId === artifactId);

/** Projects route-owned runtime references without moving binding ownership. */
export const createRouteRuntimeCodeSlotProvider = (
  workspaceId: string,
  manifest: WorkspaceRouteManifest
): CodeSlotProvider => {
  const slots: CodeSlotContract[] = [];
  const bindings: CodeSlotBindingProjection[] = [];

  for (const route of flattenRouteManifest(manifest)) {
    for (const descriptor of ROUTE_RUNTIME_SLOTS) {
      const slot = createSlot(route.id, descriptor);
      slots.push(slot);
      const reference = route.node.runtime?.[descriptor.field];
      if (!reference) continue;
      bindings.push({
        binding: { slotId: slot.id, reference },
        ownerRef: slot.ownerRef,
        semanticReferenceId: createRouteRuntimeCodeReferenceId(
          workspaceId,
          route.id,
          descriptor.key,
          reference
        ),
      });
    }
  }

  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const bindingsById = new Map(
    bindings.map((projection) => [projection.binding.slotId, projection])
  );
  const routeIdBySlotId = new Map<string, string>();
  flattenRouteManifest(manifest).forEach((route) => {
    ROUTE_RUNTIME_SLOTS.forEach(({ key }) => {
      routeIdBySlotId.set(
        createRouteRuntimeCodeSlotId(route.id, key),
        route.id
      );
    });
  });

  return {
    id: 'core.route.code-slots',
    source: { kind: 'workspace' },
    listSlots(context) {
      return slots.filter((slot) => {
        const routeId = routeIdBySlotId.get(slot.id);
        return routeId ? matchesContext(context, routeId) : false;
      });
    },
    getSlot(id) {
      return slotsById.get(id) ?? null;
    },
    listBindingProjections(context) {
      return bindings.filter((projection) => {
        const routeId = routeIdBySlotId.get(projection.binding.slotId);
        return routeId
          ? matchesContext(
              context,
              routeId,
              projection.binding.reference.artifactId
            )
          : false;
      });
    },
    getBindingProjection(id) {
      return bindingsById.get(id) ?? null;
    },
  };
};
