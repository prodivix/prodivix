import type { PIRComponentContract, PIRDocument, PIRNode } from '@prodivix/pir';
import {
  selectWorkspacePirDocumentResults,
  validateWorkspaceComponentGraph,
  type WorkspaceComponentDependencyEdge,
  type WorkspacePirDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

export type WorkspacePirAuthoringDocument = Readonly<{
  document: WorkspacePirDocument;
  content: PIRDocument;
}>;

export type WorkspaceComponentDefinitionSummary = Readonly<{
  documentId: string;
  name: string;
  path: string;
  nodeCount: number;
  contract: PIRComponentContract;
  dependencies: readonly WorkspaceComponentDependencyEdge[];
  consumers: readonly WorkspaceComponentDependencyEdge[];
}>;

export type WorkspaceComponentAuthoringModel = Readonly<{
  documents: readonly WorkspacePirAuthoringDocument[];
  definitions: readonly WorkspaceComponentDefinitionSummary[];
  graphIssues: ReturnType<typeof validateWorkspaceComponentGraph>['issues'];
}>;

export type PIRGraphTreeItem = Readonly<{
  documentId: string;
  node: PIRNode;
  regionName?: string;
  children: readonly PIRGraphTreeItem[];
}>;

const compareText = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { numeric: true });

const definitionName = (
  document: WorkspacePirDocument,
  content: PIRDocument
): string =>
  content.metadata?.name?.trim() ||
  document.name?.trim() ||
  document.path.split('/').at(-1) ||
  document.id;

/** Builds the immutable Component read model from the canonical snapshot. */
export const createWorkspaceComponentAuthoringModel = (
  workspace: WorkspaceSnapshot
): WorkspaceComponentAuthoringModel => {
  const documents = selectWorkspacePirDocumentResults(workspace)
    .filter((result) => result.status === 'valid')
    .map((result) => ({
      document: result.document,
      content: result.decodedContent,
    }))
    .sort((left, right) =>
      compareText(left.document.path, right.document.path)
    );
  const validation = validateWorkspaceComponentGraph(workspace);
  const definitions = documents
    .filter(
      ({ document, content }) =>
        document.type === 'pir-component' && Boolean(content.componentContract)
    )
    .map(({ document, content }) => ({
      documentId: document.id,
      name: definitionName(document, content),
      path: document.path,
      nodeCount: Object.keys(content.ui.graph.nodesById).length,
      contract: content.componentContract!,
      dependencies: validation.graph.edges.filter(
        (edge) => edge.sourceDocumentId === document.id
      ),
      consumers: validation.graph.edges.filter(
        (edge) => edge.targetDocumentId === document.id
      ),
    }))
    .sort(
      (left, right) =>
        compareText(left.name, right.name) ||
        compareText(left.documentId, right.documentId)
    );

  return Object.freeze({
    documents: Object.freeze(documents),
    definitions: Object.freeze(definitions),
    graphIssues: validation.issues,
  });
};

export const createPirGraphTree = (
  documentId: string,
  document: PIRDocument
): PIRGraphTreeItem | null => {
  const graph = document.ui.graph;
  const visiting = new Set<string>();
  const build = (
    nodeId: string,
    regionName?: string
  ): PIRGraphTreeItem | null => {
    const node = graph.nodesById[nodeId];
    if (!node || visiting.has(nodeId)) return null;
    visiting.add(nodeId);
    const directChildren = (graph.childIdsById[nodeId] ?? []).map((childId) =>
      build(childId)
    );
    const regionChildren = Object.entries(graph.regionsById?.[nodeId] ?? {})
      .sort(([left], [right]) => compareText(left, right))
      .flatMap(([region, childIds]) =>
        childIds.map((childId) => build(childId, region))
      );
    visiting.delete(nodeId);
    return {
      documentId,
      node,
      ...(regionName ? { regionName } : {}),
      children: [...directChildren, ...regionChildren].filter(
        (child): child is PIRGraphTreeItem => Boolean(child)
      ),
    };
  };
  return build(graph.rootId);
};

export const collectPirNodeLabels = (
  content: PIRDocument
): Readonly<Record<string, string>> =>
  Object.freeze(
    Object.fromEntries(
      Object.values(content.ui.graph.nodesById).map((node) => [
        node.id,
        node.kind === 'element'
          ? `${node.type} · ${node.id}`
          : node.kind === 'component-instance'
            ? `Instance · ${node.id}`
            : node.kind === 'component-slot-outlet'
              ? `Slot · ${node.slotMemberId}`
              : `Collection · ${node.id}`,
      ])
    )
  );
