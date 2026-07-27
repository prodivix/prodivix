import { describe, expect, it } from 'vitest';
import type { BehaviorRuntimeInvocation } from '@prodivix/behavior';
import {
  createRouteBehaviorRuntimeAdapters,
  type RouteBehaviorRuntimePort,
} from './index';

const target = Object.freeze({
  targetId: 'route-target',
  semanticSymbolId: 'route-symbol',
  capability: 'behavior:route:navigate',
  source: Object.freeze({
    workspaceDocumentId: 'workspace',
    path: '/routes/catalog',
  }),
});

const invocation = (
  capabilityId: string,
  overrides: Partial<BehaviorRuntimeInvocation> = {}
): BehaviorRuntimeInvocation =>
  Object.freeze({
    invocationId: `attempt:${capabilityId}`,
    attemptId: 'attempt',
    mode: capabilityId === 'route.location' ? 'observation' : 'action',
    workspaceRevision: 4,
    programDigest: `sha256-${'3'.repeat(64)}`,
    instructionId: `instruction:${capabilityId}`,
    stepId: capabilityId,
    operation: capabilityId,
    capabilityId,
    input: '/catalog/p2',
    target,
    source: target.source,
    signal: Object.freeze({ aborted: false }),
    readStepOutput: () => undefined,
    ...overrides,
  });

describe('Route Behavior runtime contribution', () => {
  it('delegates navigation and location observation to one Router-owned port', async () => {
    let location = '/';
    const port: RouteBehaviorRuntimePort = {
      navigate(input) {
        location = input.path ?? '/';
        return { status: 'completed', location };
      },
      readLocation: () => location,
    };
    const adapters = createRouteBehaviorRuntimeAdapters(port);
    const adapter = (capabilityId: string) =>
      adapters.find((candidate) => candidate.capabilityId === capabilityId)!;
    await expect(
      adapter('route.navigate').invoke(invocation('route.navigate'))
    ).resolves.toEqual({
      status: 'succeeded',
      output: '/catalog/p2',
    });
    await expect(
      adapter('route.location').invoke(
        invocation('route.location', {
          input: undefined,
          target: {
            ...target,
            capability: 'behavior:route:location',
          },
        })
      )
    ).resolves.toEqual({
      status: 'succeeded',
      output: '/catalog/p2',
    });
  });

  it('rejects an untyped navigation target before calling the port', async () => {
    let called = false;
    const adapters = createRouteBehaviorRuntimeAdapters({
      navigate: () => {
        called = true;
        return { status: 'completed', location: '/' };
      },
      readLocation: () => '/',
    });
    const navigate = adapters.find(
      (candidate) => candidate.capabilityId === 'route.navigate'
    )!;
    await expect(
      navigate.invoke(
        invocation('route.navigate', { input: 'javascript:alert(1)' })
      )
    ).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'route-navigation-input-invalid' },
    });
    expect(called).toBe(false);
  });
});
