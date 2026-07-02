import { getNavigateLinkKind } from '@prodivix/shared/safety';
import { normalizeRoutePath } from '@prodivix/shared/router';
import { logRouteDebug } from '@/pir/renderer/routeDebug';

export type BuiltInActionName = 'navigate' | 'executeGraph';

export type BuiltInActionContext = {
  params?: Record<string, unknown>;
  nodeId: string;
  trigger: string;
  eventKey: string;
  payload?: unknown;
};

export type BuiltInActionHandler = (context: BuiltInActionContext) => void;

export const DOM_EVENT_TRIGGERS = [
  'onClick',
  'onDoubleClick',
  'onMouseEnter',
  'onMouseLeave',
  'onFocus',
  'onBlur',
  'onChange',
  'onInput',
  'onSubmit',
  'onKeyDown',
  'onKeyUp',
] as const;

export const BUILT_IN_ACTION_OPTIONS = [
  {
    value: 'navigate',
    label: 'Navigate',
    labelKey: 'inspector.groups.triggers.actions.navigate',
  },
  {
    value: 'executeGraph',
    label: 'Execute Graph',
    labelKey: 'inspector.groups.triggers.actions.executeGraph',
  },
] as const;

export const isBuiltInActionName = (
  action: string | undefined
): action is BuiltInActionName =>
  action === 'navigate' || action === 'executeGraph';

export const normalizeBuiltInAction = (
  action: string | undefined
): BuiltInActionName => (isBuiltInActionName(action) ? action : 'navigate');

export const createDefaultActionParams = (
  action: BuiltInActionName
): Record<string, unknown> => {
  if (action === 'executeGraph') {
    return { graphMode: 'new', graphName: '', graphId: '' };
  }
  return { to: '', target: '_blank', replace: false, state: '' };
};

export type NavigateTarget = '_self' | '_blank';

export const resolveNavigateTarget = (
  rawTarget: unknown,
  options?: { forceBlankForExternalSafety?: boolean }
) => {
  const configuredTarget: NavigateTarget =
    rawTarget === '_self' ? '_self' : '_blank';
  if (options?.forceBlankForExternalSafety) {
    return {
      configuredTarget,
      effectiveTarget: '_blank' as const,
      openedAsBlankForSafety: configuredTarget === '_self',
    };
  }
  return {
    configuredTarget,
    effectiveTarget: configuredTarget,
    openedAsBlankForSafety: false,
  };
};

const parseNavigationState = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

export const resolveInternalNavigatePath = (to: string): string => {
  if (to.startsWith('?') || to.startsWith('#')) return to;
  return normalizeRoutePath(to);
};

const openExternalNavigateTarget = (
  url: string,
  options: { target: NavigateTarget; replace: boolean }
) => {
  logRouteDebug('built-in external navigation requested', {
    url,
    target: options.target,
    replace: options.replace,
  });
  if (options.target === '_blank') {
    let opened: Window | null = null;
    try {
      opened = window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      logRouteDebug('built-in external window.open threw', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    logRouteDebug('built-in external window.open result', {
      url,
      opened: Boolean(opened),
      closed: opened?.closed,
    });
    if (opened) return;
    logRouteDebug('built-in external anchor fallback requested', { url });
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    logRouteDebug('built-in external anchor fallback clicked', { url });
    return;
  }
  if (options.replace) {
    logRouteDebug('built-in external navigation via location.replace', { url });
    window.location.replace(url);
    return;
  }
  logRouteDebug('built-in external navigation via location.assign', { url });
  window.location.assign(url);
};

/**
 * 内置动作执行链路：
 * PIR 事件 -> executeBuiltInAction ->
 * - executeGraph: 派发 `prodivix:execute-graph`
 * - navigate: 外链或 history/location 跳转
 */
export const executeBuiltInAction = (
  actionName: BuiltInActionName,
  context: BuiltInActionContext
) => {
  if (typeof window === 'undefined') return;
  if (actionName === 'executeGraph') {
    window.dispatchEvent(
      new CustomEvent('prodivix:execute-graph', {
        detail: {
          requestId:
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `graph-${Date.now().toString(36)}-${Math.random()
                  .toString(36)
                  .slice(2, 8)}`,
          nodeId: context.nodeId,
          trigger: context.trigger,
          eventKey: context.eventKey,
          params: context.params ?? {},
        },
      })
    );
    return;
  }

  const params = context.params ?? {};
  const to = typeof params.to === 'string' ? params.to.trim() : '';
  if (!to) return;

  const { effectiveTarget } = resolveNavigateTarget(params.target);
  const replace = Boolean(params.replace);
  const state = parseNavigationState(params.state);
  const linkKind = getNavigateLinkKind(to);
  logRouteDebug('built-in navigation resolved link kind', {
    nodeId: context.nodeId,
    trigger: context.trigger,
    eventKey: context.eventKey,
    to,
    linkKind,
    effectiveTarget,
    replace,
  });
  if (!linkKind) return;

  if (linkKind === 'external') {
    openExternalNavigateTarget(to, {
      target: effectiveTarget,
      replace,
    });
    return;
  }

  if (linkKind === 'internal') {
    const nextPath = resolveInternalNavigatePath(to);
    if (replace) {
      window.history.replaceState(state, '', nextPath);
    } else {
      window.history.pushState(state, '', nextPath);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
};
