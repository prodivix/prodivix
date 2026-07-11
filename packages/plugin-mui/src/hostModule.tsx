import * as MuiIcons from '@mui/icons-material';
import type {
  OfficialHostModule,
  OfficialIconProviderImplementation,
  OfficialRenderPolicyImplementation,
  OfficialRenderPolicyResult,
} from '@prodivix/plugin-react-host';
import type { ElementType, ReactNode } from 'react';
import {
  MUI_COMPONENTS,
  MUI_PACKAGE_NAME,
  MUI_PACKAGE_VERSION,
} from '#mui-plugin/componentCatalog';
import { wrapMuiComponent } from '#mui-plugin/muiSurfaceHost';
import { MUI_PALETTE_PROJECTION } from '#mui-plugin/paletteProjection';

const isElementType = (value: unknown): value is ElementType =>
  typeof value === 'function' ||
  (typeof value === 'object' && value !== null && '$$typeof' in value);

const iconExports = Object.freeze(
  Object.entries(MuiIcons)
    .filter(
      ([name, value]) =>
        name !== 'default' && name !== 'createSvgIcon' && isElementType(value)
    )
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right))
);

const iconModule = MuiIcons as Readonly<Record<string, unknown>>;
const wrappedIconCache = new Map<string, ElementType>();

export const MUI_ICON_IMPLEMENTATION = Object.freeze({
  kind: 'icon-provider',
  package: Object.freeze({
    name: '@mui/icons-material',
    version: '7.3.2',
  }),
  listExports: () => iconExports,
  resolveExport: (exportName: string) => {
    const cached = wrappedIconCache.get(exportName);
    if (cached) return cached;
    const candidate = iconModule[exportName];
    if (!isElementType(candidate)) return null;
    const wrapped = wrapMuiComponent(candidate);
    wrappedIconCache.set(exportName, wrapped);
    return wrapped;
  },
}) satisfies OfficialIconProviderImplementation;

const extractAuthoredChildren = (
  props: Record<string, unknown>
): ReactNode | undefined => {
  if (!Object.prototype.hasOwnProperty.call(props, 'children'))
    return undefined;
  const children = props.children as ReactNode;
  delete props.children;
  return children;
};

const MUI_RENDER_IMPLEMENTATION = Object.freeze({
  kind: 'render-policy',
  mapProps: (context) => {
    const props = { ...context.resolvedProps };
    const children = extractAuthoredChildren(props);
    if (context.runtimeType === 'MuiTextField') {
      if (
        context.resolvedText !== undefined &&
        props.value === undefined &&
        props.defaultValue === undefined
      ) {
        props.defaultValue = String(context.resolvedText);
      }
    } else if (context.runtimeType === 'MuiDialog') {
      props.disableAutoFocus = true;
      props.disableEnforceFocus = true;
      props.disableRestoreFocus = true;
      props.disableScrollLock = true;
    } else if (context.runtimeType === 'MuiSnackbar') {
      props.autoHideDuration = null;
    }
    return {
      props,
      ...(children === undefined ? {} : { children }),
    } satisfies OfficialRenderPolicyResult;
  },
  wrapComponent: wrapMuiComponent,
}) satisfies OfficialRenderPolicyImplementation;

export const MUI_OFFICIAL_HOST_MODULE: OfficialHostModule = Object.freeze({
  implementations: Object.freeze({
    'mui.components': Object.freeze({
      kind: 'component-library',
      package: Object.freeze({
        name: MUI_PACKAGE_NAME,
        version: MUI_PACKAGE_VERSION,
      }),
      components: MUI_COMPONENTS,
    }),
    'mui.palette': MUI_PALETTE_PROJECTION,
    'mui.render': MUI_RENDER_IMPLEMENTATION,
    'mui.icons': MUI_ICON_IMPLEMENTATION,
  }),
});
