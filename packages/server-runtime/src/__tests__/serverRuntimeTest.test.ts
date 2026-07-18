import { describe, expect, it } from 'vitest';
import {
  createServerRuntimeTestSession,
  normalizeServerRuntimeTestProvision,
  SERVER_RUNTIME_TEST_ERROR_CODES,
  SERVER_RUNTIME_TEST_PROVISION_FORMAT,
  type ServerFunctionDefinition,
} from '../index';

const loader = Object.freeze({
  reference: { artifactId: 'code-auth', exportName: 'loadPrincipal' },
  kind: 'route-loader',
  runtimeZone: 'server',
  adapterId: 'fixture.auth',
  effect: 'read',
  auth: { kind: 'authenticated' },
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['routeId'],
    properties: { routeId: { type: 'string' } },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['providerId', 'principalId'],
    properties: {
      providerId: { type: 'string' },
      principalId: { type: 'string' },
    },
  },
} as const) satisfies ServerFunctionDefinition;

const action = Object.freeze({
  reference: { artifactId: 'code-auth', exportName: 'updateProfile' },
  kind: 'route-action',
  runtimeZone: 'server',
  adapterId: 'fixture.profile',
  effect: 'mutation',
  auth: { kind: 'permission', permissionId: 'profile.update' },
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  idempotency: { kind: 'invocation-key' },
} as const) satisfies ServerFunctionDefinition;

const provision = {
  format: SERVER_RUNTIME_TEST_PROVISION_FORMAT,
  fixtureSetId: 'auth-route-action',
  principal: { providerId: 'test-auth', principalId: 'user-1' },
  permissions: [{ permissionId: 'profile.update', allowed: true }],
  fixtures: [
    {
      id: 'principal',
      functionRef: loader.reference,
      behavior: {
        kind: 'outcome',
        outcome: {
          kind: 'value',
          value: { providerId: 'test-auth', principalId: 'user-1' },
        },
      },
    },
    {
      id: 'update-profile',
      functionRef: action.reference,
      behavior: {
        kind: 'outcome',
        outcome: { kind: 'value', value: { updated: true } },
      },
    },
  ],
} as const;

describe('deterministic Server Runtime Test session', () => {
  it('uses session-scoped principal and permission fixtures without live fallback', async () => {
    const session = createServerRuntimeTestSession({
      workspaceId: 'workspace-1',
      definitions: [loader, action],
      provision,
    });
    await expect(
      session.invoke({
        functionRef: loader.reference,
        invocationId: 'loader-1',
        attempt: 1,
        input: { routeId: 'route-profile' },
      })
    ).resolves.toEqual({
      kind: 'value',
      value: { providerId: 'test-auth', principalId: 'user-1' },
    });
    expect(JSON.stringify(session.listObservations())).not.toMatch(
      /session|token|cookie/iu
    );
  });

  it('executes one invocation-key mutation effect and replays its result', async () => {
    const session = createServerRuntimeTestSession({
      workspaceId: 'workspace-1',
      definitions: [loader, action],
      provision,
    });
    const request = {
      functionRef: action.reference,
      invocationId: 'action-1',
      attempt: 1,
      input: { displayName: 'Ada' },
    } as const;
    await expect(session.invoke(request)).resolves.toEqual({
      kind: 'value',
      value: { updated: true },
    });
    await expect(session.invoke({ ...request, attempt: 2 })).resolves.toEqual({
      kind: 'value',
      value: { updated: true },
    });
    expect(session.listObservations().map(({ status }) => status)).toEqual([
      'executed',
      'replayed',
    ]);
    await expect(
      session.invoke({
        ...request,
        attempt: 3,
        input: { displayName: 'Grace' },
      })
    ).rejects.toMatchObject({
      code: SERVER_RUNTIME_TEST_ERROR_CODES.replayConflict,
    });
  });

  it('cancels a delayed fixture before publishing an outcome', async () => {
    const controller = new AbortController();
    const delayed = {
      ...provision,
      fixtures: provision.fixtures.map((fixture) =>
        fixture.id === 'principal'
          ? {
              ...fixture,
              behavior: { ...fixture.behavior, delayMs: 100 },
            }
          : fixture
      ),
    };
    const session = createServerRuntimeTestSession({
      workspaceId: 'workspace-1',
      definitions: [loader, action],
      provision: delayed,
    });
    const result = session.invoke({
      functionRef: loader.reference,
      invocationId: 'loader-cancel',
      attempt: 1,
      input: { routeId: 'route-profile' },
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: 'SVR_CANCELLED' });
  });

  it('rejects authority-shaped fixture material before creating a session', () => {
    expect(() =>
      normalizeServerRuntimeTestProvision({
        ...provision,
        sessionId: 'must-not-enter-the-snapshot',
      })
    ).toThrow(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
    expect(() =>
      normalizeServerRuntimeTestProvision({
        ...provision,
        fixtures: [
          {
            ...provision.fixtures[0],
            behavior: {
              kind: 'outcome',
              outcome: { kind: 'value', value: { accessToken: 'canary' } },
            },
          },
        ],
      })
    ).toThrow(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
  });
});
