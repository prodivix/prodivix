import {
  createElement,
  useLayoutEffect,
  useMemo,
  useState,
  type ElementType,
  type ReactNode,
} from 'react';
import { createCache, StyleProvider } from '@ant-design/cssinjs';
import { ConfigProvider, Drawer, Modal } from 'antd';
import enUS from 'antd/locale/en_US';
import { useOfficialReactSurfaceHost } from '@prodivix/plugin-react-host';

type AntdSurfaceProviderProps = Readonly<{ children: ReactNode }>;

export function AntdSurfaceProvider({ children }: AntdSurfaceProviderProps) {
  const surfaceHost = useOfficialReactSurfaceHost();
  const parentStyleContainer = surfaceHost?.getStyleContainer();
  const [styleContainer, setStyleContainer] = useState<HTMLElement>();
  const cache = useMemo(
    () => (styleContainer ? createCache() : undefined),
    [styleContainer]
  );

  useLayoutEffect(() => {
    if (!surfaceHost || !parentStyleContainer) return;
    const container = parentStyleContainer.ownerDocument.createElement('div');
    container.style.display = 'contents';
    container.dataset.prodivixOfficialStyleOwner = 'antd';
    parentStyleContainer.append(container);
    const lease = surfaceHost.registerCleanup(() => container.remove());
    setStyleContainer(container);
    return () => lease.dispose();
  }, [parentStyleContainer, surfaceHost]);

  if (!surfaceHost || !parentStyleContainer) {
    throw new Error(
      'Ant Design rendering requires a controlled Prodivix style surface.'
    );
  }

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

  if (!styleContainer || !cache) return null;

  return (
    <StyleProvider cache={cache} container={styleContainer} hashPriority="high">
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
