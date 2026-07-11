import type { ElementType } from 'react';
import * as AntdIcons from '@ant-design/icons';
import type { OfficialHostModule } from '@prodivix/plugin-react-host';
import {
  ANTD_COMPONENT_IMPLEMENTATIONS,
  ANTD_PALETTE_GROUPS,
} from '#antd/paletteProjection';
import {
  mapAntdRenderProps,
  wrapAntdOverlayComponent,
  wrapAntdProviderComponent,
} from '#antd/surfaceProvider';

const iconUtilities = new Set([
  'IconProvider',
  'createFromIconfontCN',
  'defaultTheme',
  'getTwoToneColor',
  'setTwoToneColor',
]);
const iconSuffixPattern = /(Outlined|Filled|TwoTone)$/;
const iconExports = Object.keys(AntdIcons)
  .filter((name) => iconSuffixPattern.test(name) && !iconUtilities.has(name))
  .filter((name) => {
    const value = (AntdIcons as Record<string, unknown>)[name];
    return (
      typeof value === 'function' ||
      (typeof value === 'object' && value !== null && '$$typeof' in value)
    );
  })
  .sort();
const iconNames = Object.freeze(
  [
    ...new Set(iconExports.map((name) => name.replace(iconSuffixPattern, ''))),
  ].sort()
);

export const ANTD_OFFICIAL_HOST_MODULE: OfficialHostModule = Object.freeze({
  implementations: Object.freeze({
    'antd.components': Object.freeze({
      kind: 'component-library',
      package: Object.freeze({ name: 'antd', version: '5.28.0' }),
      components: ANTD_COMPONENT_IMPLEMENTATIONS,
    }),
    'antd.palette': Object.freeze({
      kind: 'palette-projection',
      groups: ANTD_PALETTE_GROUPS,
    }),
    'antd.render.provider': Object.freeze({
      kind: 'render-policy',
      mapProps: mapAntdRenderProps,
      wrapComponent: wrapAntdProviderComponent,
    }),
    'antd.render.overlay': Object.freeze({
      kind: 'render-policy',
      mapProps: mapAntdRenderProps,
      wrapComponent: wrapAntdOverlayComponent,
    }),
    'antd.icons': Object.freeze({
      kind: 'icon-provider',
      package: Object.freeze({
        name: '@ant-design/icons',
        version: '6.1.0',
      }),
      resolveExport: (exportName: string): ElementType | null => {
        if (!iconExports.includes(exportName)) return null;
        return (AntdIcons as Record<string, unknown>)[
          exportName
        ] as ElementType;
      },
      listExports: () => iconNames,
    }),
  }),
});
