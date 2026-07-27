import { describe, expect, it } from 'vitest';
import {
  createServerFunctionAdapterRegistry,
  createServerRuntimeTestSession,
  decodeServerRuntimeProfile,
  normalizeServerRuntimeTestProvision,
  readServerRouteActionInput,
  SERVER_ROUTE_ACTION_INPUT_FORMAT,
  SERVER_RUNTIME_PROFILE_METADATA_KEY,
  SERVER_RUNTIME_TEST_PROVISION_FORMAT,
  type ServerFunctionDefinition,
} from '../index';

/**
 * Every name pair below is chosen so host ICU collation and Unicode code-point
 * order disagree: root collation sorts `alpha` before `Zulu`, code points sort
 * `Z` (0x5A) before `a` (0x61). Each ordering asserted here is emitted into a
 * generated project file, a persisted Code metadata profile, or an execution
 * identity, so it must be the code-point order on every host.
 */

const publicEntry = {
  kind: 'function',
  runtimeZone: 'server',
  adapterId: 'fixture.alpha',
  effect: 'read',
  auth: { kind: 'public' },
  inputSchema: true,
  outputSchema: true,
} as const;

describe('server runtime canonical ordering', () => {
  it('normalizes Route action params and search params in code-point order', () => {
    const normalized = readServerRouteActionInput({
      format: SERVER_ROUTE_ACTION_INPUT_FORMAT,
      route: {
        routeNodeId: 'route-profile',
        currentPath: '/profile',
        matchedPath: '/profile',
        params: { alpha: 'one', Zulu: 'two' },
        searchParams: { alpha: 'three', Zulu: ['four'] },
      },
      submission: {
        method: 'POST',
        encType: 'application/json',
        value: { updated: true },
      },
    });

    expect(normalized).toBeDefined();
    expect(Object.keys(normalized!.route.params)).toEqual(['Zulu', 'alpha']);
    expect(Object.keys(normalized!.route.searchParams)).toEqual([
      'Zulu',
      'alpha',
    ]);
  });

  it('decodes profile exports in code-point order', () => {
    const result = decodeServerRuntimeProfile(
      {
        [SERVER_RUNTIME_PROFILE_METADATA_KEY]: {
          schemaVersion: '1.0',
          functionsByExport: {
            alphaHandler: publicEntry,
            ZuluHandler: publicEntry,
          },
        },
      },
      'ts'
    );

    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    expect(Object.keys(result.profile.functionsByExport)).toEqual([
      'ZuluHandler',
      'alphaHandler',
    ]);
  });

  it('decodes Secret binding fields in code-point order', () => {
    const result = decodeServerRuntimeProfile(
      {
        [SERVER_RUNTIME_PROFILE_METADATA_KEY]: {
          schemaVersion: '1.0',
          functionsByExport: {
            signPayload: {
              ...publicEntry,
              auth: { kind: 'authenticated' },
              environment: {
                secretsByField: {
                  alphaKey: { bindingId: 'binding-alpha' },
                  ZuluKey: { bindingId: 'binding-zulu' },
                },
              },
            },
          },
        },
      },
      'ts'
    );

    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    expect(
      Object.keys(
        result.profile.functionsByExport.signPayload?.environment
          ?.secretsByField ?? {}
      )
    ).toEqual(['ZuluKey', 'alphaKey']);
  });

  it('lists registered adapters in code-point order', () => {
    const registry = createServerFunctionAdapterRegistry();
    const adapter = (id: string) => ({
      id,
      kinds: ['function'] as const,
      runtimeZones: ['server'] as const,
      effects: ['read'] as const,
      execute: () => ({ kind: 'value', value: null }) as const,
    });
    registry.register(adapter('alpha.adapter'));
    registry.register(adapter('Zulu.adapter'));

    expect(registry.list().map(({ id }) => id)).toEqual([
      'Zulu.adapter',
      'alpha.adapter',
    ]);
  });

  it('normalizes Test provision permissions and fixtures in code-point order', () => {
    const provision = normalizeServerRuntimeTestProvision({
      format: SERVER_RUNTIME_TEST_PROVISION_FORMAT,
      fixtureSetId: 'ordering',
      permissions: [
        { permissionId: 'alpha.update', allowed: true },
        { permissionId: 'Zulu.update', allowed: true },
      ],
      fixtures: [
        {
          id: 'alpha-fixture',
          functionRef: { artifactId: 'code-a', exportName: 'alphaHandler' },
          behavior: { kind: 'outcome', outcome: { kind: 'value', value: 1 } },
        },
        {
          id: 'Zulu-fixture',
          functionRef: { artifactId: 'code-a', exportName: 'zuluHandler' },
          behavior: { kind: 'outcome', outcome: { kind: 'value', value: 2 } },
        },
      ],
    });

    expect(
      provision.permissions.map(({ permissionId }) => permissionId)
    ).toEqual(['Zulu.update', 'alpha.update']);
    expect(provision.fixtures.map(({ id }) => id)).toEqual([
      'Zulu-fixture',
      'alpha-fixture',
    ]);
  });

  it('matches a fixture by canonical input regardless of key insertion order', async () => {
    const definition: ServerFunctionDefinition = Object.freeze({
      reference: Object.freeze({
        artifactId: 'code-a',
        exportName: 'alphaHandler',
      }),
      kind: 'function',
      runtimeZone: 'server',
      adapterId: 'fixture.alpha',
      effect: 'read',
      auth: Object.freeze({ kind: 'public' }),
      inputSchema: true,
      outputSchema: true,
    });
    const session = createServerRuntimeTestSession({
      workspaceId: 'workspace-1',
      definitions: [definition],
      provision: {
        format: SERVER_RUNTIME_TEST_PROVISION_FORMAT,
        fixtureSetId: 'ordering',
        permissions: [],
        fixtures: [
          {
            id: 'exact-input',
            functionRef: definition.reference,
            input: { alpha: 1, Zulu: 2 },
            behavior: {
              kind: 'outcome',
              outcome: { kind: 'value', value: 'matched' },
            },
          },
        ],
      },
    });

    await expect(
      session.invoke({
        functionRef: definition.reference,
        invocationId: 'invocation-1',
        attempt: 1,
        input: { Zulu: 2, alpha: 1 },
      })
    ).resolves.toEqual({ kind: 'value', value: 'matched' });
  });
});
