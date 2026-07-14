import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type {
  CodeArtifact,
  CodeLanguageSnapshot,
  SemanticSnapshotIdentity,
} from '..';
import {
  createCodeLanguageSnapshotIdentity,
  createCodeLanguageSnapshotKey,
  createCodeSourceSpanFromOffsets,
  resolveCodeSourceSpanOffsets,
} from '..';

const semanticIdentity: SemanticSnapshotIdentity = {
  workspaceRevisions: {
    workspaceId: 'workspace-1',
    workspaceRev: 7,
    routeRev: 3,
    opSeq: 11,
    documentRevs: {},
  },
  schemaVersion: 'semantic-current',
  providerSetDigest: 'providers-current',
};

const toArtifact = (id: number, revision: number): CodeArtifact => ({
  id: `artifact-${id}`,
  path: `/src/artifact-${id}.ts`,
  language: 'ts',
  owner: { kind: 'workspace-module', documentId: `artifact-${id}` },
  source: `export const value${id} = ${revision};`,
  revision: String(revision),
});

const isCrLfBoundary = (source: string, offset: number): boolean =>
  offset > 0 && source[offset - 1] === '\r' && source[offset] === '\n';

describe('code language stable properties', () => {
  it('round-trips every representable one-based, end-exclusive source range', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.nat(),
        fc.nat(),
        (source, firstSeed, secondSeed) => {
          const first = firstSeed % (source.length + 1);
          const second = secondSeed % (source.length + 1);
          const from = Math.min(first, second);
          const to = Math.max(first, second);
          fc.pre(!isCrLfBoundary(source, from) && !isCrLfBoundary(source, to));

          const sourceSpan = createCodeSourceSpanFromOffsets({
            artifactId: 'artifact-1',
            source,
            from,
            to,
          });

          expect(sourceSpan).not.toBeNull();
          expect(resolveCodeSourceSpanOffsets(source, sourceSpan!)).toEqual({
            from,
            to,
          });
        }
      ),
      { numRuns: 200 }
    );
  });

  it('derives an order-independent identity from exact artifact revisions', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            id: fc.integer({ min: 0, max: 1_000 }),
            revision: fc.integer({ min: 0, max: 1_000 }),
          }),
          {
            minLength: 1,
            maxLength: 20,
            selector: ({ id }) => id,
          }
        ),
        (entries) => {
          const artifacts = entries.map(({ id, revision }) =>
            toArtifact(id, revision)
          );
          const snapshot = {
            identity: semanticIdentity,
            artifacts,
          } satisfies CodeLanguageSnapshot;
          const reversed = {
            identity: semanticIdentity,
            artifacts: [...artifacts].reverse(),
          } satisfies CodeLanguageSnapshot;

          expect(
            createCodeLanguageSnapshotKey(
              createCodeLanguageSnapshotIdentity(snapshot)
            )
          ).toBe(
            createCodeLanguageSnapshotKey(
              createCodeLanguageSnapshotIdentity(reversed)
            )
          );
        }
      )
    );
  });

  it('rejects invalid ranges and duplicate artifact identities', () => {
    expect(
      createCodeSourceSpanFromOffsets({
        artifactId: 'artifact-1',
        source: 'one\r\ntwo',
        from: 4,
        to: 5,
      })
    ).toBeNull();
    expect(
      createCodeSourceSpanFromOffsets({
        artifactId: 'artifact-1',
        source: 'one',
        from: 2,
        to: 1,
      })
    ).toBeNull();

    const artifact = toArtifact(1, 1);
    expect(() =>
      createCodeLanguageSnapshotIdentity({
        identity: semanticIdentity,
        artifacts: [artifact, { ...artifact }],
      })
    ).toThrow('duplicate artifact id');
  });
});
