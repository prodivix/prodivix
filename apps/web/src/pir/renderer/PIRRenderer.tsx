import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  executeBuiltInAction,
  isBuiltInActionName,
  type BuiltInActionContext,
} from '@/pir/actions/registry';
import { materializeUiTree } from '@/pir/graph/materialize';
import { getDefaultComponentRegistry } from './registry';
import { resolveLinkCapability } from './capabilities';
import { PIRNode } from './PIRNode';
import type {
  BuiltInActionDispatchOptions,
  PIRRendererProps,
  RenderParams,
  RenderState,
} from './PIRRenderer.types';
import {
  buildInitialState,
  collectMountedCssBlocks,
  collectNodesById,
  deferSelectionNotification,
  emitSelectionDebug,
  isInteractiveEventTarget,
  isSyntheticEvent,
  pickIncrementTarget,
} from './PIRRenderer.helpers';

export type {
  ActionContext,
  ActionHandlers,
  PIRRendererProps,
  RenderContext,
  RenderState,
  RenderParams,
} from './PIRRenderer.types';

const readPirNodeId = (element: Element) =>
  element.getAttribute('data-pir-node-id') ?? element.getAttribute('data-pir-id');

const findNearestPirNodeId = (target: Element) => {
  const matched = target.closest('[data-pir-node-id], [data-pir-id]');
  return matched ? readPirNodeId(matched) : null;
};

