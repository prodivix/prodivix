import {
  registerIconProvider,
  unregisterIconProvider,
} from '@prodivix/pir-react-renderer';
import type { WebExtensionQueryService } from '@/plugins/platform/types';

export const createIconProviderRegistryBridge = (
  extensions: WebExtensionQueryService
) => {
  const managed = new Map<string, unknown>();

  const synchronize = () => {
    const providers = new Map(
      extensions
        .getSnapshot()
        .iconProviders.map(
          (provider) => [provider.providerId, provider] as const
        )
    );
    for (const providerId of managed.keys()) {
      if (providers.has(providerId)) continue;
      unregisterIconProvider(providerId);
      managed.delete(providerId);
    }
    providers.forEach((provider, providerId) => {
      if (managed.get(providerId) === provider) return;
      registerIconProvider(providerId, provider.runtime);
      managed.set(providerId, provider);
    });
  };

  synchronize();
  const unsubscribe = extensions.subscribe(synchronize);
  let disposed = false;
  return Object.freeze({
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      [...managed.keys()].forEach(unregisterIconProvider);
      managed.clear();
    },
  });
};
