import {
  createAnimationBindingScopeId,
  createAnimationBindingSymbolId,
  createAnimationDocumentScopeId,
  createAnimationTimelineScopeId,
  createAnimationTimelineSymbolId,
  createAnimationTrackSymbolId,
  createCodeReferenceSemanticTarget,
  createPirNodeSymbolId,
  createSemanticId,
  createWorkspaceDocumentScopeId,
  createWorkspaceDocumentSymbolId,
  type SemanticContribution,
  type SemanticContributionProvider,
  type SemanticDocumentRevision,
  type SemanticSnapshotIdentity,
  type WorkspaceDependencyContribution,
  type WorkspaceReferenceFact,
  type WorkspaceScopeContribution,
  type WorkspaceSymbolContribution,
} from '@prodivix/authoring';
import {
  createAnimationTimelineCodeReferenceId,
  type AnimationTimelineCodeSlotRole,
} from './animationCodeSlotProvider';
import type { AnimationDefinition, AnimationTrack } from './animation.types';

export const ANIMATION_SEMANTIC_PROVIDER_DESCRIPTOR = Object.freeze({
  id: 'core.animation',
  semanticVersion: '2',
});

export type AnimationSemanticSourceInput = Readonly<{
  documentId: string;
  revision: SemanticDocumentRevision;
  definition: AnimationDefinition;
}>;

export type CreateAnimationSemanticContributionProviderInput = Readonly<{
  workspaceId: string;
  sources: readonly AnimationSemanticSourceInput[];
}>;

