import { getNavigateLinkKind } from '@prodivix/shared/safety';

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

/**
 * 内置动作执行链路：
 * PIR 事件 -> executeBuiltInAction ->
 * - executeGraph: 派发 `prodivix:execute-graph`
 * - navigate: 外链确认或 history/location 跳转
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
  if (!linkKind) return;

  if (linkKind === 'external') {
    const confirmed = window.confirm(
      [
        'Open external link?',
        `URL: ${to}`,
        `Target: ${effectiveTarget}`,
        `Replace history: ${replace ? 'Yes' : 'No'}`,
        `Source: ${context.nodeId} · ${context.trigger}`,
      ].join('\n')
    );
    if (!confirmed) return;
    if (effectiveTarget === '_blank') {
      window.open(to, '_blank', 'noopener,noreferrer');
      return;
    }
    if (replace) {
      window.location.replace(to);
      return;
    }
    window.location.assign(to);
    return;
  }

  if (linkKind === 'internal') {
    if (replace) {
      window.history.replaceState(state, '', to);
    } else {
      window.history.pushState(state, '', to);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
};
