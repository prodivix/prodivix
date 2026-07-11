import { describe, expect, it, vi } from 'vitest';
import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type JsonValue,
  type PluginManifestV1,
} from '@prodivix/plugin-contracts';
import type { PluginAuditEvent } from '#host/audit/audit.types';
import { resolvePermissionSnapshot } from '#host/capability/permissionResolution';
import type { PermissionSnapshot } from '#host/capability/permissionSnapshot';
import { defineContributionContract } from '#host/contribution/contributionContract';
import { createPluginHost } from '#host/lifecycle/createPluginHost';
import type { CreatePluginHostOptions } from '#host/lifecycle/pluginHost';
import type { PluginPackageSource } from '#host/host.types';
import type {
  PluginRuntimeActivationInput,
  PluginRuntimeSession,
  RuntimeDeactivationReason,
  RuntimeTerminationEvent,
} from '#host/runtime/pluginRuntimeAdapter';
import type { VerifiedPluginRuntimeArtifact } from '#host/runtime/runtimeArtifact';
import { pluginHostFailure, pluginHostSuccess } from '#host/result';
import type { PluginHostResult } from '#host/result';

type TestContributionMap = {
  paletteContribution: Readonly<{ label: string }>;
};

const contract = defineContributionContract<
  TestContributionMap,
  'paletteContribution',
  JsonValue
>({
  point: 'paletteContribution',
  contractVersion: '1.0',
  validateDescriptor: (input) => {
    if (
      typeof input === 'object' &&
      input !== null &&
      !Array.isArray(input) &&
      typeof input.label === 'string'
    ) {
      return pluginHostSuccess(input);
    }
    return pluginHostFailure([
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_SCHEMA_VIOLATION,
        'Palette descriptor requires a label.',
        { contributionPoint: 'paletteContribution' }
      ),
    ]);
  },
  prepare: async ({ descriptor }) => {
    const label =
      typeof descriptor === 'object' &&
      descriptor !== null &&
      !Array.isArray(descriptor) &&
      typeof descriptor.label === 'string'
        ? descriptor.label
        : '';
    return pluginHostSuccess({
      value: { label },
      lifetime: 'installation',
      dependsOnCapabilities: [],
    });
  },
});

const createManifest = (runtime: boolean): PluginManifestV1 => ({
  schemaVersion: '1.0',
  id: '@prodivix/plugin-host-test',
  displayName: 'Plugin Host test',
  version: '1.0.0',
  publisher: 'prodivix',
  engines: { prodivix: '>=0.1.0 <1.0.0' },
  entrypoints: runtime ? { runtime: { path: './dist/runtime.js' } } : undefined,
  activationEvents: runtime ? [{ type: 'manual' }] : undefined,
  capabilities: [
    {
      id: 'extension.register',
      scope: 'paletteContribution',
      reason: 'Register test palette contributions.',
    },
  ],
  contributes: [
    {
      id: 'static.palette',
      point: 'paletteContribution',
      contractVersion: '1.0',
      source: {
        kind: 'inline',
        descriptor: { label: 'Static palette item' },
      },
    },
  ],
});

const createSource = (manifest: PluginManifestV1): PluginPackageSource => ({
  installationId: 'installation-1',
  attestation: {
    sourceId: 'test-source',
    packageDigest: 'sha256-test-package',
    trustLevel: 'development',
    publisherVerified: false,
  },
  reader: {
    readManifest: async () =>
      pluginHostSuccess(new TextEncoder().encode(JSON.stringify(manifest))),
    readResource: async (path) =>
      path === manifest.entrypoints?.runtime?.path
        ? pluginHostSuccess(
            new TextEncoder().encode('export const activate = () => {};')
          )
        : pluginHostFailure([
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_READ_FAILED,
              'The requested test resource does not exist.'
            ),
          ]),
  },
});

