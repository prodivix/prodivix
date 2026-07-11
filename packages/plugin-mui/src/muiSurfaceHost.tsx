import createCache, { type EmotionCache } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { createTheme, Dialog, Snackbar, ThemeProvider } from '@mui/material';
import {
  useOfficialReactSurfaceHost,
  type OfficialReactSurfaceHost,
} from '@prodivix/plugin-react-host';
import {
  createElement,
  useEffect,
  useMemo,
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
  dispose(): void;
}>;

const createStyleLease = (
  host: OfficialReactSurfaceHost,
  styleContainer: HTMLElement | ShadowRoot
): StyleLease => {
  const cache = createCache({
    key: 'pdxmui',
    prepend: true,
    container: styleContainer,
  });
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    cache.sheet.flush();
  };
  const registration = host.registerCleanup(cleanup);
  return Object.freeze({
    cache,
    dispose: () => {
      cleanup();
      registration.dispose();
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
  const lease = useMemo(
    () => createStyleLease(host, styleContainer),
    [host, styleContainer]
  );

  useEffect(() => () => lease.dispose(), [lease]);

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
