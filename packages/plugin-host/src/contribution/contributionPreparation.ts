import {
  createPluginDiagnostic,
  parseStrictJsonDocument,
  PLUGIN_DIAGNOSTIC_CODES,
  type ContributionDeclaration,
  type JsonValue,
  type PluginDiagnostic,
  type PluginManifestV1,
} from '@prodivix/plugin-contracts';
import {
  capabilityIdentityKey,
  compareCapabilityIdentity,
  type CapabilityIdentity,
} from '#host/capability/capabilityIdentity';
import {
  createPermissionSnapshotReader,
  isCapabilityGranted,
  requestedCapabilityKeys,
  type PermissionSnapshot,
  type PermissionSnapshotReader,
} from '#host/capability/permissionSnapshot';
import type { ContributionContractRegistry } from '#host/contribution/contributionContractRegistry';
import type { RegisteredContributionContract } from '#host/contribution/contributionContract';
import type {
  HostContributionPointMap,
  PreparedContributionEntry,
} from '#host/contribution/contribution.types';
import type { PluginOwnerRef } from '#host/identity';
import type { PluginPackageAttestation } from '#host/host.types';
import type { PluginPackageReader } from '#host/host.types';
import type { PluginResourceIntegrityService } from '#host/contribution/resourceIntegrity';
import {
  asNonEmptyDiagnostics,
  pluginHostFailure,
  pluginHostSuccess,
  type PluginHostResult,
} from '#host/result';

export type PluginContributionResourceLimits = Readonly<{
  maxResourceCount: number;
  maxResourceBytes: number;
  maxTotalResourceBytes: number;
  maxDescriptorDepth: number;
  maxDescriptorNodes: number;
}>;

export const DEFAULT_PLUGIN_CONTRIBUTION_RESOURCE_LIMITS: PluginContributionResourceLimits =
  Object.freeze({
    maxResourceCount: 256,
    maxResourceBytes: 256 * 1024,
    maxTotalResourceBytes: 2 * 1024 * 1024,
    maxDescriptorDepth: 64,
    maxDescriptorNodes: 50_000,
  });

export type ValidatedContributionDescriptor<
  TMap extends HostContributionPointMap,
> = Readonly<{
  declaration: ContributionDeclaration;
  declarationIndex: number;
  descriptor: JsonValue;
  contract: RegisteredContributionContract<TMap>;
}>;

export type ContributionBatchValidationContext<
  TMap extends HostContributionPointMap,
> = Readonly<{
  owner: PluginOwnerRef;
  attestation: PluginPackageAttestation;
  manifest: PluginManifestV1;
  permission: PermissionSnapshotReader;
  descriptors: readonly ValidatedContributionDescriptor<TMap>[];
  operationId: string;
  signal: AbortSignal;
}>;

export type ContributionBatchValidator<TMap extends HostContributionPointMap> =
  (
    context: ContributionBatchValidationContext<TMap>
  ) => PluginHostResult<void> | Promise<PluginHostResult<void>>;

type DescriptorLoadContext<TMap extends HostContributionPointMap> = Readonly<{
  owner: PluginOwnerRef;
  manifest: PluginManifestV1;
  permission: PermissionSnapshot;
  reader: PluginPackageReader;
  contracts: ContributionContractRegistry<TMap>;
  integrityService: PluginResourceIntegrityService;
  limits: PluginContributionResourceLimits;
  operationId: string;
  signal: AbortSignal;
}>;

const diagnosticMeta = (
  context: Pick<
    DescriptorLoadContext<HostContributionPointMap>,
    'owner' | 'manifest' | 'operationId'
  >,
  declaration: ContributionDeclaration
) => ({
  pluginId: context.owner.pluginId,
  pluginVersion: context.manifest.version,
  installationId: context.owner.installationId,
  generation: context.owner.generation,
  operationId: context.operationId,
  contributionId: declaration.id,
  contributionPoint: declaration.point,
  contractVersion: declaration.contractVersion,
});

const normalizePositiveLimit = (value: number, fallback: number): number =>
  Number.isSafeInteger(value) && value > 0 ? value : fallback;

