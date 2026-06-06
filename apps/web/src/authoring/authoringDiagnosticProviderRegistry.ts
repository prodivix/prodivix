import type {
  AuthoringContext,
  AuthoringDiagnosticProvider,
} from '@/authoring/authoring.types';
import type { ProdivixDiagnostic } from '@/diagnostics';

export type AuthoringDiagnosticProviderRegistry = {
  register(provider: AuthoringDiagnosticProvider): void;
  unregister(providerId: string): void;
  listProviders(): AuthoringDiagnosticProvider[];
  getDiagnostics(context: AuthoringContext): ProdivixDiagnostic[];
};

export const createAuthoringDiagnosticProviderRegistry =
  (): AuthoringDiagnosticProviderRegistry => {
    const providers = new Map<string, AuthoringDiagnosticProvider>();

    return {
      register(provider) {
        providers.set(provider.id, provider);
      },
      unregister(providerId) {
        providers.delete(providerId);
      },
      listProviders() {
        return Array.from(providers.values());
      },
      getDiagnostics(context) {
        return Array.from(providers.values()).flatMap((provider) =>
          provider.getDiagnostics(context)
        );
      },
    };
  };
