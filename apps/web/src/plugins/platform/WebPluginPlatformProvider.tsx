import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { BuiltInGatewayServicePorts } from '@prodivix/plugin-browser';
import type { PluginHostResult } from '@prodivix/plugin-host';
import {
  createWorkspaceWebPluginPlatform,
  resolveConfiguredPluginSandboxUrl,
  type CreateWorkspaceWebPluginPlatformOptions,
} from '@/plugins/platform/createWorkspaceWebPluginPlatform';
import { installNativeCorePlugin } from '@/plugins/platform/nativeCorePlugin';
import type { WebPluginPlatform } from '@/plugins/platform/types';
import { OfficialSurfaceLeaseRegistryContext } from '@/plugins/platform/officialSurfaceHost';
import {
  WebPluginQueryContext,
  WebPluginRuntimeContext,
} from '@/plugins/platform/WebPluginPlatformContext';

export type WebPluginPlatformFactory = (
  options: CreateWorkspaceWebPluginPlatformOptions
) => PluginHostResult<WebPluginPlatform>;

export type WebPluginPlatformProviderProps = Readonly<{
  workspaceId: string;
  gatewayServices?: BuiltInGatewayServicePorts;
  sandboxUrl?: string;
  fallback?: ReactNode;
  platformFactory?: WebPluginPlatformFactory;
  children: ReactNode;
}>;

/**
 * Owns the editor's single workspace Host session. Workspace changes enqueue
 * shutdown before the next platform is created, then publish only read-only
 * query services to feature surfaces after the native core package commits.
 */
export function WebPluginPlatformProvider({
  workspaceId,
  gatewayServices,
  sandboxUrl = resolveConfiguredPluginSandboxUrl(),
  fallback = null,
  platformFactory = createWorkspaceWebPluginPlatform,
  children,
}: WebPluginPlatformProviderProps) {
  const [platform, setPlatform] = useState<WebPluginPlatform>();
  const [failure, setFailure] = useState<Error>();
  const lifecycle = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let created: WebPluginPlatform | undefined;
    setFailure(undefined);
    setPlatform(undefined);

    const start = lifecycle.current
      .catch(() => undefined)
      .then(async () => {
        if (disposed) return;
        const result = platformFactory({
          workspaceId,
          ...(gatewayServices ? { gatewayServices } : {}),
          ...(sandboxUrl ? { sandboxUrl } : {}),
        });
        if (result.ok === false) {
          if (!disposed) {
            setFailure(
              new Error(
                `Web Plugin Platform configuration failed: ${result.diagnostics
                  .map((diagnostic) => diagnostic.code)
                  .join(', ')}`
              )
            );
          }
          return;
        }
        created = result.value;
        const initialized = await installNativeCorePlugin(
          created.runtime.paletteContributions,
          controller.signal
        );
        if (initialized.ok === false) {
          await created.shutdown();
          if (!disposed) {
            setFailure(
              new Error(
                `Native core plugin initialization failed: ${initialized.diagnostics
                  .map((diagnostic) => diagnostic.code)
                  .join(', ')}`
              )
            );
          }
          return;
        }
        if (disposed) {
          await created.shutdown();
          return;
        }
        setPlatform(created);
      });
    lifecycle.current = start;

    return () => {
      disposed = true;
      controller.abort('web-plugin-platform-disposed');
      lifecycle.current = start
        .catch(() => undefined)
        .then(async () => {
          await created?.shutdown();
        });
    };
  }, [gatewayServices, platformFactory, sandboxUrl, workspaceId]);

  if (failure) throw failure;
  if (!platform || platform.workspaceId !== workspaceId) return fallback;

  return (
    <OfficialSurfaceLeaseRegistryContext.Provider
      value={platform.runtime.surfaceLeases}
    >
      <WebPluginRuntimeContext.Provider value={platform.runtime}>
        <WebPluginQueryContext.Provider value={platform.queries}>
          {children}
        </WebPluginQueryContext.Provider>
      </WebPluginRuntimeContext.Provider>
    </OfficialSurfaceLeaseRegistryContext.Provider>
  );
}
