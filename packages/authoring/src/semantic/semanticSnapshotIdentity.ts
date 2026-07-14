import type {
  SemanticProviderDescriptor,
  SemanticSnapshotIdentity,
  SemanticSnapshotRevision,
  SemanticWorkspaceRevisions,
} from './semantic.types';
import { compareSemanticText } from './semanticOrder';

const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;

const hashText = (value: string): string => {
  let hash = FNV_OFFSET_BASIS_64;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * FNV_PRIME_64);
  }
  return hash.toString(16).padStart(16, '0');
};

const orderedDocumentRevisions = (
  revisions: SemanticWorkspaceRevisions['documentRevs']
): SemanticWorkspaceRevisions['documentRevs'] =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(revisions)
        .sort(([left], [right]) => compareSemanticText(left, right))
        .map(([documentId, revision]) => [
          documentId,
          Object.freeze({
            contentRev: revision.contentRev,
            metaRev: revision.metaRev,
          }),
        ])
    )
  );

export const createSemanticProviderSetDigest = (
  descriptors: readonly SemanticProviderDescriptor[]
): string => {
  const canonicalDescriptors = descriptors
    .map(({ id, semanticVersion, configurationDigest }) => ({
      id,
      semanticVersion,
      configurationDigest: configurationDigest ?? '',
    }))
    .sort((left, right) => compareSemanticText(left.id, right.id));

  return `semantic-provider-set-v1:${hashText(
    JSON.stringify(canonicalDescriptors)
  )}`;
};

export const createSemanticSnapshotIdentity = (
  revision: SemanticSnapshotRevision,
  descriptors: readonly SemanticProviderDescriptor[]
): SemanticSnapshotIdentity =>
  Object.freeze({
    workspaceRevisions: Object.freeze({
      workspaceId: revision.workspaceRevisions.workspaceId,
      workspaceRev: revision.workspaceRevisions.workspaceRev,
      routeRev: revision.workspaceRevisions.routeRev,
      opSeq: revision.workspaceRevisions.opSeq,
      documentRevs: orderedDocumentRevisions(
        revision.workspaceRevisions.documentRevs
      ),
    }),
    schemaVersion: revision.schemaVersion,
    providerSetDigest: createSemanticProviderSetDigest(descriptors),
  });

export const createSemanticSnapshotKey = (
  identity: SemanticSnapshotIdentity
): string =>
  JSON.stringify({
    workspaceRevisions: createSemanticWorkspaceRevisionsKey(
      identity.workspaceRevisions
    ),
    schemaVersion: identity.schemaVersion,
    providerSetDigest: identity.providerSetDigest,
  });

export const createSemanticWorkspaceRevisionsKey = (
  revisions: SemanticWorkspaceRevisions
): string =>
  JSON.stringify({
    workspaceId: revisions.workspaceId,
    workspaceRev: revisions.workspaceRev,
    routeRev: revisions.routeRev,
    opSeq: revisions.opSeq,
    documentRevs: Object.entries(revisions.documentRevs)
      .sort(([left], [right]) => compareSemanticText(left, right))
      .map(([documentId, revision]) => [
        documentId,
        revision.contentRev,
        revision.metaRev,
      ]),
  });

export const isSameSemanticWorkspaceRevisions = (
  left: SemanticWorkspaceRevisions,
  right: SemanticWorkspaceRevisions
): boolean =>
  createSemanticWorkspaceRevisionsKey(left) ===
  createSemanticWorkspaceRevisionsKey(right);

export const isSameSemanticSnapshotIdentity = (
  left: SemanticSnapshotIdentity,
  right: SemanticSnapshotIdentity
): boolean =>
  createSemanticSnapshotKey(left) === createSemanticSnapshotKey(right);