export const normalizeContributionResourceLimits = (
  input: Partial<PluginContributionResourceLimits> = {}
): PluginContributionResourceLimits =>
  Object.freeze({
    maxResourceCount: normalizePositiveLimit(
      input.maxResourceCount ?? 0,
      DEFAULT_PLUGIN_CONTRIBUTION_RESOURCE_LIMITS.maxResourceCount
    ),
    maxResourceBytes: normalizePositiveLimit(
      input.maxResourceBytes ?? 0,
      DEFAULT_PLUGIN_CONTRIBUTION_RESOURCE_LIMITS.maxResourceBytes
    ),
    maxTotalResourceBytes: normalizePositiveLimit(
      input.maxTotalResourceBytes ?? 0,
      DEFAULT_PLUGIN_CONTRIBUTION_RESOURCE_LIMITS.maxTotalResourceBytes
    ),
    maxDescriptorDepth: normalizePositiveLimit(
      input.maxDescriptorDepth ?? 0,
      DEFAULT_PLUGIN_CONTRIBUTION_RESOURCE_LIMITS.maxDescriptorDepth
    ),
    maxDescriptorNodes: normalizePositiveLimit(
      input.maxDescriptorNodes ?? 0,
      DEFAULT_PLUGIN_CONTRIBUTION_RESOURCE_LIMITS.maxDescriptorNodes
    ),
  });

const readResource = async <TMap extends HostContributionPointMap>(
  context: DescriptorLoadContext<TMap>,
  declaration: ContributionDeclaration
): Promise<PluginHostResult<Uint8Array>> => {
  if (declaration.source.kind !== 'resource') {
    return pluginHostFailure([
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_JSON,
        'Host attempted to read an inline contribution as a package resource.',
        diagnosticMeta(context, declaration)
      ),
    ]);
  }
  try {
    const result = await context.reader.readResource(declaration.source.path, {
      maxBytes: context.limits.maxResourceBytes,
      signal: context.signal,
    });
    if (!result.ok) return result;
    const bytes = new Uint8Array(result.value);
    if (bytes.byteLength > context.limits.maxResourceBytes) {
      return pluginHostFailure([
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_LIMIT,
          `Contribution resource exceeds the ${context.limits.maxResourceBytes} byte limit.`,
          {
            ...diagnosticMeta(context, declaration),
            resourcePath: declaration.source.path,
            limit: context.limits.maxResourceBytes,
            actual: bytes.byteLength,
          }
        ),
      ]);
    }
    return pluginHostSuccess(bytes, result.diagnostics);
  } catch {
    return pluginHostFailure([
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_READ_FAILED,
        `Contribution resource ${JSON.stringify(declaration.source.path)} could not be read.`,
        {
          ...diagnosticMeta(context, declaration),
          resourcePath: declaration.source.path,
        }
      ),
    ]);
  }
};

const validateContractDescriptor = <TMap extends HostContributionPointMap>(
  context: DescriptorLoadContext<TMap>,
  declaration: ContributionDeclaration,
  contract: RegisteredContributionContract<TMap>,
  descriptor: JsonValue
): PluginHostResult<JsonValue> => {
  try {
    return contract.validateDescriptor(descriptor);
  } catch {
    return pluginHostFailure([
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_SCHEMA_VIOLATION,
        `Contribution ${JSON.stringify(declaration.id)} descriptor validation failed unexpectedly.`,
        diagnosticMeta(context, declaration)
      ),
    ]);
  }
};

export const loadAndValidateContributionDescriptors = async <
  TMap extends HostContributionPointMap,
>(
  context: DescriptorLoadContext<TMap>
): Promise<
  PluginHostResult<readonly ValidatedContributionDescriptor<TMap>[]>
