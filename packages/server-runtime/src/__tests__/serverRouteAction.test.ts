import { describe, expect, it } from 'vitest';
import {
  createServerRouteActionInput,
  readServerRouteActionInput,
  SERVER_ROUTE_ACTION_INPUT_FORMAT,
} from '../index';

describe('Server Route action input', () => {
  it('normalizes one typed framework-neutral action payload', () => {
    expect(
      createServerRouteActionInput({
        route: {
          routeNodeId: 'route-profile',
          currentPath: '/profiles/user-1',
          matchedPath: '/profiles/:id',
          params: { id: 'user-1' },
          searchParams: { tab: 'settings', filter: ['active', 'owned'] },
          hash: '#details',
        },
        submission: {
          method: 'PATCH',
          encType: 'application/json',
          value: { displayName: 'Ada' },
        },
      })
    ).toEqual({
      format: SERVER_ROUTE_ACTION_INPUT_FORMAT,
      route: {
        routeNodeId: 'route-profile',
        currentPath: '/profiles/user-1',
        matchedPath: '/profiles/:id',
        params: { id: 'user-1' },
        searchParams: { filter: ['active', 'owned'], tab: 'settings' },
        hash: '#details',
      },
      submission: {
        method: 'PATCH',
        encType: 'application/json',
        value: { displayName: 'Ada' },
      },
    });
  });

  it('rejects unknown fields, unsafe paths, and non-ExecutionValue input', () => {
    const base = {
      format: SERVER_ROUTE_ACTION_INPUT_FORMAT,
      route: {
        routeNodeId: 'route-profile',
        currentPath: '/profiles/user-1',
        matchedPath: '/profiles/:id',
        params: { id: 'user-1' },
        searchParams: {},
      },
      submission: {
        method: 'POST',
        encType: 'application/json',
        value: {},
      },
    } as const;
    expect(
      readServerRouteActionInput({ ...base, token: 'must-not-pass' })
    ).toBeUndefined();
    expect(
      readServerRouteActionInput({
        ...base,
        route: { ...base.route, currentPath: '//evil.example' },
      })
    ).toBeUndefined();
    expect(
      readServerRouteActionInput({
        ...base,
        submission: { ...base.submission, value: Number.NaN },
      })
    ).toBeUndefined();
  });
});
