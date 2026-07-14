import { describe, expect, it } from 'vitest';
import { createCodeSlotRegistry } from '@prodivix/authoring';
import { createRouteRuntimeCodeSlotProvider } from '@prodivix/router';

describe('createRouteRuntimeCodeSlotProvider', () => {
  it('exposes route runtime code slots through the code slot registry', () => {
    const provider = createRouteRuntimeCodeSlotProvider('workspace-1', {
      version: '1',
      root: {
        id: 'root',
        children: [
          {
            id: 'route-profile',
            segment: 'profile',
          },
        ],
      },
    });
    const registry = createCodeSlotRegistry();

    registry.register(provider);

    const ownerRef = { kind: 'route' as const, routeId: 'route-profile' };
    expect(
      registry
        .listSlots({ surface: 'inspector', targetRef: ownerRef })
        .map((slot) => ({
          id: slot.id,
          kind: slot.kind,
          inputTypeRef: slot.inputTypeRef,
        }))
    ).toEqual([
      {
        id: 'route.route-profile.loader',
        kind: 'route-loader',
        inputTypeRef: 'RouteRuntimeContext',
      },
      {
        id: 'route.route-profile.action',
        kind: 'route-action',
        inputTypeRef: 'RouteRuntimeContext + RouteSubmitPayload',
      },
      {
        id: 'route.route-profile.guard',
        kind: 'route-guard',
        inputTypeRef: 'RouteRuntimeContext',
      },
    ]);
    expect(registry.getSlot('route.route-profile.loader')?.ownerRef).toEqual(
      ownerRef
    );
  });
});
