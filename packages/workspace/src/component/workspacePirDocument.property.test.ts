import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import type { WorkspaceDocument, WorkspaceSnapshot } from '../types';
import {
  decodeWorkspacePirDocument,
  isWorkspacePirDocument,
  selectWorkspacePirDocument,
  selectWorkspacePirDocumentResults,
} from './workspacePirDocument';

const propertyParameters = Object.freeze({
  numRuns: 30,
  seed: 0x14_07_2026,
});

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/);

const createDocument = (
  id: string,
  content: unknown,
  type: WorkspaceDocument['type'] = 'pir-page'
): WorkspaceDocument => ({
  id,
  type,
  path: `/${id}.${type === 'code' ? 'ts' : 'pir.json'}`,
  contentRev: 1,
  metaRev: 1,
  content,
});

const createSnapshot = (
  documents: readonly WorkspaceDocument[]
): WorkspaceSnapshot => ({
  id: 'workspace-pir',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: [],
    },
  },
  docsById: Object.fromEntries(
    documents.map((document) => [document.id, document])
  ),
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

describe('Workspace canonical PIR document properties', () => {
  it('delegates decode and semantic validation to the canonical PIR boundary', () => {
    fc.assert(
      fc.property(identifier, (documentId) => {
        const validContent = createEmptyPirDocument({ rootId: 'root-node' });
        const validDocument = createDocument(documentId, validContent);
        const decodeInvalid = decodeWorkspacePirDocument(
          createDocument(documentId, { ui: {} }),
          { workspaceId: 'workspace-pir' }
        );
        const semanticInvalid = decodeWorkspacePirDocument(
          createDocument(documentId, {
            ...validContent,
            ui: {
              graph: { ...validContent.ui.graph, rootId: 'missing-root' },
            },
          }),
          { workspaceId: 'workspace-pir' }
        );
        const valid = decodeWorkspacePirDocument(validDocument, {
          workspaceId: 'workspace-pir',
        });

        expect(decodeInvalid.status).toBe('decode-invalid');
        expect(semanticInvalid.status).toBe('semantic-invalid');
        expect(valid.status).toBe('valid');
        expect(isWorkspacePirDocument(validDocument)).toBe(true);
        if (valid.status === 'valid') {
          expect(valid.document.content).toEqual(valid.decodedContent);
          expect(valid.location).toMatchObject({
            workspaceId: 'workspace-pir',
            documentId,
          });
        }
      }),
      propertyParameters
    );
  });

  it('keeps unsupported document types distinct and selection order stable', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(identifier, { minLength: 1, maxLength: 6 }),
        (ids) => {
          const documents = ids.map((id, index) =>
            index % 2 === 0
              ? createDocument(id, createEmptyPirDocument())
              : createDocument(
                  id,
                  { language: 'typescript', source: '' },
                  'code'
                )
          );
          const forward = createSnapshot(documents);
          const reversed = createSnapshot([...documents].reverse());

          const forwardResults = selectWorkspacePirDocumentResults(forward);
          const reversedResults = selectWorkspacePirDocumentResults(reversed);
          expect(reversedResults).toEqual(forwardResults);
          expect(forwardResults.map(({ document }) => document.id)).toEqual(
            [...ids].sort()
          );
          expect(
            forwardResults
              .filter(({ document }) => document.type === 'code')
              .every(({ status }) => status === 'unsupported-document-type')
          ).toBe(true);
          expect(
            selectWorkspacePirDocument(forward, 'missing')
          ).toBeUndefined();
        }
      ),
      propertyParameters
    );
  });
});
