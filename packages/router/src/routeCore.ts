import type {
  RouteModule,
  RouteModuleMount,
  WorkspaceRouteManifest,
  WorkspaceRouteNode,
} from './routeTypes';
import { getNavigateLinkKind } from './routeNavigation';

export type RouteSegmentValidation =
  | {
      ok: true;
      segment: string;
      params: string[];
      wildcard: boolean;
    }
  | {
      ok: false;
      segment: string;
      message: string;
    };

export type RouteManifestItem = {
  id: string;
  path: string;
  depth: number;
  label: string;
  node: WorkspaceRouteNode;
  parentId?: string;
};

export type RouteManifestIssue = {
  code:
    'RTE-1001' | 'RTE-1002' | 'RTE-1010' | 'RTE-2001' | 'RTE-2010' | 'RTE-2011';
  routeNodeId: string;
  message: string;
  artifactId?: string;
};

export type RouteManifestValidationOptions = {
  manifest: WorkspaceRouteManifest;
  documentExists?: (documentId: string) => boolean;
  codeArtifactExists?: (artifactId: string) => boolean;
};

type SegmentMatcher = {
  kind: 'static' | 'dynamic' | 'wildcard';
  value: string;
};

export type RoutePatternMatch = {
  score: number;
  matchedPath: string;
  exact: boolean;
  consumedCount: number;
  staticCount: number;
  paramCount: number;
  wildcard: boolean;
};

export type ResolvedRouteMatch = {
  routeNodeId: string;
  path: string;
  params: Record<string, string>;
  node: WorkspaceRouteNode;
  layoutDocId?: string;
  pageDocId?: string;
  outletNodeId?: string;
  source?: {
    kind: 'workspace' | 'route-module';
    moduleId?: string;
    mountId?: string;
    sourceRouteNodeId?: string;
  };
};

export type RouteRuntimeContext = {
  currentPath: string;
  matchedPath: string;
  params: Record<string, string>;
  searchParams: Record<string, string | string[]>;
  hash?: string;
  matchChain: ResolvedRouteMatch[];
  activeRouteNodeId?: string;
  routeModuleScope?: string;
};

export type RouteNavigationTarget = {
  to?: string;
  path?: string;
  routeNodeId?: string;
};

export type RouteNavigationResult =
  | {
      kind: 'external';
      url: string;
    }
  | {
      kind: 'internal';
      runtimeContext: RouteRuntimeContext;
    }
  | {
      kind: 'unmatched';
      path: string;
    };

export type ResolvedRouteOutletBinding = {
  routeNodeId: string;
  outletName: string;
  outletNodeId: string;
  pageDocId?: string;
};

export type RouteNodeParentInfo = {
  node: WorkspaceRouteNode;
  parent: WorkspaceRouteNode | null;
  index: number;
};

export type RouteModuleSourceTrace = {
  kind: 'route-module';
  moduleId: string;
  mountId: string;
  sourceRouteNodeId: string;
  hostRouteNodeId: string;
  path: string;
};

export type ComposedRouteManifest = {
  manifest: WorkspaceRouteManifest;
  sourceTrace: RouteModuleSourceTrace[];
  skippedMounts: Array<{
    mountId: string;
    reason: 'missing-module' | 'missing-parent' | 'invalid-mount-path';
  }>;
};

const trimSlashes = (value: string): string =>
  value.replace(/^\/+/, '').replace(/\/+$/, '');

const splitPath = (value: string): string[] => {
  const normalized = normalizeRoutePath(value);
  return normalized === '/' ? [] : normalized.slice(1).split('/');
};

const decodeSearchPart = (value: string) => {
  const normalized = value.replaceAll('+', ' ');
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
};

const parseRouteLocation = (
  value: string
): {
  path: string;
  searchParams: Record<string, string | string[]>;
  hash?: string;
} => {
  const trimmed = value.trim();
  const hashIndex = trimmed.indexOf('#');
  const beforeHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const hash =
    hashIndex >= 0 && trimmed.slice(hashIndex + 1).trim()
      ? trimmed.slice(hashIndex + 1)
      : undefined;
  const queryIndex = beforeHash.indexOf('?');
  const beforeQuery =
    queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';
  const searchParams: Record<string, string | string[]> = {};
  query.split('&').forEach((entry) => {
    if (!entry) return;
    const separatorIndex = entry.indexOf('=');
    const key = decodeSearchPart(
      separatorIndex >= 0 ? entry.slice(0, separatorIndex) : entry
    );
    const value = decodeSearchPart(
      separatorIndex >= 0 ? entry.slice(separatorIndex + 1) : ''
    );
    const previous = searchParams[key];
    if (previous === undefined) {
      searchParams[key] = value;
      return;
    }
    searchParams[key] = Array.isArray(previous)
      ? [...previous, value]
      : [previous, value];
  });
  return {
    path: normalizeRoutePath(beforeQuery),
    searchParams,
    ...(hash ? { hash } : {}),
  };
};

