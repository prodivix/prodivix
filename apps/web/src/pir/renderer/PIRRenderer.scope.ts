import type { ComponentNode } from '@/core/types/engine.types';
import { deepResolveValueOrRef, readValueByPath } from '@/pir/shared/valueRef';
import type { RenderContext } from './PIRRenderer.types';

const resolvePathLikeString = (value: string, data: unknown): unknown => {
  const candidate = value.trim();
  if (!candidate || data === null || data === undefined) return value;
  const resolved = readValueByPath(data, candidate);
  return resolved === undefined ? value : resolved;
};

export const resolveValue = (
  value: unknown,
  context: RenderContext
): unknown => {
  if (typeof value === 'string') {
    return resolvePathLikeString(value, context.data);
  }
  return deepResolveValueOrRef(value, {
    state: context.state,
    params: context.params,
    data: context.data,
    item: context.item,
    index: context.index,
  });
};

export const resolveNodeDataScope = (
  context: RenderContext,
  node: ComponentNode
): unknown => {
  const scope = node.data;
  if (!scope) return context.data;
  let nextValue = context.data;
  const hasMock = scope.mock !== undefined;
  if (hasMock) {
    nextValue = deepResolveValueOrRef(scope.mock, {
      state: context.state,
      params: context.params,
      data: context.data,
      item: context.item,
      index: context.index,
    });
  }
  if (scope.source) {
    nextValue = deepResolveValueOrRef(scope.source, {
      state: context.state,
      params: context.params,
      data: context.data,
      item: context.item,
      index: context.index,
    });
  }
  if (typeof scope.pick === 'string' && scope.pick.trim()) {
    nextValue = readValueByPath(nextValue, scope.pick);
  }
  if (!hasMock && scope.value !== undefined) {
    nextValue = deepResolveValueOrRef(scope.value, {
      state: context.state,
      params: context.params,
      data: context.data,
      item: context.item,
      index: context.index,
    });
  }
  if (
    scope.extend &&
    typeof scope.extend === 'object' &&
    !Array.isArray(scope.extend)
  ) {
    const resolvedExtend = deepResolveValueOrRef(scope.extend, {
      state: context.state,
      params: context.params,
      data: context.data,
      item: context.item,
      index: context.index,
    });
    if (
      resolvedExtend &&
      typeof resolvedExtend === 'object' &&
      !Array.isArray(resolvedExtend)
    ) {
      const base =
        nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue)
          ? (nextValue as Record<string, unknown>)
          : {};
      return {
        ...base,
        ...(resolvedExtend as Record<string, unknown>),
      };
    }
  }
  return nextValue;
};

export const resolveListKey = (
  item: unknown,
  index: number,
  keyBy?: string
): string => {
  if (!keyBy?.trim()) return String(index);
  const resolved = readValueByPath(item, keyBy);
  if (resolved === undefined || resolved === null || resolved === '') {
    return String(index);
  }
  return String(resolved);
};
