import type React from 'react';
import * as PdxUi from '@prodivix/ui';
import { PDX_COMPONENT_MANIFEST } from '@prodivix/ui';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import { isIconRef, resolveIconRef } from './iconRegistry';

export type ComponentKind = 'html' | 'prodivix' | 'custom';
export type RegistryGroup = 'custom' | 'prodivix' | 'native';

export type AdapterContext = {
  node: ComponentNode;
  resolvedProps: Record<string, unknown>;
  resolvedStyle: Record<string, unknown>;
  resolvedText: React.ReactNode;
  isSelected: boolean;
  hasSelectedDescendant: boolean;
  interactionMode: 'design' | 'interactive';
};

export type AdapterResult = {
  props?: Record<string, unknown>;
  children?: React.ReactNode;
  supportsChildren?: boolean;
  isVoid?: boolean;
  renderNodeChildren?: boolean;
  instanceKey?: string;
};

export type ComponentAdapter = {
  kind: ComponentKind;
  supportsChildren?: boolean;
  isVoid?: boolean;
  mapProps?: (context: AdapterContext) => AdapterResult;
  applySelection?: (
    props: Record<string, unknown>,
    selectionData: Record<string, string>
  ) => Record<string, unknown>;
};

export type RegistryEntry = {
  component: React.ElementType;
  adapter: ComponentAdapter;
};

export type ResolvedComponent = RegistryEntry & {
  type: string;
  missing?: boolean;
};

export type ComponentRegistry = {
  register: (
    type: string,
    component: React.ElementType,
    adapter?: ComponentAdapter
  ) => void;
  get: (type: string) => RegistryEntry | undefined;
  resolve: (type: string) => ResolvedComponent;
};

const normalizeSelectionData = (selectionData?: Record<string, string>) =>
  selectionData ?? {};

const applyHtmlSelection = (
  props: Record<string, unknown>,
  selectionData: Record<string, string>
) => {
  const { dataAttributes, ...rest } = props;
  const dataProps =
    typeof dataAttributes === 'object' && dataAttributes ? dataAttributes : {};
  return { ...rest, ...dataProps, ...normalizeSelectionData(selectionData) };
};

const applyPdxSelection = (
  props: Record<string, unknown>,
  selectionData: Record<string, string>
) => {
  const dataProps =
    typeof props.dataAttributes === 'object' && props.dataAttributes
      ? props.dataAttributes
      : {};
  return {
    ...props,
    dataAttributes: {
      ...dataProps,
      ...normalizeSelectionData(selectionData),
    },
  };
};

const htmlAdapter: ComponentAdapter = {
  kind: 'html',
  supportsChildren: true,
  applySelection: applyHtmlSelection,
};

const prodivixAdapter: ComponentAdapter = {
  kind: 'prodivix',
  supportsChildren: true,
  applySelection: applyPdxSelection,
};

const htmlTextAdapter: ComponentAdapter = {
  kind: 'html',
  supportsChildren: true,
  applySelection: applyHtmlSelection,
  mapProps: ({ resolvedProps, resolvedText }) => ({
    props: resolvedProps,
    children: resolvedText,
  }),
};

const htmlButtonAdapter: ComponentAdapter = {
  kind: 'html',
  supportsChildren: true,
  applySelection: applyHtmlSelection,
  mapProps: ({ resolvedProps, resolvedText }) => ({
    props: resolvedProps,
    children: resolvedText,
  }),
};

const htmlInputAdapter: ComponentAdapter = {
  kind: 'html',
  supportsChildren: false,
  isVoid: true,
  applySelection: applyHtmlSelection,
  mapProps: ({ resolvedProps, resolvedText }) => {
    const props = { ...resolvedProps };
    if (
      resolvedText !== undefined &&
      props.value === undefined &&
      props.defaultValue === undefined
    ) {
      props.defaultValue = resolvedText;
    }
    return { props };
  },
};

const prodivixTextAdapter: ComponentAdapter = {
  kind: 'prodivix',
  supportsChildren: true,
  applySelection: applyPdxSelection,
  mapProps: ({ resolvedProps, resolvedText }) => ({
    props: resolvedProps,
    children: resolvedText,
  }),
};