export const normalizeRoutePath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '/';
  const withoutHash = trimmed.split('#')[0] ?? trimmed;
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;
  const pieces = withoutQuery
    .split('/')
    .map((piece) => piece.trim())
    .filter(Boolean);
  return pieces.length ? `/${pieces.join('/')}` : '/';
};

export const normalizeRouteSegment = (input = ''): RouteSegmentValidation => {
  const segment = trimSlashes(input.trim());
  if (!segment) {
    return { ok: true, segment: '', params: [], wildcard: false };
  }
  const params = new Set<string>();
  let wildcard = false;
  const pieces = segment.split('/');

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (!piece) {
      return {
        ok: false,
        segment,
        message: 'Route segment cannot contain empty path parts.',
      };
    }
    if (piece === '*') {
      wildcard = true;
      if (index !== pieces.length - 1) {
        return {
          ok: false,
          segment,
          message: 'Wildcard route segment must be the last path part.',
        };
      }
      continue;
    }
    if (piece.startsWith('*')) {
      const name = piece.slice(1);
      if (!name) {
        return {
          ok: false,
          segment,
          message: 'Named wildcard route segment requires a parameter name.',
        };
      }
      params.add(name);
      wildcard = true;
      if (index !== pieces.length - 1) {
        return {
          ok: false,
          segment,
          message: 'Wildcard route segment must be the last path part.',
        };
      }
      continue;
    }
    if (piece.startsWith(':')) {
      const name = piece.slice(1);
      if (!name) {
        return {
          ok: false,
          segment,
          message: 'Dynamic route segment requires a parameter name.',
        };
      }
      params.add(name);
      continue;
    }
    if (piece.startsWith('[...') && piece.endsWith(']')) {
      const name = piece.slice(4, -1);
      if (!name) {
        return {
          ok: false,
          segment,
          message: 'Catch-all route segment requires a parameter name.',
        };
      }
      params.add(name);
      wildcard = true;
      if (index !== pieces.length - 1) {
        return {
          ok: false,
          segment,
          message: 'Catch-all route segment must be the last path part.',
        };
      }
      continue;
    }
    if (piece.startsWith('[') && piece.endsWith(']')) {
      const name = piece.slice(1, -1);
      if (!name) {
        return {
          ok: false,
          segment,
          message: 'Dynamic route segment requires a parameter name.',
        };
      }
      params.add(name);
    }
  }

  return { ok: true, segment, params: [...params], wildcard };
};

export const buildRoutePath = (
  parentPath: string,
  node: WorkspaceRouteNode
): string => {
  const normalizedParent = normalizeRoutePath(parentPath);
  if (node.index) return normalizedParent;
  const segment = trimSlashes(node.segment ?? '');
  if (!segment) return normalizedParent;
  return normalizeRoutePath(
    normalizedParent === '/' ? segment : `${normalizedParent}/${segment}`
  );
};

const getRouteLabel = (node: WorkspaceRouteNode, path: string): string => {
  if (node.index) return '(index)';
  const segment = node.segment?.trim();
  return segment && segment.length > 0 ? segment : path;
};

export const flattenRouteManifest = (
  manifestOrNode: WorkspaceRouteManifest | WorkspaceRouteNode,
  parentPath = '/',
  depth = 0,
  parentId?: string
): RouteManifestItem[] => {
  const node =
    'root' in manifestOrNode
      ? manifestOrNode.root
      : (manifestOrNode as WorkspaceRouteNode);
  const currentPath = buildRoutePath(parentPath, node);
  const items: RouteManifestItem[] = [];
  if (node.id !== 'root') {
    items.push({
      id: node.id,
      path: currentPath,
      depth,
      label: getRouteLabel(node, currentPath),
      node,
      parentId,
    });
  }
  for (const child of node.children ?? []) {
    items.push(...flattenRouteManifest(child, currentPath, depth + 1, node.id));
  }
  return items;
};

