import { describe, expect, it } from 'vitest';
import {
  createServerRuntimeAuthConfiguration,
  decodeServerRuntimeAuthConfiguration,
  PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID,
  SERVER_RUNTIME_AUTH_CONFIGURATION_MAX_PERMISSIONS,
} from '../index';

describe('Server Runtime Auth configuration', () => {
  it('creates and strictly decodes a normalized reference-only declaration', () => {
    const configuration = createServerRuntimeAuthConfiguration({
      providerId: PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID,
      permissionIds: ['workspace.write', 'workspace.owner', 'workspace.owner'],
    });
    expect(configuration).toEqual({
      schemaVersion: '1.0',
      providerId: 'prodivix-product-session',
      permissionIds: ['workspace.owner', 'workspace.write'],
    });
    expect(decodeServerRuntimeAuthConfiguration(configuration)).toEqual({
      status: 'valid',
      configuration,
    });
  });

  it.each([
    ['credential field', { token: 'must-not-persist' }],
    ['session field', { sessionId: 'must-not-persist' }],
    ['unknown field', { mode: 'live' }],
  ])('rejects an otherwise valid configuration with a %s', (_label, field) => {
    expect(
      decodeServerRuntimeAuthConfiguration({
        schemaVersion: '1.0',
        providerId: 'prodivix-product-session',
        permissionIds: ['workspace.owner'],
        ...field,
      }).status
    ).toBe('invalid');
  });

  it.each([
    [
      'unsorted permissions',
      {
        schemaVersion: '1.0',
        providerId: 'prodivix-product-session',
        permissionIds: ['workspace.write', 'workspace.owner'],
      },
    ],
    [
      'duplicate permissions',
      {
        schemaVersion: '1.0',
        providerId: 'prodivix-product-session',
        permissionIds: ['workspace.owner', 'workspace.owner'],
      },
    ],
    [
      'invalid provider',
      {
        schemaVersion: '1.0',
        providerId: '../provider',
        permissionIds: [],
      },
    ],
    [
      'permission budget',
      {
        schemaVersion: '1.0',
        providerId: 'prodivix-product-session',
        permissionIds: Array.from(
          { length: SERVER_RUNTIME_AUTH_CONFIGURATION_MAX_PERMISSIONS + 1 },
          (_, index) => `permission.${String(index).padStart(2, '0')}`
        ),
      },
    ],
  ])('rejects %s', (_label, value) => {
    expect(decodeServerRuntimeAuthConfiguration(value).status).toBe('invalid');
  });
});
