import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type InlineContributionSource,
  type PluginManifestV1,
} from '@prodivix/plugin-contracts';
import {
  pluginHostFailure,
  pluginHostSuccess,
  type PluginHostResult,
  type PluginResourceIntegrityService,
} from '@prodivix/plugin-host';
import type {
  TrustedPackageBuildResult,
  TrustedWebPluginInput,
} from '@/plugins/platform/types';

const encoder = new TextEncoder();

const registrationCapabilities = (input: TrustedWebPluginInput) =>
  [...new Set(input.contributions.map((contribution) => contribution.point))]
    .sort((left, right) => left.localeCompare(right))
    .map((point) => ({
      id: 'extension.register' as const,
      scope: point,
      reason: `Register trusted ${point} contributions.`,
    }));

const createManifest = (input: TrustedWebPluginInput): PluginManifestV1 => ({
  schemaVersion: '1.0',
  id: input.pluginId,
  displayName: input.displayName,
  version: input.version,
  publisher: input.publisher,
  engines: { prodivix: '>=0.1.0 <1.0.0' },
  capabilities: registrationCapabilities(input),
  contributes: input.contributions.map((contribution) => ({
    id: contribution.id,
    point: contribution.point,
    contractVersion: contribution.contractVersion,
    source: {
      kind: 'inline' as const,
      // Closed generated schema types are JSON-safe but have no index signature.
      descriptor:
        contribution.descriptor as unknown as InlineContributionSource['descriptor'],
    },
    ...(contribution.metadata ? { metadata: contribution.metadata } : {}),
  })),
});

export const createTrustedPackageSource = async (
  input: TrustedWebPluginInput,
  options: Readonly<{
    sourceId: string;
    integrityService: PluginResourceIntegrityService;
    signal: AbortSignal;
  }>
): Promise<PluginHostResult<TrustedPackageBuildResult>> => {
  const manifest = createManifest(input);
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  let packageDigest: string;
  try {
    packageDigest = await options.integrityService.digestSha256(
      manifestBytes,
      options.signal
    );
  } catch {
    return pluginHostFailure([
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_READ_FAILED,
        'Trusted plugin package identity could not be computed.',
        {
          pluginId: input.pluginId,
          installationId: input.installationId,
          reasonCode: options.signal.aborted
            ? 'package-build-aborted'
            : 'package-digest-failed',
        }
      ),
    ]);
  }

  const source = Object.freeze({
    installationId: input.installationId,
    attestation: Object.freeze({
      sourceId: options.sourceId,
      packageDigest,
      trustLevel: input.trustLevel,
      publisherVerified: input.publisherVerified,
    }),
    reader: Object.freeze({
      readManifest: async (signal: AbortSignal) =>
        signal.aborted
          ? pluginHostFailure([
              createPluginDiagnostic(
                PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_READ_FAILED,
                'Trusted plugin Manifest read was aborted.',
                { pluginId: input.pluginId }
              ),
            ])
          : pluginHostSuccess(new Uint8Array(manifestBytes)),
      readResource: async () =>
        pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_READ_FAILED,
            'Trusted inline plugin package does not expose resource files.',
            { pluginId: input.pluginId }
          ),
        ]),
    }),
  });

  return pluginHostSuccess(Object.freeze({ manifest, source }));
};
