import type { NodeProps } from '@xyflow/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { renderAbstractionGraphNode } from './nodes/AbstractionGraphNode';
import { renderAdvancedFormsGraphNode } from './nodes/AdvancedFormsGraphNode';
import { renderAnnotationGraphNode } from './nodes/AnnotationGraphNode';
import { renderCodeGraphNode } from './nodes/CodeGraphNode';
import { renderDataTransformGraphNode } from './nodes/DataTransformGraphNode';
import { renderDebugGraphNode } from './nodes/DebugGraphNode';
import { renderEventGraphNode } from './nodes/EventGraphNode';
import { renderExpressionGraphNode } from './nodes/ExpressionGraphNode';
import { renderFetchGraphNode } from './nodes/FetchGraphNode';
import { renderFlowGraphNode } from './nodes/FlowGraphNode';
import { renderFlowControlGraphNode } from './nodes/FlowControlGraphNode';
import { renderInteractionMotionGraphNode } from './nodes/InteractionMotionGraphNode';
import { renderNetworkGraphNode } from './nodes/NetworkGraphNode';
import { renderRealtimeFilesGraphNode } from './nodes/RealtimeFilesGraphNode';
import { renderRoutingGraphNode } from './nodes/RoutingGraphNode';
import { renderStateGraphNode } from './nodes/StateGraphNode';
import { renderUiGraphNode } from './nodes/UiGraphNode';
import { renderSwitchGraphNode } from './nodes/SwitchGraphNode';
import { renderSystemEnvironmentGraphNode } from './nodes/SystemEnvironmentGraphNode';
import { renderValueGraphNode } from './nodes/ValueGraphNode';
import { buildRuntimeNodeData } from './nodeGraphFlowNodes';
import type { GraphNodeData as GraphNodePayload } from './graphNodeShared';
import { useNodeGraphRenderStore } from './nodeGraphRenderStore';

export type {
  FetchStatusItem,
  GraphNodeData,
  GraphNodeKind,
  SwitchCaseItem,
} from './graphNodeShared';