type RuntimeControl = {
  activationCount: number;
  deactivationCount: number;
  deactivationReasons: RuntimeDeactivationReason[];
  disposedRuntimeContributionCount: number;
  runtimeArtifact?: VerifiedPluginRuntimeArtifact;
  deactivationFails: boolean;
  mode: 'success' | 'failure' | 'pending';
  pendingResolve?: (result: PluginHostResult<PluginRuntimeSession>) => void;
  terminate?: (reasonCode: string) => void;
  permissionNotifications: Array<PermissionSnapshot | undefined>;
  disposePermissionSubscription?: () => void;
};

const createRuntimeControl = (): RuntimeControl => ({
  activationCount: 0,
  deactivationCount: 0,
  deactivationReasons: [],
  disposedRuntimeContributionCount: 0,
  deactivationFails: false,
  mode: 'success',
  permissionNotifications: [],
});

const createSession = (
  control: RuntimeControl,
  sessionToken: string
): PluginRuntimeSession => {
  let terminationListener:
    ((event: RuntimeTerminationEvent) => void) | undefined;
  control.terminate = (reasonCode) =>
    terminationListener?.({ sessionToken, reasonCode });
  return {
    deactivate: async (reason) => {
      control.disposePermissionSubscription?.();
      control.disposePermissionSubscription = undefined;
      control.deactivationCount += 1;
      control.deactivationReasons.push(reason);
      if (control.deactivationFails) {
        return pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED,
            'Test runtime deactivation failed.'
          ),
        ]);
      }
      return pluginHostSuccess(undefined);
    },
    onDidTerminate: (listener) => {
      terminationListener = listener;
      let disposed = false;
      return {
        dispose: () => {
          if (disposed) return;
          disposed = true;
          terminationListener = undefined;
        },
      };
    },
  };
};

const stageRuntimeContribution = (
  control: RuntimeControl,
  input: PluginRuntimeActivationInput<TestContributionMap>
) =>
  input.contributions.stage({
    contributionId: 'runtime.palette',
    point: 'paletteContribution',
    contractVersion: '1.0',
    registrationOrdinal: 100,
    requiredCapabilities: [],
    value: { label: 'Runtime palette item' },
    dispose: () => {
      control.disposedRuntimeContributionCount += 1;
    },
  });