export const updateRouteNodeById = (
  node: WorkspaceRouteNode,
  nodeId: string,
  updater: (target: WorkspaceRouteNode) => WorkspaceRouteNode
): WorkspaceRouteNode => {
  if (node.id === nodeId) {
    return updater(node);
  }
  const children = node.children ?? [];
  if (!children.length) return node;
  let changed = false;
  const nextChildren = children.map((child) => {
    const nextChild = updateRouteNodeById(child, nodeId, updater);
    if (nextChild !== child) changed = true;
    return nextChild;
  });
  if (!changed) return node;
  return { ...node, children: nextChildren };
};

export const removeRouteNodeById = (
  node: WorkspaceRouteNode,
  nodeId: string
): { node: WorkspaceRouteNode; removed?: WorkspaceRouteNode } => {
  const children = node.children ?? [];
  if (!children.length) return { node };
  const removedDirect = children.find((child) => child.id === nodeId);
  if (removedDirect) {
    return {
      node: {
        ...node,
        children: children.filter((child) => child.id !== nodeId),
      },
      removed: removedDirect,
    };
  }
  let removed: WorkspaceRouteNode | undefined;
  let changed = false;
  const nextChildren = children.map((child) => {
    const result = removeRouteNodeById(child, nodeId);
    if (result.removed) {
      removed = result.removed;
    }
    if (result.node !== child) changed = true;
    return result.node;
  });
  if (!changed) return { node };
  return { node: { ...node, children: nextChildren }, removed };
};

export const findRouteNodeParentInfo = (
  node: WorkspaceRouteNode,
  nodeId: string,
  parent: WorkspaceRouteNode | null = null,
  index = -1
): RouteNodeParentInfo | null => {
  if (node.id === nodeId) return { node, parent, index };
  const children = node.children ?? [];
  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const matched = findRouteNodeParentInfo(
      children[childIndex],
      nodeId,
      node,
      childIndex
    );
    if (matched) return matched;
  }
  return null;
};

export const insertRouteNodeIntoParent = (
  root: WorkspaceRouteNode,
  parentNodeId: string,
  routeNode: WorkspaceRouteNode,
  index?: number
): WorkspaceRouteNode => {
  return updateRouteNodeById(root, parentNodeId, (target) => {
    const children = target.children ?? [];
    const insertIndex =
      typeof index === 'number'
        ? Math.max(0, Math.min(index, children.length))
        : children.length;
    return {
      ...target,
      children: [
        ...children.slice(0, insertIndex),
        routeNode,
        ...children.slice(insertIndex),
      ],
    };
  });
};

export const moveRouteNodeById = (
  root: WorkspaceRouteNode,
  routeNodeId: string,
  parentNodeId: string,
  index?: number
): { root: WorkspaceRouteNode; moved?: WorkspaceRouteNode } => {
  if (routeNodeId === root.id) return { root };
  if (routeNodeId === parentNodeId) return { root };
  const currentInfo = findRouteNodeParentInfo(root, routeNodeId);
  if (!currentInfo?.parent) return { root };
  if (findRouteNodeById(currentInfo.node, parentNodeId)) {
    return { root };
  }
  const removed = removeRouteNodeById(root, routeNodeId);
  if (!removed.removed) return { root };
  if (!findRouteNodeById(removed.node, parentNodeId)) return { root };
  return {
    root: insertRouteNodeIntoParent(
      removed.node,
      parentNodeId,
      removed.removed,
      index
    ),
    moved: removed.removed,
  };
};

export const findRouteNodeById = (
  node: WorkspaceRouteNode,
  nodeId: string
): WorkspaceRouteNode | undefined => {
  if (node.id === nodeId) return node;
  for (const child of node.children ?? []) {
    const matched = findRouteNodeById(child, nodeId);
    if (matched) return matched;
  }
  return undefined;
};

const createMountedRouteNodeId = (
  mount: RouteModuleMount,
  routeNode: WorkspaceRouteNode
): string => `${mount.mountId}:${routeNode.id}`;

