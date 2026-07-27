import { describe, expect, it, vi } from 'vitest';
import {
  createRouteLifecycleCoordinator,
  type RouteLifecycleMatch,
  type RouteLifecyclePorts,
  type RouteLifecycleTransitionHandle,
} from './routeLifecycle';

const match = (path: string, transition = true): RouteLifecycleMatch => ({
  routeNodeId: path === '/catalog' ? 'catalog' : 'detail',
  path,
  params: {},
  search: {},
  pageDocumentId: `${path.slice(1)}-page`,
  outletId: 'app-outlet',
  ...(transition
    ? {
        transition: {
          leaveCompositionId: 'route-leave',
          enterCompositionId: 'route-enter',
          handoffMarkerId: 'route-handoff',
          sharedHandoffId: 'catalog-card',
        },
      }
    : {}),
});

const setup = (overrides: Partial<RouteLifecyclePorts> = {}) => {
  const order: string[] = [];
  const transition = (
    role: 'leave' | 'enter'
  ): RouteLifecycleTransitionHandle => ({
    async waitForMarker(markerId) {
      order.push(`${role}:marker:${markerId}`);
      return 'reached';
    },
    get completion() {
      order.push(`${role}:completed`);
      return Promise.resolve<'completed'>('completed');
    },
    cancel: vi.fn(),
  });
  const ports: RouteLifecyclePorts = {
    resolve: ({ path }) => match(path),
    guard: () => ({ status: 'allowed' }),
    load: ({ match: routeMatch }) => ({
      status: 'ready',
      data: { routeNodeId: routeMatch.routeNodeId },
    }),
    scopes: {
      prepare({ role }) {
        order.push(`${role}:prepared`);
        return {
          scopeId: `${role}-scope`,
          activate() {
            order.push(`${role}:activated`);
          },
          restore() {
            order.push(`${role}:restored`);
          },
          dispose() {
            order.push(`${role}:disposed`);
          },
        };
      },
    },
    transitions: {
      start({ role }) {
        order.push(`${role}:started`);
        return transition(role);
      },
    },
    outlet: {
      commit() {
        order.push('outlet:committed');
      },
    },
    ...overrides,
  };
  return {
    order,
    ports,
    coordinator: createRouteLifecycleCoordinator(ports),
  };
};

describe('Route lifecycle coordinator', () => {
  it('waits for the semantic handoff before committing and materializes loader data', async () => {
    const { coordinator, order } = setup();
    const first = await coordinator.navigate({
      path: '/catalog',
      kind: 'deep-link',
    });
    expect(first).toMatchObject({
      status: 'completed',
      generation: 1,
      location: { routeNodeId: 'catalog' },
      data: { routeNodeId: 'catalog' },
    });
    expect(order.indexOf('enter:marker:route-handoff')).toBeLessThan(
      order.indexOf('outlet:committed')
    );
    expect(order.indexOf('outlet:committed')).toBeLessThan(
      order.indexOf('enter:completed')
    );

    order.splice(0);
    const second = await coordinator.navigate({
      path: '/detail',
      kind: 'push',
    });
    expect(second.status).toBe('completed');
    expect(
      order.filter((entry) => entry.endsWith('marker:route-handoff'))
    ).toEqual(['leave:marker:route-handoff', 'enter:marker:route-handoff']);
    expect(order.indexOf('outlet:committed')).toBeGreaterThan(
      order.indexOf('enter:marker:route-handoff')
    );
    expect(order).toContain('outgoing:disposed');
    expect(coordinator.snapshot()).toMatchObject({
      generation: 2,
      status: 'settled',
      current: { path: '/detail' },
    });
  });

  it('cancels a replaced generation and never commits its stale outlet', async () => {
    let releaseFirst: (
      value: Readonly<{ status: 'ready'; data: { id: string } }>
    ) => void = () => undefined;
    const firstLoad = new Promise<
      Readonly<{ status: 'ready'; data: { id: string } }>
    >((resolve) => {
      releaseFirst = resolve;
    });
    const commits: string[] = [];
    const { coordinator } = setup({
      load: ({ match: routeMatch }) =>
        routeMatch.path === '/catalog'
          ? firstLoad
          : { status: 'ready', data: { id: 'detail' } },
      outlet: {
        commit({ to }) {
          commits.push(to.path);
        },
      },
    });
    const stale = coordinator.navigate({ path: '/catalog', kind: 'push' });
    await Promise.resolve();
    const current = await coordinator.navigate({
      path: '/detail',
      kind: 'replace',
    });
    releaseFirst({ status: 'ready', data: { id: 'catalog' } });
    await expect(stale).resolves.toMatchObject({
      status: 'cancelled',
      generation: 1,
      reasonCode: 'navigation-replaced',
    });
    expect(current).toMatchObject({ status: 'completed', generation: 2 });
    expect(commits).toEqual(['/detail']);
  });

  it('blocks guards before loader, scope, transition, or outlet effects', async () => {
    const load = vi.fn();
    const prepare = vi.fn();
    const start = vi.fn();
    const commit = vi.fn();
    const { coordinator } = setup({
      guard: () => ({
        status: 'blocked',
        reasonCode: 'auth-required',
      }),
      load,
      scopes: { prepare },
      transitions: { start },
      outlet: { commit },
    });
    await expect(
      coordinator.navigate({ path: '/catalog', kind: 'back' })
    ).resolves.toMatchObject({
      status: 'blocked',
      reasonCode: 'auth-required',
      observations: expect.arrayContaining([
        expect.objectContaining({
          kind: 'navigation-blocked',
          navigationKind: 'back',
        }),
      ]),
    });
    expect(load).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});
