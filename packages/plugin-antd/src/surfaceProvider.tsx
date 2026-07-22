import {
  createElement,
  useLayoutEffect,
  type ElementType,
  type ReactNode,
} from 'react';
import { createCache, StyleProvider } from '@ant-design/cssinjs';
import { ConfigProvider, Drawer, Modal } from 'antd';
import enUS from 'antd/locale/en_US';
import {
  useOfficialReactSurfaceHost,
  type OfficialReactSurfaceHost,
} from '@prodivix/plugin-react-host';

type AntdSurfaceProviderProps = Readonly<{ children: ReactNode }>;

type AntdSurfaceResource = {
  container: HTMLElement | ShadowRoot;
  cache: ReturnType<typeof createCache>;
  references: number;
  disposed: boolean;
  registration?: ReturnType<OfficialReactSurfaceHost['registerCleanup']>;
};

const cacheBySurfaceHost = new WeakMap<
  OfficialReactSurfaceHost,
  AntdSurfaceResource
>();

const getSurfaceResource = (
  surfaceHost: OfficialReactSurfaceHost,
  container: HTMLElement | ShadowRoot
): AntdSurfaceResource => {
  const current = cacheBySurfaceHost.get(surfaceHost);
  if (current?.container === container && !current.disposed) return current;
  const resource: AntdSurfaceResource = {
    container,
    cache: createCache(),
    references: 0,
    disposed: false,
  };
  cacheBySurfaceHost.set(surfaceHost, resource);
  return resource;
};

const disposeSurfaceResource = (
  surfaceHost: OfficialReactSurfaceHost,
  resource: AntdSurfaceResource
) => {
  if (resource.disposed) return;
  resource.disposed = true;
  resource.cache.cache.clear();
  resource.cache.extracted.clear();
  resource.container
    .querySelectorAll<HTMLStyleElement>('style[data-css-hash]')
    .forEach((style) => {
      if (
        (style as HTMLStyleElement & { __cssinjs_instance__?: string })
          .__cssinjs_instance__ === resource.cache.instanceId
      ) {
        style.remove();
      }
    });
  if (cacheBySurfaceHost.get(surfaceHost) === resource) {
    cacheBySurfaceHost.delete(surfaceHost);
  }
  resource.registration?.dispose();
};

const acquireSurfaceResource = (
  surfaceHost: OfficialReactSurfaceHost,
  resource: AntdSurfaceResource
) => {
  if (resource.disposed) {
    resource.disposed = false;
    cacheBySurfaceHost.set(surfaceHost, resource);
  }
  if (resource.references === 0) {
    resource.registration = surfaceHost.registerCleanup(() =>
      disposeSurfaceResource(surfaceHost, resource)
    );
  }
  resource.references += 1;
  let released = false;
  return () => {
    if (released || resource.disposed) return;
    released = true;
    resource.references -= 1;
    if (resource.references === 0) {
      disposeSurfaceResource(surfaceHost, resource);
    }
  };
};

export function AntdSurfaceProvider({ children }: AntdSurfaceProviderProps) {
  const surfaceHost = useOfficialReactSurfaceHost();
  const parentStyleContainer = surfaceHost?.getStyleContainer();

  if (!surfaceHost || !parentStyleContainer) {
    throw new Error(
      'Ant Design rendering requires a controlled Prodivix style surface.'
    );
  }
  const resource = getSurfaceResource(surfaceHost, parentStyleContainer);

  useLayoutEffect(
    () => acquireSurfaceResource(surfaceHost, resource),
    [resource, surfaceHost]
  );

  const configured = (
    <ConfigProvider
      locale={enUS}
      getPopupContainer={(triggerNode) => {
        const container = surfaceHost.getOverlayContainer();
        if (!container) {
          throw new Error(
            `Ant Design popup requires a controlled Prodivix overlay surface${
              triggerNode ? '.' : ' before trigger resolution.'
            }`
          );
        }
        return container;
      }}
      theme={{
        hashed: true,
        token: {
          borderRadius: 6,
          colorPrimary: '#1677ff',
          fontSize: 14,
        },
      }}
    >
      {children}
    </ConfigProvider>
  );

  return (
    <StyleProvider
      cache={resource.cache}
      container={parentStyleContainer}
      hashPriority="high"
    >
      {configured}
    </StyleProvider>
  );
}

const callbackPropsByRuntimeType = (
  runtimeType: string,
  props: Readonly<Record<string, unknown>>
): Record<string, unknown> => {
  if (runtimeType === 'AntdList' && props.renderItem === undefined) {
    return {
      ...props,
      renderItem: (item: unknown) => createElement('span', null, String(item)),
    };
  }
  if (runtimeType === 'AntdTransfer' && props.render === undefined) {
    return {
      ...props,
      render: (item: Readonly<{ title?: unknown; key?: unknown }>) =>
        String(item.title ?? item.key ?? 'Item'),
    };
  }
  return { ...props };
};

export const mapAntdRenderProps = (context: {
  runtimeType: string;
  resolvedProps: Readonly<Record<string, unknown>>;
}) => ({
  props: callbackPropsByRuntimeType(context.runtimeType, context.resolvedProps),
});

const createAntdWrapper = (component: ElementType, overlay: boolean) => {
  const WrappedAntdComponent = (inputProps: Record<string, unknown>) => {
    const surfaceHost = useOfficialReactSurfaceHost();
    const props = { ...inputProps };
    if (
      overlay &&
      (component === Modal || component === Drawer) &&
      (props.getContainer === undefined || props.getContainer === true)
    ) {
      const overlayContainer = surfaceHost?.getOverlayContainer();
      if (!overlayContainer) {
        throw new Error(
          'Ant Design overlay component requires a controlled Prodivix overlay surface.'
        );
      }
      props.getContainer = () => overlayContainer;
    }
    return (
      <AntdSurfaceProvider>
        {createElement(component, props)}
      </AntdSurfaceProvider>
    );
  };
  const componentMeta =
    typeof component === 'string'
      ? { displayName: component }
      : (component as Readonly<{ displayName?: string; name?: string }>);
  WrappedAntdComponent.displayName = `AntdSurface(${
    componentMeta.displayName ?? componentMeta.name ?? 'Component'
  })`;
  return WrappedAntdComponent;
};

export const wrapAntdProviderComponent = (component: ElementType) =>
  createAntdWrapper(component, false);

export const wrapAntdOverlayComponent = (component: ElementType) =>
  createAntdWrapper(component, true);