export const GraphNode = ({ id, data, selected }: NodeProps) => {
  const { t } = useTranslation('editor');
  const runtimeNode = useNodeGraphRenderStore((state) =>
    state.nodesById.get(id)
  );
  const runtimeCodeArtifacts = useNodeGraphRenderStore(
    (state) => state.codeArtifacts
  );
  const runtimeBindCodeArtifact = useNodeGraphRenderStore(
    (state) => state.bindCodeArtifact
  );
  const runtimeOpenCodeSlotDefinition = useNodeGraphRenderStore(
    (state) => state.openCodeSlotDefinition
  );
  const runtimeUpdateCodeArtifactSource = useNodeGraphRenderStore(
    (state) => state.updateCodeArtifactSource
  );
  const runtimeEdges = useNodeGraphRenderStore((state) => state.edges);
  const runtimeGroupAutoLayoutById = useNodeGraphRenderStore(
    (state) => state.groupAutoLayoutById
  );
  const runtimeHintText = useNodeGraphRenderStore((state) => state.hintText);
  const runtimeSetEdges = useNodeGraphRenderStore((state) => state.setEdges);
  const runtimeSetHint = useNodeGraphRenderStore((state) => state.setHint);
  const runtimeSetMenu = useNodeGraphRenderStore((state) => state.setMenu);
  const runtimeSetNodes = useNodeGraphRenderStore((state) => state.setNodes);
  const runtimeValidationText = useNodeGraphRenderStore(
    (state) => state.validationText
  );
  const fallbackNodeData = data as GraphNodePayload;
  const nodeData = useMemo(() => {
    const node = runtimeNode ?? {
      id,
      type: 'graphNode',
      position: { x: 0, y: 0 },
      data: fallbackNodeData,
    };
    return buildRuntimeNodeData({
      node: {
        ...node,
        data: fallbackNodeData,
      },
      runtime: {
        codeArtifacts: runtimeCodeArtifacts,
        edges: runtimeEdges,
        groupAutoLayoutById: runtimeGroupAutoLayoutById,
        hintText: runtimeHintText,
        nodesById: new Map(runtimeNode ? [[id, runtimeNode]] : []),
        bindCodeArtifact: runtimeBindCodeArtifact,
        openCodeSlotDefinition: runtimeOpenCodeSlotDefinition,
        updateCodeArtifactSource: runtimeUpdateCodeArtifactSource,
        setEdges: runtimeSetEdges,
        setHint: runtimeSetHint,
        setMenu: runtimeSetMenu,
        setNodes: runtimeSetNodes,
        validationText: runtimeValidationText,
      },
    });
  }, [
    fallbackNodeData,
    id,
    runtimeEdges,
    runtimeCodeArtifacts,
    runtimeBindCodeArtifact,
    runtimeOpenCodeSlotDefinition,
    runtimeUpdateCodeArtifactSource,
    runtimeGroupAutoLayoutById,
    runtimeHintText,
    runtimeNode,
    runtimeSetEdges,
    runtimeSetHint,
    runtimeSetMenu,
    runtimeSetNodes,
    runtimeValidationText,
  ]);

  if (nodeData.kind === 'switch') {
    return renderSwitchGraphNode({ id, nodeData, selected, t });
  }

  if (nodeData.kind === 'fetch') {
    return renderFetchGraphNode({ id, nodeData, selected, t });
  }

  if (nodeData.kind === 'code') {
    return renderCodeGraphNode({ id, nodeData, selected, t });
  }

  if (nodeData.kind === 'expression') {
    return renderExpressionGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'onMount' ||
    nodeData.kind === 'onClick' ||
    nodeData.kind === 'onInput' ||
    nodeData.kind === 'onSubmit' ||
    nodeData.kind === 'onRouteEnter' ||
    nodeData.kind === 'onTimer'
  ) {
    return renderEventGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'compare' ||
    nodeData.kind === 'math' ||
    nodeData.kind === 'templateString' ||
    nodeData.kind === 'jsonParse' ||
    nodeData.kind === 'jsonStringify' ||
    nodeData.kind === 'map' ||
    nodeData.kind === 'filter' ||
    nodeData.kind === 'reduce'
  ) {
    return renderDataTransformGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'getState' ||
    nodeData.kind === 'setState' ||
    nodeData.kind === 'computed' ||
    nodeData.kind === 'watchState' ||
    nodeData.kind === 'localStorageRead' ||
    nodeData.kind === 'localStorageWrite'
  ) {
    return renderStateGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'retry' ||
    nodeData.kind === 'timeout' ||
    nodeData.kind === 'cancel' ||
    nodeData.kind === 'cacheRead' ||
    nodeData.kind === 'cacheWrite'
  ) {
    return renderNetworkGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'navigate' ||
    nodeData.kind === 'routeParams' ||
    nodeData.kind === 'routeQuery' ||
    nodeData.kind === 'routeGuard'
  ) {
    return renderRoutingGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'renderComponent' ||
    nodeData.kind === 'conditionalRender' ||
    nodeData.kind === 'listRender' ||
    nodeData.kind === 'toast' ||
    nodeData.kind === 'modal'
  ) {
    return renderUiGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'log' ||
    nodeData.kind === 'assert' ||
    nodeData.kind === 'breakpoint' ||
    nodeData.kind === 'mockData' ||
    nodeData.kind === 'perfMark'
  ) {
    return renderDebugGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'playAnimation' ||
    nodeData.kind === 'scrollTo' ||
    nodeData.kind === 'focusControl' ||
    nodeData.kind === 'clipboard'
  ) {
    return renderInteractionMotionGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'validate' ||
    nodeData.kind === 'rateLimit' ||
    nodeData.kind === 'formContext' ||
    nodeData.kind === 'formField'
  ) {
    return renderAdvancedFormsGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'webSocket' ||
    nodeData.kind === 'uploadFile' ||
    nodeData.kind === 'download'
  ) {
    return renderRealtimeFilesGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'envVar' ||
    nodeData.kind === 'theme' ||
    nodeData.kind === 'i18n' ||
    nodeData.kind === 'mediaQuery'
  ) {
    return renderSystemEnvironmentGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'subFlowCall' ||
    nodeData.kind === 'subFlowInput' ||
    nodeData.kind === 'subFlowOutput' ||
    nodeData.kind === 'memoCache'
  ) {
    return renderAbstractionGraphNode({ id, nodeData, selected, t });
  }

  if (nodeData.kind === 'groupBox' || nodeData.kind === 'stickyNote') {
    return renderAnnotationGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'start' ||
    nodeData.kind === 'end' ||
    nodeData.kind === 'process' ||
    nodeData.kind === 'if' ||
    nodeData.kind === 'forEach' ||
    nodeData.kind === 'tryCatch' ||
    nodeData.kind === 'delay' ||
    nodeData.kind === 'parallel' ||
    nodeData.kind === 'race'
  ) {
    return renderFlowControlGraphNode({ id, nodeData, selected, t });
  }

  if (
    nodeData.kind === 'string' ||
    nodeData.kind === 'number' ||
    nodeData.kind === 'boolean' ||
    nodeData.kind === 'object' ||
    nodeData.kind === 'array'
  ) {
    return renderValueGraphNode({ id, nodeData, selected, t });
  }

  return renderFlowGraphNode({ id, nodeData, selected, t });
};
