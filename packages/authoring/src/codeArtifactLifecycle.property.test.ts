import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createCodeArtifactLifecycleManifest,
  createCodeSlotRegistry,
  decodeCodeArtifactLifecycleManifest,
  resolveCodeArtifactLifecycle,
  writeCodeArtifactLifecycleManifest,
  type CodeArtifact,
  type CodeSlotProvider,
} from '.';

const identifierArbitrary = fc.string({
  unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-'),
  minLength: 1,
  maxLength: 24,
});

describe('code artifact lifecycle properties', () => {
  it('preserves explicit slot ownership without classifying plain modules as orphan', () => {
    fc.assert(
      fc.property(
        identifierArbitrary,
        identifierArbitrary,
        (artifactId, key) => {
          const slotId = `slot-${key}`;
          const manifest = createCodeArtifactLifecycleManifest({
            slotId,
            slotKind: 'external-adapter',
          });
          const metadata = writeCodeArtifactLifecycleManifest(
            { retained: key },
            manifest
          );
          const decoded = decodeCodeArtifactLifecycleManifest(metadata);
          expect(decoded).toEqual({ status: 'valid', manifest });
          expect(metadata?.retained).toBe(key);

          const artifact: CodeArtifact = {
            id: artifactId,
            path: `/src/${artifactId}.ts`,
            language: 'ts',
            ownership: 'code-owned',
            owner: { kind: 'workspace-module', documentId: artifactId },
            source: 'export default {};',
            revision: '1',
            lifecycleManifest: manifest,
          };
          const ownerRef = {
            kind: 'document' as const,
            documentId: `config-${key}`,
          };
          const projection = {
            binding: { slotId, reference: { artifactId } },
            ownerRef,
            semanticReferenceId: `reference-${key}`,
          };
          const provider: CodeSlotProvider = {
            id: `provider-${key}`,
            source: { kind: 'external-library', libraryId: key },
            listSlots: () => [],
            getSlot: () => null,
            listBindingProjections: ({ artifactId: selectedArtifactId }) =>
              !selectedArtifactId || selectedArtifactId === artifactId
                ? [projection]
                : [],
            getBindingProjection: (id) => (id === slotId ? projection : null),
          };
          const activeRegistry = createCodeSlotRegistry();
          activeRegistry.register(provider);
          expect(
            resolveCodeArtifactLifecycle({ artifact, registry: activeRegistry })
              .status
          ).toBe('active');

          const emptyRegistry = createCodeSlotRegistry();
          expect(
            resolveCodeArtifactLifecycle({ artifact, registry: emptyRegistry })
          ).toEqual({ status: 'orphan', previousSlot: manifest.origin });
          expect(
            resolveCodeArtifactLifecycle({
              artifact: { ...artifact, lifecycleManifest: undefined },
              registry: emptyRegistry,
            })
          ).toEqual({ status: 'workspace-module' });
          expect(writeCodeArtifactLifecycleManifest(metadata, null)).toEqual({
            retained: key,
          });
        }
      ),
      { numRuns: 40 }
    );
  });
});
