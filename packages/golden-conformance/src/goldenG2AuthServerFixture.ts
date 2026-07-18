import { createEmptyPirDocument } from '@prodivix/pir';
import type {
  ServerFunctionReference,
  ServerRuntimeTestProvision,
} from '@prodivix/server-runtime';
import type { WorkspaceSnapshot } from '@prodivix/workspace';

export const GOLDEN_G2_AUTH_SERVER_SOURCE_CANARY =
  'golden-auth-server-source-must-stay-server-owned' as const;

export const GOLDEN_G2_AUTH_SERVER_CREDENTIAL_CANARIES = Object.freeze([
  'golden-bearer-token-canary',
  'golden-session-id-canary',
  'golden-cookie-canary',
  'golden-secret-material-canary',
] as const);

export const GOLDEN_G2_AUTH_SERVER_IDS = Object.freeze({
  workspace: 'golden-g2-auth-server-workspace',
  route: 'route-owner-only',
  pageDocument: 'page-owner-only',
  serverDocument: 'code-owner-guards',
  helperDocument: 'code-owner-helper',
  authConfigurationDocument: 'config-auth',
  remoteExport: 'requireRemoteOwner',
  remoteSecretExport: 'signRemotePayload',
  isolatedExport: 'requireIsolatedOwner',
  isolatedSecretExport: 'useIsolatedSecret',
});

export const GOLDEN_G2_REMOTE_OWNER_FUNCTION_REF: ServerFunctionReference =
  Object.freeze({
    artifactId: GOLDEN_G2_AUTH_SERVER_IDS.serverDocument,
    exportName: GOLDEN_G2_AUTH_SERVER_IDS.remoteExport,
  });

export const GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF: ServerFunctionReference =
  Object.freeze({
    artifactId: GOLDEN_G2_AUTH_SERVER_IDS.serverDocument,
    exportName: GOLDEN_G2_AUTH_SERVER_IDS.isolatedExport,
  });

export const GOLDEN_G2_REMOTE_HMAC_FUNCTION_REF: ServerFunctionReference =
  Object.freeze({
    artifactId: GOLDEN_G2_AUTH_SERVER_IDS.serverDocument,
    exportName: GOLDEN_G2_AUTH_SERVER_IDS.remoteSecretExport,
  });

export const GOLDEN_G2_ISOLATED_SECRET_FUNCTION_REF: ServerFunctionReference =
  Object.freeze({
    artifactId: GOLDEN_G2_AUTH_SERVER_IDS.serverDocument,
    exportName: GOLDEN_G2_AUTH_SERVER_IDS.isolatedSecretExport,
  });

export type GoldenG2AuthServerBinding =
  'remote-live' | 'remote-secret' | 'isolated-production' | 'isolated-secret';

const ownerGuardProfile = (adapterId: string) =>
  Object.freeze({
    kind: 'route-guard' as const,
    runtimeZone: 'server' as const,
    adapterId,
    effect: 'read' as const,
    auth: Object.freeze({
      kind: 'permission' as const,
      permissionId: 'workspace.owner',
    }),
    inputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze(['routeId']),
      properties: Object.freeze({
        routeId: Object.freeze({ type: 'string' }),
      }),
    }),
    outputSchema: true,
  });

const hmacProfile = () =>
  Object.freeze({
    kind: 'route-action' as const,
    runtimeZone: 'server' as const,
    adapterId: 'core.server.hmac-sha256',
    effect: 'read' as const,
    auth: Object.freeze({ kind: 'authenticated' as const }),
    inputSchema: true,
    outputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze(['algorithm', 'digest']),
      properties: Object.freeze({
        algorithm: Object.freeze({ const: 'HMAC-SHA256' }),
        digest: Object.freeze({
          type: 'string',
          pattern: '^[a-f0-9]{64}$',
        }),
      }),
    }),
    environment: Object.freeze({
      secretsByField: Object.freeze({
        key: Object.freeze({ bindingId: 'golden-webhook-signing-key' }),
      }),
    }),
  });

