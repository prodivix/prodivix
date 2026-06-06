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
  collectNodeEvents,
  collectNodesById,
  deferSelectionNotification,
  emitSelectionDebug,
  isClickTrigger,
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
    return result;
  }, [pirDoc.logic?.props, overrides, allowExternalProps]);

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
  const nodeEventsById = useMemo(() => collectNodeEvents(rootNode), [rootNode]);
  const nodesById = useMemo(() => collectNodesById(rootNode), [rootNode]);
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
   * click -> PIRRenderer(onClickCapture) -> onNodeSelect -> Canvas -> controller；
   * click -> PIRRenderer -> dispatchBuiltInAction/dispatchAction。
   */
  const handleDelegatedClickCapture = useCallback(
    (event: React.SyntheticEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      emitSelectionDebug({
        stage: 'capture',
        targetTag: target.tagName,
        targetClass: target.className,
      });
      const matched = target.closest('[data-pir-node-id], [data-pir-id]');
      if (!matched) {
        emitSelectionDebug({
          stage: 'no-match',
        });
        return;
      }
      const nodeId =
        matched.getAttribute('data-pir-node-id') ??
        matched.getAttribute('data-pir-id');
      if (!nodeId) {
        emitSelectionDebug({
          stage: 'empty-node-id',
        });
        return;
      }
      const matchedNode = nodesById[nodeId];
      if (onNodeSelect && resolveLinkCapability(matchedNode)) {
        event.preventDefault();
      }
      const wasSelected = selectedId === nodeId;
      const shouldDeferSelection =
        isInteractiveEventTarget(target) && !wasSelected;

      if (shouldDeferSelection) {
        deferSelectionNotification(() => onNodeSelect?.(nodeId, event));
      } else {
        onNodeSelect?.(nodeId, event);
      }
      emitSelectionDebug({
        stage: 'selected',
        nodeId,
        deferred: shouldDeferSelection,
      });
      if (requireSelectionForEvents && !wasSelected) {
        emitSelectionDebug({
          stage: 'event-skipped-unselected',
          nodeId,
          selectedId,
        });
        return;
      }

      const events = nodeEventsById[nodeId];
      if (!events) {
        emitSelectionDebug({
          stage: 'no-events',
          nodeId,
        });
        return;
      }
      Object.entries(events).forEach(([eventKey, eventDef]) => {
        const trigger = eventDef.trigger || eventKey;
        if (!isClickTrigger(trigger)) return;
        emitSelectionDebug({
          stage: 'click-trigger',
          nodeId,
          eventKey,
          trigger,
          action: eventDef.action,
        });
        if (
          eventDef.action &&
          dispatchBuiltInAction(eventDef.action, {
            params: eventDef.params,
            nodeId,
            trigger,
            eventKey,
            payload: event,
          })
        ) {
          emitSelectionDebug({
            stage: 'built-in-dispatched',
            nodeId,
            eventKey,
            action: eventDef.action,
          });
          return;
        }
        dispatchAction(eventDef.action, event);
        emitSelectionDebug({
          stage: 'action-dispatched',
          nodeId,
          eventKey,
          action: eventDef.action,
        });
      });
    },
    [
      dispatchAction,
      dispatchBuiltInAction,
      nodeEventsById,
      nodesById,
      onNodeSelect,
      requireSelectionForEvents,
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
      onNodeSelect,
      renderMode,
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
      onNodeSelect,
      renderMode,
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
