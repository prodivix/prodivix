import type { PluginDiagnostic } from '@prodivix/plugin-contracts';
import {
  createBrowserGatewaySessionFactory,
  createBrowserPluginRuntimeAdapter,
  createBrowserRuntimeSandboxFactory,
  createBuiltInGatewayContractRegistry,
  createIndexedDbGatewayAuditStore,
  type BuiltInGatewayServicePorts,
} from '@prodivix/plugin-browser';
import {
  pluginHostFailure,
  type PluginHostResult,
  type PluginRuntimeAdapter,
} from '@prodivix/plugin-host';
import { createWebPluginPlatform } from '@/plugins/platform/createWebPluginPlatform';
import type {
  WebContributionPointMap,
  WebPluginPlatform,
} from '@/plugins/platform/types';
import { BUNDLED_OFFICIAL_HOST_MODULE_CATALOG } from '@/plugins/platform/bundledOfficialPlugins';

const auditDatabaseName = (workspaceId: string) =>
  `prodivix-plugin-gateway-audit-v1-${workspaceId
    .replaceAll(/[^A-Za-z0-9._-]/g, '-')
    .slice(0, 96)}`;

export const resolveConfiguredPluginSandboxUrl = (): string | undefined => {
  const configured = import.meta.env.VITE_PLUGIN_SANDBOX_URL?.trim();
  return configured || undefined;
};

export type CreateWorkspaceWebPluginPlatformOptions = Readonly<{
  workspaceId: string;
  sandboxUrl?: string;
  gatewayServices?: BuiltInGatewayServicePorts;
  onDiagnostic?: (diagnostic: PluginDiagnostic) => void;
}>;

export const createWorkspaceWebPluginPlatform = (
  options: CreateWorkspaceWebPluginPlatformOptions
): PluginHostResult<WebPluginPlatform> => {
  const auditStore = createIndexedDbGatewayAuditStore({
    databaseName: auditDatabaseName(options.workspaceId),
  });
  const gatewayContracts = createBuiltInGatewayContractRegistry(
    options.gatewayServices ?? {}
  );
  if (gatewayContracts.ok === false) {
    void auditStore.dispose();
    return pluginHostFailure(gatewayContracts.diagnostics);
  }

  const sandboxUrl = options.sandboxUrl?.trim();
  let runtimeAdapter: PluginRuntimeAdapter<WebContributionPointMap> | undefined;
  if (sandboxUrl) {
    const runtimeResult =
      createBrowserPluginRuntimeAdapter<WebContributionPointMap>({
        sandboxFactory: createBrowserRuntimeSandboxFactory({ sandboxUrl }),
        gatewaySessionFactory: createBrowserGatewaySessionFactory({
          contracts: gatewayContracts.value,
          auditStore,
          onDiagnostic: options.onDiagnostic,
        }),
      });
    if (runtimeResult.ok === false) {
      void auditStore.dispose();
      return pluginHostFailure(runtimeResult.diagnostics);
    }
    runtimeAdapter = runtimeResult.value;
  }

  const platform = createWebPluginPlatform({
    workspaceId: options.workspaceId,
    officialHostModules: BUNDLED_OFFICIAL_HOST_MODULE_CATALOG,
    ...(runtimeAdapter ? { runtimeAdapter } : {}),
    onShutdown: () => auditStore.dispose(),
  });
  if (!platform.ok) void auditStore.dispose();
  return platform;
};
