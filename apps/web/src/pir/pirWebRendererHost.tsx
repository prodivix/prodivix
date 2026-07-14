import type { ElementType, ReactNode } from 'react';
import type {
  ComponentAdapter,
  ComponentRegistry,
  PIRElementProjectionInput,
  PIRElementProjectionResult,
  PIRRendererHost,
} from '@prodivix/pir-react-renderer';

const HTML_ELEMENTS = new Set([
  'a',
  'article',
  'aside',
  'button',
  'div',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'header',
  'img',
  'input',
  'label',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'section',
  'select',
  'span',
  'strong',
  'textarea',
  'ul',
]);

const ELEMENT_ALIASES: Readonly<Record<string, ElementType>> = Object.freeze({
  container: 'div',
  text: 'span',
});

const VOID_ELEMENTS = new Set(['img', 'input']);

const createStableIdentityProps = (
  input: PIRElementProjectionInput
): Record<string, string> => ({
  'data-pir-document-id': input.location.documentId,
  'data-pir-node-id': input.location.nodeId,
  'data-pir-instance-path': input.location.instancePath,
  ...(input.selected ? { 'data-pir-selected': 'true' } : {}),
});

const projectElement = (
  input: PIRElementProjectionInput,
  adapter?: ComponentAdapter
): PIRElementProjectionResult => {
  const adapterResult = adapter?.mapProps?.({
    node: input.node,
    resolvedProps: { ...input.resolvedProps },
    resolvedStyle: { ...input.resolvedStyle },
    resolvedText: input.resolvedText as ReactNode,
    isSelected: input.selected,
    hasSelectedDescendant: false,
    interactionMode: 'interactive',
  });
  const identityProps = createStableIdentityProps(input);
  const projectedProps = {
    ...(adapterResult?.props ?? input.resolvedProps),
  };
  const props = adapter?.applySelection
    ? adapter.applySelection(projectedProps, identityProps)
    : { ...projectedProps, ...identityProps };

  return {
    props,
    ...(adapterResult?.children !== undefined
      ? { children: adapterResult.children }
      : {}),
    ...(adapterResult?.supportsChildren !== undefined
      ? { supportsChildren: adapterResult.supportsChildren }
      : {}),
    ...(adapterResult?.isVoid !== undefined
      ? { isVoid: adapterResult.isVoid }
      : {}),
    ...(adapterResult?.renderNodeChildren !== undefined
      ? { renderGraphChildren: adapterResult.renderNodeChildren }
      : {}),
    ...(adapterResult?.instanceKey !== undefined
      ? { instanceKey: adapterResult.instanceKey }
      : {}),
  };
};

/**
 * Composes the browser PIR host from stable native elements and an optional
 * extension registry. The adapter bridge is independent from PIR wire versions.
 */
export const createPirWebRendererHost = (
  registry?: Pick<ComponentRegistry, 'get'>
): PIRRendererHost =>
  Object.freeze({
    resolveElement(type) {
      const registered = registry?.get(type);
      if (registered) {
        return {
          component: registered.component,
          supportsChildren: registered.adapter.supportsChildren,
          isVoid: registered.adapter.isVoid,
          project: (input) => projectElement(input, registered.adapter),
        };
      }

      const component =
        ELEMENT_ALIASES[type] ??
        (HTML_ELEMENTS.has(type) ? (type as ElementType) : undefined);
      if (!component) return undefined;
      const nativeType = typeof component === 'string' ? component : type;
      return {
        component,
        supportsChildren: !VOID_ELEMENTS.has(nativeType),
        isVoid: VOID_ELEMENTS.has(nativeType),
        project: projectElement,
      };
    },
  });

/** Native-only application host; unknown element adapters fail closed. */
export const pirWebRendererHost = createPirWebRendererHost();
