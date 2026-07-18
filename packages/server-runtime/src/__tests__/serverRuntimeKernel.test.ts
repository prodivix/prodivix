import { describe, expect, it, vi } from 'vitest';
import type { ExecutionEnvironmentResolutionLease } from '@prodivix/runtime-core';
import {
  createServerFunctionAdapterRegistry,
  executeServerFunction,
  SERVER_RUNTIME_ERROR_CODES,
  ServerRuntimeError,
  type ServerFunctionDefinition,
} from '../index';

const definition: ServerFunctionDefinition = Object.freeze({
  reference: Object.freeze({
    artifactId: 'code-auth',
    exportName: 'loadPrincipal',
  }),
  kind: 'route-loader',
  runtimeZone: 'server',
  adapterId: 'core.auth.current-principal',
  effect: 'read',
  auth: Object.freeze({
    kind: 'permission',
    permissionId: 'workspace.read',
  }),
  inputSchema: Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: ['routeId'],
    properties: { routeId: { type: 'string' } },
  }),
  outputSchema: Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: ['providerId', 'principalId'],
    properties: {
      providerId: { type: 'string' },
      principalId: { type: 'string' },
    },
  }),
});

const principal = Object.freeze({
  providerId: 'product-session',
  principalId: 'user-1',
});
const session = Object.freeze({
  providerId: 'product-session',
  principalId: 'user-1',
  sessionId: 'session-server-only',
  expiresAt: '2030-01-01T00:00:00.000Z',
});

const secretDefinition: ServerFunctionDefinition = Object.freeze({
  reference: Object.freeze({
    artifactId: 'code-signing',
    exportName: 'signPayload',
  }),
  kind: 'route-action',
  runtimeZone: 'server',
  adapterId: 'core.server.hmac-sha256',
  effect: 'read',
  auth: Object.freeze({ kind: 'authenticated' }),
  inputSchema: Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: ['payload'],
    properties: { payload: { type: 'string' } },
  }),
  outputSchema: Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: ['digest'],
    properties: { digest: { type: 'string' } },
  }),
  environment: Object.freeze({
    secretsByField: Object.freeze({
      key: Object.freeze({ bindingId: 'webhook-signing-key' }),
    }),
  }),
});

const createSecretLease = (material = 'secret-material-canary') => {
  const revoke = vi.fn();
  const useSecret = vi.fn(
    async (
      reference: Readonly<{ bindingId: string }>,
      field: string,
      consumer: (value: string) => void | Promise<void>
    ) => {
      expect(reference).toEqual({ bindingId: 'webhook-signing-key' });
      expect(field).toBe('key');
      await consumer(material);
    }
  );
  const lease = Object.freeze({
    metadata: Object.freeze({
      leaseId: 'lease-1',
      principal: Object.freeze({
        principalId: 'user-1',
        sessionId: 'session-server-only',
      }),
      environment: Object.freeze({
        environmentId: 'environment-production',
        revision: 'environment-revision-1',
        mode: 'live' as const,
      }),
      grantId: 'grant-1',
      permissionRevision: 'permission-revision-1',
      expiresAt: Date.parse('2030-01-01T00:00:00.000Z'),
    }),
    isActive: () => true,
    readPublicBinding: () => {
      throw new Error('not used');
    },
    useSecret,
    revoke,
  }) satisfies ExecutionEnvironmentResolutionLease;
  return { lease, revoke, useSecret };
};

