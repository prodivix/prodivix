import type { PirElementEmitter } from '#src/workspace/pirElementEmitter';

const toReactEventName = (eventName: string): string => {
  if (/^on[A-Z]/.test(eventName)) return eventName;
  const normalized = eventName.trim().replace(/^on/i, '');
  return `on${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
};

const childSlot = (expression: string): string => `{${expression}}`;

/** Emits the compiled PIR expressions as JSX. */
export const reactElementEmitter: PirElementEmitter = {
  emptyExpression: 'null',
  isEmittableElement: (value) => /^[A-Za-z][A-Za-z0-9_$.-]*$/.test(value),
  eventPropName: toReactEventName,
  resolveFragmentLocal: (imports) =>
    imports.addNamedPackageImport('react', 'Fragment'),
  fragment: (children) => `<>${children.map(childSlot).join('')}</>`,
  wrappedFragment: ({ fragmentLocal, children }) =>
    `<${fragmentLocal}>${children.map(childSlot).join('')}</${fragmentLocal}>`,
  keyedFragment: ({ fragmentLocal, keyExpression, children }) =>
    `<${fragmentLocal} key={${keyExpression}}>${children.map(childSlot).join('')}</${fragmentLocal}>`,
  element: ({ tag, propsExpression, children }) =>
    children.length === 0
      ? `<${tag} {...${propsExpression}} />`
      : `<${tag} {...${propsExpression}}>${children.map(childSlot).join('')}</${tag}>`,
  component: ({ localName, propsExpression }) =>
    `<${localName} {...${propsExpression}} />`,
};
