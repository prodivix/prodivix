import {
  flattenRouteManifest,
  type WorkspaceRouteManifest,
} from '@prodivix/shared/router';
import type {
  AuthoringContext,
  CodeSlotContract,
  CodeSlotKind,
  CodeSlotProvider,
} from '@/authoring/authoring.types';

type RouteRuntimeSlotKind = 'loader' | 'action' | 'guard';

const routeRuntimeSlots: Array<{
  key: RouteRuntimeSlotKind;
  kind: CodeSlotKind;
  outputTypeRef: string;
}> = [
  {
    key: 'loader',
    kind: 'route-loader',
    outputTypeRef: 'SerializableRouteLoaderData',
  },
  {
    key: 'action',
    kind: 'route-action',
    outputTypeRef: 'RouteActionResult',
  },
  {
    key: 'guard',
    kind: 'route-guard',
    outputTypeRef: 'RouteGuardResult',
  },
];

const createRouteRuntimeSlot = (
  routeNodeId: string,
  slot: (typeof routeRuntimeSlots)[number]
): CodeSlotContract => ({
  id: `route.${routeNodeId}.${slot.key}`,
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

export const createRouteRuntimeCodeSlotProvider = (
  manifest: WorkspaceRouteManifest
): CodeSlotProvider => {
  const slots = flattenRouteManifest(manifest).flatMap((route) =>
    routeRuntimeSlots.map((slot) => createRouteRuntimeSlot(route.id, slot))
  );
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));

  return {
    id: 'route-runtime-slots',
    source: { kind: 'route', routeId: manifest.root.id },
    listSlots(context: AuthoringContext) {
      if (context.targetRef?.kind !== 'route') return slots;
      const routeId = context.targetRef.routeId;
      return slots.filter(
        (slot) =>
          slot.ownerRef.kind === 'route' && slot.ownerRef.routeId === routeId
      );
    },
    getSlot(id: string) {
      return slotsById.get(id) ?? null;
    },
  };
};