describe('Server Function authorization kernel', () => {
  it('checks session and permission before invoking an adapter', async () => {
    const execute = vi.fn((_input, context) => ({
      kind: 'value' as const,
      value: context.principal!,
    }));
    const decide = vi.fn(() => ({ allowed: true }));
    const registry = createServerFunctionAdapterRegistry();
    registry.register({
      id: definition.adapterId,
      kinds: ['route-loader'],
      runtimeZones: ['server'],
      effects: ['read'],
      execute,
    });

    await expect(
      executeServerFunction({
        definition,
        workspaceId: 'workspace-1',
        invocationId: 'invocation-1',
        attempt: 1,
        input: { routeId: 'route-home' },
        registry,
        principal,
        session,
        permissionPort: { decide },
        now: () => new Date('2029-01-01T00:00:00.000Z'),
      })
    ).resolves.toEqual({ kind: 'value', value: principal });
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionId: 'workspace.read',
        session,
      })
    );
    expect(execute).toHaveBeenCalledWith(
      { routeId: 'route-home' },
      expect.not.objectContaining({ session: expect.anything() })
    );
  });

  it('fails before the adapter when permission is denied', async () => {
    const execute = vi.fn();
    const registry = createServerFunctionAdapterRegistry();
    registry.register({
      id: definition.adapterId,
      kinds: ['route-loader'],
      runtimeZones: ['server'],
      effects: ['read'],
      execute,
    });
    const result = executeServerFunction({
      definition,
      workspaceId: 'workspace-1',
      invocationId: 'invocation-1',
      attempt: 1,
      input: { routeId: 'route-home' },
      registry,
      principal,
      session,
      permissionPort: { decide: () => ({ allowed: false }) },
      now: () => new Date('2029-01-01T00:00:00.000Z'),
    });
    await expect(result).rejects.toMatchObject({
      code: SERVER_RUNTIME_ERROR_CODES.permissionDenied,
    } satisfies Partial<ServerRuntimeError>);
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails before the adapter for invalid input or mismatched session', async () => {
    const execute = vi.fn();
    const registry = createServerFunctionAdapterRegistry();
    registry.register({
      id: definition.adapterId,
      kinds: ['route-loader'],
      runtimeZones: ['server'],
      effects: ['read'],
      execute,
    });
    await expect(
      executeServerFunction({
        definition,
        workspaceId: 'workspace-1',
        invocationId: 'invocation-1',
        attempt: 1,
        input: {},
        registry,
        principal,
        session,
      })
    ).rejects.toMatchObject({ code: SERVER_RUNTIME_ERROR_CODES.inputInvalid });
    await expect(
      executeServerFunction({
        definition,
        workspaceId: 'workspace-1',
        invocationId: 'invocation-1',
        attempt: 1,
        input: { routeId: 'route-home' },
        registry,
        principal,
        session: { ...session, principalId: 'user-2' },
      })
    ).rejects.toMatchObject({
      code: SERVER_RUNTIME_ERROR_CODES.authSessionMismatch,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects malformed execution and auth identities before the adapter effect', async () => {
    const execute = vi.fn();
    const registry = createServerFunctionAdapterRegistry();
    registry.register({
      id: definition.adapterId,
      kinds: ['route-loader'],
      runtimeZones: ['server'],
      effects: ['read'],
      execute,
    });
    await expect(
      executeServerFunction({
        definition,
        workspaceId: '../workspace-1',
        invocationId: 'invocation-1',
        attempt: 1,
        input: { routeId: 'route-home' },
        registry,
        principal,
        session,
      })
    ).rejects.toMatchObject({
      code: SERVER_RUNTIME_ERROR_CODES.requestInvalid,
    });
    await expect(
      executeServerFunction({
        definition,
        workspaceId: 'workspace-1',
        invocationId: 'invocation-1',
        attempt: 1,
        input: { routeId: 'route-home' },
        registry,
        principal: { ...principal, principalId: '' },
        session: { ...session, principalId: '' },
      })
    ).rejects.toMatchObject({
      code: SERVER_RUNTIME_ERROR_CODES.authSessionMismatch,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('exposes only the declared callback-bound Secret and revokes the lease', async () => {
    const registry = createServerFunctionAdapterRegistry();
    const execute = vi.fn(async (_input, context) => {
      await context.useSecret!('key', (material: string) => {
        expect(material).toBe('secret-material-canary');
      });
      return { kind: 'value' as const, value: { digest: 'derived-digest' } };
    });
    registry.register({
      id: secretDefinition.adapterId,
      kinds: ['route-action'],
      runtimeZones: ['server'],
      effects: ['read'],
      execute,
    });
    const { lease, revoke, useSecret } = createSecretLease();

    await expect(
      executeServerFunction({
        definition: secretDefinition,
        workspaceId: 'workspace-1',
        invocationId: 'invocation-1',
        attempt: 1,
        input: { payload: 'hello' },
        registry,
        principal,
        session,
        environment: lease,
        now: () => new Date('2029-01-01T00:00:00.000Z'),
      })
    ).resolves.toEqual({
      kind: 'value',
      value: { digest: 'derived-digest' },
    });
    expect(useSecret).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      { payload: 'hello' },
      expect.not.objectContaining({
        environment: expect.anything(),
        grantId: expect.anything(),
        session: expect.anything(),
      })
    );
  });

  it('fails closed for missing, undeclared, or material-leaking Secret use', async () => {
    const registry = createServerFunctionAdapterRegistry();
    let outcomeDigest = 'safe';
    const execute = vi.fn(async (_input, context) => {
      await context.useSecret!('key', (material: string) => {
        outcomeDigest = material;
      });
      return { kind: 'value' as const, value: { digest: outcomeDigest } };
    });
    registry.register({
      id: secretDefinition.adapterId,
      kinds: ['route-action'],
      runtimeZones: ['server'],
      effects: ['read'],
      execute,
    });
    await expect(
      executeServerFunction({
        definition: secretDefinition,
        workspaceId: 'workspace-1',
        invocationId: 'invocation-1',
        attempt: 1,
        input: { payload: 'hello' },
        registry,
        principal,
        session,
        now: () => new Date('2029-01-01T00:00:00.000Z'),
      })
    ).rejects.toMatchObject({
      code: SERVER_RUNTIME_ERROR_CODES.environmentLeaseMissing,
    });

    const undeclaredRegistry = createServerFunctionAdapterRegistry();
    undeclaredRegistry.register({
      id: secretDefinition.adapterId,
      kinds: ['route-action'],
      runtimeZones: ['server'],
      effects: ['read'],
      execute: async (_input, context) => {
        await context.useSecret!('other', () => undefined);
        return { kind: 'value', value: { digest: 'safe' } };
      },
    });
    const undeclared = createSecretLease();
    await expect(
      executeServerFunction({
        definition: secretDefinition,
        workspaceId: 'workspace-1',
        invocationId: 'invocation-2',
        attempt: 1,
        input: { payload: 'hello' },
        registry: undeclaredRegistry,
        principal,
        session,
        environment: undeclared.lease,
        now: () => new Date('2029-01-01T00:00:00.000Z'),
      })
    ).rejects.toMatchObject({
      code: SERVER_RUNTIME_ERROR_CODES.secretBindingMissing,
    });
    expect(undeclared.revoke).toHaveBeenCalledOnce();

    const leaked = createSecretLease();
    await expect(
      executeServerFunction({
        definition: secretDefinition,
        workspaceId: 'workspace-1',
        invocationId: 'invocation-3',
        attempt: 1,
        input: { payload: 'hello' },
        registry,
        principal,
        session,
        environment: leaked.lease,
        now: () => new Date('2029-01-01T00:00:00.000Z'),
      })
    ).rejects.toMatchObject({
      code: SERVER_RUNTIME_ERROR_CODES.secretOutputLeak,
    });
    expect(leaked.revoke).toHaveBeenCalledOnce();

    const throwingRegistry = createServerFunctionAdapterRegistry();
    throwingRegistry.register({
      id: secretDefinition.adapterId,
      kinds: ['route-action'],
      runtimeZones: ['server'],
      effects: ['read'],
      execute: async (_input, context) => {
        await context.useSecret!('key', (material: string) => {
          throw new Error(material);
        });
        return { kind: 'value', value: { digest: 'unreachable' } };
      },
    });
    const throwing = createSecretLease();
    await expect(
      executeServerFunction({
        definition: secretDefinition,
        workspaceId: 'workspace-1',
        invocationId: 'invocation-4',
        attempt: 1,
        input: { payload: 'hello' },
        registry: throwingRegistry,
        principal,
        session,
        environment: throwing.lease,
        now: () => new Date('2029-01-01T00:00:00.000Z'),
      })
    ).rejects.toMatchObject({
      code: SERVER_RUNTIME_ERROR_CODES.secretOutputLeak,
      message: SERVER_RUNTIME_ERROR_CODES.secretOutputLeak,
    });
    expect(throwing.revoke).toHaveBeenCalledOnce();
  });

  it('rejects an unrequested Secret lease before invoking the adapter', async () => {
    const registry = createServerFunctionAdapterRegistry();
    const execute = vi.fn(() => ({
      kind: 'value' as const,
      value: principal,
    }));
    registry.register({
      id: definition.adapterId,
      kinds: ['route-loader'],
      runtimeZones: ['server'],
      effects: ['read'],
      execute,
    });
    const extra = createSecretLease();
    await expect(
      executeServerFunction({
        definition,
        workspaceId: 'workspace-1',
        invocationId: 'invocation-5',
        attempt: 1,
        input: { routeId: 'route-home' },
        registry,
        principal,
        session,
        permissionPort: { decide: () => ({ allowed: true }) },
        environment: extra.lease,
        now: () => new Date('2029-01-01T00:00:00.000Z'),
      })
    ).rejects.toMatchObject({
      code: SERVER_RUNTIME_ERROR_CODES.environmentLeaseMissing,
    });
    expect(extra.revoke).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });
});
