import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  validatePaletteContribution,
  type PluginDiagnostic,
} from '@prodivix/plugin-contracts';
import {
  asNonEmptyDiagnostics,
  createPluginHost,
  createSha256ResourceIntegrityService,
  pluginHostFailure,
  pluginHostSuccess,
  resolvePermissionSnapshot,
  type CapabilityPolicy,
  type PluginAuditSink,
  type PluginClock,
  type PluginHostResult,
  type PluginHostSnapshot,
  type PluginIdFactory,
  type PluginResourceIntegrityService,
  type PluginRuntimeAdapter,
  type RegisteredContributionContract,
} from '@prodivix/plugin-host';
import { createBundledPluginPackageSource } from '@prodivix/plugin-package';
import { createPaletteProjectionResolver } from '@/editor/features/blueprint/palette/projectionResolver';
import { createPaletteQueryService } from '@/plugins/platform/paletteQueryService';
import { createWebExtensionQueryService } from '@/plugins/platform/extensionQueryService';
import { createIconProviderRegistryBridge } from '@/plugins/platform/iconProviderBridge';
import { createPluginAuditJournal } from '@/plugins/platform/pluginAuditJournal';
import { createTrustedPackageSource } from '@/plugins/platform/trustedPackageSource';
import {
  BUILT_IN_OFFICIAL_HOST_MODULE_CATALOG,
  createLibraryArtifactResolver,
  createOfficialHostImplementationRegistry,
  type OfficialHostModuleCatalogEntry,
} from '@/plugins/platform/officialHostImplementations';
import { validateWebContributionBatch } from '@/plugins/platform/contributions/contributionBatchValidator';
import { createExternalLibraryContributionResolver } from '@/plugins/platform/contributions/externalLibraryResolver';
import { createRenderPolicyContributionResolver } from '@/plugins/platform/contributions/renderPolicyResolver';
import { createCodegenPolicyContributionResolver } from '@/plugins/platform/contributions/codegenPolicyResolver';
import { createIconProviderContributionResolver } from '@/plugins/platform/contributions/iconProviderResolver';
import { createBlueprintTemplateContributionResolver } from '@/plugins/platform/contributions/blueprintTemplateResolver';
import { createOfficialSurfaceLeaseRegistry } from '@/plugins/platform/officialSurfaceHost';
import type {
  TrustedPaletteContributionInput,
  WebContributionPointMap,
  WebPluginPlatform,
} from '@/plugins/platform/types';

const WEB_PLUGIN_HOST_VERSION = '0.1.0';

const createUnavailableRuntimeAdapter =
  (): PluginRuntimeAdapter<WebContributionPointMap> =>
    Object.freeze({
      activate: async (input) =>
        pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.RUNTIME_ACTIVATION_FAILED,
            'This Web Plugin Platform has no Browser runtime adapter.',
            { pluginId: input.owner.pluginId }
          ),
        ]),
    });

const createDefaultCapabilityPolicy = (): CapabilityPolicy => ({
  resolve: async (input) => {
    const trusted =
      input.attestation.trustLevel === 'core' ||
      input.attestation.trustLevel === 'official';
    return resolvePermissionSnapshot({
      owner: input.owner,
      pluginVersion: input.manifest.version,
      requests: input.manifest.capabilities,
      decisions: input.manifest.capabilities.map((request) => ({
        capability:
          'scope' in request
            ? { id: request.id, scope: request.scope }
            : { id: request.id },
        decision: trusted ? 'grant' : 'deny',
        source: 'host-safety',
        reasonCode: trusted
          ? 'trusted-web-plugin-package'
          : 'web-plugin-trust-level-denied',
      })),
      permissionRevision: input.nextPermissionRevision,
      policyRevision: 'web-plugin-platform-v1',
      policySource: 'web-plugin-platform',
    });
  },
});

export type CreateWebPluginPlatformOptions = Readonly<{
  workspaceId: string;
  contracts?: readonly RegisteredContributionContract<WebContributionPointMap>[];
  runtimeAdapter?: PluginRuntimeAdapter<WebContributionPointMap>;
  capabilityPolicy?: CapabilityPolicy;
  auditSink?: PluginAuditSink;
  integrityService?: PluginResourceIntegrityService;
  clock?: PluginClock;
  idFactory?: PluginIdFactory;
  officialHostModules?: readonly OfficialHostModuleCatalogEntry[];
  allowDevelopmentHostImplementations?: boolean;
  onShutdown?: () => void | Promise<void>;
}>;

