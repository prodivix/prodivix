import type { ActivationEvent } from '@prodivix/plugin-contracts';
import type { PluginAuditSink } from '#host/audit/audit.types';
import type { CapabilityPolicy } from '#host/capability/capabilityPolicy';
import type { RegisteredContributionContract } from '#host/contribution/contributionContract';
import type { ContributionRegistryReader } from '#host/contribution/contributionRegistry';
import type { HostContributionPointMap } from '#host/contribution/contribution.types';
import type {
  ContributionBatchValidator,
  PluginContributionResourceLimits,
} from '#host/contribution/contributionPreparation';
import type { PluginResourceIntegrityService } from '#host/contribution/resourceIntegrity';
import type {
  Disposable,
  PluginClock,
  PluginHostListener,
  PluginHostSnapshot,
  PluginIdFactory,
  PluginPackageSource,
} from '#host/host.types';
import type {
  PluginRuntimeAdapter,
  RuntimeDeactivationReason,
} from '#host/runtime/pluginRuntimeAdapter';
import type { PluginRuntimeArtifactLimits } from '#host/runtime/runtimeArtifact';
import type { PluginHostResult } from '#host/result';

export type PluginHost<TMap extends HostContributionPointMap> = Readonly<{
  discover(
    source: PluginPackageSource,
    signal?: AbortSignal
  ): Promise<PluginHostResult<PluginHostSnapshot>>;
  enable(pluginId: string): Promise<PluginHostResult<PluginHostSnapshot>>;
  disable(pluginId: string): Promise<PluginHostResult<PluginHostSnapshot>>;
  activate(
    pluginId: string,
    event: ActivationEvent
  ): Promise<PluginHostResult<PluginHostSnapshot>>;
  deactivate(
    pluginId: string,
    reason: RuntimeDeactivationReason
  ): Promise<PluginHostResult<PluginHostSnapshot>>;
  reconcilePermissions(
    pluginId: string
  ): Promise<PluginHostResult<PluginHostSnapshot>>;
  retry(pluginId: string): Promise<PluginHostResult<PluginHostSnapshot>>;
  shutdown(): Promise<PluginHostResult<void>>;
  getSnapshot(pluginId: string): PluginHostSnapshot | undefined;
  listSnapshots(): readonly PluginHostSnapshot[];
  subscribe(listener: PluginHostListener): Disposable;
  contributions: ContributionRegistryReader<TMap>;
}>;

export type CreatePluginHostOptions<TMap extends HostContributionPointMap> =
  Readonly<{
    hostVersion: string;
    knownCommandIds?: readonly string[];
    contracts: readonly RegisteredContributionContract<TMap>[];
    capabilityPolicy: CapabilityPolicy;
    runtimeAdapter: PluginRuntimeAdapter<TMap>;
    auditSink: PluginAuditSink;
    clock: PluginClock;
    idFactory: PluginIdFactory;
    integrityService?: PluginResourceIntegrityService;
    contributionResourceLimits?: Partial<PluginContributionResourceLimits>;
    runtimeArtifactLimits?: Partial<PluginRuntimeArtifactLimits>;
    runtimeTimeoutMs?: number;
    validateContributionBatch?: ContributionBatchValidator<TMap>;
  }>;