> => {
  const diagnostics: PluginDiagnostic[] = [];
  const validated: ValidatedContributionDescriptor<TMap>[] = [];
  let resourceCount = 0;
  let totalResourceBytes = 0;

  for (const [
    declarationIndex,
    declaration,
  ] of context.manifest.contributes.entries()) {
    if (declaration.enabledByDefault === false) continue;
    const registerCapability: CapabilityIdentity = {
      id: 'extension.register',
      scope: declaration.point,
    };
    if (!isCapabilityGranted(context.permission, registerCapability)) continue;

    const contract = context.contracts.get(declaration);
    if (!contract) {
      return pluginHostFailure([
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.UNSUPPORTED_CONTRIBUTION_CONTRACT,
          `Host does not support ${JSON.stringify(declaration.point)} contract ${JSON.stringify(declaration.contractVersion)}.`,
          diagnosticMeta(context, declaration)
        ),
        ...diagnostics,
      ]);
    }

    let descriptor: JsonValue;
    if (declaration.source.kind === 'inline') {
      descriptor = declaration.source.descriptor;
    } else {
      resourceCount += 1;
      if (resourceCount > context.limits.maxResourceCount) {
        return pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_LIMIT,
            `Plugin exceeds the ${context.limits.maxResourceCount} contribution resource limit.`,
            {
              ...diagnosticMeta(context, declaration),
              limit: context.limits.maxResourceCount,
              actual: resourceCount,
            }
          ),
        ]);
      }
      const resourceResult = await readResource(context, declaration);
      if (!resourceResult.ok) return resourceResult;
      diagnostics.push(...resourceResult.diagnostics);
      totalResourceBytes += resourceResult.value.byteLength;
      if (totalResourceBytes > context.limits.maxTotalResourceBytes) {
        return pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_LIMIT,
            `Plugin contribution resources exceed the ${context.limits.maxTotalResourceBytes} total byte limit.`,
            {
              ...diagnosticMeta(context, declaration),
              limit: context.limits.maxTotalResourceBytes,
              actual: totalResourceBytes,
            }
          ),
        ]);
      }
      if (declaration.source.integrity) {
        try {
          const actualIntegrity = await context.integrityService.digestSha256(
            resourceResult.value,
            context.signal
          );
          if (actualIntegrity !== declaration.source.integrity) {
            return pluginHostFailure([
              createPluginDiagnostic(
                PLUGIN_DIAGNOSTIC_CODES.RESOURCE_INTEGRITY_MISMATCH,
                `Contribution resource ${JSON.stringify(declaration.source.path)} does not match its declared integrity.`,
                {
                  ...diagnosticMeta(context, declaration),
                  resourcePath: declaration.source.path,
                }
              ),
            ]);
          }
        } catch {
          return pluginHostFailure([
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.RESOURCE_INTEGRITY_MISMATCH,
              `Contribution resource ${JSON.stringify(declaration.source.path)} integrity could not be verified.`,
              {
                ...diagnosticMeta(context, declaration),
                resourcePath: declaration.source.path,
              }
            ),
          ]);
        }
      }
      const parsed = parseStrictJsonDocument(resourceResult.value, {
        documentKind: 'contribution',
        maxBytes: context.limits.maxResourceBytes,
        maxDepth: context.limits.maxDescriptorDepth,
        maxNodes: context.limits.maxDescriptorNodes,
        diagnosticMeta: {
          ...diagnosticMeta(context, declaration),
          resourcePath: declaration.source.path,
        },
      });
      if (!parsed.ok) {
        const nonEmpty = asNonEmptyDiagnostics(parsed.diagnostics);
        if (nonEmpty) return pluginHostFailure(nonEmpty);
        continue;
      }
      descriptor = parsed.value;
    }

    const contractResult = validateContractDescriptor(
      context,
      declaration,
      contract,
      descriptor
    );
    if (!contractResult.ok) return contractResult;
    diagnostics.push(...contractResult.diagnostics);
    validated.push(
      Object.freeze({
        declaration,
        declarationIndex,
        descriptor: contractResult.value,
        contract,
      })
    );
  }

  return pluginHostSuccess(Object.freeze(validated), diagnostics);
};

const disposePrepared = async <TMap extends HostContributionPointMap>(
  entries: readonly PreparedContributionEntry<TMap>[],
  context: Pick<
    DescriptorLoadContext<TMap>,
    'owner' | 'manifest' | 'operationId'
  >
): Promise<PluginDiagnostic[]> => {
  const diagnostics: PluginDiagnostic[] = [];
  for (const entry of [...entries].reverse()) {
    try {
      await entry.prepared.dispose?.();
    } catch {
      diagnostics.push(
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED,
          `Prepared contribution ${JSON.stringify(entry.declaration.id)} could not be disposed.`,
          diagnosticMeta(context, entry.declaration)
        )
      );
    }
  }
  return diagnostics;
};

export const prepareValidatedContributions = async <
  TMap extends HostContributionPointMap,