export const createWebPluginPlatform = (
  options: CreateWebPluginPlatformOptions
): PluginHostResult<WebPluginPlatform> => {
  const workspaceId = options.workspaceId.trim();
  if (!workspaceId) {
    return pluginHostFailure([
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.INVALID_HOST_TRANSITION,
        'Web Plugin Platform requires a non-empty workspace identity.'
      ),
    ]);
  }

  let generatedId = 0;
  const nextId = (kind: string) => {
    generatedId += 1;
    return `web-plugin-${workspaceId}-${kind}-${generatedId}`;
  };
  const idFactory: PluginIdFactory =
    options.idFactory ??
    Object.freeze({
      createId: (kind) => nextId(kind),
    });
  const integrityService =
    options.integrityService ?? createSha256ResourceIntegrityService();
  const auditJournal = createPluginAuditJournal();
  const surfaceLeases = createOfficialSurfaceLeaseRegistry();
  const implementationRegistryResult = createOfficialHostImplementationRegistry(
    options.officialHostModules ?? BUILT_IN_OFFICIAL_HOST_MODULE_CATALOG,
    {
      allowDevelopment: options.allowDevelopmentHostImplementations,
    }
  );
  if (implementationRegistryResult.ok === false) {
    return pluginHostFailure(implementationRegistryResult.diagnostics);
  }
  const implementationRegistry = implementationRegistryResult.value;
  const paletteResolver = createPaletteProjectionResolver(
    implementationRegistry,
    surfaceLeases
  );
  const libraryArtifacts = createLibraryArtifactResolver(
    implementationRegistry
  );
  const hostResult = createPluginHost<WebContributionPointMap>({
    hostVersion: WEB_PLUGIN_HOST_VERSION,
    contracts: [
      paletteResolver.contract,
      createExternalLibraryContributionResolver(libraryArtifacts),
      createRenderPolicyContributionResolver(
        implementationRegistry,
        surfaceLeases
      ),
      createCodegenPolicyContributionResolver(),
      createIconProviderContributionResolver(libraryArtifacts, surfaceLeases),
      createBlueprintTemplateContributionResolver(),
      ...(options.contracts ?? []),
    ],
    validateContributionBatch: validateWebContributionBatch,
    capabilityPolicy:
      options.capabilityPolicy ?? createDefaultCapabilityPolicy(),
    runtimeAdapter: options.runtimeAdapter ?? createUnavailableRuntimeAdapter(),
    auditSink: options.auditSink ?? auditJournal.sink,
    integrityService,
    clock: options.clock ?? { now: () => new Date().toISOString() },
    idFactory,
  });
  if (hostResult.ok === false) {
    return pluginHostFailure(hostResult.diagnostics);
  }
  const host = hostResult.value;
  const bundledInstallations = new Map<
    string,
    Readonly<{
      pluginId: string;
      packageDigest: string;
      generation: number;
    }>
  >();
  const paletteQuery = createPaletteQueryService(host.contributions);
  const extensionQuery = createWebExtensionQueryService(host.contributions);

  const install = async (
    input: Parameters<WebPluginPlatform['runtime']['packages']['install']>[0],
    signal = new AbortController().signal
  ): Promise<PluginHostResult<PluginHostSnapshot>> => {
    const sourceResult = await createTrustedPackageSource(input, {
      sourceId: nextId('package-source'),
      integrityService,
      signal,
    });
    if (sourceResult.ok === false) {
      return pluginHostFailure(sourceResult.diagnostics);
    }
    if (signal.aborted) {
      return pluginHostFailure([
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED,
          'Trusted plugin package installation was canceled before discovery.',
          { pluginId: input.pluginId }
        ),
      ]);
    }

    const missingPaletteProjection = input.contributions.find(
      (contribution) =>
        contribution.point === 'paletteContribution' &&
        !contribution.paletteProjection
    );
    if (missingPaletteProjection) {
      return pluginHostFailure([
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOLVER_FAILED,
          'Trusted Palette contribution requires a runtime projection.',
          {
            pluginId: input.pluginId,
            contributionId: missingPaletteProjection.id,
            contributionPoint: missingPaletteProjection.point,
            contractVersion: missingPaletteProjection.contractVersion,
          }
        ),
      ]);
    }

    const bindings: Array<Readonly<{ dispose(): void }>> = [];
    for (const contribution of input.contributions) {
      if (
        contribution.point !== 'paletteContribution' ||
        !contribution.paletteProjection
      ) {
        continue;
      }
      bindings.push(
        paletteResolver.bindProjection({
          packageSourceId: sourceResult.value.source.attestation.sourceId,
          packageDigest: sourceResult.value.source.attestation.packageDigest,
          pluginId: input.pluginId,
          contributionId: contribution.id,
          projection: contribution.paletteProjection,
        })
      );
    }

    try {
      return await host.discover(sourceResult.value.source, signal);
    } finally {
      [...bindings].reverse().forEach((binding) => binding.dispose());
    }
  };

  const disable = async (pluginId: string) => {
    if (!host.getSnapshot(pluginId)) {
      bundledInstallations.delete(pluginId);
      return pluginHostSuccess(undefined);
    }
    const result = await host.disable(pluginId);
    if (host.getSnapshot(pluginId)?.availability !== 'ready') {
      bundledInstallations.delete(pluginId);
    }
    return result.ok
      ? pluginHostSuccess(undefined, result.diagnostics)
      : result;
  };

  const installBundled: WebPluginPlatform['runtime']['packages']['installBundled'] =
    async (artifact, packageOptions) => {
      const signal = packageOptions.signal ?? new AbortController().signal;
      const source = await createBundledPluginPackageSource(artifact, {
        installationId: packageOptions.installationId,
        sourceId: packageOptions.sourceId,
        trustLevel: packageOptions.trustLevel,
        publisherVerified: packageOptions.publisherVerified,
        signatureKeyId: packageOptions.signatureKeyId,
        signal,
      });
      if (source.ok === false) return pluginHostFailure(source.diagnostics);
      const discovered = await host.discover(source.value, signal);
      if (discovered.ok) {
        bundledInstallations.set(discovered.value.pluginId, {
          pluginId: discovered.value.pluginId,
          packageDigest: artifact.packageDigest,
          generation: discovered.value.generation,
        });
      }
      return discovered;
    };

  const installPalette = (
    input: TrustedPaletteContributionInput,
    signal?: AbortSignal
  ) => {
    const validation = validatePaletteContribution(input.descriptor);
    if (!validation.ok) {
      return Promise.resolve(
        pluginHostFailure(
          asNonEmptyDiagnostics(validation.diagnostics) ?? [
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_SCHEMA_VIOLATION,
              'Palette descriptor validation failed without a diagnostic.',
              {
                pluginId: input.pluginId,
                contributionId: input.contributionId,
              }
            ),
          ]
        )
      );
    }
    return install(
      {
        pluginId: input.pluginId,
        displayName: input.displayName,
        version: input.version,
        publisher: input.publisher ?? 'prodivix',
        installationId: input.installationId,
        trustLevel: input.trustLevel ?? 'core',
        publisherVerified: input.publisherVerified ?? true,
        contributions: [
          {
            id: input.contributionId,
            point: 'paletteContribution',
            contractVersion: '1.0',
            descriptor: validation.descriptor,
            metadata: { order: input.order ?? 0 },
            paletteProjection: { groups: input.groups },
          },
        ],
      },
      signal
    );
  };

  const cleanupEntries = new Set<Readonly<{ run(): Promise<void> }>>();
  const registerCleanup = (cleanup: () => void | Promise<void>) => {
    let disposed = false;
    let runPromise: Promise<void> | undefined;
    const entry = Object.freeze({
      run: () => {
        runPromise ??= Promise.resolve().then(cleanup);
        return runPromise;
      },
    });
    cleanupEntries.add(entry);
    return Object.freeze({
      run: entry.run,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        cleanupEntries.delete(entry);
      },
    });
  };
  const iconProviderBridge = createIconProviderRegistryBridge(extensionQuery);
  registerCleanup(() => iconProviderBridge.dispose());

  let shutdownPromise: Promise<PluginHostResult<void>> | undefined;
  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      const diagnostics: PluginDiagnostic[] = [];
      for (const entry of [...cleanupEntries]) {
        try {
          await entry.run();
        } catch {
          diagnostics.push(
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED,
              'Workspace plugin cleanup task failed.',
              { workspaceId }
            )
          );
        }
      }
      cleanupEntries.clear();
      const hostShutdown = await host.shutdown();
      diagnostics.push(...hostShutdown.diagnostics);
      try {
        await surfaceLeases.releaseAll();
      } catch {
        diagnostics.push(
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED,
            'Official plugin surface cleanup failed.',
            { workspaceId }
          )
        );
      }
      try {
        await options.onShutdown?.();
      } catch {
        diagnostics.push(
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED,
            'Web Plugin Platform dependency cleanup failed.',
            { workspaceId }
          )
        );
      }
      const errors = diagnostics.filter(
        (diagnostic) =>
          diagnostic.severity === 'error' || diagnostic.severity === 'fatal'
      );
      return errors.length > 0
        ? pluginHostFailure(asNonEmptyDiagnostics(diagnostics) ?? [errors[0]!])
        : pluginHostSuccess(undefined, diagnostics);
    })();
    return shutdownPromise;
  };

  const packages = Object.freeze({
    install,
    installBundled,
    discover: host.discover,
    disable,
    getSnapshot: host.getSnapshot,
    listSnapshots: host.listSnapshots,
    listBundledInstallations: () =>
      Object.freeze(
        [...bundledInstallations.values()]
          .filter((installation) => {
            const snapshot = host.getSnapshot(installation.pluginId);
            return (
              snapshot?.availability === 'ready' &&
              snapshot.generation === installation.generation
            );
          })
          .map((installation) =>
            Object.freeze({
              pluginId: installation.pluginId,
              packageDigest: installation.packageDigest,
            })
          )
          .sort((left, right) => left.pluginId.localeCompare(right.pluginId))
      ),
    subscribe: host.subscribe,
    contributions: host.contributions,
  });
  const paletteContributions = Object.freeze({
    workspaceId,
    install: installPalette,
    disable,
  });

  return pluginHostSuccess(
    Object.freeze({
      workspaceId,
      queries: Object.freeze({
        workspaceId,
        palette: paletteQuery,
        extensions: extensionQuery,
      }),
      runtime: Object.freeze({
        workspaceId,
        packages,
        paletteContributions,
        surfaceLeases,
        registerCleanup,
      }),
      getAuditEvents: auditJournal.list,
      listOfficialImplementationBindings: implementationRegistry.listBindings,
      shutdown,
    })
  );
};