type MutableAnimationSemanticContribution = {
  scopes: WorkspaceScopeContribution[];
  symbols: WorkspaceSymbolContribution[];
  references: WorkspaceReferenceFact[];
  dependencies: WorkspaceDependencyContribution[];
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const freezeFacts = <T extends object>(facts: T[]): readonly T[] =>
  Object.freeze(facts.map((fact) => Object.freeze(fact)));

const createDocumentOwnerRef = (workspaceId: string, documentId: string) =>
  ({ kind: 'document', workspaceId, documentId }) as const;

const createTrackOwnerRef = (
  documentId: string,
  timelineId: string,
  bindingId: string,
  trackId: string
) =>
  ({
    kind: 'animation-track',
    documentId,
    timelineId,
    bindingId,
    trackId,
  }) as const;

const getTrackDisplayName = (track: AnimationTrack): string => {
  if (track.kind === 'style') return track.property;
  if (track.kind === 'css-filter') return track.fn;
  return `${track.filterId}.${track.primitiveId}.${track.attr}`;
};

const assertSourceRevision = (
  identity: SemanticSnapshotIdentity,
  workspaceId: string,
  source: AnimationSemanticSourceInput
): void => {
  const actual = identity.workspaceRevisions.documentRevs[source.documentId];
  if (
    identity.workspaceRevisions.workspaceId !== workspaceId ||
    !actual ||
    actual.contentRev !== source.revision.contentRev ||
    actual.metaRev !== source.revision.metaRev
  ) {
    throw new Error(
      `Animation semantic provider snapshot mismatch for document "${source.documentId}".`
    );
  }
};

const contributeSource = (
  contribution: MutableAnimationSemanticContribution,
  workspaceId: string,
  source: AnimationSemanticSourceInput
): void => {
  const { definition, documentId } = source;
  const targetDocumentId = definition.target.documentId;
  const documentScopeId = createAnimationDocumentScopeId(
    workspaceId,
    documentId
  );
  const documentOwnerRef = createDocumentOwnerRef(workspaceId, documentId);

  contribution.scopes.push({
    id: documentScopeId,
    kind: 'animation',
    ownerRef: documentOwnerRef,
    parentId: createWorkspaceDocumentScopeId(workspaceId, documentId),
  });

  [...definition.timelines]
    .sort((left, right) => compareText(left.id, right.id))
    .forEach((timeline) => {
      const timelineScopeId = createAnimationTimelineScopeId(
        workspaceId,
        documentId,
        timeline.id
      );
      const timelineSymbolId = createAnimationTimelineSymbolId(
        workspaceId,
        documentId,
        timeline.id
      );
      const timelineOwnerRef = {
        kind: 'animation-timeline' as const,
        documentId,
        timelineId: timeline.id,
      };

      contribution.scopes.push({
        id: timelineScopeId,
        kind: 'animation',
        ownerRef: timelineOwnerRef,
        parentId: documentScopeId,
      });
      contribution.symbols.push({
        id: timelineSymbolId,
        stability: 'durable',
        kind: 'animation-timeline',
        name: timeline.id,
        displayName: timeline.name,
        qualifiedName: `${documentId}::${timeline.id}`,
        scopeId: documentScopeId,
        ownerRef: timelineOwnerRef,
        typeRef: 'animation:timeline',
      });
      contribution.dependencies.push({
        id: createSemanticId(
          'animation-document-timeline-dependency',
          workspaceId,
          documentId,
          timeline.id
        ),
        kind: 'document',
        sourceSymbolId: timelineSymbolId,
        targetSymbolId: createWorkspaceDocumentSymbolId(
          workspaceId,
          documentId
        ),
      });

      for (const [role, binding] of [
        ['custom-easing', timeline.codeSlots?.customEasing],
        ['shader', timeline.codeSlots?.shader],
        ['script', timeline.codeSlots?.script],
      ] as const satisfies readonly (readonly [
        AnimationTimelineCodeSlotRole,
        unknown,
      ])[]) {
        if (!binding) continue;
        contribution.references.push({
          id: createAnimationTimelineCodeReferenceId(
            workspaceId,
            documentId,
            timeline.id,
            role
          ),
          kind: 'code-reference',
          sourceRef: timelineOwnerRef,
          sourceSymbolId: timelineSymbolId,
          scopeId: timelineScopeId,
          target: createCodeReferenceSemanticTarget(
            workspaceId,
            binding.reference
          ),
          resolutionMode: 'addressable',
          requiresDurableTarget: true,
        });
      }

      [...timeline.bindings]
        .sort((left, right) => compareText(left.id, right.id))
        .forEach((binding) => {
          const bindingScopeId = createAnimationBindingScopeId(
            workspaceId,
            documentId,
            timeline.id,
            binding.id
          );
          const bindingSymbolId = createAnimationBindingSymbolId(
            workspaceId,
            documentId,
            timeline.id,
            binding.id
          );

          contribution.scopes.push({
            id: bindingScopeId,
            kind: 'animation',
            ownerRef: documentOwnerRef,
            parentId: timelineScopeId,
          });
          contribution.symbols.push({
            id: bindingSymbolId,
            stability: 'durable',
            kind: 'animation-binding',
            name: binding.id,
            displayName: binding.targetNodeId,
            qualifiedName: `${documentId}::${timeline.id}::${binding.id}`,
            scopeId: timelineScopeId,
            ownerRef: documentOwnerRef,
            typeRef: 'animation:binding',
          });
          contribution.references.push({
            id: createSemanticId(
              'animation-binding-target-reference',
              workspaceId,
              documentId,
              timeline.id,
              binding.id
            ),
            kind: 'animation-target',
            sourceRef: documentOwnerRef,
            sourceSymbolId: bindingSymbolId,
            scopeId: bindingScopeId,
            target: {
              kind: 'symbol-id',
              symbolId: createPirNodeSymbolId(
                workspaceId,
                targetDocumentId,
                binding.targetNodeId
              ),
            },
            resolutionMode: 'addressable',
            requiresDurableTarget: true,
          });
          contribution.dependencies.push({
            id: createSemanticId(
              'animation-timeline-binding-dependency',
              workspaceId,
              documentId,
              timeline.id,
              binding.id
            ),
            kind: 'animation',
            sourceSymbolId: bindingSymbolId,
            targetSymbolId: timelineSymbolId,
          });

          [...binding.tracks]
            .sort((left, right) => compareText(left.id, right.id))
            .forEach((track) => {
              const trackSymbolId = createAnimationTrackSymbolId(
                workspaceId,
                documentId,
                timeline.id,
                binding.id,
                track.id
              );
              contribution.symbols.push({
                id: trackSymbolId,
                stability: 'durable',
                kind: 'animation-track',
                name: track.id,
                displayName: getTrackDisplayName(track),
                qualifiedName: `${documentId}::${timeline.id}::${binding.id}::${track.id}`,
                scopeId: bindingScopeId,
                ownerRef: createTrackOwnerRef(
                  documentId,
                  timeline.id,
                  binding.id,
                  track.id
                ),
                typeRef: `animation:track:${track.kind}`,
              });
              contribution.dependencies.push({
                id: createSemanticId(
                  'animation-binding-track-dependency',
                  workspaceId,
                  documentId,
                  timeline.id,
                  binding.id,
                  track.id
                ),
                kind: 'animation',
                sourceSymbolId: trackSymbolId,
                targetSymbolId: bindingSymbolId,
              });
            });
        });
    });
};

const createContribution = (
  input: CreateAnimationSemanticContributionProviderInput
): SemanticContribution => {
  const contribution: MutableAnimationSemanticContribution = {
    scopes: [],
    symbols: [],
    references: [],
    dependencies: [],
  };
  const documentIds = new Set<string>();

  [...input.sources]
    .sort((left, right) => compareText(left.documentId, right.documentId))
    .forEach((source) => {
      if (documentIds.has(source.documentId)) {
        throw new Error(
          `Animation semantic provider received duplicate document "${source.documentId}".`
        );
      }
      documentIds.add(source.documentId);
      contributeSource(contribution, input.workspaceId, source);
    });

  return Object.freeze({
    scopes: freezeFacts(contribution.scopes),
    symbols: freezeFacts(contribution.symbols),
    references: freezeFacts(contribution.references),
    dependencies: freezeFacts(contribution.dependencies),
  });
};

/**
 * Projects canonical Animation definitions into revision-bound semantic facts.
 * Target PIR nodes remain owned by the PIR provider and are addressed directly
 * through the explicit target document supplied by Workspace composition.
 */
export const createAnimationSemanticContributionProvider = (
  input: CreateAnimationSemanticContributionProviderInput
): SemanticContributionProvider => {
  const contribution = createContribution(input);
  return Object.freeze({
    descriptor: ANIMATION_SEMANTIC_PROVIDER_DESCRIPTOR,
    contribute(identity) {
      for (const source of input.sources) {
        assertSourceRevision(identity, input.workspaceId, source);
      }
      if (
        !input.sources.length &&
        identity.workspaceRevisions.workspaceId !== input.workspaceId
      ) {
        throw new Error('Animation semantic provider workspace mismatch.');
      }
      return contribution;
    },
  });
};
