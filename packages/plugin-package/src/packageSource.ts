import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
} from '@prodivix/plugin-contracts';
import {
  pluginHostFailure,
  pluginHostSuccess,
  type PluginHostResult,
  type PluginPackageSource,
  type PluginTrustLevel,
} from '@prodivix/plugin-host';
import {
  normalizeBundledPluginResourcePath,
  verifyBundledPluginArtifact,
  type BundledPluginArtifactLimits,
  type BundledPluginArtifactV1,
  type BundledPluginDigestService,
} from '#package/artifact';

export type CreateBundledPluginPackageSourceOptions = Readonly<{
  installationId: string;
  sourceId: string;
  trustLevel: PluginTrustLevel;
  publisherVerified: boolean;
  signatureKeyId?: string;
  signal?: AbortSignal;
  limits?: BundledPluginArtifactLimits;
  digestService?: BundledPluginDigestService;
}>;

const failure = (
  code:
    | typeof PLUGIN_DIAGNOSTIC_CODES.INVALID_SOURCE
    | typeof PLUGIN_DIAGNOSTIC_CODES.RESOURCE_INTEGRITY_MISMATCH
    | typeof PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_READ_FAILED
    | typeof PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_LIMIT
    | typeof PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED,
  message: string,
  meta: Record<string, string | number | boolean | undefined> = {}
) => pluginHostFailure([createPluginDiagnostic(code, message, meta)]);

const dirname = (path: string): string => {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
};

const resolveResourcePath = (manifestPath: string, requestedPath: string) => {
  const relativePath = normalizeBundledPluginResourcePath(requestedPath);
  const base = dirname(manifestPath);
  return base ? `${base}/${relativePath}` : relativePath;
};

export const createBundledPluginPackageSource = async (
  artifact: BundledPluginArtifactV1,
  options: CreateBundledPluginPackageSourceOptions
): Promise<PluginHostResult<PluginPackageSource>> => {
  const signal = options.signal ?? new AbortController().signal;
  const installationId = options.installationId.trim();
  const sourceId = options.sourceId.trim();
  if (!installationId || !sourceId) {
    return failure(
      PLUGIN_DIAGNOSTIC_CODES.INVALID_SOURCE,
      'Bundled plugin package source requires installation and source identities.'
    );
  }

  const verified = await verifyBundledPluginArtifact(artifact, {
    signal,
    limits: options.limits,
    digestService: options.digestService,
  });
  if (!verified.ok) {
    const issue = verified.issues[0];
    if (issue?.code === 'operation-aborted') {
      return failure(
        PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED,
        'Bundled plugin package verification was canceled.',
        { installationId, sourceId }
      );
    }
    const resourceLimit =
      issue?.code === 'resource-limit-exceeded' ||
      issue?.code === 'package-limit-exceeded';
    return failure(
      resourceLimit
        ? PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_LIMIT
        : issue?.code === 'digest-mismatch'
          ? PLUGIN_DIAGNOSTIC_CODES.RESOURCE_INTEGRITY_MISMATCH
          : PLUGIN_DIAGNOSTIC_CODES.INVALID_SOURCE,
      issue?.message ?? 'Bundled plugin artifact is invalid.',
      {
        installationId,
        sourceId,
        resourcePath: issue?.path,
        limit: issue?.limit,
        actual: issue?.actual,
        reasonCode: issue?.code,
      }
    );
  }

  const resources = new Map(
    verified.artifact.resources.map(
      (resource) => [resource.path, resource.bytes] as const
    )
  );
  const readBytes = (
    path: string,
    maxBytes: number,
    readSignal: AbortSignal
  ): PluginHostResult<Uint8Array> => {
    if (readSignal.aborted) {
      return failure(
        PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED,
        'Bundled plugin resource read was canceled.',
        { installationId, sourceId, resourcePath: path }
      );
    }
    const bytes = resources.get(path);
    if (!bytes) {
      return failure(
        PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_READ_FAILED,
        'Bundled plugin resource does not exist.',
        { installationId, sourceId, resourcePath: path }
      );
    }
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes <= 0 ||
      bytes.length > maxBytes
    ) {
      return failure(
        PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_LIMIT,
        'Bundled plugin resource exceeds the requested byte limit.',
        {
          installationId,
          sourceId,
          resourcePath: path,
          limit: maxBytes,
          actual: bytes.length,
        }
      );
    }
    return pluginHostSuccess(new Uint8Array(bytes));
  };

  return pluginHostSuccess(
    Object.freeze({
      installationId,
      attestation: Object.freeze({
        sourceId,
        packageDigest: verified.artifact.packageDigest,
        trustLevel: options.trustLevel,
        publisherVerified: options.publisherVerified,
        ...(options.signatureKeyId
          ? { signatureKeyId: options.signatureKeyId }
          : {}),
      }),
      reader: Object.freeze({
        readManifest: async (readSignal: AbortSignal) =>
          readBytes(
            verified.artifact.manifestPath,
            Number.MAX_SAFE_INTEGER,
            readSignal
          ),
        readResource: async (
          requestedPath: string,
          readOptions: Readonly<{ maxBytes: number; signal: AbortSignal }>
        ) => {
          let resourcePath: string;
          try {
            resourcePath = resolveResourcePath(
              verified.artifact.manifestPath,
              requestedPath
            );
          } catch {
            return failure(
              PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_READ_FAILED,
              'Bundled plugin resource path is invalid.',
              { installationId, sourceId, resourcePath: requestedPath }
            );
          }
          return readBytes(
            resourcePath,
            readOptions.maxBytes,
            readOptions.signal
          );
        },
      }),
    })
  );
};
