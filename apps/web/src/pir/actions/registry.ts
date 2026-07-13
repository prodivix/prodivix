import { getNavigateLinkKind } from '@prodivix/router';
import { normalizeRoutePath } from '@prodivix/router';
import { logRouteDebug } from '@prodivix/pir-react-renderer';

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

export const openExternalNavigateTarget = (
  url: string,
  options: { target: NavigateTarget; replace: boolean; debugLabel?: string }
) => {
  const debugLabel = options.debugLabel ?? 'built-in external';
  logRouteDebug(`${debugLabel} navigation requested`, {
    url,
    target: options.target,
    replace: options.replace,
  });
  if (options.target === '_blank') {
    let opened: Window | null = null;
    try {
      opened = window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      logRouteDebug(`${debugLabel} window.open threw`, {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    logRouteDebug(`${debugLabel} window.open result`, {
      url,
      opened: Boolean(opened),
      closed: opened?.closed,
    });
    return;
  }
  if (options.replace) {
    logRouteDebug(`${debugLabel} navigation via location.replace`, { url });
    window.location.replace(url);
    return;
  }
  logRouteDebug(`${debugLabel} navigation via location.assign`, { url });
  window.location.assign(url);
};

/**
 * 默认导航链路：PIR 事件 -> Web navigation adapter。其他内置动作必须由
 * composition root 显式注入，禁止通过 Window 事件总线寻找运行时。
 */
export const executeBuiltInNavigateAction = (context: BuiltInActionContext) => {
  if (typeof window === 'undefined') return;
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