const isolatedSecretProfile = () =>
  Object.freeze({
    kind: 'route-loader' as const,
    runtimeZone: 'server' as const,
    adapterId: 'prodivix.code-export',
    effect: 'read' as const,
    auth: Object.freeze({ kind: 'public' as const }),
    inputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze(['routeId']),
      properties: Object.freeze({
        routeId: Object.freeze({ type: 'string' }),
      }),
    }),
    outputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze(['secretLength']),
      properties: Object.freeze({
        secretLength: Object.freeze({ type: 'number' }),
      }),
    }),
    environment: Object.freeze({
      secretsByField: Object.freeze({
        signingKey: Object.freeze({
          bindingId: 'golden-webhook-signing-key',
        }),
      }),
    }),
  });

/**
 * Authors one server-owned code document with two target-specific adapters that
 * intentionally share the exact route-guard/auth/input/outcome contract.
 */
export const createGoldenG2AuthServerWorkspace = (
  binding: GoldenG2AuthServerBinding
): WorkspaceSnapshot => {
  const functionRef =
    binding === 'remote-live'
      ? GOLDEN_G2_REMOTE_OWNER_FUNCTION_REF
      : binding === 'remote-secret'
        ? GOLDEN_G2_REMOTE_HMAC_FUNCTION_REF
        : binding === 'isolated-secret'
          ? GOLDEN_G2_ISOLATED_SECRET_FUNCTION_REF
          : GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF;
  return {
    id: GOLDEN_G2_AUTH_SERVER_IDS.workspace,
    workspaceRev: 8,
    routeRev:
      binding === 'remote-live'
        ? 4
        : binding === 'remote-secret'
          ? 6
          : binding === 'isolated-secret'
            ? 7
            : 5,
    opSeq: 12,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: ['page-node', 'server-node', 'auth-dir', 'config-dir'],
      },
      'page-node': {
        id: 'page-node',
        kind: 'doc',
        name: 'owner-only.pir.json',
        parentId: 'root',
        docId: GOLDEN_G2_AUTH_SERVER_IDS.pageDocument,
      },
      'server-node': {
        id: 'server-node',
        kind: 'doc',
        name: 'owner-guards.server.ts',
        parentId: 'root',
        docId: GOLDEN_G2_AUTH_SERVER_IDS.serverDocument,
      },
      'auth-dir': {
        id: 'auth-dir',
        kind: 'dir',
        name: 'auth',
        parentId: 'root',
        children: ['helper-node'],
      },
      'helper-node': {
        id: 'helper-node',
        kind: 'doc',
        name: 'owner.ts',
        parentId: 'auth-dir',
        docId: GOLDEN_G2_AUTH_SERVER_IDS.helperDocument,
      },
      'config-dir': {
        id: 'config-dir',
        kind: 'dir',
        name: 'config',
        parentId: 'root',
        children: ['auth-config-node'],
      },
      'auth-config-node': {
        id: 'auth-config-node',
        kind: 'doc',
        name: 'auth.json',
        parentId: 'config-dir',
        docId: GOLDEN_G2_AUTH_SERVER_IDS.authConfigurationDocument,
      },
    },
    docsById: {
      [GOLDEN_G2_AUTH_SERVER_IDS.pageDocument]: {
        id: GOLDEN_G2_AUTH_SERVER_IDS.pageDocument,
        type: 'pir-page',
        path: '/owner-only.pir.json',
        contentRev: 2,
        metaRev: 1,
        content: createEmptyPirDocument(),
      },
      [GOLDEN_G2_AUTH_SERVER_IDS.serverDocument]: {
        id: GOLDEN_G2_AUTH_SERVER_IDS.serverDocument,
        type: 'code',
        path: '/owner-guards.server.ts',
        contentRev: 7,
        metaRev: 2,
        content: {
          language: 'ts',
          source: `import { isGoldenWorkspaceOwner } from './auth/owner.ts';

const serverSourceBoundary = '${GOLDEN_G2_AUTH_SERVER_SOURCE_CANARY}';
void serverSourceBoundary;

export const requireRemoteOwner = () => ({ kind: 'allow' as const });

export const signRemotePayload = () => ({
  kind: 'value' as const,
  value: { forbidden: serverSourceBoundary },
});

export const requireIsolatedOwner = (
  _input: { routeId: string },
  context: { principal?: { providerId: string; principalId: string } },
) => isGoldenWorkspaceOwner(context.principal)
  ? ({ kind: 'allow' as const })
  : ({ kind: 'deny' as const, code: 'WORKSPACE_OWNER_REQUIRED' });

export const useIsolatedSecret = async (
  _input: { routeId: string },
  context: { useSecret?: (field: string, consumer: (material: string) => void) => Promise<void> },
) => {
  let secretLength = 0;
  await context.useSecret?.('signingKey', (material) => { secretLength = material.length; });
  return { kind: 'value' as const, value: { secretLength } };
};
`,
          metadata: {
            'prodivix.serverRuntime': {
              schemaVersion: '1.0',
              functionsByExport: {
                [GOLDEN_G2_AUTH_SERVER_IDS.remoteExport]: ownerGuardProfile(
                  'core.auth.require-workspace-owner'
                ),
                [GOLDEN_G2_AUTH_SERVER_IDS.remoteSecretExport]: hmacProfile(),
                [GOLDEN_G2_AUTH_SERVER_IDS.isolatedExport]: ownerGuardProfile(
                  'prodivix.code-export'
                ),
                [GOLDEN_G2_AUTH_SERVER_IDS.isolatedSecretExport]:
                  isolatedSecretProfile(),
              },
            },
          },
        },
      },
      [GOLDEN_G2_AUTH_SERVER_IDS.helperDocument]: {
        id: GOLDEN_G2_AUTH_SERVER_IDS.helperDocument,
        type: 'code',
        path: '/auth/owner.ts',
        contentRev: 3,
        metaRev: 1,
        content: {
          language: 'ts',
          source: `export const isGoldenWorkspaceOwner = (
  principal: { providerId: string; principalId: string } | undefined,
) => principal?.providerId === 'prodivix-product-session' &&
  principal.principalId === 'golden-owner';
`,
        },
      },
      [GOLDEN_G2_AUTH_SERVER_IDS.authConfigurationDocument]: {
        id: GOLDEN_G2_AUTH_SERVER_IDS.authConfigurationDocument,
        type: 'project-config',
        path: '/config/auth.json',
        contentRev: 1,
        metaRev: 1,
        content: {
          kind: 'config',
          value: {
            schemaVersion: '1.0',
            providerId: 'prodivix-product-session',
            permissionIds: ['workspace.owner'],
          },
        },
      },
    },
    routeManifest: {
      version: '1',
      root: {
        id: 'root',
        children: [
          {
            id: GOLDEN_G2_AUTH_SERVER_IDS.route,
            index: true,
            pageDocId: GOLDEN_G2_AUTH_SERVER_IDS.pageDocument,
            runtime:
              binding === 'remote-secret'
                ? { actionRef: functionRef }
                : binding === 'isolated-secret'
                  ? { loaderRef: functionRef }
                  : { guardRef: functionRef },
          },
        ],
      },
    },
  };
};

export const createGoldenG2AuthServerTestProvision =
  (): ServerRuntimeTestProvision =>
    Object.freeze({
      format: 'prodivix.server-runtime-test-provision.v1',
      fixtureSetId: 'golden-g2-owner-guards',
      principal: Object.freeze({
        providerId: 'prodivix-product-session',
        principalId: 'golden-owner',
      }),
      permissions: Object.freeze([
        Object.freeze({ permissionId: 'workspace.owner', allowed: true }),
      ]),
      fixtures: Object.freeze([
        Object.freeze({
          id: 'golden-remote-owner-allow',
          functionRef: GOLDEN_G2_REMOTE_OWNER_FUNCTION_REF,
          behavior: Object.freeze({
            kind: 'outcome' as const,
            outcome: Object.freeze({ kind: 'allow' as const }),
          }),
        }),
        Object.freeze({
          id: 'golden-isolated-owner-allow',
          functionRef: GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF,
          behavior: Object.freeze({
            kind: 'outcome' as const,
            outcome: Object.freeze({ kind: 'allow' as const }),
          }),
        }),
      ]),
    });
