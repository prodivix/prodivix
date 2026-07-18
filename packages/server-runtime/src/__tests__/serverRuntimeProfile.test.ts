import { describe, expect, it } from 'vitest';
import {
  decodeServerRuntimeProfile,
  resolveServerFunctionDefinition,
  SERVER_RUNTIME_PROFILE_METADATA_KEY,
  writeServerRuntimeProfile,
} from '../index';

const profile = {
  schemaVersion: '1.0',
  functionsByExport: {
    loadPrincipal: {
      kind: 'route-loader',
      runtimeZone: 'server',
      adapterId: 'core.auth.current-principal',
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
    },
  },
} as const;

const secretProfile = {
  schemaVersion: '1.0',
  functionsByExport: {
    signPayload: {
      kind: 'route-action',
      runtimeZone: 'server',
      adapterId: 'core.server.hmac-sha256',
      effect: 'read',
      auth: { kind: 'authenticated' },
      inputSchema: true,
      outputSchema: true,
      environment: {
        secretsByField: {
          key: { bindingId: 'webhook-signing-key' },
        },
      },
    },
  },
} as const;

describe('Server runtime profile', () => {
  it('writes a normalized profile while preserving sibling Code metadata', () => {
    const metadata = writeServerRuntimeProfile(
      { sibling: { owner: 'code' } },
      profile,
      'ts'
    );
    expect(metadata).toEqual({
      sibling: { owner: 'code' },
      [SERVER_RUNTIME_PROFILE_METADATA_KEY]: profile,
    });
    expect(() => writeServerRuntimeProfile(undefined, profile, 'css')).toThrow(
      'TypeScript or JavaScript'
    );
  });

  it('decodes the exact current profile and resolves a CodeReference', () => {
    const result = decodeServerRuntimeProfile(
      { [SERVER_RUNTIME_PROFILE_METADATA_KEY]: profile },
      'ts'
    );
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    expect(
      resolveServerFunctionDefinition(
        result.profile,
        'code-auth',
        'loadPrincipal'
      )
    ).toMatchObject({
      reference: { artifactId: 'code-auth', exportName: 'loadPrincipal' },
      adapterId: 'core.auth.current-principal',
    });
  });

  it('normalizes reference-only Secret requirements without material', () => {
    const result = decodeServerRuntimeProfile(
      { [SERVER_RUNTIME_PROFILE_METADATA_KEY]: secretProfile },
      'ts'
    );
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    expect(result.profile.functionsByExport.signPayload?.environment).toEqual({
      secretsByField: {
        key: { bindingId: 'webhook-signing-key' },
      },
    });
    expect(JSON.stringify(result.profile)).not.toContain(
      'secret-material-canary'
    );
  });

  it.each([
    {
      secretsByField: {},
    },
    {
      secretsByField: {
        key: {
          bindingId: 'webhook-signing-key',
          value: 'secret-material-canary',
        },
      },
    },
    {
      secretsByField: {
        'not a field': { bindingId: 'webhook-signing-key' },
      },
    },
  ])('rejects invalid or material-bearing Secret policies', (environment) => {
    expect(
      decodeServerRuntimeProfile(
        {
          [SERVER_RUNTIME_PROFILE_METADATA_KEY]: {
            ...secretProfile,
            functionsByExport: {
              signPayload: {
                ...secretProfile.functionsByExport.signPayload,
                environment,
              },
            },
          },
        },
        'ts'
      ).status
    ).toBe('invalid');
  });

  it.each([
    ['wrong language', profile, 'css'],
    ['unknown profile field', { ...profile, token: 'must-not-persist' }, 'ts'],
    [
      'unknown function field',
      {
        ...profile,
        functionsByExport: {
          loadPrincipal: {
            ...profile.functionsByExport.loadPrincipal,
            session: 'must-not-persist',
          },
        },
      },
      'ts',
    ],
    [
      'invalid schema',
      {
        ...profile,
        functionsByExport: {
          loadPrincipal: {
            ...profile.functionsByExport.loadPrincipal,
            inputSchema: { type: 'not-a-json-schema-type' },
          },
        },
      },
      'ts',
    ],
  ])('fails closed for %s', (_label, value, language) => {
    expect(
      decodeServerRuntimeProfile(
        { [SERVER_RUNTIME_PROFILE_METADATA_KEY]: value },
        language as 'ts'
      ).status
    ).toBe('invalid');
  });

  it('rejects external schema resolution and excessive schema depth', () => {
    let deepSchema: unknown = true;
    for (let depth = 0; depth < 66; depth += 1) {
      deepSchema = { allOf: [deepSchema] };
    }
    for (const inputSchema of [
      { $dynamicRef: 'https://example.invalid/schema' },
      deepSchema,
    ]) {
      expect(
        decodeServerRuntimeProfile(
          {
            [SERVER_RUNTIME_PROFILE_METADATA_KEY]: {
              ...profile,
              functionsByExport: {
                loadPrincipal: {
                  ...profile.functionsByExport.loadPrincipal,
                  inputSchema,
                },
              },
            },
          },
          'ts'
        ).status
      ).toBe('invalid');
    }
  });
});