const createHarness = (
  options: {
    runtime?: boolean;
    granted?: boolean;
    auditFails?: boolean;
    optionalCapability?: boolean;
    runtimeArtifactMaxBytes?: number;
    runtimeTimeoutMs?: number;
    deactivationFails?: boolean;
    integrityService?: CreatePluginHostOptions<TestContributionMap>['integrityService'];
    validateContributionBatch?: CreatePluginHostOptions<TestContributionMap>['validateContributionBatch'];
  } = {}
) => {
  const manifest = createManifest(options.runtime ?? true);
  if (options.optionalCapability) {
    manifest.capabilities[0] = {
      ...manifest.capabilities[0]!,
      optional: true,
    };
  }
  const control = createRuntimeControl();
  control.deactivationFails = options.deactivationFails ?? false;
  let granted = options.granted ?? true;
  let id = 0;
  const auditEvents: PluginAuditEvent[] = [];
  const hostResult = createPluginHost<TestContributionMap>({
    hostVersion: '0.5.0',
    contracts: [contract],
    capabilityPolicy: {
      resolve: async (input) =>
        resolvePermissionSnapshot({
          owner: input.owner,
          pluginVersion: input.manifest.version,
          requests: input.manifest.capabilities,
          decisions: input.manifest.capabilities.map((request) => ({
            capability:
              'scope' in request
                ? { id: request.id, scope: request.scope }
                : { id: request.id },
            decision: granted ? 'grant' : 'deny',
            source: 'administrator',
            reasonCode: granted ? 'test-grant' : 'test-deny',
          })),
          permissionRevision: input.nextPermissionRevision,
          policyRevision: `policy-${input.nextPermissionRevision}`,
          policySource: 'test',
        }),
    },
    runtimeAdapter: {
      activate: async (input) => {
        control.activationCount += 1;
        control.runtimeArtifact = input.runtimeArtifact;
        const staged = stageRuntimeContribution(control, input);
        if (!staged.ok) return staged;
        if (control.mode === 'failure') {
          return pluginHostFailure([
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.RUNTIME_ACTIVATION_FAILED,
              'Test runtime activation failed.',
              { pluginId: input.owner.pluginId }
            ),
          ]);
        }
        if (control.mode === 'pending') {
          return new Promise<PluginHostResult<PluginRuntimeSession>>(
            (resolve) => {
              control.pendingResolve = resolve;
            }
          );
        }
        const permissionSubscription = input.permission.subscribe((snapshot) =>
          control.permissionNotifications.push(snapshot)
        );
        control.disposePermissionSubscription = () =>
          permissionSubscription.dispose();
        return pluginHostSuccess(createSession(control, input.sessionToken));
      },
    },
    auditSink: {
      append: async (events) => {
        auditEvents.push(...events);
        return options.auditFails
          ? pluginHostFailure([
              createPluginDiagnostic(
                PLUGIN_DIAGNOSTIC_CODES.AUDIT_SINK_FAILED,
                'Test audit sink failed.'
              ),
            ])
          : pluginHostSuccess(undefined);
      },
    },
    clock: { now: () => '2026-07-10T00:00:00.000Z' },
    idFactory: {
      createId: (kind) => {
        id += 1;
        return `${kind}-${id}`;
      },
    },
    runtimeTimeoutMs: options.runtimeTimeoutMs ?? 1_000,
    integrityService: options.integrityService,
    validateContributionBatch: options.validateContributionBatch,
    runtimeArtifactLimits: options.runtimeArtifactMaxBytes
      ? { maxBytes: options.runtimeArtifactMaxBytes }
      : undefined,
  });
  if (!hostResult.ok) throw new Error('Test Host must be created.');
  return {
    host: hostResult.value,
    manifest,
    source: createSource(manifest),
    control,
    auditEvents,
    setGranted: (value: boolean) => {
      granted = value;
    },
  };
};