const cloneMountedRouteNode = (
  module: RouteModule,
  mount: RouteModuleMount,
  routeNode: WorkspaceRouteNode,
  mountPath: string | undefined,
  sourceTrace: RouteModuleSourceTrace[],
  parentPath: string
): WorkspaceRouteNode => {
  const hostRouteNodeId = createMountedRouteNodeId(mount, routeNode);
  const mountedNode: WorkspaceRouteNode = {
    ...routeNode,
    id: hostRouteNodeId,
    ...(mountPath !== undefined
      ? {
          segment: mountPath,
          index: false,
        }
      : {}),
  };
  const currentPath = buildRoutePath(parentPath, mountedNode);
  sourceTrace.push({
    kind: 'route-module',
    moduleId: module.moduleId,
    mountId: mount.mountId,
    sourceRouteNodeId: routeNode.id,
    hostRouteNodeId,
    path: currentPath,
  });
  const children = routeNode.children ?? [];
  return {
    ...mountedNode,
    children: children.map((child) =>
      cloneMountedRouteNode(
        module,
        mount,
        child,
        undefined,
        sourceTrace,
        currentPath
      )
    ),
  };
};

export const composeRouteManifestWithModules = (
  manifest: WorkspaceRouteManifest
): ComposedRouteManifest => {
  const sourceTrace: RouteModuleSourceTrace[] = [];
  const skippedMounts: ComposedRouteManifest['skippedMounts'] = [];
  let root = manifest.root;
  const routePathsById = new Map(
    flattenRouteManifest(manifest).map((item) => [item.id, item.path])
  );
  routePathsById.set(manifest.root.id, '/');

  for (const mount of manifest.mounts ?? []) {
    const module = manifest.modules?.[mount.moduleRef];
    if (!module) {
      skippedMounts.push({ mountId: mount.mountId, reason: 'missing-module' });
      continue;
    }
    const parentRouteNodeId =
      mount.parentRouteNodeId?.trim() || manifest.root.id;
    if (!findRouteNodeById(root, parentRouteNodeId)) {
      skippedMounts.push({ mountId: mount.mountId, reason: 'missing-parent' });
      continue;
    }
    const mountPath = mount.mountPath?.trim();
    let normalizedMountSegment: string | undefined;
    if (mountPath) {
      const normalizedMountPath = normalizeRouteSegment(mountPath);
      if (!normalizedMountPath.ok) {
        skippedMounts.push({
          mountId: mount.mountId,
          reason: 'invalid-mount-path',
        });
        continue;
      }
      normalizedMountSegment = normalizedMountPath.segment;
    }
    const parentPath = routePathsById.get(parentRouteNodeId) ?? '/';
    const mountedNode = cloneMountedRouteNode(
      module,
      mount,
      module.root,
      normalizedMountSegment,
      sourceTrace,
      parentPath
    );
    root = insertRouteNodeIntoParent(root, parentRouteNodeId, mountedNode);
    flattenRouteManifest(mountedNode, parentPath, 0, parentRouteNodeId).forEach(
      (item) => routePathsById.set(item.id, item.path)
    );
  }

  return {
    manifest: {
      ...manifest,
      root,
    },
    sourceTrace,
    skippedMounts,
  };
};

export const resolveRouteMatchChain = (
  manifest: WorkspaceRouteManifest,
  routeNodeId: string
): WorkspaceRouteNode[] => {
  const walk = (
    node: WorkspaceRouteNode,
    chain: WorkspaceRouteNode[]
  ): WorkspaceRouteNode[] | null => {
    const nextChain = [...chain, node];
    if (node.id === routeNodeId) return nextChain;
    for (const child of node.children ?? []) {
      const matched = walk(child, nextChain);
      if (matched) return matched;
    }
    return null;
  };
  return walk(manifest.root, []) ?? [];
};

const createSegmentMatchersFromSegment = (
  segment: string | undefined
): SegmentMatcher[] => {
  const normalized = normalizeRouteSegment(segment);
  if (!normalized.ok || !normalized.segment) return [];
  return normalized.segment.split('/').map((piece) => {
    if (piece === '*' || piece.startsWith('*')) {
      return { kind: 'wildcard', value: piece };
    }
    if (piece.startsWith(':')) {
      return { kind: 'dynamic', value: piece.slice(1) };
    }
    if (piece.startsWith('[...') && piece.endsWith(']')) {
      return { kind: 'wildcard', value: piece.slice(4, -1) };
    }
    if (piece.startsWith('[') && piece.endsWith(']')) {
      return { kind: 'dynamic', value: piece.slice(1, -1) };
    }
    return { kind: 'static', value: piece };
  });
};

const createSegmentMatchers = (node: WorkspaceRouteNode): SegmentMatcher[] => {
  if (node.index) return [];
  return createSegmentMatchersFromSegment(node.segment);
};