export const PIRRenderer: React.FC<PIRRendererProps> = ({
  node,
  pirDoc,
  overrides = {},
  runtimeState,
  codeArtifacts = [],
  actions = {},
  selectedId,
  onNodeSelect,
  registry: registryProp,
  renderMode = 'tolerant',
  allowExternalProps = true,
  builtInActions,
  requireSelectionForEvents = false,
  interactionMode = 'design',
  routeManifest,
  activeRouteNodeId,
  routeRuntimeContext,
  outletContentNode,
  outletTargetNodeId,
}) => {
  const rootNode = useMemo(
    () => node ?? materializeUiTree(pirDoc.ui.graph),
    [pirDoc.ui.graph, node]
  );
  const effectiveParams = useMemo(() => {
    const result: RenderParams = {};
    const propsDef = pirDoc.logic?.props || {};

    Object.keys(propsDef).forEach((key) => {
      result[key] = propsDef[key].default;
    });
    if (allowExternalProps) {
      Object.keys(overrides).forEach((key) => {
        if (!(key in result)) {
          result[key] = overrides[key];
        } else if (overrides[key] !== undefined) {
          result[key] = overrides[key];
        }
      });
    }
    if (routeRuntimeContext) {
      Object.assign(result, routeRuntimeContext.params);
      result.route = {
        currentPath: routeRuntimeContext.currentPath,
        matchedPath: routeRuntimeContext.matchedPath,
        activeRouteNodeId: routeRuntimeContext.activeRouteNodeId,
        params: routeRuntimeContext.params,
        searchParams: routeRuntimeContext.searchParams,
        hash: routeRuntimeContext.hash,
      };
      result.searchParams = routeRuntimeContext.searchParams;
      if (routeRuntimeContext.hash) {
        result.hash = routeRuntimeContext.hash;
      }
    }
    return result;
  }, [pirDoc.logic?.props, overrides, allowExternalProps, routeRuntimeContext]);

  const initialState = useMemo(
    () => buildInitialState(pirDoc.logic?.state),
    [pirDoc.logic?.state]
  );
  const runtimeStateOverrides = useMemo(() => {
    if (!runtimeState || typeof runtimeState !== 'object') return {};
    return runtimeState;
  }, [runtimeState]);
  const [state, setState] = useState<RenderState>({
    ...initialState,
    ...runtimeStateOverrides,
  });

  useEffect(() => {
    setState({
      ...initialState,
      ...runtimeStateOverrides,
    });
  }, [initialState, runtimeStateOverrides]);

  const dispatchAction = useCallback(
    (actionName?: string, payload?: unknown) => {
      if (!actionName) return;

      const event = isSyntheticEvent(payload) ? payload : undefined;

      const customAction = actions[actionName];
      if (typeof customAction === 'function') {
        customAction({
          state,
          setState,
          params: effectiveParams,
          event,
          payload,
        });
        return;
      }

      const paramAction = effectiveParams[actionName];
      if (typeof paramAction === 'function') {
        paramAction(event ?? payload);
        return;
      }

      if (actionName === 'increment') {
        setState((prev) => {
          const targetKey = pickIncrementTarget(prev);
          if (!targetKey) return prev;
          const nextValue = (Number(prev[targetKey]) || 0) + 1;
          return { ...prev, [targetKey]: nextValue };
        });
      }
    },
    [actions, effectiveParams, state]
  );

  const registry = useMemo(
    () => registryProp ?? getDefaultComponentRegistry(),
    [registryProp]
  );
  const nodesById = useMemo(() => {
    const map = collectNodesById(rootNode);
    if (outletContentNode) collectNodesById(outletContentNode, map);
    return map;
  }, [outletContentNode, rootNode]);
  const mountedCssBlocks = useMemo(
    () =>
      collectMountedCssBlocks(
        rootNode,
        codeArtifacts,
        outletContentNode ? [outletContentNode] : []
      ),
    [codeArtifacts, outletContentNode, rootNode]
  );

  const dispatchBuiltInAction = useCallback(
    (actionName: string, options: BuiltInActionDispatchOptions) => {
      const action = builtInActions?.[actionName];
      if (typeof action === 'function') {
        action(options);
        return true;
      }
      if (isBuiltInActionName(actionName)) {
        executeBuiltInAction(actionName, options as BuiltInActionContext);
        return true;
      }
      return false;
    },
    [builtInActions]
  );

  /**
   * Delegated click handler (capture phase).
   *
   * 调用链路：
   * click -> PIRRenderer(onClickCapture) -> onNodeSelect -> Canvas -> controller。
   * Runtime click actions are attached to the rendered component by PIRNode.
   */
  const handleDelegatedClickCapture = useCallback(
    (event: React.SyntheticEvent) => {
      if (interactionMode !== 'design') return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      emitSelectionDebug({
        stage: 'capture',
        targetTag: target.tagName,
        targetClass: target.className,
        interactionMode,
      });
      const selectionNodeId = findNearestPirNodeId(target);
      if (!selectionNodeId) {
        emitSelectionDebug({
          stage: 'no-match',
        });
        return;
      }
      const matchedNode = nodesById[selectionNodeId];
      if (onNodeSelect && resolveLinkCapability(matchedNode)) {
        event.preventDefault();
      }
      const wasSelected = selectedId === selectionNodeId;
      const isInteractiveTarget = isInteractiveEventTarget(target);
      const shouldDeferSelection = isInteractiveTarget && !wasSelected;

      if (shouldDeferSelection) {
        deferSelectionNotification(() => onNodeSelect?.(selectionNodeId, event));
      } else {
        onNodeSelect?.(selectionNodeId, event);
      }
      emitSelectionDebug({
        stage: 'selected',
        nodeId: selectionNodeId,
        deferred: shouldDeferSelection,
      });
    },
    [
      nodesById,
      onNodeSelect,
      interactionMode,
      selectedId,
    ]
  );

  const context = useMemo(
    () => ({
      state,
      params: effectiveParams,
      data: undefined,
      item: undefined,
      index: undefined,
      nodesById,
      dispatchAction,
      dispatchBuiltInAction,
      selectedId,
      requireSelectionForEvents,
      interactionMode,
      onNodeSelect,
      renderMode,
      routeManifest,
      activeRouteNodeId,
      routeRuntimeContext,
      outletContentNode,
      outletTargetNodeId,
    }),
    [
      state,
      effectiveParams,
      nodesById,
      dispatchAction,
      dispatchBuiltInAction,
      selectedId,
      requireSelectionForEvents,
      interactionMode,
      onNodeSelect,
      renderMode,
      routeManifest,
      activeRouteNodeId,
      routeRuntimeContext,
      outletContentNode,
      outletTargetNodeId,
    ]
  );

  return (
    <div
      style={{ display: 'contents' }}
      onClickCapture={handleDelegatedClickCapture}
    >
      {mountedCssBlocks.map((block) => (
        <style
          key={block.key}
          data-pir-mounted-css={block.key}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      ))}
      <PIRNode node={rootNode} context={context} registry={registry} />
    </div>
  );
};
