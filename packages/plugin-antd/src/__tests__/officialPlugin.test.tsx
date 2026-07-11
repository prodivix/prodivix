import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  OfficialReactSurfaceHostContext,
  type OfficialHostModule,
  type OfficialReactSurfaceHost,
} from '@prodivix/plugin-react-host';
import {
  ANTD_OFFICIAL_PLUGIN,
  BUNDLED_PLUGIN_ARTIFACT,
  GENERATED_OFFICIAL_PLUGIN_CATALOG,
} from '#antd/index';
import { ANTD_COMPONENT_CATALOG } from '#antd/componentCatalog.generated';
import { ANTD_OFFICIAL_HOST_MODULE } from '#antd/hostModule';

const implementation = <TKind extends string>(
  module: OfficialHostModule,
  id: string,
  kind: TKind
) => {
  const value = module.implementations[id];
  if (!value || value.kind !== kind) {
    throw new Error(`Expected ${id} to be a ${kind} implementation.`);
  }
  return value;
};

describe('Ant Design official plugin package', () => {
  it('attests one 81-component artifact and closes every Host implementation', async () => {
    expect(GENERATED_OFFICIAL_PLUGIN_CATALOG.support).toEqual({
      total: 81,
      supported: 46,
      template: 1,
      degraded: 34,
    });
    expect(ANTD_COMPONENT_CATALOG).toHaveLength(81);
    expect(new Set(ANTD_COMPONENT_CATALOG.map((item) => item.path)).size).toBe(
      81
    );
    expect(BUNDLED_PLUGIN_ARTIFACT.packageDigest).toMatch(/^sha256-/);
    expect(ANTD_OFFICIAL_PLUGIN.artifact).toBe(BUNDLED_PLUGIN_ARTIFACT);
    expect(await ANTD_OFFICIAL_PLUGIN.loadHostModule()).toBe(
      ANTD_OFFICIAL_HOST_MODULE
    );
    expect(
      Object.keys(ANTD_OFFICIAL_HOST_MODULE.implementations).sort()
    ).toEqual(
      GENERATED_OFFICIAL_PLUGIN_CATALOG.hostImplementations
        .map((item) => item.id)
        .sort()
    );

    const components = implementation(
      ANTD_OFFICIAL_HOST_MODULE,
      'antd.components',
      'component-library'
    );
    expect(Object.keys(components.components).sort()).toEqual(
      ANTD_COMPONENT_CATALOG.map((item) => item.exportName).sort()
    );

    const renderPolicy = BUNDLED_PLUGIN_ARTIFACT.resources.find(
      (resource) => resource.path === 'plugin/contributions/render-policy.json'
    );
    const codegenPolicy = BUNDLED_PLUGIN_ARTIFACT.resources.find(
      (resource) => resource.path === 'plugin/contributions/codegen-policy.json'
    );
    if (!renderPolicy || !codegenPolicy) {
      throw new Error('Ant Design render and codegen policies are required.');
    }
    const policyRules = [renderPolicy, codegenPolicy].map((resource) =>
      JSON.parse(new TextDecoder().decode(Uint8Array.from(resource.bytes)))
    ) as Array<{
      rules: Array<{
        runtimeType: string;
        children: Readonly<{ mode: string }>;
      }>;
    }>;
    policyRules.forEach(({ rules }) => {
      expect(
        rules
          .filter((rule) => rule.runtimeType.startsWith('AntdTypography'))
          .map((rule) => rule.children.mode)
      ).toEqual(['preserve', 'preserve', 'preserve', 'preserve', 'preserve']);
    });
  });

  it('projects real Button preview and static icon exports through controlled hosts', () => {
    const styleContainer = document.createElement('div');
    const overlayContainer = document.createElement('div');
    document.body.append(styleContainer, overlayContainer);
    const cleanups = new Set<() => void | Promise<void>>();
    const host: OfficialReactSurfaceHost = {
      getStyleContainer: () => styleContainer,
      getOverlayContainer: () => overlayContainer,
      registerCleanup: (dispose) => {
        cleanups.add(dispose);
        return {
          dispose: () => {
            if (!cleanups.delete(dispose)) return;
            void dispose();
          },
        };
      },
    };
    const palette = implementation(
      ANTD_OFFICIAL_HOST_MODULE,
      'antd.palette',
      'palette-projection'
    );
    const button = palette.groups
      .flatMap((group) => group.items)
      .find((item) => item.id === 'antd-button');
    expect(button).toBeDefined();
    expect(button?.variants?.map((variant) => variant.id)).toEqual([
      'primary',
      'default',
      'dashed',
      'text',
      'link',
    ]);
    const rendered = render(
      <OfficialReactSurfaceHostContext.Provider value={host}>
        {button?.preview}
      </OfficialReactSurfaceHostContext.Provider>
    );
    expect(screen.getByRole('button', { name: 'Button' })).toBeTruthy();
    expect(styleContainer.childElementCount).toBeGreaterThan(0);

    const icons = implementation(
      ANTD_OFFICIAL_HOST_MODULE,
      'antd.icons',
      'icon-provider'
    );
    expect(icons.listExports()).toContain('Search');
    expect(
      icons.resolveExport('SearchOutlined', {
        providerId: 'ant-design-icons',
        requestedName: 'Search',
        variantId: 'outlined',
      })
    ).toBeTruthy();

    rendered.unmount();
    expect(cleanups.size).toBe(0);
    expect(styleContainer.childElementCount).toBe(0);
    styleContainer.remove();
    overlayContainer.remove();
  });

  it('fails closed without a controlled surface and leaves global containers untouched', () => {
    const palette = implementation(
      ANTD_OFFICIAL_HOST_MODULE,
      'antd.palette',
      'palette-projection'
    );
    const button = palette.groups
      .flatMap((group) => group.items)
      .find((item) => item.id === 'antd-button');
    const detached = document.createElement('div');
    const headBefore = document.head.innerHTML;
    const bodyBefore = document.body.innerHTML;

    expect(() => render(button?.preview, { container: detached })).toThrow(
      /controlled Prodivix style surface/
    );
    expect(document.head.innerHTML).toBe(headBefore);
    expect(document.body.innerHTML).toBe(bodyBefore);
  });
});
