import { Children, isValidElement, type ReactElement } from 'react';
import type React from 'react';
import { type PdxComponent } from '@prodivix/shared';
import './PdxRoute.scss';

interface PdxRouteSpecificProps {
  currentPath?: string;
  emptyText?: string;
  children?: React.ReactNode;
}

export interface PdxRouteProps extends PdxComponent, PdxRouteSpecificProps {}

const normalizePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '/';
  const withoutHash = trimmed.split('#')[0] ?? trimmed;
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;
  const ensured = withoutQuery.startsWith('/')
    ? withoutQuery
    : `/${withoutQuery}`;
  const collapsed = ensured.replace(/\/{2,}/g, '/');
  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.slice(0, -1);
  }
  return collapsed;
};

const splitPathSegments = (value: string) => {
  const normalized = normalizePath(value);
  if (normalized === '/') return [] as string[];
  return normalized.split('/').filter(Boolean);
};

type RouteMatch = {
  score: number;
  matchedPath: string;
};

type RouteLikeProps = {
  ['data-route-path']?: string;
  ['data-route-fallback']?: boolean;
  ['data-route-index']?: boolean;
  node?: {
    props?: {
      ['data-route-path']?: string;
      ['data-route-fallback']?: boolean;
      ['data-route-index']?: boolean;
    };
  };
};

const toRelativeSegments = (value: string) => {
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

const tryMatchFromIndex = (
  routeSegments: string[],
  currentSegments: string[],
  startIndex: number
) => {
  let routeIndex = 0;
  let currentIndex = startIndex;
  let staticCount = 0;
  let paramCount = 0;
  let wildcard = false;

  while (routeIndex < routeSegments.length) {
    const routeSegment = routeSegments[routeIndex];
    if (routeSegment === '*') {
      wildcard = true;
      currentIndex = currentSegments.length;
      break;
    }
    const currentSegment = currentSegments[currentIndex];
    if (currentSegment === undefined) return null;
    if (routeSegment.startsWith(':') && routeSegment.length > 1) {
      paramCount += 1;
      routeIndex += 1;
      currentIndex += 1;
      continue;
    }
    if (routeSegment !== currentSegment) return null;
    staticCount += 1;
    routeIndex += 1;
    currentIndex += 1;
  }

  const exact = currentIndex === currentSegments.length;
  return {
    exact,
    wildcard,
    staticCount,
    paramCount,
    consumedCount: currentIndex - startIndex,
    matchedPath:
      currentIndex > 0
        ? `/${currentSegments.slice(0, currentIndex).join('/')}`
        : '/',
  };
};

const matchRoutePath = (
  routePath: string,
  currentPath: string
): RouteMatch | null => {
  const trimmedRoutePath = routePath.trim();
  if (!trimmedRoutePath) return null;
  const currentSegments = splitPathSegments(currentPath);
  const isAbsolute = trimmedRoutePath.startsWith('/');
  const routeSegments = isAbsolute
    ? splitPathSegments(trimmedRoutePath)
    : toRelativeSegments(trimmedRoutePath);
  if (routeSegments.length === 0 && !isAbsolute) return null;
  const startIndexes = isAbsolute
    ? [0]
    : Array.from({ length: currentSegments.length + 1 }, (_, index) => index);

  return startIndexes.reduce<RouteMatch | null>((best, startIndex) => {
    const matched = tryMatchFromIndex(
      routeSegments,
      currentSegments,
      startIndex
    );
    if (!matched) return best;
    const score =
      (matched.exact ? 10_000 : 0) +
      matched.staticCount * 220 +
      matched.paramCount * 120 +
      matched.consumedCount * 10 +
      (matched.wildcard ? -120 : 0) +
      (isAbsolute ? 0 : startIndex * 30);
    const next: RouteMatch = {
      score,
      matchedPath: matched.matchedPath,
    };
    if (!best) return next;
    return next.score > best.score ? next : best;
  }, null);
};

const readChildRoutePath = (
  child: ReactElement<RouteLikeProps>
): string | undefined => {
  const direct = child.props['data-route-path'];
  if (typeof direct === 'string') return direct;
  const wrapped = child.props.node?.props?.['data-route-path'];
  return typeof wrapped === 'string' ? wrapped : undefined;
};

const readChildFallback = (child: ReactElement<RouteLikeProps>): boolean => {
  if (child.props['data-route-fallback'] === true) return true;
  return child.props.node?.props?.['data-route-fallback'] === true;
};

const readChildIndex = (child: ReactElement<RouteLikeProps>): boolean => {
  if (child.props['data-route-index'] === true) return true;
  return child.props.node?.props?.['data-route-index'] === true;
};

type RouteCandidate = {
  node: React.ReactNode;
  score: number;
  index: boolean;
};

const resolveRouteCandidate = (
  child: React.ReactNode,
  currentPath: string
): RouteCandidate | null => {
  if (!isValidElement(child)) return null;
  const routeChild = child as ReactElement<RouteLikeProps>;
  if (readChildFallback(routeChild)) return null;
  const isIndex = readChildIndex(routeChild);
  const routePath = readChildRoutePath(routeChild);
  if (!routePath && !isIndex) return null;
  if (isIndex) {
    return {
      node: routeChild,
      score: Number.NEGATIVE_INFINITY,
      index: true,
    };
  }
  const match = matchRoutePath(routePath ?? '', currentPath);
  if (!match) return null;
  return {
    node: routeChild,
    score: match.score,
    index: false,
  };
};

const pickBestCandidate = (
  current: RouteCandidate | null,
  next: RouteCandidate | null
) => {
  if (!next) return current;
  if (!current) return next;
  return next.score > current.score ? next : current;
};

const readFallbackNode = (children: React.ReactNode[]) =>
  children.find((child) => {
    if (!isValidElement(child)) return false;
    return readChildFallback(child as ReactElement<RouteLikeProps>);
  });

function PdxRoute({
  currentPath,
  emptyText,
  children,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxRouteProps) {
  const normalizedCurrentPath = normalizePath(currentPath ?? '/');
  const childList = Children.toArray(children);
  const matched = childList.reduce<RouteCandidate | null>((best, child) => {
    const next = resolveRouteCandidate(child, normalizedCurrentPath);
    if (next?.index) return best;
    return pickBestCandidate(best, next);
  }, null);
  const indexCandidate =
    matched ??
    childList.reduce<RouteCandidate | null>((best, child) => {
      const next = resolveRouteCandidate(child, normalizedCurrentPath);
      if (!next?.index) return best;
      return best ?? next;
    }, null);
  const fallback = readFallbackNode(childList);
  const content =
    indexCandidate?.node ??
    fallback ??
    (emptyText ? <div className="PdxRouteEmpty">{emptyText}</div> : null);

  return (
    <div
      className={`PdxRoute ${className ?? ''}`.trim()}
      style={style as React.CSSProperties | undefined}
      id={id}
      {...dataAttributes}
    >
      {content}
    </div>
  );
}

export default PdxRoute;
