import {
  createPirSemanticContributionProvider,
  decodePirDocument,
  type PIRDocument,
} from '@prodivix/pir';
import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createPirParamSymbolId,
  createPirStateSymbolId,
  createPirDataSymbolId,
  createSemanticSnapshotIdentity,
  type WorkspaceSymbolContribution,
} from '@prodivix/authoring';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { findNodeAtLocation, parseTree, type Node } from 'jsonc-parser';

export type PirDocumentModel = Readonly<{
  document: PIRDocument;
  tree: Node;
  revision: number;
  symbols: readonly WorkspaceSymbolContribution[];
}>;

/** Local editor revisions identify read-only projections and never become Workspace authoring state. */
export const readPirDocumentModel = (
  text: string,
  documentId: string,
  revision: number
): PirDocumentModel => {
  if (Buffer.byteLength(text, 'utf8') > 2_097_152)
    throw new Error('PIR preview is limited to 2 MiB documents.');
  const decoded = decodePirDocument(JSON.parse(text));
  if (!decoded.ok)
    throw new Error(
      decoded.issues
        .slice(0, 5)
        .map(({ path, message }) => `${path}: ${message}`)
        .join('; ')
    );
  const tree = parseTree(text);
  if (!tree) throw new Error('PIR document has no JSON source tree.');
  const provider = createPirSemanticContributionProvider({
    workspaceId: 'vscode-readonly',
    documents: [
      {
        documentId,
        documentType: decoded.value.componentContract
          ? 'pir-component'
          : 'pir-page',
        revision: { contentRev: revision, metaRev: 1 },
        document: decoded.value,
      },
    ],
  });
  const contribution = provider.contribute(
    createSemanticSnapshotIdentity(
      {
        workspaceRevisions: {
          workspaceId: 'vscode-readonly',
          workspaceRev: revision,
          routeRev: 0,
          opSeq: 0,
          documentRevs: { [documentId]: { contentRev: revision, metaRev: 1 } },
        },
        schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
      },
      [provider.descriptor]
    )
  );
  return {
    document: decoded.value,
    tree,
    revision,
    symbols: [...(contribution.symbols ?? [])].sort((a, b) =>
      compareUnicodeCodePoints(a.id, b.id)
    ),
  };
};

export const findPirSymbolSource = (
  model: PirDocumentModel,
  symbol: WorkspaceSymbolContribution
): Node | undefined => {
  if (
    symbol.ownerRef.kind === 'pir-node' ||
    symbol.ownerRef.kind === 'inspector-field'
  )
    return findNodeAtLocation(model.tree, [
      'ui',
      'graph',
      'nodesById',
      symbol.ownerRef.nodeId,
    ]);
  const logicField =
    symbol.kind === 'param'
      ? 'props'
      : symbol.kind === 'state'
        ? 'state'
        : symbol.kind === 'data'
          ? 'dataById'
          : undefined;
  if (logicField && symbol.ownerRef.kind === 'document') {
    const owner = symbol.ownerRef;
    const createId =
      symbol.kind === 'param'
        ? createPirParamSymbolId
        : symbol.kind === 'state'
          ? createPirStateSymbolId
          : createPirDataSymbolId;
    const key = Object.keys(model.document.logic?.[logicField] ?? {}).find(
      (id) =>
        createId(
          owner.workspaceId ?? 'vscode-readonly',
          owner.documentId,
          id
        ) === symbol.id
    );
    if (key !== undefined)
      return findNodeAtLocation(model.tree, ['logic', logicField, key]);
  }
  return symbol.kind.startsWith('component-')
    ? findNodeAtLocation(model.tree, ['componentContract'])
    : model.tree;
};
