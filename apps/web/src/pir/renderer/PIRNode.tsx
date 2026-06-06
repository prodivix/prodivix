import React, { useMemo } from 'react';
import type { ComponentNode } from '@/core/types/engine.types';
import { deepResolveValueOrRef, readValueByPath } from '@/pir/shared/valueRef';
import type {
  AdapterContext,
  AdapterResult,
  ComponentRegistry,
} from './registry';
import { renderRichTextValue } from './richText';
import { decodeHtmlEntities } from './textEntities';
import type { RenderContext } from './PIRRenderer.types';
import {
  resolveListKey,
  resolveNodeDataScope,
  resolveValue,
} from './PIRRenderer.scope';
import {
  VOID_ELEMENTS,
  isClickTrigger,
  mergeHandlers,
  stripInternalProps,
  toReactEventName,
} from './PIRRenderer.helpers';

export const PIRNode: React.FC<{
  node: ComponentNode;
  context: RenderContext;
  registry: ComponentRegistry;
}> = ({ node, context, registry }) => {
  const resolvedNodeData = useMemo(
    () => resolveNodeDataScope(context, node),
    [
      context.data,
      context.index,
      context.item,
      context.params,
      context.state,
      node,
    ]
  );
  const scopedContext = useMemo(
    () => ({
      ...context,
      data: resolvedNodeData,
    }),
    [context, resolvedNodeData]
  );
  const resolvedProps = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (node.props) {
      Object.entries(node.props).forEach(([key, val]) => {
        p[key] = resolveValue(val, scopedContext);
      });
    }
    if (
      node.type === 'PdxRoute' &&
      p.currentPath === undefined &&
      typeof scopedContext.params.currentPath === 'string'
    ) {
      p.currentPath = scopedContext.params.currentPath;
    }
    return p;
  }, [node.props, node.type, scopedContext]);

  const resolvedStyle = useMemo(() => {
    const s: Record<string, unknown> = {};
    if (node.style) {
      Object.entries(node.style).forEach(([key, val]) => {
        s[key] = resolveValue(val, scopedContext);
      });
    }
    return s;
  }, [node.style, scopedContext]);

  const resolvedText = useMemo(
    () => decodeHtmlEntities(resolveValue(node.text, scopedContext)),
    [node.text, scopedContext]
  );
  const resolvedTextMode = useMemo(() => {
    const raw = resolvedProps?.textMode;
    if (typeof raw !== 'object' || raw === null) return 'plain';
    const mode = (raw as Record<string, unknown>).text;
    return mode === 'rich' ? 'rich' : 'plain';
  }, [resolvedProps]);
  const renderedText = useMemo(() => {
    if (resolvedTextMode !== 'rich' || typeof resolvedText !== 'string') {
      return resolvedText;
    }
    return renderRichTextValue(resolvedText);
  }, [resolvedText, resolvedTextMode]);

  const resolvedComponent = useMemo(
    () => registry.resolve(node.type),
    [registry, node.type]
  );

  const adapterResult = useMemo<AdapterResult>(() => {
    const adapterContext: AdapterContext = {
      node,
      resolvedProps,
      resolvedStyle,
      resolvedText: renderedText as React.ReactNode,
    };
    return (
      resolvedComponent.adapter.mapProps?.(adapterContext) ?? {
        props: resolvedProps,
      }
    );
  }, [node, resolvedComponent, resolvedProps, resolvedStyle, renderedText]);

  const eventProps = useMemo(() => {
    const handlers: Record<string, unknown> = {};
    if (!node.events) return handlers;
    Object.entries(node.events).forEach(([eventKey, eventDef]) => {
      const trigger = eventDef.trigger || eventKey;
      const reactEventName = toReactEventName(trigger);
      if (!reactEventName) return;
      if (isClickTrigger(trigger)) return;
      const handler = (payload: unknown) => {
        if (
          scopedContext.requireSelectionForEvents &&
          scopedContext.selectedId !== node.id
        ) {
          return;
        }
        const resolvedParams = eventDef.params
          ? (deepResolveValueOrRef(eventDef.params, {
              state: scopedContext.state,
              params: scopedContext.params,
              data: scopedContext.data,
              item: scopedContext.item,
              index: scopedContext.index,
            }) as Record<string, unknown>)
          : undefined;
        if (
          eventDef.action &&
          scopedContext.dispatchBuiltInAction(eventDef.action, {
            params: resolvedParams,
            nodeId: node.id,
            trigger,
            eventKey,
            payload,
          })
        ) {
          return;
        }
        scopedContext.dispatchAction(eventDef.action, payload);
      };
      handlers[reactEventName] = mergeHandlers(
        handlers[reactEventName],
        handler
      );
    });
    return handlers;
  }, [node.events, scopedContext, node.id]);

  const mergedProps = useMemo(() => {
    const combined = {
      ...(adapterResult.props ?? resolvedProps),
    } as Record<string, unknown>;
    Object.entries(eventProps).forEach(([key, handler]) => {
      combined[key] = mergeHandlers(combined[key], handler);
    });
    return stripInternalProps(combined);
  }, [adapterResult.props, resolvedProps, eventProps]);

  const selectionData = scopedContext.onNodeSelect
    ? {
        'data-pir-id': node.id,
        ...(scopedContext.selectedId === node.id
          ? { 'data-pir-selected': 'true' }
          : {}),
      }
    : {};
  let finalProps: Record<string, unknown> = { ...mergedProps };

  if (resolvedComponent.missing && context.renderMode === 'strict') {
    finalProps = {
      ...finalProps,
      'data-pir-missing': 'true',
      'data-pir-type': node.type,
    };
  }

  if (resolvedComponent.adapter.applySelection) {
    finalProps = resolvedComponent.adapter.applySelection(
      finalProps,
      selectionData
    );
  } else if (Object.keys(selectionData).length > 0) {
    finalProps = { ...finalProps, ...selectionData };
  }

  const Component = resolvedComponent.component as React.ElementType;
  const isVoid =
    adapterResult.isVoid ??
    resolvedComponent.adapter.isVoid ??
    (resolvedComponent.adapter.kind === 'html' &&
      typeof Component === 'string' &&
      VOID_ELEMENTS.has(Component.toLowerCase()));

  const supportsChildren =
    (adapterResult.supportsChildren ??
      resolvedComponent.adapter.supportsChildren ??
      true) &&
    !isVoid;

  const outletChildren =
    node.type === 'PdxOutlet' &&
    scopedContext.outletContentNode &&
    (!scopedContext.outletTargetNodeId ||
      scopedContext.outletTargetNodeId === node.id) ? (
      <PIRNode
        key={scopedContext.outletContentNode.id}
        node={scopedContext.outletContentNode}
        context={scopedContext}
        registry={registry}
      />
    ) : null;

  const listRender = useMemo(() => {
    if (!node.list) return null;
    const source =
      node.list.source !== undefined
        ? deepResolveValueOrRef(node.list.source, {
            state: scopedContext.state,
            params: scopedContext.params,
            data: scopedContext.data,
            item: scopedContext.item,
            index: scopedContext.index,
          })
        : typeof node.list.arrayField === 'string' &&
            node.list.arrayField.trim().length > 0
          ? readValueByPath(scopedContext.data, node.list.arrayField)
          : scopedContext.data;
    const items = Array.isArray(source) ? source : [];
    if (!items.length) {
      const emptyNodeId =
        typeof node.list.emptyNodeId === 'string' ? node.list.emptyNodeId : '';
      if (!emptyNodeId || emptyNodeId === node.id) return null;
      const emptyNode = scopedContext.nodesById[emptyNodeId];
      if (!emptyNode) return null;
      return (
        <PIRNode
          key={`${node.id}-empty`}
          node={emptyNode}
          context={scopedContext}
          registry={registry}
        />
      );
    }
    const nodeWithoutList = { ...node, list: undefined };
    const itemAlias =
      typeof node.list.itemAs === 'string' && node.list.itemAs.trim()
        ? node.list.itemAs.trim()
        : 'item';
    const indexAlias =
      typeof node.list.indexAs === 'string' && node.list.indexAs.trim()
        ? node.list.indexAs.trim()
        : 'index';
    return items.map((item, index) => {
      const iterationData =
        item && typeof item === 'object' && !Array.isArray(item)
          ? ({
              ...(scopedContext.data &&
              typeof scopedContext.data === 'object' &&
              !Array.isArray(scopedContext.data)
                ? (scopedContext.data as Record<string, unknown>)
                : {}),
              ...(item as Record<string, unknown>),
            } as Record<string, unknown>)
          : item;
      return (
        <PIRNode
          key={`${node.id}-${resolveListKey(item, index, node.list?.keyBy)}`}
          node={nodeWithoutList}
          context={{
            ...scopedContext,
            data: iterationData,
            item,
            index,
            params: {
              ...scopedContext.params,
              [itemAlias]: item,
              [indexAlias]: index,
            },
          }}
          registry={registry}
        />
      );
    });
  }, [node, scopedContext, registry]);

  const { style: propStyle, ...restProps } = finalProps;
  const mergedStyle = propStyle
    ? { ...(propStyle as Record<string, unknown>), ...resolvedStyle }
    : resolvedStyle;

  if (!supportsChildren) {
    if (listRender) {
      return <>{listRender}</>;
    }
    return (
      <span style={{ display: 'contents' }} data-pir-node-id={node.id}>
        <Component {...restProps} style={mergedStyle} />
      </span>
    );
  }

  if (listRender) {
    return <>{listRender}</>;
  }

  return (
    <span style={{ display: 'contents' }} data-pir-node-id={node.id}>
      <Component {...restProps} style={mergedStyle}>
        {adapterResult.children}
        {outletChildren ??
          node.children?.map((child) => (
            <PIRNode
              key={child.id}
              node={child}
              context={scopedContext}
              registry={registry}
            />
          ))}
      </Component>
    </span>
  );
};
