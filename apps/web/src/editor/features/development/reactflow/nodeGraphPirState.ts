import {
  applyNodeGraphEditorStateToGraphs,
  ensureProjectGraphSnapshot,
  NODE_GRAPH_EDITOR_STATE_KEY,
  normalizeNodeGraphEditorState,
  serializeGraphsForPirLogic,
  buildNodeGraphEditorState,
  type NodeGraphEditorPirState,
  type GraphDocument,
  type ProjectGraphSnapshot,
} from './nodeGraphEditorModel';

export const resolveNodeGraphHydrationSnapshot = (input: {
  pirGraphs: GraphDocument[];
  pirEditorState: NodeGraphEditorPirState | null;
  currentActiveGraphId?: string;
  starterSnapshot: ProjectGraphSnapshot;
}): ProjectGraphSnapshot =>
  input.pirGraphs.length
    ? ensureProjectGraphSnapshot({
        activeGraphId:
          input.pirEditorState?.activeGraphId ||
          input.currentActiveGraphId ||
          input.starterSnapshot.activeGraphId,
        graphs: applyNodeGraphEditorStateToGraphs(
          input.pirGraphs,
          input.pirEditorState
        ),
      })
    : input.starterSnapshot;

export const readNodeGraphEditorStateFromLogic = (
  logic: unknown
): NodeGraphEditorPirState | null => {
  if (!logic || typeof logic !== 'object' || Array.isArray(logic)) return null;
  return normalizeNodeGraphEditorState(
    (logic as Record<string, unknown>)[NODE_GRAPH_EDITOR_STATE_KEY]
  );
};

export const serializeNodeGraphEditorState = (
  state: NodeGraphEditorPirState | null
) => JSON.stringify(state);

export const serializeSnapshotForPir = (snapshot: ProjectGraphSnapshot) =>
  JSON.stringify({
    graphs: serializeGraphsForPirLogic(snapshot.graphs),
    editorState: buildNodeGraphEditorState(snapshot),
  });
