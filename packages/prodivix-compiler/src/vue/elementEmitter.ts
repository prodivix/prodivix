import type { PirElementEmitter } from '#src/workspace/pirElementEmitter';

/**
 * Emits the compiled PIR expressions as Vue `h()` calls.
 *
 * Vue and React share the `onXxx` event-prop convention, so the only real
 * differences are call syntax and how a list is wrapped. Everything upstream —
 * traversal, traces, contracts, slot projection — is the shared compiler.
 */
export const vueElementEmitter: PirElementEmitter = {
  emptyExpression: 'null',
  // `h()` accepts any string tag, plus imported component locals.
  isEmittableElement: (value) => /^[A-Za-z][A-Za-z0-9_$.-]*$/.test(value),
  eventPropName: (eventName) => {
    if (/^on[A-Z]/.test(eventName)) return eventName;
    const normalized = eventName.trim().replace(/^on/i, '');
    return `on${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  },
  resolveFragmentLocal: (imports) =>
    imports.addNamedPackageImport('vue', 'Fragment'),
  fragment: (children) => `[${children.join(', ')}]`,
  wrappedFragment: ({ fragmentLocal, children }) =>
    `__pdxH(${fragmentLocal}, null, [${children.join(', ')}])`,
  keyedFragment: ({ fragmentLocal, keyExpression, children }) =>
    `__pdxH(${fragmentLocal}, { key: ${keyExpression} }, [${children.join(', ')}])`,
  element: ({ tag, propsExpression, children }) => {
    // A bare lowercase tag is a host element and stays a string literal; an
    // adapter-resolved component local is referenced by identifier.
    const tagExpression = /^[a-z][a-zA-Z0-9-]*$/.test(tag)
      ? JSON.stringify(tag)
      : tag;
    return children.length === 0
      ? `__pdxH(${tagExpression}, ${propsExpression})`
      : `__pdxH(${tagExpression}, ${propsExpression}, [${children.join(', ')}])`;
  },
  component: ({ localName, propsExpression }) =>
    `__pdxH(${localName}, ${propsExpression})`,
};