>(
  context: Readonly<{
    owner: PluginOwnerRef;
    attestation: PluginPackageAttestation;
    manifest: PluginManifestV1;
    permission: PermissionSnapshot;
    descriptors: readonly ValidatedContributionDescriptor<TMap>[];
    operationId: string;
    signal: AbortSignal;
  }>
): Promise<PluginHostResult<readonly PreparedContributionEntry<TMap>[]>> => {
  const preparedEntries: PreparedContributionEntry<TMap>[] = [];
  const diagnostics: PluginDiagnostic[] = [];
  const requested = requestedCapabilityKeys(context.manifest);
  const permissionReader = createPermissionSnapshotReader(context.permission);

  for (const descriptor of context.descriptors) {
    let preparedResult;
    try {
      preparedResult = await descriptor.contract.prepare({
        owner: context.owner,
        attestation: context.attestation,
        declaration: descriptor.declaration,
        descriptor: descriptor.descriptor,
        permission: permissionReader,
        operationId: context.operationId,
        signal: context.signal,
      });
    } catch {
      preparedResult = pluginHostFailure([
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOLVER_FAILED,
          `Contribution ${JSON.stringify(descriptor.declaration.id)} resolver failed unexpectedly.`,
          diagnosticMeta(context, descriptor.declaration)
        ),
      ]);
    }
    if (!preparedResult.ok) {
      const cleanup = await disposePrepared(preparedEntries, context);
      const combined = asNonEmptyDiagnostics([
        ...diagnostics,
        ...preparedResult.diagnostics,
        ...cleanup,
      ]);
      return pluginHostFailure(
        combined ?? [
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOLVER_FAILED,
            'Contribution preparation failed without a diagnostic.',
            diagnosticMeta(context, descriptor.declaration)
          ),
        ]
      );
    }
    diagnostics.push(...preparedResult.diagnostics);
    const mandatoryRegisterCapability: CapabilityIdentity = {
      id: 'extension.register',
      scope: descriptor.declaration.point,
    };
    const dependencies = new Map<string, CapabilityIdentity>();
    for (const capability of [
      mandatoryRegisterCapability,
      ...preparedResult.value.dependsOnCapabilities,
    ]) {
      const key = capabilityIdentityKey(capability);
      if (
        !requested.has(key) ||
        !isCapabilityGranted(context.permission, capability)
      ) {
        const cleanup = await disposePrepared(preparedEntries, context);
        try {
          await preparedResult.value.dispose?.();
        } catch {
          cleanup.push(
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED,
              `Unauthorized prepared contribution ${JSON.stringify(descriptor.declaration.id)} could not be disposed.`,
              diagnosticMeta(context, descriptor.declaration)
            )
          );
        }
        return pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOLVER_FAILED,
            `Contribution ${JSON.stringify(descriptor.declaration.id)} depends on an unrequested or denied capability.`,
            {
              ...diagnosticMeta(context, descriptor.declaration),
              capabilityId: capability.id,
              capabilityScope: capability.scope,
            }
          ),
          ...cleanup,
        ]);
      }
      dependencies.set(key, Object.freeze({ ...capability }));
    }
    if (
      preparedResult.value.lifetime === 'activation' &&
      !context.manifest.entrypoints?.runtime
    ) {
      const cleanup = await disposePrepared(preparedEntries, context);
      try {
        await preparedResult.value.dispose?.();
      } catch {
        // Best-effort cleanup of the contribution that is already being rejected;
        // its own failure must not replace the rejection diagnostic below.
      }
      return pluginHostFailure([
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOLVER_FAILED,
          `Contribution ${JSON.stringify(descriptor.declaration.id)} requires activation lifetime without a runtime entrypoint.`,
          diagnosticMeta(context, descriptor.declaration)
        ),
        ...cleanup,
      ]);
    }
    if (
      preparedResult.value.order !== undefined &&
      !Number.isSafeInteger(preparedResult.value.order)
    ) {
      const cleanup = await disposePrepared(preparedEntries, context);
      try {
        await preparedResult.value.dispose?.();
      } catch {
        // Best-effort cleanup of the contribution that is already being rejected;
        // its own failure must not replace the rejection diagnostic below.
      }
      return pluginHostFailure([
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOLVER_FAILED,
          `Contribution ${JSON.stringify(descriptor.declaration.id)} returned an invalid order.`,
          diagnosticMeta(context, descriptor.declaration)
        ),
        ...cleanup,
      ]);
    }

    preparedEntries.push(
      Object.freeze({
        declaration: descriptor.declaration,
        declarationIndex: descriptor.declarationIndex,
        prepared: Object.freeze({
          ...preparedResult.value,
          dependsOnCapabilities: Object.freeze(
            [...dependencies.values()].sort(compareCapabilityIdentity)
          ),
          order:
            preparedResult.value.order ??
            descriptor.declaration.metadata?.order ??
            0,
        }),
      })
    );
  }

  return pluginHostSuccess(Object.freeze(preparedEntries), diagnostics);
};