const toRelativeSegments = (value: string): string[] => {
  const nextSegments: string[] = [];
  value
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .forEach((segment) => {
      if (segment === '.') return;
      if (segment === '..') {
        if (nextSegments.length > 0) nextSegments.pop();
        return;
      }
      nextSegments.push(segment);
    });
  return nextSegments;
};

const matchPatternFromIndex = (
  patternSegments: string[],
  currentSegments: string[],
  startIndex: number
): RoutePatternMatch | null => {
  const matchers = createSegmentMatchersFromSegment(patternSegments.join('/'));
  if (!matchers.length) return null;

  let currentIndex = startIndex;
  let staticCount = 0;
  let paramCount = 0;
  let wildcard = false;

  for (const matcher of matchers) {
    if (matcher.kind === 'wildcard') {
      wildcard = true;
      currentIndex = currentSegments.length;
      break;
    }
    const currentSegment = currentSegments[currentIndex];
    if (currentSegment === undefined) return null;
    if (matcher.kind === 'dynamic') {
      paramCount += 1;
      currentIndex += 1;
      continue;
    }
    if (matcher.value !== currentSegment) return null;
    staticCount += 1;
    currentIndex += 1;
  }

  const exact = currentIndex === currentSegments.length;
  const consumedCount = currentIndex - startIndex;
  const matchedPath =
    currentIndex > 0
      ? `/${currentSegments.slice(0, currentIndex).join('/')}`
      : '/';

  return {
    exact,
    wildcard,
    staticCount,
    paramCount,
    consumedCount,
    matchedPath,
    score:
      (exact ? 10_000 : 0) +
      staticCount * 220 +
      paramCount * 120 +
      consumedCount * 10 +
      (wildcard ? -120 : 0),
  };
};

export const matchRoutePattern = (
  routePath: string,
  currentPath: string
): RoutePatternMatch | null => {
  const trimmedRoutePath = routePath.trim();
  if (!trimmedRoutePath) return null;
  const currentSegments = splitPath(currentPath);
  const isAbsolute = trimmedRoutePath.startsWith('/');
  const patternSegments = isAbsolute
    ? splitPath(trimmedRoutePath)
    : toRelativeSegments(trimmedRoutePath);
  if (patternSegments.length === 0) return null;
  const startIndexes = isAbsolute
    ? [0]
    : Array.from({ length: currentSegments.length + 1 }, (_, index) => index);

  return startIndexes.reduce<RoutePatternMatch | null>((best, startIndex) => {
    const matched = matchPatternFromIndex(
      patternSegments,
      currentSegments,
      startIndex
    );
    if (!matched) return best;
    const next = {
      ...matched,
      score: matched.score + (isAbsolute ? 0 : startIndex * 30),
    };
    if (!best) return next;
    return next.score > best.score ? next : best;
  }, null);
};

const matchNodeSegments = (
  node: WorkspaceRouteNode,
  segments: string[]
): { matched: boolean; consumed: number; params: Record<string, string> } => {
  if (node.index) {
    return { matched: segments.length === 0, consumed: 0, params: {} };
  }
  const matchers = createSegmentMatchers(node);
  if (!matchers.length) return { matched: true, consumed: 0, params: {} };
  let consumed = 0;
  const params: Record<string, string> = {};
  for (const matcher of matchers) {
    if (matcher.kind === 'wildcard') {
      const wildcardName =
        matcher.value === '*'
          ? '*'
          : matcher.value.startsWith('*')
            ? matcher.value.slice(1)
            : matcher.value;
      params[wildcardName || '*'] = segments.slice(consumed).join('/');
      return { matched: true, consumed: segments.length, params };
    }
    const current = segments[consumed];
    if (!current) return { matched: false, consumed: 0, params: {} };
    if (matcher.kind === 'static' && matcher.value !== current) {
      return { matched: false, consumed: 0, params: {} };
    }
    if (matcher.kind === 'dynamic') {
      params[matcher.value] = current;
    }
    consumed += 1;
  }
  return { matched: true, consumed, params };
};

