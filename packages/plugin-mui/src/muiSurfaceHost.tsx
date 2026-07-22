import createCache, { type EmotionCache } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { createTheme, Dialog, Snackbar, ThemeProvider } from '@mui/material';
import {
  useOfficialReactSurfaceHost,
  type OfficialReactSurfaceHost,
} from '@prodivix/plugin-react-host';
import {
  createElement,
  useLayoutEffect,
  useState,
  type ElementType,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

const MUI_BASELINE_THEME = createTheme({
  cssVariables: false,
  palette: { mode: 'light' },
  shape: { borderRadius: 4 },
  typography: {
    fontFamily: 'Mona Sans, HarmonyOS Sans SC, Inter, system-ui, sans-serif',
  },
});

type StyleLease = Readonly<{
  cache: EmotionCache;
  host: OfficialReactSurfaceHost;
  styleContainer: HTMLElement | ShadowRoot;
  dispose(): void;
}>;

type SharedStyleResource = {
  cache: EmotionCache;
  referenceCount: number;
  dispose(): void;
};

const resourcesByHost = new WeakMap<
  OfficialReactSurfaceHost,
  Map<HTMLElement | ShadowRoot, SharedStyleResource>
>();

const createStyleLease = (
  host: OfficialReactSurfaceHost,
  styleContainer: HTMLElement | ShadowRoot
): StyleLease => {
  let resources = resourcesByHost.get(host);
  if (!resources) {
    resources = new Map();
    resourcesByHost.set(host, resources);
  }
  let resource = resources.get(styleContainer);
  if (!resource) {
    const cache = createCache({
      key: 'pdxmui',
      prepend: true,
      container: styleContainer,
    });
    let disposed = false;
    let registration: ReturnType<OfficialReactSurfaceHost['registerCleanup']>;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      cache.sheet.flush();
      resources?.delete(styleContainer);
      if (resources?.size === 0) resourcesByHost.delete(host);
    };
    registration = host.registerCleanup(cleanup);
    resource = {
      cache,
      referenceCount: 0,
      dispose: () => {
        cleanup();
        registration.dispose();
      },
    };
    resources.set(styleContainer, resource);
  }
  resource.referenceCount += 1;
  let released = false;
  return Object.freeze({
    cache: resource.cache,
    host,
    styleContainer,
    dispose: () => {
      if (released) return;
      released = true;
      resource.referenceCount -= 1;
      if (resource.referenceCount === 0) resource.dispose();
    },
  });
};

const MuiControlledSurfaceProvider = ({
  children,
  host,
  styleContainer,
}: {
  children: ReactNode;
  host: OfficialReactSurfaceHost;
  styleContainer: HTMLElement | ShadowRoot;
}) => {
  const [lease, setLease] = useState<StyleLease | null>(null);

  useLayoutEffect(() => {
    const acquired = createStyleLease(host, styleContainer);
    setLease(acquired);
    return () => acquired.dispose();
  }, [host, styleContainer]);

  if (
    !lease ||
    lease.host !== host ||
    lease.styleContainer !== styleContainer
  ) {
    return null;
  }

  return (
    <CacheProvider value={lease.cache}>
      <ThemeProvider theme={MUI_BASELINE_THEME}>{children}</ThemeProvider>
    </CacheProvider>
  );
};

const MuiSurfaceProvider = ({ children }: { children: ReactNode }) => {
  const host = useOfficialReactSurfaceHost();
  const styleContainer = host?.getStyleContainer() ?? null;
  if (!host || !styleContainer) return null;
  return (
    <MuiControlledSurfaceProvider host={host} styleContainer={styleContainer}>
      {children}
    </MuiControlledSurfaceProvider>
  );
};

const MuiDialogSurface = ({
  component: Component,
  props,
}: {
  component: ElementType;
  props: Record<string, unknown>;
}) => {
  const host = useOfficialReactSurfaceHost();
  const overlayContainer = host?.getOverlayContainer() ?? null;
  if (!overlayContainer) return null;
  return createElement(Component, {
    ...props,
    container: overlayContainer,
    disableAutoFocus: true,
    disableEnforceFocus: true,
    disableRestoreFocus: true,
    disableScrollLock: true,
  });
};

const MuiSnackbarSurface = ({
  component: Component,
  props,
}: {
  component: ElementType;
  props: Record<string, unknown>;
}) => {
  const host = useOfficialReactSurfaceHost();
  const overlayContainer = host?.getOverlayContainer() ?? null;
  if (!overlayContainer) return null;
  const element = createElement(Component, props);
  return createPortal(element, overlayContainer);
};

/**
 * Bridges a statically attested MUI export to the owner-scoped style and
 * overlay surface without exposing editor, Workspace, or PIR state.
 */
export const wrapMuiComponent = (component: ElementType): ElementType => {
  const MuiSurfaceComponent = (props: Record<string, unknown>) => {
    let content: ReactNode;
    if (component === Dialog) {
      content = <MuiDialogSurface component={component} props={props} />;
    } else if (component === Snackbar) {
      content = <MuiSnackbarSurface component={component} props={props} />;
    } else {
      content = createElement(component, props);
    }
    return <MuiSurfaceProvider>{content}</MuiSurfaceProvider>;
  };
  MuiSurfaceComponent.displayName = `ProdivixMuiSurface(${
    typeof component === 'string'
      ? component
      : component.displayName || component.name || 'Component'
  })`;
  return MuiSurfaceComponent;
};
