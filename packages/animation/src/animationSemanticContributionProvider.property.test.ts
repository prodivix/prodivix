import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createAnimationBindingScopeId,
  createAnimationBindingSymbolId,
  createAnimationDocumentScopeId,
  createAnimationTimelineScopeId,
  createAnimationTimelineSymbolId,
  createAnimationTrackSymbolId,
  createPirNodeSymbolId,
  createWorkspaceDocumentScopeId,
  createWorkspaceDocumentSymbolId,
  type SemanticSnapshotIdentity,
} from '@prodivix/authoring';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createAnimationSemanticContributionProvider,
  type AnimationDefinition,
  type AnimationSemanticSourceInput,
  type AnimationTrack,
} from './index';

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/);

const createIdentity = (
  workspaceId: string,
  sources: readonly AnimationSemanticSourceInput[]
): SemanticSnapshotIdentity => ({
  workspaceRevisions: {
    workspaceId,
    workspaceRev: 1,
    routeRev: 1,
    opSeq: 1,
    documentRevs: Object.fromEntries(
      sources.map(({ documentId, revision }) => [documentId, revision])
    ),
  },
  schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
  providerSetDigest: 'animation-provider-property-test',
});

const createTracks = (reverse: boolean): AnimationTrack[] => {
  const tracks: AnimationTrack[] = [
    {
      id: 'track-style',
      kind: 'style',
      property: 'opacity',
      keyframes: [{ atMs: 0, value: 0 }],
    },
    {
      id: 'track-filter',
      kind: 'css-filter',
      fn: 'blur',
      unit: 'px',
      keyframes: [{ atMs: 0, value: 0 }],
    },
  ];
  return reverse ? tracks.reverse() : tracks;
};

const createDefinition = (
  documentId: string,
  timelineParts: readonly string[],
  reverse: boolean
): AnimationDefinition => ({
  version: 1,
  target: {
    kind: 'pir-document',
    documentId: `target-${documentId}`,
  },
  timelines: (reverse ? [...timelineParts].reverse() : [...timelineParts]).map(
    (part) => {
      const bindings = ['binding-a', 'binding-b'].map((bindingId) => ({
        id: bindingId,
        targetNodeId: `${documentId}-${part}-${bindingId}`,
        tracks: createTracks(reverse),
      }));
      return {
        id: `timeline-${part}`,
        name: `Timeline ${part}`,
        durationMs: 1000,
        bindings: reverse ? bindings.reverse() : bindings,
      };
    }
  ),
});

const createSources = (
  timelineParts: readonly string[],
  reverse: boolean
): AnimationSemanticSourceInput[] => {
  const documentIds = reverse
    ? ['document-a', 'document-b']
    : ['document-b', 'document-a'];
  return documentIds.map((documentId) => ({
    documentId,
    revision: { contentRev: 3, metaRev: 2 },
    definition: createDefinition(documentId, timelineParts, reverse),
  }));
};