const matchChildren = (
  parent: WorkspaceRouteNode,
  segments: string[],
  chain: Array<{ node: WorkspaceRouteNode; params: Record<string, string> }>
): Array<{
  node: WorkspaceRouteNode;
  params: Record<string, string>;
}> | null => {
  const children = parent.children ?? [];
  const rankedChildren = [...children].sort((left, right) => {
    if (left.index !== right.index) return left.index ? 1 : -1;
    const leftStatic = createSegmentMatchers(left).filter(
      (matcher) => matcher.kind === 'static'
    ).length;
    const rightStatic = createSegmentMatchers(right).filter(
      (matcher) => matcher.kind === 'static'
    ).length;
    return rightStatic - leftStatic;
  });

  for (const child of rankedChildren) {
    const result = matchNodeSegments(child, segments);
    if (!result.matched) continue;
    const remaining = segments.slice(result.consumed);
    const nextEntry = { node: child, params: result.params };
    if (!remaining.length) {
      const indexChild = (child.children ?? []).find(
        (candidate) => candidate.index
      );
      if (indexChild)
        return [...chain, nextEntry, { node: indexChild, params: {} }];
      return [...chain, nextEntry];
    }
    const nested = matchChildren(child, remaining, [...chain, nextEntry]);
    if (nested) return nested;
  }

  return null;
};

const toResolvedRouteMatchChain = (
  manifest: WorkspaceRouteManifest,
  chain: Array<{ node: WorkspaceRouteNode; params: Record<string, string> }>
): ResolvedRouteMatch[] => {
  const flattened = new Map(
    flattenRouteManifest(manifest).map((item) => [item.id, item.path])
  );
  flattened.set(manifest.root.id, '/');
  const accumulatedParams: Record<string, string> = {};
  return chain.map(({ node, params }) => {
    Object.assign(accumulatedParams, params);
    return {
      routeNodeId: node.id,
      path: flattened.get(node.id) ?? '/',
      params: { ...accumulatedParams },
      node,
      ...(node.layoutDocId ? { layoutDocId: node.layoutDocId } : {}),
      ...(node.pageDocId ? { pageDocId: node.pageDocId } : {}),
      ...(node.outletNodeId ? { outletNodeId: node.outletNodeId } : {}),
    };
  });
};

const matchRouteManifestEntries = (
  manifest: WorkspaceRouteManifest,
  path: string
): Array<{ node: WorkspaceRouteNode; params: Record<string, string> }> => {
  const segments = splitPath(path);
  if (!segments.length) {
    const indexChild = (manifest.root.children ?? []).find(
      (candidate) => candidate.index
    );
    return indexChild
      ? [
          { node: manifest.root, params: {} },
          { node: indexChild, params: {} },
        ]
      : [{ node: manifest.root, params: {} }];
  }
  return (
    matchChildren(manifest.root, segments, [
      { node: manifest.root, params: {} },
    ]) ?? []
  );
};

export const matchRouteManifest = (
  manifest: WorkspaceRouteManifest,
  path: string
): WorkspaceRouteNode[] => {
  return matchRouteManifestEntries(manifest, path).map((entry) => entry.node);
};

export const matchRouteManifestResolved = (
  manifest: WorkspaceRouteManifest,
  path: string
): ResolvedRouteMatch[] =>
  toResolvedRouteMatchChain(
    manifest,
    matchRouteManifestEntries(manifest, path)
  );

const toRouteNodeEntries = (
  chain: WorkspaceRouteNode[]
): Array<{ node: WorkspaceRouteNode; params: Record<string, string> }> =>
  chain.map((node) => ({ node, params: {} }));

export const resolveRouteRuntimeContext = (
  manifest: WorkspaceRouteManifest,
  input: { currentPath?: string; routeNodeId?: string }
): RouteRuntimeContext => {
  const location = parseRouteLocation(input.currentPath ?? '/');
  const pathMatchedChain = matchRouteManifestResolved(manifest, location.path);
  const exactPathRouteNodeId =
    pathMatchedChain.length > 0
      ? undefined
      : flattenRouteManifest(manifest).find(
          (item) => item.path === location.path
        )?.id;
  let matchChain = pathMatchedChain;
  if (exactPathRouteNodeId) {
    matchChain = toResolvedRouteMatchChain(
      manifest,
      toRouteNodeEntries(resolveRouteMatchChain(manifest, exactPathRouteNodeId))
    );
  }
  const requestedRouteNodeId = input.routeNodeId?.trim();
  if (requestedRouteNodeId) {
    const pathLeaf = pathMatchedChain.at(-1);
    if (pathLeaf?.routeNodeId !== requestedRouteNodeId) {
      matchChain = toResolvedRouteMatchChain(
        manifest,
        toRouteNodeEntries(
          resolveRouteMatchChain(manifest, requestedRouteNodeId)
        )
      );
    }
  }
  const activeRoute = matchChain
    .filter((item) => item.routeNodeId !== manifest.root.id)
    .at(-1);
  const activeRouteNodeId = activeRoute?.routeNodeId;
  const params = activeRoute?.params ?? {};
  return {
    currentPath: location.path,
    matchedPath: matchChain.length ? location.path : '/',
    params,
    searchParams: location.searchParams,
    ...(location.hash ? { hash: location.hash } : {}),
    matchChain,
    ...(activeRouteNodeId ? { activeRouteNodeId } : {}),
  };
};

