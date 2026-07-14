type EventHandler = (event: unknown) => void;

export const toReactEventName = (trigger: string): string | undefined => {
  const normalized = trigger.trim();
  if (!normalized) return undefined;
  if (/^on[A-Z]/.test(normalized)) return normalized;
  const lower = normalized.toLowerCase();
  if (lower === 'click') return 'onClick';
  if (lower === 'change') return 'onChange';
  if (lower === 'input') return 'onInput';
  if (lower === 'submit') return 'onSubmit';
  if (lower === 'focus') return 'onFocus';
  if (lower === 'blur') return 'onBlur';
  return `on${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
};

export const mergeHandlers = (first: unknown, second: unknown): unknown => {
  if (typeof first === 'function' && typeof second === 'function') {
    const firstHandler = first as EventHandler;
    const secondHandler = second as EventHandler;
    return (event: unknown) => {
      firstHandler(event);
      secondHandler(event);
    };
  }
  return typeof second === 'function' ? second : first;
};

export const stripChildProps = (
  props: Record<string, unknown>
): Record<string, unknown> => {
  const projected = { ...props };
  delete projected.children;
  delete projected.dangerouslySetInnerHTML;
  return projected;
};