describe('animation semantic contribution provider properties', () => {
  it('emits stable namespaced facts and direct PIR target references', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(identifier, { minLength: 1, maxLength: 5 }),
        (timelineParts) => {
          const workspaceId = 'workspace-animation';
          const forwardSources = createSources(timelineParts, false);
          const reversedSources = createSources(timelineParts, true);
          const identity = createIdentity(workspaceId, forwardSources);
          const forward = createAnimationSemanticContributionProvider({
            workspaceId,
            sources: forwardSources,
          }).contribute(identity);
          const reversed = createAnimationSemanticContributionProvider({
            workspaceId,
            sources: reversedSources,
          }).contribute(identity);

          expect(reversed).toEqual(forward);

          const documentId = 'document-a';
          const targetDocumentId = `target-${documentId}`;
          const timelineId = `timeline-${timelineParts[0]}`;
          const bindingId = 'binding-a';
          const targetNodeId = `${documentId}-${timelineParts[0]}-${bindingId}`;
          const timelineScopeId = createAnimationTimelineScopeId(
            workspaceId,
            documentId,
            timelineId
          );
          const bindingScopeId = createAnimationBindingScopeId(
            workspaceId,
            documentId,
            timelineId,
            bindingId
          );
          const timelineSymbolId = createAnimationTimelineSymbolId(
            workspaceId,
            documentId,
            timelineId
          );
          const bindingSymbolId = createAnimationBindingSymbolId(
            workspaceId,
            documentId,
            timelineId,
            bindingId
          );
          const trackSymbolId = createAnimationTrackSymbolId(
            workspaceId,
            documentId,
            timelineId,
            bindingId,
            'track-style'
          );

          expect(forward.scopes).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: createAnimationDocumentScopeId(workspaceId, documentId),
                parentId: createWorkspaceDocumentScopeId(
                  workspaceId,
                  documentId
                ),
              }),
              expect.objectContaining({
                id: timelineScopeId,
                parentId: createAnimationDocumentScopeId(
                  workspaceId,
                  documentId
                ),
              }),
              expect.objectContaining({
                id: bindingScopeId,
                parentId: timelineScopeId,
              }),
            ])
          );
          expect(forward.symbols).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: timelineSymbolId,
                stability: 'durable',
                kind: 'animation-timeline',
              }),
              expect.objectContaining({
                id: bindingSymbolId,
                stability: 'durable',
                kind: 'animation-binding',
              }),
              expect.objectContaining({
                id: trackSymbolId,
                stability: 'durable',
                kind: 'animation-track',
                ownerRef: {
                  kind: 'animation-track',
                  documentId,
                  timelineId,
                  bindingId,
                  trackId: 'track-style',
                },
              }),
            ])
          );
          expect(
            forward.references?.find(
              ({ sourceSymbolId }) => sourceSymbolId === bindingSymbolId
            )
          ).toMatchObject({
            kind: 'animation-target',
            scopeId: bindingScopeId,
            target: {
              kind: 'symbol-id',
              symbolId: createPirNodeSymbolId(
                workspaceId,
                targetDocumentId,
                targetNodeId
              ),
            },
            resolutionMode: 'addressable',
            requiresDurableTarget: true,
          });
          expect(forward.dependencies).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                kind: 'document',
                sourceSymbolId: timelineSymbolId,
                targetSymbolId: createWorkspaceDocumentSymbolId(
                  workspaceId,
                  documentId
                ),
              }),
              expect.objectContaining({
                kind: 'animation',
                sourceSymbolId: bindingSymbolId,
                targetSymbolId: timelineSymbolId,
              }),
              expect.objectContaining({
                kind: 'animation',
                sourceSymbolId: trackSymbolId,
                targetSymbolId: bindingSymbolId,
              }),
            ])
          );
          expect(
            createAnimationTrackSymbolId(
              workspaceId,
              documentId,
              timelineId,
              'binding-b',
              'track-style'
            )
          ).not.toBe(trackSymbolId);
          expect(new Set(forward.symbols?.map(({ kind }) => kind))).toEqual(
            new Set([
              'animation-timeline',
              'animation-binding',
              'animation-track',
            ])
          );
        }
      ),
      { numRuns: 30 }
    );
  });

  it('rejects workspace and document revision mismatches', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        (contentRev, metaRev) => {
          const workspaceId = 'workspace-revision';
          const source: AnimationSemanticSourceInput = {
            documentId: 'document-revision',
            revision: { contentRev, metaRev },
            definition: {
              version: 1,
              target: {
                kind: 'pir-document',
                documentId: 'document-revision',
              },
              timelines: [],
            },
          };
          const provider = createAnimationSemanticContributionProvider({
            workspaceId,
            sources: [source],
          });

          expect(() =>
            provider.contribute(
              createIdentity(`${workspaceId}-other`, [source])
            )
          ).toThrow(/snapshot mismatch/);
          expect(() =>
            provider.contribute(
              createIdentity(workspaceId, [
                {
                  ...source,
                  revision: { contentRev: contentRev + 1, metaRev },
                },
              ])
            )
          ).toThrow(/snapshot mismatch/);
          expect(() =>
            provider.contribute(
              createIdentity(workspaceId, [
                {
                  ...source,
                  revision: { contentRev, metaRev: metaRev + 1 },
                },
              ])
            )
          ).toThrow(/snapshot mismatch/);
        }
      ),
      { numRuns: 20 }
    );
  });
});
