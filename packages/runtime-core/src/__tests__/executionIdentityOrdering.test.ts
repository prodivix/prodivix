import { describe, expect, it } from 'vitest';
import {
  createExecutionEnvironmentResolutionService,
  createExecutionProviderDescriptor,
  createExecutionProviderRegistry,
  createExecutionRequest,
  type ExecutionEnvironmentResolutionRequest,
  type ExecutionEnvironmentSnapshot,
  type ExecutionProvider,
  type ExecutionRequestInput,
} from '..';

/**
 * Stands in for a host ICU collation that disagrees with code-point order: it
 * folds case, diacritics, and connector punctuation the way a real locale does.
 * Any identity ordering that still reaches `String.prototype.localeCompare`
 * changes shape under this collation, which is the cross-process divergence
 * recorded by G2-GAP-04 (sandbox and host disagreed on Secret field ordering).
 */
const foldForCollation = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[_-]/gu, '')
    .toLowerCase();

type HostCollation = 'code-point-host' | 'folding-host' | 'absent-host';

const collationStubs: Readonly<
  Record<HostCollation, (this: string, other: string) => number>
> = {
  'code-point-host': function (other) {
    const left = String(this);
    return left < other ? -1 : left > other ? 1 : 0;
  },
  'folding-host': function (other) {
    const left = foldForCollation(String(this));
    const right = foldForCollation(other);
    if (left !== right) return left < right ? -1 : 1;
    const raw = String(this);
    return raw < other ? -1 : raw > other ? 1 : 0;
  },
  'absent-host': function () {
    throw new Error('host locale collation was used for an identity ordering');
  },
};

const HOSTS: readonly HostCollation[] = [
  'code-point-host',
  'folding-host',
  'absent-host',
];

const withHostCollation = async <Result>(
  host: HostCollation,
  run: () => Result | Promise<Result>
): Promise<Result> => {
  const original = String.prototype.localeCompare;
  Object.defineProperty(String.prototype, 'localeCompare', {
    configurable: true,
    writable: true,
    value: collationStubs[host],
  });
  try {
    return await run();
  } finally {
    Object.defineProperty(String.prototype, 'localeCompare', {
      configurable: true,
      writable: true,
      value: original,
    });
  }
};

const requestInput: ExecutionRequestInput = {
  requestId: 'request-1',
  profile: 'production',
  runtimeZone: 'server',
  workspace: {
    workspaceId: 'workspace-1',
    snapshotId: 'snapshot-1',
    partitionRevisions: {
      Route: '4',
      route: '3',
      'route-manifest': '2',
      route_code: '1',
    },
  },
  invocation: {
    kind: 'workspace',
    targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
  },
  metadata: {
    DB_PASSWORD: 'ref:secret-1',
    Zone: 'edge',
    _internal: 'true',
    'db-host': 'primary',
    db_password: 'ref:secret-2',
    resume: 'plain',
    résumé: 'accented',
  },
};

describe('execution identity ordering is host-locale independent', () => {
  it('orders execution request record keys by code point on every host', async () => {
    for (const host of HOSTS) {
      const request = await withHostCollation(host, () =>
        createExecutionRequest(requestInput)
      );

      expect(Object.keys(request.metadata ?? {})).toEqual([
        'DB_PASSWORD',
        'Zone',
        '_internal',
        'db-host',
        'db_password',
        'resume',
        'résumé',
      ]);
      expect(Object.keys(request.workspace.partitionRevisions ?? {})).toEqual([
        'Route',
        'route',
        'route-manifest',
        'route_code',
      ]);
    }
  });

  it('encodes one execution request byte sequence across hosts', async () => {
    const encodings = new Set<string>();
    for (const host of HOSTS) {
      const request = await withHostCollation(host, () =>
        createExecutionRequest(requestInput)
      );
      encodings.add(JSON.stringify(request));
    }
    expect(encodings.size).toBe(1);
  });

  it('hands the environment authorization port one binding order on every host', async () => {
    const snapshot: ExecutionEnvironmentSnapshot = Object.freeze({
      environmentId: 'environment-main',
      revision: 'revision-1',
      mode: 'live',
      publicBindingsById: Object.freeze({ 'client-id': 'public-client' }),
      secretBindingIds: Object.freeze(['api-secret', 'session-token']),
    });
    const resolutionRequest: ExecutionEnvironmentResolutionRequest = {
      leaseId: 'lease-1',
      workspaceId: 'workspace-1',
      principal: { principalId: 'principal-1', sessionId: 'session-1' },
      providerId: 'remote-provider',
      providerIsolation: 'remote-isolated',
      executionClass: 'isolated-runner',
      profile: 'production',
      runtimeZone: 'server',
      environment: {
        environmentId: 'environment-main',
        revision: 'revision-1',
        mode: 'live',
      },
      purpose: { kind: 'data-operation', resourceId: 'data-products:list' },
      bindings: [
        { bindingId: 'session-token', kind: 'secret', field: 'authorization' },
        { bindingId: 'client-id', kind: 'public', field: 'apiKey' },
        { bindingId: 'api-secret', kind: 'secret', field: 'API_SECRET' },
      ],
    };

    const observedOrders: string[][] = [];
    for (const host of HOSTS) {
      await withHostCollation(host, async () => {
        const service = createExecutionEnvironmentResolutionService({
          snapshots: { load: () => snapshot },
          permissions: {
            authorize: (authorized) => {
              observedOrders.push(
                authorized.bindings.map(
                  (binding) => `${binding.field} ${binding.bindingId}`
                )
              );
              return {
                allowed: true,
                grantId: 'grant-1',
                permissionRevision: 'permission-1',
                expiresAt: 1_100,
              };
            },
          },
          secrets: { read: () => 'canary-secret-value' },
          now: () => 1_000,
        });
        await service.resolve(resolutionRequest);
      });
    }

    expect(observedOrders).toHaveLength(HOSTS.length);
    observedOrders.forEach((order) => {
      expect(order).toEqual([
        'API_SECRET api-secret',
        'apiKey client-id',
        'authorization session-token',
      ]);
    });
  });

  it('lists execution provider descriptors in one order on every host', async () => {
    const providerIds = ['Zeta-runner', 'alpha-runner', 'alpha_runner'];
    const observed: string[][] = [];

    for (const host of HOSTS) {
      const registry = createExecutionProviderRegistry();
      providerIds.forEach((id) => {
        const provider: ExecutionProvider = Object.freeze({
          descriptor: createExecutionProviderDescriptor({
            id,
            version: '1.0.0',
            isolation: 'remote-isolated',
            profiles: ['production'],
            runtimeZones: ['server'],
            invocationKinds: ['workspace'],
          }),
          start: () => Promise.reject(new Error('provider is not started')),
        });
        registry.register(provider);
      });
      await withHostCollation(host, () => {
        observed.push(
          registry.listDescriptors().map((descriptor) => descriptor.id)
        );
      });
    }

    expect(observed).toHaveLength(HOSTS.length);
    observed.forEach((order) => {
      expect(order).toEqual(['Zeta-runner', 'alpha-runner', 'alpha_runner']);
    });
  });
});