describe('Plugin Host lifecycle', () => {
  it('runs batch semantic validation after descriptor validation and before publication', async () => {
    const observed: string[] = [];
    const harness = createHarness({
      runtime: false,
      validateContributionBatch: (context) => {
        observed.push(
          `${context.owner.pluginId}/${context.descriptors[0]?.declaration.id}`
        );
        return pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_REFERENCE,
            'Test batch reference is invalid.'
          ),
        ]);
      },
    });

    const discovered = await harness.host.discover(harness.source);

    expect(discovered.ok).toBe(false);
    expect(discovered.diagnostics[0]?.code).toBe('PLG-2020');
    expect(observed).toEqual(['@prodivix/plugin-host-test/static.palette']);
    expect(harness.host.contributions.list('paletteContribution')).toEqual([]);
  });

  it('discovers a declarative plugin and removes installation contributions on disable', async () => {
    const harness = createHarness({ runtime: false });

    const discovered = await harness.host.discover(harness.source);

    expect(discovered.ok).toBe(true);
    if (!discovered.ok) return;
    expect(discovered.value.availability).toBe('ready');
    expect(discovered.value.runtime).toBe('not-applicable');
    expect(harness.host.contributions.list('paletteContribution')).toHaveLength(
      1
    );

    const disabled = await harness.host.disable(harness.manifest.id);

    expect(disabled.ok).toBe(true);
    expect(harness.host.contributions.list('paletteContribution')).toEqual([]);
    expect(harness.host.getSnapshot(harness.manifest.id)?.availability).toBe(
      'disabled'
    );
  });

  it('rejects a well-formed but unregistered contribution contract at the Host boundary', async () => {
    const harness = createHarness({ runtime: false });
    harness.manifest.capabilities[0] = {
      id: 'extension.register',
      scope: 'iconProvider',
      reason: 'Register an icon provider contribution.',
    };
    harness.manifest.contributes[0] = {
      ...harness.manifest.contributes[0]!,
      point: 'iconProvider',
    };

    const result = await harness.host.discover(harness.source);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.UNSUPPORTED_CONTRIBUTION_CONTRACT
    );
    expect(harness.host.contributions.list('paletteContribution')).toEqual([]);
  });

  it('keeps installation contributions while deactivating runtime contributions', async () => {
    const harness = createHarness();
    await harness.host.discover(harness.source);

    const activated = await harness.host.activate(harness.manifest.id, {
      type: 'manual',
    });

    expect(activated.ok).toBe(true);
    expect(activated.ok && activated.value.runtime).toBe('active');
    expect(harness.control.runtimeArtifact).toMatchObject({
      path: './dist/runtime.js',
      packageDigest: 'sha256-test-package',
    });
    expect(harness.control.runtimeArtifact?.digest).toMatch(/^sha256-/);
    expect(
      new TextDecoder().decode(harness.control.runtimeArtifact?.bytes)
    ).toBe('export const activate = () => {};');
    expect(harness.auditEvents).toContainEqual(
      expect.objectContaining({
        action: 'activate',
        packageDigest: 'sha256-test-package',
        runtimeArtifactPath: './dist/runtime.js',
        runtimeArtifactDigest: harness.control.runtimeArtifact?.digest,
      })
    );
    expect(
      harness.host.contributions
        .list('paletteContribution')
        .map((record) => record.identity.contributionId)
    ).toEqual(['static.palette', 'runtime.palette']);

    const deactivated = await harness.host.deactivate(
      harness.manifest.id,
      'manual'
    );

    expect(deactivated.ok).toBe(true);
    expect(
      harness.host.contributions
        .list('paletteContribution')
        .map((record) => record.identity.contributionId)
    ).toEqual(['static.palette']);
    expect(harness.control.deactivationCount).toBe(1);
    expect(harness.control.disposedRuntimeContributionCount).toBe(1);
  });

  it('treats required capability denial as blocked instead of failed', async () => {
    const harness = createHarness({ granted: false });

    const result = await harness.host.discover(harness.source);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.availability).toBe('blocked');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'PLG-3001'
    );
    expect(harness.host.contributions.list('paletteContribution')).toEqual([]);
  });

  it('deduplicates concurrent activation requests', async () => {
    const harness = createHarness();
    await harness.host.discover(harness.source);

    const first = harness.host.activate(harness.manifest.id, {
      type: 'manual',
    });
    const second = harness.host.activate(harness.manifest.id, {
      type: 'manual',
    });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    expect(harness.control.activationCount).toBe(1);
  });

  it('rolls back runtime contributions when activation fails', async () => {
    const harness = createHarness();
    await harness.host.discover(harness.source);
    harness.control.mode = 'failure';

    const result = await harness.host.activate(harness.manifest.id, {
      type: 'manual',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'PLG-4002'
    );
    expect(
      harness.host.contributions
        .list('paletteContribution')
        .map((record) => record.identity.contributionId)
    ).toEqual(['static.palette']);
    expect(harness.control.disposedRuntimeContributionCount).toBe(1);
  });

  it('rejects an unreadable runtime artifact before invoking the adapter', async () => {
    const harness = createHarness();
    const source: PluginPackageSource = {
      ...harness.source,
      reader: {
        ...harness.source.reader,
        readResource: async () =>
          pluginHostFailure([
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_READ_FAILED,
              'Runtime artifact is unavailable in the test package.'
            ),
          ]),
      },
    };
    await harness.host.discover(source);

    const result = await harness.host.activate(harness.manifest.id, {
      type: 'manual',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.RUNTIME_ARTIFACT_READ_FAILED
    );
    expect(harness.control.activationCount).toBe(0);
    expect(
      harness.host.contributions
        .list('paletteContribution')
        .map((record) => record.identity.contributionId)
    ).toEqual(['static.palette']);
  });

  it('enforces the Host runtime artifact byte limit even when the reader ignores it', async () => {
    const harness = createHarness({ runtimeArtifactMaxBytes: 8 });
    await harness.host.discover(harness.source);

    const result = await harness.host.activate(harness.manifest.id, {
      type: 'manual',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.RUNTIME_ARTIFACT_LIMIT
    );
    expect(harness.control.activationCount).toBe(0);
  });

  it('rejects a runtime artifact that does not match declared integrity', async () => {
    const harness = createHarness();
    harness.manifest.entrypoints!.runtime!.integrity =
      'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    await harness.host.discover(harness.source);

    const result = await harness.host.activate(harness.manifest.id, {
      type: 'manual',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.RUNTIME_ARTIFACT_INTEGRITY_MISMATCH
    );
    expect(harness.control.activationCount).toBe(0);
  });

  it('supersedes runtime artifact loading before the adapter can activate', async () => {
    const harness = createHarness();
    let artifactReadStarted = false;
    const source: PluginPackageSource = {
      ...harness.source,
      reader: {
        ...harness.source.reader,
        readResource: async (_path, { signal }) => {
          artifactReadStarted = true;
          return new Promise((resolve) => {
            const abort = () =>
              resolve(
                pluginHostFailure([
                  createPluginDiagnostic(
                    PLUGIN_DIAGNOSTIC_CODES.RUNTIME_ARTIFACT_READ_FAILED,
                    'Runtime artifact read was aborted by the Host.'
                  ),
                ])
              );
            if (signal.aborted) abort();
            else signal.addEventListener('abort', abort, { once: true });
          });
        },
      },
    };
    await harness.host.discover(source);
    const activation = harness.host.activate(harness.manifest.id, {
      type: 'manual',
    });
    await vi.waitFor(() => expect(artifactReadStarted).toBe(true));

    const disable = harness.host.disable(harness.manifest.id);
    const [activationResult, disableResult] = await Promise.all([
      activation,
      disable,
    ]);

    expect(activationResult.ok).toBe(false);
    expect(
      activationResult.diagnostics.map((diagnostic) => diagnostic.code)
    ).toContain(PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED);
    expect(disableResult.ok).toBe(true);
    expect(harness.control.activationCount).toBe(0);
    expect(harness.host.contributions.list('paletteContribution')).toEqual([]);
  });

  it('marks the runtime failed when artifact loading times out', async () => {
    const harness = createHarness({ runtimeTimeoutMs: 10 });
    const source: PluginPackageSource = {
      ...harness.source,
      reader: {
        ...harness.source.reader,
        readResource: async () => new Promise(() => {}),
      },
    };
    await harness.host.discover(source);

    const result = await harness.host.activate(harness.manifest.id, {
      type: 'manual',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.RUNTIME_TIMEOUT
    );
    expect(harness.host.getSnapshot(harness.manifest.id)?.runtime).toBe(
      'failed'
    );
    expect(harness.control.activationCount).toBe(0);
    await harness.host.shutdown();
  });

  it('marks the runtime failed when adapter activation times out', async () => {
    const harness = createHarness({
      runtimeTimeoutMs: 10,
      integrityService: {
        digestSha256: async () =>
          'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      },
    });
    await harness.host.discover(harness.source);
    harness.control.mode = 'pending';

    const result = await harness.host.activate(harness.manifest.id, {
      type: 'manual',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.RUNTIME_TIMEOUT
    );
    expect(harness.host.getSnapshot(harness.manifest.id)?.runtime).toBe(
      'failed'
    );

    expect(harness.control.pendingResolve).toBeTypeOf('function');
    harness.control.pendingResolve!(
      pluginHostSuccess(createSession(harness.control, 'late-timeout-session'))
    );
    await vi.waitFor(() => {
      expect(harness.control.deactivationReasons).toContain(
        'activation-rollback'
      );
    });
    await harness.host.shutdown();
  });

  it('atomically replaces installation contributions with a new generation', async () => {
    const harness = createHarness({ runtime: false });
    const first = await harness.host.discover(harness.source);
    expect(first.ok).toBe(true);
    const replacementManifest = createManifest(false);
    replacementManifest.version = '1.1.0';
    replacementManifest.contributes[0]!.source = {
      kind: 'inline',
      descriptor: { label: 'Replacement palette item' },
    };

    const replacement = await harness.host.discover(
      createSource(replacementManifest)
    );

    expect(replacement.ok).toBe(true);
    if (!replacement.ok) return;
    expect(replacement.value.generation).toBe(2);
    expect(replacement.value.pluginVersion).toBe('1.1.0');
    expect(harness.host.contributions.list('paletteContribution')).toEqual([
      expect.objectContaining({
        owner: expect.objectContaining({ generation: 2 }),
        value: { label: 'Replacement palette item' },
      }),
    ]);
  });

  it('supersedes activation when disable arrives and cleans a late session', async () => {
    const harness = createHarness();
    await harness.host.discover(harness.source);
    harness.control.mode = 'pending';
    const activation = harness.host.activate(harness.manifest.id, {
      type: 'manual',
    });
    await vi.waitFor(() => {
      expect(harness.host.getSnapshot(harness.manifest.id)?.runtime).toBe(
        'activating'
      );
    });

    const disable = harness.host.disable(harness.manifest.id);
    const activationResult = await activation;
    const disableResult = await disable;

    expect(activationResult.ok).toBe(false);
    expect(
      activationResult.diagnostics.map((diagnostic) => diagnostic.code)
    ).toContain('PLG-4006');
    expect(disableResult.ok).toBe(true);
    expect(harness.host.contributions.list('paletteContribution')).toEqual([]);

    const lateSession = createSession(harness.control, 'late-session');
    harness.control.pendingResolve?.(pluginHostSuccess(lateSession));
    await vi.waitFor(() => {
      expect(harness.control.deactivationCount).toBe(1);
    });
    expect(harness.host.getSnapshot(harness.manifest.id)?.availability).toBe(
      'disabled'
    );
  });

  it('revokes required permission by stopping runtime and clearing all leases', async () => {
    const harness = createHarness();
    await harness.host.discover(harness.source);
    await harness.host.activate(harness.manifest.id, { type: 'manual' });
    harness.setGranted(false);

    const reconciled = await harness.host.reconcilePermissions(
      harness.manifest.id
    );

    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.value.availability).toBe('blocked');
    expect(reconciled.value.runtime).toBe('inactive');
    expect(harness.host.contributions.list('paletteContribution')).toEqual([]);
    expect(harness.control.deactivationCount).toBe(1);
    expect(
      harness.control.permissionNotifications.map(
        (snapshot) => snapshot?.permissionRevision
      )
    ).toEqual([2]);
  });

  it('revokes an optional registration capability without blocking runtime', async () => {
    const harness = createHarness({ optionalCapability: true });
    await harness.host.discover(harness.source);
    await harness.host.activate(harness.manifest.id, { type: 'manual' });
    harness.setGranted(false);

    const reconciled = await harness.host.reconcilePermissions(
      harness.manifest.id
    );

    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.value.availability).toBe('ready');
    expect(reconciled.value.runtime).toBe('active');
    expect(harness.host.contributions.list('paletteContribution')).toEqual([]);
    expect(harness.control.deactivationCount).toBe(0);
    expect(
      harness.control.permissionNotifications.map(
        (snapshot) => snapshot?.permissionRevision
      )
    ).toEqual([2]);
  });

  it('handles current-session transport termination without removing static contributions', async () => {
    const harness = createHarness();
    await harness.host.discover(harness.source);
    await harness.host.activate(harness.manifest.id, { type: 'manual' });

    harness.control.terminate?.('transport-closed');

    await vi.waitFor(() => {
      expect(harness.host.getSnapshot(harness.manifest.id)?.runtime).toBe(
        'failed'
      );
    });
    expect(
      harness.host.contributions
        .list('paletteContribution')
        .map((record) => record.identity.contributionId)
    ).toEqual(['static.palette']);
    expect(
      harness.host
        .getSnapshot(harness.manifest.id)
        ?.diagnostics.map((diagnostic) => diagnostic.code)
    ).toContain('PLG-4005');
  });

  it('keeps lifecycle success when the best-effort audit sink fails', async () => {
    const harness = createHarness({ runtime: false, auditFails: true });

    const result = await harness.host.discover(harness.source);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'PLG-4007'
    );
  });

  it('shuts down active plugins exactly once and rejects later operations', async () => {
    const harness = createHarness();
    await harness.host.discover(harness.source);
    await harness.host.activate(harness.manifest.id, { type: 'manual' });

    const firstShutdown = harness.host.shutdown();
    const secondShutdown = harness.host.shutdown();

    expect(secondShutdown).toBe(firstShutdown);
    const result = await firstShutdown;
    expect(result.ok).toBe(true);
    expect(harness.control.deactivationCount).toBe(1);
    expect(harness.control.deactivationReasons).toEqual(['host-shutdown']);
    expect(harness.control.disposedRuntimeContributionCount).toBe(1);
    expect(harness.host.contributions.list('paletteContribution')).toEqual([]);
    expect(harness.host.listSnapshots()).toEqual([]);

    const rejected = await harness.host.discover(harness.source);
    expect(rejected.ok).toBe(false);
    expect(rejected.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.INVALID_HOST_TRANSITION
    );
  });

  it('aborts discovery before a Manifest has produced a plugin identity', async () => {
    const harness = createHarness();
    let manifestReadStarted = false;
    const source: PluginPackageSource = {
      ...harness.source,
      reader: {
        ...harness.source.reader,
        readManifest: async (signal) => {
          manifestReadStarted = true;
          return new Promise((resolve) => {
            const abort = () =>
              resolve(
                pluginHostFailure([
                  createPluginDiagnostic(
                    PLUGIN_DIAGNOSTIC_CODES.INVALID_SOURCE,
                    'Manifest read was aborted by Host shutdown.'
                  ),
                ])
              );
            if (signal.aborted) abort();
            else signal.addEventListener('abort', abort, { once: true });
          });
        },
      },
    };
    const discovery = harness.host.discover(source);
    await vi.waitFor(() => expect(manifestReadStarted).toBe(true));

    const shutdownResult = await harness.host.shutdown();
    const discoveryResult = await discovery;

    expect(shutdownResult.ok).toBe(true);
    expect(discoveryResult.ok).toBe(false);
    expect(harness.host.listSnapshots()).toEqual([]);
    expect(harness.host.contributions.list('paletteContribution')).toEqual([]);
  });

  it('aggregates shutdown cleanup failure after removing every Host lease', async () => {
    const harness = createHarness({ deactivationFails: true });
    await harness.host.discover(harness.source);
    await harness.host.activate(harness.manifest.id, { type: 'manual' });

    const result = await harness.host.shutdown();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED
    );
    expect(harness.host.contributions.list('paletteContribution')).toEqual([]);
    expect(harness.host.listSnapshots()).toEqual([]);
  });

  it('shuts down during activation and cleans a session that resolves late', async () => {
    const harness = createHarness();
    await harness.host.discover(harness.source);
    harness.control.mode = 'pending';
    const activation = harness.host.activate(harness.manifest.id, {
      type: 'manual',
    });
    await vi.waitFor(() => {
      expect(harness.host.getSnapshot(harness.manifest.id)?.runtime).toBe(
        'activating'
      );
    });

    const shutdown = harness.host.shutdown();
    const activationResult = await activation;
    const shutdownResult = await shutdown;

    expect(activationResult.ok).toBe(false);
    expect(shutdownResult.ok).toBe(true);
    expect(harness.host.contributions.list('paletteContribution')).toEqual([]);

    harness.control.pendingResolve?.(
      pluginHostSuccess(createSession(harness.control, 'late-session'))
    );
    await vi.waitFor(() => {
      expect(harness.control.deactivationReasons).toContain(
        'activation-rollback'
      );
    });
  });
});
