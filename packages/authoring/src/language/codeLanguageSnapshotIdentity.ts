import { createSemanticSnapshotKey } from '../semantic/semanticSnapshotIdentity';
import type {
  CodeLanguageSnapshot,
  CodeLanguageSnapshotIdentity,
} from './codeLanguage.types';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const collectArtifactRevisions = (
  snapshot: CodeLanguageSnapshot
): Readonly<Record<string, string>> => {
  const entries = [...snapshot.artifacts]
    .sort((left, right) => compareText(left.id, right.id))
    .map((artifact) => [artifact.id, artifact.revision] as const);
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1]![0] === entries[index]![0]) {
      throw new Error(
        `Code language snapshot contains duplicate artifact id "${entries[index]![0]}".`
      );
    }
  }
  return Object.freeze(Object.fromEntries(entries));
};

/** Binds language results to canonical semantic state and exact text revisions. */
export const createCodeLanguageSnapshotIdentity = (
  snapshot: CodeLanguageSnapshot
): CodeLanguageSnapshotIdentity =>
  Object.freeze({
    semanticSnapshotIdentity: snapshot.identity,
    artifactRevisions: collectArtifactRevisions(snapshot),
  });

export const createCodeLanguageSnapshotKey = (
  identity: CodeLanguageSnapshotIdentity
): string =>
  JSON.stringify({
    semanticSnapshotKey: createSemanticSnapshotKey(
      identity.semanticSnapshotIdentity
    ),
    artifactRevisions: Object.entries(identity.artifactRevisions).sort(
      ([left], [right]) => compareText(left, right)
    ),
  });

export const isSameCodeLanguageSnapshotIdentity = (
  left: CodeLanguageSnapshotIdentity,
  right: CodeLanguageSnapshotIdentity
): boolean =>
  createCodeLanguageSnapshotKey(left) === createCodeLanguageSnapshotKey(right);