const prodivixButtonAdapter: ComponentAdapter = {
  kind: 'prodivix',
  supportsChildren: false,
  applySelection: applyPdxSelection,
  mapProps: ({ resolvedProps, resolvedText }) => {
    const props = { ...resolvedProps };
    if (resolvedText !== undefined && props.text === undefined) {
      props.text = resolvedText;
    }
    return { props };
  },
};

const prodivixLinkAdapter: ComponentAdapter = {
  kind: 'prodivix',
  supportsChildren: false,
  applySelection: applyPdxSelection,
  mapProps: ({ resolvedProps, resolvedText }) => {
    const props = { ...resolvedProps };
    if (resolvedText !== undefined && props.text === undefined) {
      props.text = String(resolvedText);
    }
    return { props };
  },
};

const prodivixInputAdapter: ComponentAdapter = {
  kind: 'prodivix',
  supportsChildren: false,
  applySelection: applyPdxSelection,
  mapProps: ({ resolvedProps, resolvedText }) => {
    const props = { ...resolvedProps };
    if (resolvedText !== undefined && props.value === undefined) {
      props.value = String(resolvedText);
    }
    return { props };
  },
};

const prodivixLeafAdapter: ComponentAdapter = {
  kind: 'prodivix',
  supportsChildren: false,
  applySelection: applyPdxSelection,
};

const resolveIconProps = (resolvedProps: Record<string, unknown>) => {
  const props = { ...resolvedProps };
  const iconRef =
    props.iconRef ??
    (typeof props.iconName === 'string'
      ? {
          provider:
            typeof props.iconProvider === 'string'
              ? props.iconProvider
              : 'lucide',
          name: props.iconName,
        }
      : null);

  if (isIconRef(iconRef)) {
    const resolvedIcon = resolveIconRef(iconRef);
    if (resolvedIcon) {
      props.icon = resolvedIcon;
    }
  }

  delete props.iconRef;
  delete props.iconName;
  delete props.iconProvider;
  return props;
};

const prodivixIconAdapter: ComponentAdapter = {
  kind: 'prodivix',
  supportsChildren: false,
  applySelection: applyPdxSelection,
  mapProps: ({ resolvedProps }) => ({
    props: resolveIconProps(resolvedProps),
  }),
};

const prodivixIconLinkAdapter: ComponentAdapter = {
  kind: 'prodivix',
  supportsChildren: false,
  applySelection: applyPdxSelection,
  mapProps: ({ resolvedProps }) => ({
    props: resolveIconProps(resolvedProps),
  }),
};

const DEFAULT_RESOLVER_ORDER: RegistryGroup[] = [
  'custom',
  'prodivix',
  'native',
];

const registerNativeComponents = (registry: ComponentRegistry) => {
  registry.register('container', 'div', htmlAdapter);
  registry.register('div', 'div', htmlAdapter);
  registry.register('text', 'span', htmlTextAdapter);
  registry.register('button', 'button', htmlButtonAdapter);
  registry.register('input', 'input', htmlInputAdapter);
};

const registerPdxComponents = (registry: ComponentRegistry) => {
  PDX_COMPONENT_MANIFEST.forEach(({ runtimeType }) => {
    const component = (PdxUi as Record<string, unknown>)[runtimeType];
    if (!component) return;
    const isValidElementType =
      typeof component === 'function' ||
      (typeof component === 'object' &&
        component !== null &&
        '$$typeof' in component);
    if (!isValidElementType) return;
    registry.register(
      runtimeType,
      component as React.ElementType,
      prodivixAdapter
    );
  });

  const adapterOverrides: Record<string, ComponentAdapter> = {
    PdxDiv: prodivixAdapter,
    PdxSection: prodivixAdapter,
    PdxCard: prodivixAdapter,
    PdxPanel: prodivixAdapter,

    PdxText: prodivixTextAdapter,
    PdxHeading: prodivixTextAdapter,
    PdxParagraph: prodivixTextAdapter,

    PdxButton: prodivixButtonAdapter,
    PdxButtonLink: prodivixButtonAdapter,

    PdxInput: prodivixInputAdapter,
    PdxTextarea: prodivixInputAdapter,
    PdxSearch: prodivixInputAdapter,
    PdxAudio: prodivixLeafAdapter,
    PdxAvatar: prodivixLeafAdapter,
    PdxEmbed: prodivixLeafAdapter,
    PdxIcon: prodivixIconAdapter,
    PdxIconLink: prodivixIconLinkAdapter,
    PdxIframe: prodivixLeafAdapter,
    PdxImage: prodivixLeafAdapter,
    PdxImageGallery: prodivixLeafAdapter,
    PdxVideo: prodivixLeafAdapter,

    PdxLink: prodivixLinkAdapter,
  };

  Object.entries(adapterOverrides).forEach(([type, adapter]) => {
    const component = (PdxUi as Record<string, unknown>)[type];
    if (!component) return;
    registry.register(type, component as React.ElementType, adapter);
  });
};

