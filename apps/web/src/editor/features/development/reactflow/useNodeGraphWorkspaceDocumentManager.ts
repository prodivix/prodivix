import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Edge, Node } from '@xyflow/react';
import {
  createWorkspaceDocumentIntentRequest,
  deleteWorkspaceDocumentIntentRequest,
  renameWorkspaceDocumentIntentRequest,
  type WorkspaceSnapshot,
  type WorkspaceVfsIntentRequest,
} from '@prodivix/workspace';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';
import type { GraphNodeData } from './GraphNode';
import {
  cloneNodeGraphDocument,
  createStarterNodeGraphCanvas,
  toCanonicalNodeGraphDocument,
} from './nodeGraphDocumentProjection';
import type { NodeGraphTranslate } from './nodeGraphI18nTypes';
import {
  createAvailableNodeGraphPath,
  createRenamedNodeGraphPath,
  createWorkspaceNodeGraphDocumentId,
  listWorkspaceNodeGraphs,
  type WorkspaceNodeGraphListItem,
} from './nodeGraphWorkspaceDocuments';

type ScheduleWorkspaceIntent = (
  factory: (workspace: WorkspaceSnapshot) => WorkspaceVfsIntentRequest
) => Promise<boolean>;

type UseNodeGraphWorkspaceDocumentManagerInput = Readonly<{
  activeGraph?: WorkspaceNodeGraphListItem;
  activeGraphId?: string;
  edges: readonly Edge[];
  graphDocs: readonly WorkspaceNodeGraphListItem[];
  keepAtLeastOneGraphHint: string;
  localizeNodeLabel: (node: Node<GraphNodeData>) => Node<GraphNodeData>;
  nodes: readonly Node<GraphNodeData>[];
  persistCanvas: (
    nodes: readonly Node<GraphNodeData>[],
    edges: readonly Edge[]
  ) => Promise<boolean>;
  scheduleWorkspaceIntent: ScheduleWorkspaceIntent;
  setActiveDocumentId: (documentId: string | undefined) => void;
  setHint: Dispatch<SetStateAction<string | null>>;
  t: NodeGraphTranslate;
}>;

