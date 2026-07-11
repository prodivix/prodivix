import { createElement, type ElementType, type ReactNode } from 'react';
import * as Antd from 'antd';
import {
  useOfficialReactSurfaceHost,
  type OfficialPalettePreviewItem,
} from '@prodivix/plugin-react-host';
import { ANTD_COMPONENT_CATALOG } from '#antd/componentCatalog.generated';
import { AntdSurfaceProvider } from '#antd/surfaceProvider';

const readComponentByPath = (
  componentPath: string
): ElementType | undefined => {
  let current: unknown = Antd;
  for (const segment of componentPath.split('.')) {
    if (
      !current ||
      (typeof current !== 'object' && typeof current !== 'function')
    ) {
      return;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'function' ||
    (typeof current === 'object' && current !== null && '$$typeof' in current)
    ? (current as ElementType)
    : undefined;
};

export const ANTD_COMPONENT_IMPLEMENTATIONS = Object.freeze(
  Object.fromEntries(
    ANTD_COMPONENT_CATALOG.map((entry) => {
      const component = readComponentByPath(entry.path);
      if (!component) {
        throw new Error(
          `Ant Design package does not expose supported component path ${entry.path}.`
        );
      }
      return [entry.exportName, component];
    })
  ) as Readonly<Record<string, ElementType>>
);

const withPreviewRuntimeProps = (
  componentPath: string,
  defaults: Readonly<Record<string, unknown>>,
  overlayContainer: HTMLElement | null
) => {
  const props: Record<string, unknown> = { ...defaults };
  if (
    props.children === undefined &&
    [
      'Avatar',
      'Button',
      'Checkbox',
      'Divider',
      'Radio',
      'Tag',
      'Typography',
      'Typography.Link',
      'Typography.Paragraph',
      'Typography.Text',
      'Typography.Title',
    ].includes(componentPath)
  ) {
    props.children = componentPath.split('.').at(-1) ?? componentPath;
  }
  if (componentPath === 'List') {
    props.renderItem = (item: unknown) =>
      createElement('span', null, String(item));
  }
  if (componentPath === 'Transfer') {
    props.render = (item: Readonly<{ title?: unknown; key?: unknown }>) =>
      String(item.title ?? item.key ?? 'Item');
  }
  if (
    componentPath === 'Modal' ||
    componentPath === 'Drawer' ||
    componentPath === 'Tour'
  ) {
    props.open = true;
    props.getContainer = overlayContainer ? () => overlayContainer : false;
    if (componentPath !== 'Tour') props.mask = false;
  } else if (
    [
      'Cascader',
      'ColorPicker',
      'DatePicker',
      'Dropdown',
      'Popconfirm',
      'Popover',
      'Select',
      'TimePicker',
      'Tooltip',
      'TreeSelect',
    ].includes(componentPath)
  ) {
    props.open = true;
  }
  if (
    ['Dropdown', 'Popconfirm', 'Popover', 'Tooltip'].includes(componentPath) &&
    props.children === undefined
  ) {
    props.children = createElement('span', null, 'Trigger');
  }
  return props;
};

function AntdPalettePreview({
  componentPath,
  component,
  defaultProps,
}: Readonly<{
  componentPath: string;
  component: ElementType;
  defaultProps: Readonly<Record<string, unknown>>;
}>) {
  const surfaceHost = useOfficialReactSurfaceHost();
  const props = withPreviewRuntimeProps(
    componentPath,
    defaultProps,
    surfaceHost?.getOverlayContainer() ?? null
  );
  if (componentPath === 'Form.Item') {
    return (
      <AntdSurfaceProvider>
        <Antd.Form layout="vertical">
          <Antd.Form.Item label="Field" name="field">
            <Antd.Input placeholder="Type here" />
          </Antd.Form.Item>
        </Antd.Form>
      </AntdSurfaceProvider>
    );
  }
  return (
    <AntdSurfaceProvider>{createElement(component, props)}</AntdSurfaceProvider>
  );
}

const createPreview = (
  componentPath: string,
  component: ElementType,
  defaultProps: Readonly<Record<string, unknown>>
): ReactNode => (
  <AntdPalettePreview
    componentPath={componentPath}
    component={component}
    defaultProps={defaultProps}
  />
);

type AntdPaletteGroup = {
  id: string;
  title: string;
  source: 'external';
  items: OfficialPalettePreviewItem[];
};

const groupsById: Record<string, AntdPaletteGroup> = {};
ANTD_COMPONENT_CATALOG.forEach((entry) => {
  const group = (groupsById[entry.groupId] ??= {
    id: entry.groupId,
    title: entry.groupTitle,
    source: 'external',
    items: [],
  });
  const component = ANTD_COMPONENT_IMPLEMENTATIONS[entry.exportName];
  const renderPreview = (options: { size?: string; status?: string }) => {
    const props = {
      ...entry.defaultProps,
      ...(options.size ? { size: options.size } : {}),
      ...(options.status && entry.path === 'Alert'
        ? { type: options.status }
        : {}),
    };
    return createPreview(entry.path, component, props);
  };
  const variants =
    'variants' in entry.presentation && entry.presentation.variants
      ? entry.presentation.variants.map((variant) =>
          Object.freeze({
            id: variant.id,
            label: variant.label,
            element: createPreview(entry.path, component, {
              ...entry.defaultProps,
              ...variant.props,
            }),
          })
        )
      : undefined;
  const sizes =
    'sizes' in entry.presentation ? entry.presentation.sizes : undefined;
  const status =
    'status' in entry.presentation ? entry.presentation.status : undefined;
  group.items.push({
    id: entry.paletteItemId,
    name: entry.path,
    libraryId: 'antd',
    preview: renderPreview({}),
    renderPreview,
    ...(entry.creation === 'direct' ? { runtimeType: entry.runtimeType } : {}),
    defaultProps: entry.defaultProps,
    ...('scale' in entry.presentation
      ? { scale: entry.presentation.scale }
      : {}),
    ...(sizes ? { sizeOptions: Object.freeze([...sizes]) } : {}),
    ...(variants ? { variants: Object.freeze(variants) } : {}),
    ...(status
      ? {
          statusProp: status.prop,
          statusLabel: status.label,
          defaultStatus: status.defaultValue,
          statusOptions: Object.freeze([...status.options]),
        }
      : {}),
  });
});

export const ANTD_PALETTE_GROUPS = Object.freeze(
  Object.values(groupsById).map((group) =>
    Object.freeze({ ...group, items: Object.freeze(group.items) })
  )
);