export const createComponentRegistry = (): ComponentRegistry => {
  const entries = new Map<string, RegistryEntry>();

  const register = (
    type: string,
    component: React.ElementType,
    adapter: ComponentAdapter = htmlAdapter
  ) => {
    entries.set(type, { component, adapter });
  };

  const get = (type: string) => entries.get(type);

  const resolve = (type: string): ResolvedComponent => {
    const entry = entries.get(type);
    if (entry) {
      return { ...entry, type };
    }
    if (type && type.toLowerCase() === type) {
      return {
        type,
        component: type as React.ElementType,
        adapter: htmlAdapter,
      };
    }
    return { type, component: 'div', adapter: htmlAdapter, missing: true };
  };

  return { register, get, resolve };
};

const createNativeRegistry = () => {
  const registry = createComponentRegistry();
  registerNativeComponents(registry);
  return registry;
};

const createPdxRegistry = () => {
  const registry = createComponentRegistry();
  registerPdxComponents(registry);
  return registry;
};

export const parseResolverOrder = (value?: string): RegistryGroup[] => {
  if (!value) return [...DEFAULT_RESOLVER_ORDER];
  const segments = value
    .split('>')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  const order: RegistryGroup[] = [];
  segments.forEach((segment) => {
    if (
      (segment === 'custom' ||
        segment === 'prodivix' ||
        segment === 'native') &&
      !order.includes(segment)
    ) {
      order.push(segment);
    }
  });
  return order.length > 0 ? order : [...DEFAULT_RESOLVER_ORDER];
};

/**
 * 组件解析链路：
 * 设置项 `resolverOrder` -> parseResolverOrder -> createOrderedComponentRegistry ->
 * PIRRenderer 在 custom/prodivix/native 分层查找组件。
 */
export const createOrderedComponentRegistry = (
  order: RegistryGroup[] = DEFAULT_RESOLVER_ORDER,
  customRegistry?: ComponentRegistry
) => {
  const resolvedOrder = order.length > 0 ? order : DEFAULT_RESOLVER_ORDER;
  const registries = {
    custom: customRegistry ?? createComponentRegistry(),
    prodivix: createPdxRegistry(),
    native: createNativeRegistry(),
  };

  const register = (
    type: string,
    component: React.ElementType,
    adapter: ComponentAdapter = htmlAdapter
  ) => {
    registries.custom.register(type, component, adapter);
  };

  const get = (type: string) => {
    for (const group of resolvedOrder) {
      const entry = registries[group].get(type);
      if (entry) return entry;
    }
    return undefined;
  };

  const resolve = (type: string): ResolvedComponent => {
    for (const group of resolvedOrder) {
      const entry = registries[group].get(type);
      if (entry) {
        return { ...entry, type };
      }
      if (group === 'native' && type && type.toLowerCase() === type) {
        return {
          type,
          component: type as React.ElementType,
          adapter: htmlAdapter,
        };
      }
    }
    if (type && type.toLowerCase() === type) {
      return {
        type,
        component: type as React.ElementType,
        adapter: htmlAdapter,
      };
    }
    return { type, component: 'div', adapter: htmlAdapter, missing: true };
  };

  return { register, get, resolve };
};

const createDefaultComponentRegistry = () => {
  const registry = createComponentRegistry();
  registerNativeComponents(registry);
  registerPdxComponents(registry);
  return registry;
};

export const defaultComponentRegistry = createDefaultComponentRegistry();
