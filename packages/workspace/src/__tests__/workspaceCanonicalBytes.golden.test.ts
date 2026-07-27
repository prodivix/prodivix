import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { decodeWorkspaceSnapshot, encodeWorkspaceSnapshot } from '..';
import type { WorkspaceSnapshotWireDto } from '..';

/**
 * Byte-level golden fixture for the canonical Workspace wire.
 *
 * Encode order decides persisted bytes and therefore every downstream digest,
 * idempotency key and conflict comparison. This pins the encoded document
 * order over a collation-hostile path set and the SHA-256 of the canonical
 * serialization of the whole wire DTO, so any regression to locale- or
 * enumeration-dependent ordering — whatever its syntax — fails here.
 *
 * A failure is a wire-format change: follow the ADR 39 evolution protocol
 * (immutable snapshot + activation + deterministic migration), do not edit
 * the pinned values to make the test pass.
 */

const codeDocument = (
  id: string,
  path: string
): WorkspaceSnapshotWireDto['documents'][number] => ({
  id,
  type: 'code',
  path,
  contentRev: 1,
  metaRev: 1,
  content: { language: 'ts', source: '' },
  updatedAt: '2026-07-27T00:00:00.000Z',
});

// Paths chosen so locale collation, UTF-16 code-unit order and JS integer-key
// enumeration each produce a DIFFERENT order than code points do: case (B/a),
// punctuation (_), accents (é), numeric-looking names (10/9), and an astral
// character (𝐀) whose surrogate halves sort below 'é' by code unit but above
// it by code point.
const HOSTILE_DOCUMENTS = [
  ['doc-a', '/a.ts', 'a.ts'],
  ['doc-upper', '/B.ts', 'B.ts'],
  ['doc-underscore', '/_x.ts', '_x.ts'],
  ['doc-accent', '/é.ts', 'é.ts'],
  ['doc-astral', '/𝐀.ts', '𝐀.ts'],
  ['doc-ten', '/10.ts', '10.ts'],
  ['doc-nine', '/9.ts', '9.ts'],
] as const;

const createWireSnapshot = (): WorkspaceSnapshotWireDto => ({
  id: 'workspace-golden',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  tree: {
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: HOSTILE_DOCUMENTS.map(([id]) => `node-${id}`),
      },
      ...Object.fromEntries(
        HOSTILE_DOCUMENTS.map(([id, , name]) => [
          `node-${id}`,
          {
            id: `node-${id}`,
            kind: 'doc' as const,
            name,
            parentId: 'root',
            docId: id,
          },
        ])
      ),
    },
  },
  documents: HOSTILE_DOCUMENTS.map(([id, path]) => codeDocument(id, path)),
  routeManifest: { version: '1', root: { id: 'root', children: [] } },
  settings: {},
});

describe('workspace canonical wire byte stability', () => {
  it('encodes documents in code-point path order regardless of input order', () => {
    const wire = createWireSnapshot();
    // Present the documents in reverse to prove the order comes from the
    // canonical comparator, not from input or insertion order.
    wire.documents = [...wire.documents].reverse();
    const decoded = decodeWorkspaceSnapshot(wire);
    const encoded = encodeWorkspaceSnapshot(
      decoded.workspace,
      decoded.settings
    );
    expect(encoded.documents.map((document) => document.path)).toEqual([
      '/10.ts',
      '/9.ts',
      '/B.ts',
      '/_x.ts',
      '/a.ts',
      '/é.ts',
      '/𝐀.ts',
    ]);
  });

  it('pins the canonical bytes of the whole encoded snapshot', () => {
    const decoded = decodeWorkspaceSnapshot(createWireSnapshot());
    const encoded = encodeWorkspaceSnapshot(
      decoded.workspace,
      decoded.settings
    );
    const digest = createHash('sha256')
      .update(canonicalJsonText(encoded), 'utf8')
      .digest('hex');
    expect(digest).toBe(
      // Recompute only through the ADR 39 evolution protocol.
      PINNED_SNAPSHOT_DIGEST
    );
  });
});

const PINNED_SNAPSHOT_DIGEST =
  'dea15cb0d3940766e5781e0838f96538bf7a3425430854e2832ed03fd5e06ff9';
