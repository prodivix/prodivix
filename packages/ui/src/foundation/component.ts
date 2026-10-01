import type React from 'react';

export type PdxControlSize = 'ExtraSmall' | 'Small' | 'Medium' | 'Large';

export type PdxValidationState = 'Default' | 'Error' | 'Warning' | 'Success';

export type PdxDataAttributes = Record<string, string>;

export interface PdxDataAttributeProps {
  dataAttributes?: PdxDataAttributes;
}

export type PdxNativeProps<Element extends React.ElementType> = Omit<
  React.ComponentPropsWithoutRef<Element>,
  'size'
> &
  PdxDataAttributeProps;

/**
 * Every falsy value is dropped, which is what `presence && 'Modifier'` produces
 * when `presence` is a ReactNode rather than a boolean. The parameter type says
 * so instead of forcing call sites to coerce.
 */
export type PdxClassNameValue =
  string | number | bigint | false | null | undefined;

export function mergeClassNames(...values: PdxClassNameValue[]) {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}

export function getDataAttributes(dataAttributes?: PdxDataAttributes) {
  if (!dataAttributes) return {};

  return Object.fromEntries(
    Object.entries(dataAttributes).filter(([name]) => name.startsWith('data-'))
  );
}

/** Container activation must not consume a descendant control's own action. */
export function isInteractiveDescendantEvent(event: React.SyntheticEvent) {
  for (const target of event.nativeEvent.composedPath()) {
    if (target === event.currentTarget) break;
    if (
      target instanceof Element &&
      (target.matches(
        'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="combobox"]'
      ) ||
        target.getAttribute('contenteditable') === '' ||
        target.getAttribute('contenteditable') === 'true')
    )
      return true;
  }
  return false;
}

export function mergeAriaDescribedBy(...values: Array<string | undefined>) {
  const ids = values
    .flatMap((value) => value?.split(/\s+/) ?? [])
    .filter(Boolean);

  return ids.length > 0 ? [...new Set(ids)].join(' ') : undefined;
}

export function assignRef<Value>(
  ref: React.ForwardedRef<Value>,
  value: Value | null
) {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}