const resolveRouteNodePath = (
  manifest: WorkspaceRouteManifest,
  routeNodeId: string
): string | null => {
  if (manifest.root.id === routeNodeId) return '/';
  return (
    flattenRouteManifest(manifest).find((item) => item.id === routeNodeId)
      ?.path ?? null
  );
};

const resolveRelativeRoutePath = (
  currentPath: string,
  targetPath: string
): string => {
  const trimmed = targetPath.trim();
  if (!trimmed) return normalizeRoutePath(currentPath);
  if (trimmed.startsWith('?') || trimmed.startsWith('#')) {
    return `${normalizeRoutePath(currentPath)}${trimmed}`;
  }
  if (trimmed.startsWith('/')) return trimmed;
  const [pathPart = '', suffix = ''] = trimmed.split(/(?=[?#])/, 2);
  const segments = splitPath(currentPath);
  pathPart
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .forEach((segment) => {
      if (segment === '.') return;
      if (segment === '..') {
        segments.pop();
        return;
      }
      segments.push(segment);
    });
  return `${segments.length ? `/${segments.join('/')}` : '/'}${suffix}`;
};

export const resolveNavigateTarget = (
  manifest: WorkspaceRouteManifest,
  context: RouteRuntimeContext,
  target: RouteNavigationTarget
): RouteNavigationResult => {
  const routeNodeId = target.routeNodeId?.trim();
  if (routeNodeId) {
    const path = resolveRouteNodePath(manifest, routeNodeId);
    if (!path) return { kind: 'unmatched', path: context.currentPath };
    return {
      kind: 'internal',
      runtimeContext: resolveRouteRuntimeContext(manifest, {
        currentPath: path,
        routeNodeId,
      }),
    };
  }

  const rawPath = (target.path ?? target.to ?? '').trim();
  if (!rawPath) return { kind: 'unmatched', path: context.currentPath };
  const linkKind = getNavigateLinkKind(rawPath);
  if (linkKind === 'external') {
    return { kind: 'external', url: rawPath };
  }
  if (rawPath.includes(':') && !rawPath.startsWith('/')) {
    return { kind: 'unmatched', path: rawPath };
  }

  const path = resolveRelativeRoutePath(context.currentPath, rawPath);
  const runtimeContext = resolveRouteRuntimeContext(manifest, {
    currentPath: path,
  });
  if (!runtimeContext.matchChain.length) {
    const normalizedPath = parseRouteLocation(path).path;
    const exactRoute = flattenRouteManifest(manifest).find(
      (item) => item.path === normalizedPath
    );
    if (exactRoute) {
      return {
        kind: 'internal',
        runtimeContext: resolveRouteRuntimeContext(manifest, {
          currentPath: normalizedPath,
          routeNodeId: exactRoute.id,
        }),
      };
    }
    return { kind: 'unmatched', path: parseRouteLocation(path).path };
  }
  return {
    kind: 'internal',
    runtimeContext,
  };
};

export const resolveOutletBinding = (
  routeOrChain: WorkspaceRouteNode | WorkspaceRouteNode[],
  outletName = 'default'
): ResolvedRouteOutletBinding | null => {
  const chain = Array.isArray(routeOrChain) ? routeOrChain : [routeOrChain];
  const normalizedOutletName = outletName.trim() || 'default';
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const node = chain[index];
    const binding = node.outletBindings?.[normalizedOutletName];
    if (binding?.outletNodeId?.trim()) {
      return {
        routeNodeId: node.id,
        outletName: normalizedOutletName,
        outletNodeId: binding.outletNodeId,
        pageDocId: binding.pageDocId,
      };
    }
    if (
      normalizedOutletName === 'default' &&
      typeof node.outletNodeId === 'string' &&
      node.outletNodeId.trim()
    ) {
      return {
        routeNodeId: node.id,
        outletName: normalizedOutletName,
        outletNodeId: node.outletNodeId,
        pageDocId: node.pageDocId,
      };
    }
  }
  return null;
};

export const collectRouteDocumentRefs = (
  node: WorkspaceRouteNode,
  refs: Set<string> = new Set()
): Set<string> => {
  if (node.layoutDocId) refs.add(node.layoutDocId);
  if (node.pageDocId) refs.add(node.pageDocId);
  Object.values(node.outletBindings ?? {}).forEach((binding) => {
    if (binding.pageDocId) refs.add(binding.pageDocId);
  });
  (node.children ?? []).forEach((child) =>
    collectRouteDocumentRefs(child, refs)
  );
  return refs;
};

export const collectRouteManifestDocumentRefs = (
  manifest: WorkspaceRouteManifest
): Set<string> => {
  const refs = collectRouteDocumentRefs(manifest.root);
  Object.values(manifest.modules ?? {}).forEach((module) => {
    collectRouteDocumentRefs(module.root, refs);
  });
  return refs;
};

const routeDuplicateKey = (node: WorkspaceRouteNode): string => {
  if (node.index) return '__index__';
  const normalized = normalizeRouteSegment(node.segment);
  return normalized.ok ? normalized.segment : `__invalid__:${node.id}`;
};

const addMissingDocumentIssue = (
  issues: RouteManifestIssue[],
  routeNodeId: string,
  documentId: string,
  fieldName: string,
  documentExists: ((documentId: string) => boolean) | undefined
) => {
  if (!documentExists || documentExists(documentId)) return;
  issues.push({
    code: 'RTE-2001',
    routeNodeId,
    message: `${fieldName} references missing document ${documentId}.`,
  });
};

const getInvalidSegmentMessage = (segment: string | undefined): string => {
  const validation = normalizeRouteSegment(segment);
  return 'message' in validation ? validation.message : '';
};

export const validateRouteManifest = ({
  manifest,
  documentExists,
  codeArtifactExists,
}: RouteManifestValidationOptions): RouteManifestIssue[] => {
  const issues: RouteManifestIssue[] = [];

  const walk = (node: WorkspaceRouteNode) => {
    if (node.index && node.segment?.trim()) {
      issues.push({
        code: 'RTE-1002',
        routeNodeId: node.id,
        message: 'Index routes cannot define a segment.',
      });
    }
    const invalidSegmentMessage = getInvalidSegmentMessage(node.segment);
    if (!node.index && invalidSegmentMessage) {
      issues.push({
        code: 'RTE-1010',
        routeNodeId: node.id,
        message: invalidSegmentMessage,
      });
    }
    if (node.pageDocId) {
      addMissingDocumentIssue(
        issues,
        node.id,
        node.pageDocId,
        'pageDocId',
        documentExists
      );
    }
    if (node.layoutDocId) {
      addMissingDocumentIssue(
        issues,
        node.id,
        node.layoutDocId,
        'layoutDocId',
        documentExists
      );
    }

    const runtimeRefs = [
      node.runtime?.loaderRef,
      node.runtime?.actionRef,
      node.runtime?.guardRef,
    ].filter(Boolean);
    runtimeRefs.forEach((ref) => {
      if (!ref?.artifactId?.trim()) {
        issues.push({
          code: 'RTE-2010',
          routeNodeId: node.id,
          message: 'Route runtime references must point to a CodeArtifact.',
        });
        return;
      }
      if (codeArtifactExists && !codeArtifactExists(ref.artifactId)) {
        issues.push({
          code: 'RTE-2011',
          routeNodeId: node.id,
          artifactId: ref.artifactId,
          message: `Route runtime reference points to missing CodeArtifact ${ref.artifactId}.`,
        });
      }
    });

    const siblingKeys = new Map<string, WorkspaceRouteNode>();
    for (const child of node.children ?? []) {
      const key = routeDuplicateKey(child);
      const previous = siblingKeys.get(key);
      if (previous) {
        const isDuplicateIndex = key === '__index__';
        issues.push({
          code: isDuplicateIndex ? 'RTE-1001' : 'RTE-1001',
          routeNodeId: child.id,
          message: isDuplicateIndex
            ? `Route ${node.id} cannot have multiple index children.`
            : `Route ${node.id} cannot have duplicate child segment ${key}.`,
        });
      } else {
        siblingKeys.set(key, child);
      }
      walk(child);
    }
  };

  walk(manifest.root);
  Object.values(manifest.modules ?? {}).forEach((module) => walk(module.root));
  return issues;
};
