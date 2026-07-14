import type {
  AuthoringContext,
  CodeSlotBindingProjection,
  CodeSlotContract,
  CodeSlotProvider,
} from './authoring.types';
import type { DiagnosticTargetRef } from '@prodivix/diagnostics';

export type CodeSlotRegistry = {
  register(provider: CodeSlotProvider): void;
  unregister(providerId: string): void;
  listProviders(): CodeSlotProvider[];
  listSlots(context: AuthoringContext): CodeSlotContract[];
  getSlot(id: string): CodeSlotContract | null;
  listSlotsByOwner(ownerRef: DiagnosticTargetRef): CodeSlotContract[];
  listBindingProjections(
    context: AuthoringContext
  ): CodeSlotBindingProjection[];
  getBindingProjection(id: string): CodeSlotBindingProjection | null;
  listBindingProjectionsByArtifact(
    artifactId: string
  ): CodeSlotBindingProjection[];
};

const stableTargetRef = (targetRef: DiagnosticTargetRef): string =>
  JSON.stringify(targetRef, Object.keys(targetRef).sort());

export const createCodeSlotRegistry = (): CodeSlotRegistry => {
  const providers = new Map<string, CodeSlotProvider>();

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
    listSlots(context) {
      return Array.from(providers.values()).flatMap((provider) =>
        provider.listSlots(context)
      );
    },
    getSlot(id) {
      for (const provider of providers.values()) {
        const slot = provider.getSlot(id);
        if (slot) return slot;
      }

      return null;
    },
    listSlotsByOwner(ownerRef) {
      const ownerKey = stableTargetRef(ownerRef);
      return Array.from(providers.values())
        .flatMap((provider) =>
          provider.listSlots({ surface: 'issues-panel', targetRef: ownerRef })
        )
        .filter((slot) => stableTargetRef(slot.ownerRef) === ownerKey);
    },
    listBindingProjections(context) {
      return Array.from(providers.values()).flatMap((provider) =>
        provider.listBindingProjections(context)
      );
    },
    getBindingProjection(id) {
      for (const provider of providers.values()) {
        const projection = provider.getBindingProjection(id);
        if (projection) return projection;
      }

      return null;
    },
    listBindingProjectionsByArtifact(artifactId) {
      return Array.from(providers.values())
        .flatMap((provider) =>
          provider.listBindingProjections({
            surface: 'issues-panel',
            artifactId,
          })
        )
        .filter(({ binding }) => binding.reference.artifactId === artifactId);
    },
  };
};