export const useNodeGraphWorkspaceDocumentManager = ({
  activeGraph,
  activeGraphId,
  edges,
  graphDocs,
  keepAtLeastOneGraphHint,
  localizeNodeLabel,
  nodes,
  persistCanvas,
  scheduleWorkspaceIntent,
  setActiveDocumentId,
  setHint,
  t,
}: UseNodeGraphWorkspaceDocumentManagerInput) => {
  const [managerBusy, setManagerBusy] = useState(false);
  const runManagerAction = useCallback((action: () => Promise<void>) => {
    setManagerBusy(true);
    void action().finally(() => setManagerBusy(false));
  }, []);

  const createGraph = useCallback(() => {
    runManagerAction(async () => {
      const starter = createStarterNodeGraphCanvas();
      const content = toCanonicalNodeGraphDocument(
        starter.nodes.map(localizeNodeLabel),
        starter.edges
      );
      let createdDocumentId: string | undefined;
      const applied = await scheduleWorkspaceIntent((currentWorkspace) => {
        const existingNames = new Set(
          listWorkspaceNodeGraphs(currentWorkspace).map(
            (document) => document.name
          )
        );
        let index = existingNames.size + 1;
        let name = t('nodeGraph.graph.flowName', {
          index,
          defaultValue: 'Flow {{index}}',
        });
        while (existingNames.has(name)) {
          index += 1;
          name = t('nodeGraph.graph.flowName', {
            index,
            defaultValue: 'Flow {{index}}',
          });
        }
        const target = createAvailableNodeGraphPath({
          workspace: currentWorkspace,
          name,
        });
        createdDocumentId =
          createWorkspaceNodeGraphDocumentId(currentWorkspace);
        return createWorkspaceDocumentIntentRequest({
          workspaceRev: currentWorkspace.workspaceRev,
          intentId: createWorkspaceClientOperationId('nodegraph-document'),
          issuedAt: new Date().toISOString(),
          documentId: createdDocumentId,
          path: target.path,
          type: 'pir-graph',
          content,
        });
      });
      if (applied && createdDocumentId) {
        setActiveDocumentId(createdDocumentId);
      }
    });
  }, [
    localizeNodeLabel,
    runManagerAction,
    scheduleWorkspaceIntent,
    setActiveDocumentId,
    t,
  ]);

  const duplicateGraph = useCallback(() => {
    if (!activeGraphId || activeGraph?.status !== 'valid') return;
    const sourceContent = toCanonicalNodeGraphDocument(nodes, edges);
    const sourceName = activeGraph.name || activeGraphId;
    runManagerAction(async () => {
      let createdDocumentId: string | undefined;
      const applied = await scheduleWorkspaceIntent((currentWorkspace) => {
        const target = createAvailableNodeGraphPath({
          workspace: currentWorkspace,
          name: `${sourceName} ${t('nodeGraph.graph.copySuffix', {
            defaultValue: 'Copy',
          })}`,
        });
        createdDocumentId =
          createWorkspaceNodeGraphDocumentId(currentWorkspace);
        return createWorkspaceDocumentIntentRequest({
          workspaceRev: currentWorkspace.workspaceRev,
          intentId: createWorkspaceClientOperationId('nodegraph-document'),
          issuedAt: new Date().toISOString(),
          documentId: createdDocumentId,
          path: target.path,
          type: 'pir-graph',
          content: cloneNodeGraphDocument(sourceContent),
        });
      });
      if (applied && createdDocumentId) {
        setActiveDocumentId(createdDocumentId);
      }
    });
  }, [
    activeGraph,
    activeGraphId,
    edges,
    nodes,
    runManagerAction,
    scheduleWorkspaceIntent,
    setActiveDocumentId,
    t,
  ]);

  const renameActiveGraph = useCallback(
    (name: string) => {
      if (!activeGraphId || !activeGraph) return;
      runManagerAction(async () => {
        await scheduleWorkspaceIntent((currentWorkspace) => {
          const currentDocument = currentWorkspace.docsById[activeGraphId];
          const target = createRenamedNodeGraphPath({
            workspace: currentWorkspace,
            documentId: activeGraphId,
            currentPath: currentDocument?.path ?? activeGraph.path,
            name,
          });
          return renameWorkspaceDocumentIntentRequest({
            workspaceRev: currentWorkspace.workspaceRev,
            intentId: createWorkspaceClientOperationId('nodegraph-document'),
            issuedAt: new Date().toISOString(),
            documentId: activeGraphId,
            path: target.path,
            type: 'pir-graph',
          });
        });
      });
    },
    [activeGraph, activeGraphId, runManagerAction, scheduleWorkspaceIntent]
  );

  const deleteGraph = useCallback(() => {
    if (!activeGraphId) return;
    if (graphDocs.length <= 1) {
      setHint(keepAtLeastOneGraphHint);
      return;
    }
    const currentIndex = graphDocs.findIndex(
      (document) => document.id === activeGraphId
    );
    const nextGraph =
      graphDocs[currentIndex + 1] ?? graphDocs[Math.max(0, currentIndex - 1)];
    runManagerAction(async () => {
      const applied = await scheduleWorkspaceIntent((currentWorkspace) =>
        deleteWorkspaceDocumentIntentRequest({
          workspaceRev: currentWorkspace.workspaceRev,
          intentId: createWorkspaceClientOperationId('nodegraph-document'),
          issuedAt: new Date().toISOString(),
          documentId: activeGraphId,
          type: 'pir-graph',
        })
      );
      if (applied) setActiveDocumentId(nextGraph?.id);
    });
  }, [
    activeGraphId,
    graphDocs,
    keepAtLeastOneGraphHint,
    runManagerAction,
    scheduleWorkspaceIntent,
    setActiveDocumentId,
    setHint,
  ]);

  const switchGraph = useCallback(
    (nextGraphId: string) => {
      if (
        !nextGraphId ||
        nextGraphId === activeGraphId ||
        !graphDocs.some((document) => document.id === nextGraphId)
      ) {
        return;
      }
      const selectNext = () => setActiveDocumentId(nextGraphId);
      if (activeGraph?.status !== 'valid') {
        selectNext();
        return;
      }
      void persistCanvas(nodes, edges).finally(selectNext);
    },
    [
      activeGraph?.status,
      activeGraphId,
      edges,
      graphDocs,
      nodes,
      persistCanvas,
      setActiveDocumentId,
    ]
  );

  return {
    createGraph,
    deleteGraph,
    duplicateGraph,
    managerBusy,
    renameActiveGraph,
    switchGraph,
  };
};
