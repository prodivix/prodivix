import React from 'react';
import type { ComponentAdapter } from '@/pir/renderer/registry';
import type { ComponentPreviewItem } from '@/editor/features/design/blueprint/editor/model/types';
import type {
  CanonicalExternalComponent,
  ExternalCanonicalGroup,
  ExternalLibraryDescriptor,
  ExternalLibraryProfile,
} from '@/editor/features/design/blueprint/external/runtime/types';
import { antdLibraryManifest } from './antdManifest';
import {
  getValueByPath,
  isRenderableComponent,
  toKebabCase,
  toPascalCase,
} from '@/editor/features/design/blueprint/external/runtime/utils';

type AntdModule = Record<string, unknown> & {
  Button?: React.ElementType;
  Input?: React.ElementType;
  Modal?: React.ElementType;
  Form?: React.ElementType & {
    Item?: React.ElementType;
  };
};

type AntdGroupDefinition = {
  id: string;
  title: string;
  components: string[];
};

/**
 * Build esm.sh candidate URLs with a cache-bust token so each retry can bypass stale CDN/browser artifacts.
 * 使用缓存破坏参数构建 esm.sh 候选地址，确保重试时绕过陈旧的 CDN/浏览器缓存产物。
 */
const createAntdEsmUrlCandidates = (cacheBust: string) => [
  `https://esm.sh/v135/antd@5.28.0/es2022/antd.mjs?external=react,react-dom&v=${cacheBust}`,
  `https://esm.sh/antd@5.28.0?target=es2022&external=react,react-dom&deps=@ant-design/colors@7.2.1&v=${cacheBust}`,
];
const ANTD_SESSION_CACHE_BUST = `session-${Date.now().toString(36)}`;

const createAntdLibraryDescriptor = (): ExternalLibraryDescriptor => {
  return {
    libraryId: 'antd',
    packageName: 'antd',
    version: '5.28.0',
    source: 'esm.sh',
    entryCandidates: createAntdEsmUrlCandidates(ANTD_SESSION_CACHE_BUST),
  };
};

const ANTD_GROUPS: AntdGroupDefinition[] = [
  {
    id: 'antd-general',
    title: 'Ant Design / General',
    components: ['App', 'Button', 'FloatButton'],
  },
  {
    id: 'antd-layout',
    title: 'Ant Design / Layout',
    components: [
      'Divider',
      'Flex',
      'Layout',
      'Layout.Header',
      'Layout.Content',
      'Layout.Footer',
      'Layout.Sider',
      'Space',
      'Space.Compact',
      'Splitter',
    ],
  },
  {
    id: 'antd-navigation',
    title: 'Ant Design / Navigation',
    components: [
      'Affix',
      'Anchor',
      'Breadcrumb',
      'Dropdown',
      'Menu',
      'Pagination',
      'Steps',
      'Tabs',
    ],
  },
  {
    id: 'antd-data-entry',
    title: 'Ant Design / Data Entry',
    components: [
      'AutoComplete',
      'Cascader',
      'Checkbox',
      'ColorPicker',
      'DatePicker',
      'Form',
      'Form.Item',
      'Input',
      'Input.Password',
      'Input.Search',
      'Input.TextArea',
      'InputNumber',
      'Mentions',
      'Radio',
      'Rate',
      'Select',
      'Slider',
      'Switch',
      'TimePicker',
      'Transfer',
      'TreeSelect',
      'Upload',
    ],
  },
  {
    id: 'antd-data-display',
    title: 'Ant Design / Data Display',
    components: [
      'Avatar',
      'Badge',
      'Calendar',
      'Card',
      'Card.Meta',
      'Carousel',
      'Collapse',
      'Descriptions',
      'Descriptions.Item',
      'Empty',
      'Image',
      'List',
      'List.Item',
      'List.Item.Meta',
      'Popover',
      'QRCode',
      'Segmented',
      'Statistic',
      'Table',
      'Tag',
      'Timeline',
      'Tooltip',
      'Tour',
      'Tree',
      'Typography',
      'Typography.Text',
      'Typography.Title',
      'Typography.Paragraph',
      'Typography.Link',
    ],
  },
  {
    id: 'antd-feedback',
    title: 'Ant Design / Feedback',
    components: [
      'Alert',
      'Drawer',
      'Modal',
      'Popconfirm',
      'Progress',
      'Result',
      'Skeleton',
      'Spin',
      'Watermark',
    ],
  },
];

const NON_COMPONENT_EXPORTS = new Set([
  'default',
  'message',
  'notification',
  'theme',
  'version',
  'unstableSetRender',
]);

const SIZE_OPTIONS = [
  { id: 'small', label: 'S', value: 'small' },
  { id: 'middle', label: 'M', value: 'middle' },
  { id: 'large', label: 'L', value: 'large' },
];

const SIZE_SUPPORT_PATHS = new Set([
  'Button',
  'Input',
  'Input.Password',
  'Input.Search',
  'Input.TextArea',
  'Form.Item',
  'Select',
  'DatePicker',
  'TimePicker',
  'InputNumber',
]);

const INPUT_PATHS = new Set([
  'Input',
  'Input.Password',
  'Input.Search',
  'Input.TextArea',
  'InputNumber',
  'Mentions',
  'Select',
  'DatePicker',
  'TimePicker',
]);

class AntdPreviewBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <div className="text-[10px] text-(--text-muted)">Preview</div>;
    }
    return this.props.children;
  }
}

const antdTextAdapter: ComponentAdapter = {
  kind: 'custom',
  supportsChildren: true,
  mapProps: ({ resolvedProps, resolvedText }) => {
    const props = { ...resolvedProps };
    return {
      props,
      children:
        (props.children as React.ReactNode) ??
        (resolvedText ? String(resolvedText) : null),
    };
  },
};

const antdInputAdapter: ComponentAdapter = {
  kind: 'custom',
  supportsChildren: false,
  mapProps: ({ resolvedProps, resolvedText }) => {
    const props = { ...resolvedProps };
    if (resolvedText !== undefined && props.value === undefined) {
      props.value = String(resolvedText);
    }
    return { props };
  },
};

const antdModalAdapter: ComponentAdapter = {
  kind: 'custom',
  supportsChildren: true,
  mapProps: ({ resolvedProps, resolvedText }) => {
    const props = { ...resolvedProps };
    if (props.open === undefined) props.open = false;
    if (props.getContainer === undefined) props.getContainer = false;
    if (props.mask === undefined) props.mask = false;
    if (props.footer === undefined) props.footer = null;
    return {
      props,
      children:
        (props.children as React.ReactNode) ??
        (resolvedText ? String(resolvedText) : null),
    };
  },
};

const pathToRuntimeType = (path: string) =>
  `Antd${path.split('.').map(toPascalCase).join('')}`;

const pathToItemId = (path: string) =>
  `antd-${path.split('.').map(toKebabCase).join('-')}`;

const getComponentByPath = (
  module: AntdModule,
  path: string
): React.ElementType | undefined => {
  const cursor = getValueByPath(module, path);
  return isRenderableComponent(cursor)
    ? (cursor as React.ElementType)
    : undefined;
};

const getAdapterByPath = (path: string): ComponentAdapter => {
  if (path === 'Modal') return antdModalAdapter;
  if (INPUT_PATHS.has(path)) return antdInputAdapter;
  return antdTextAdapter;
};

const INLINE_POPUP_PATHS = new Set([
  'Select',
  'TreeSelect',
  'Cascader',
  'DatePicker',
  'TimePicker',
  'Dropdown',
  'Popover',
  'Tooltip',
  'ColorPicker',
]);

const withInlinePopupContainer = (
  path: string,
  props: Record<string, unknown>
): Record<string, unknown> => {
  if (!INLINE_POPUP_PATHS.has(path)) return props;
  if (props.getPopupContainer !== undefined) return props;
  return {
    ...props,
    getPopupContainer: (trigger: HTMLElement | null) =>
      trigger?.parentElement ?? trigger ?? document.body,
  };
};

const renderAntdPreview = (
  path: string,
  module: AntdModule,
  component: React.ElementType
) => {
  if (path === 'Button') {
    return ({ size, status }: { size?: string; status?: string }) =>
      React.createElement(
        component,
        { type: status ?? 'primary', size: size ?? 'middle' },
        'Button'
      );
  }
  if (path === 'Input') {
    return ({ size }: { size?: string; status?: string }) =>
      React.createElement(component, {
        size: size ?? 'middle',
        placeholder: 'Input',
        value: '',
        readOnly: true,
      });
  }
  if (path === 'Modal') {
    return () =>
      React.createElement(
        component,
        {
          open: true,
          title: 'Modal',
          footer: null,
          width: 180,
          getContainer: false,
          mask: false,
        },
        'Modal content'
      );
  }
  if (path === 'Form.Item') {
    const formComponent = getComponentByPath(module, 'Form');
    const inputComponent = getComponentByPath(module, 'Input');
    if (!formComponent || !inputComponent) return undefined;
    return ({ size }: { size?: string; status?: string }) =>
      React.createElement(
        formComponent,
        { layout: 'vertical' },
        React.createElement(
          component,
          { label: 'Field', name: 'field' },
          React.createElement(inputComponent, {
            size: size ?? 'middle',
            placeholder: 'Input',
          })
        )
      );
  }
  return undefined;
};

const renderAntdDefaultPreview = (
  path: string,
  module: AntdModule,
  component: React.ElementType,
  size?: string,
  status?: string
) => {
  const commonSize = size ?? 'middle';
  switch (path) {
    case 'Select':
      return React.createElement(
        component,
        withInlinePopupContainer(path, {
          size: commonSize,
          defaultValue: 'a',
          options: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' },
          ],
          style: { width: 120 },
        })
      );
    case 'DatePicker':
    case 'TimePicker':
      return React.createElement(
        component,
        withInlinePopupContainer(path, {
          size: commonSize,
          style: { width: 120 },
        })
      );
    case 'InputNumber':
      return React.createElement(component, {
        size: commonSize,
        defaultValue: 12,
        style: { width: 120 },
      });
    case 'Checkbox':
      return React.createElement(component, null, 'Check');
    case 'Radio':
      return React.createElement(component, null, 'Radio');
    case 'Switch':
      return React.createElement(component, { defaultChecked: true });
    case 'Slider':
      return React.createElement(component, {
        defaultValue: 36,
        style: { width: 120 },
      });
    case 'Rate':
      return React.createElement(component, { defaultValue: 3 });
    case 'Tag':
      return React.createElement(component, null, 'Tag');
    case 'Avatar':
      return React.createElement(component, null, 'A');
    case 'Badge':
      return React.createElement(
        component,
        { count: 5 },
        <span className="inline-block h-4 w-4 rounded bg-(--border-subtle)" />
      );
    case 'Card':
      return React.createElement(
        component,
        { title: 'Card', size: 'small', style: { width: 150 } },
        'Body'
      );
    case 'Alert':
      return React.createElement(component, {
        message: 'Alert',
        type: status ?? 'info',
        showIcon: true,
      });
    case 'Progress':
      return React.createElement(component, {
        percent: 62,
        size: 'small',
        style: { width: 120 },
      });
    case 'Spin':
      return React.createElement(
        component,
        { spinning: true },
        <span className="text-[10px]">Loading</span>
      );
    case 'Result':
      return React.createElement(component, {
        status: 'success',
        title: 'Done',
        subTitle: '',
      });
    case 'Tooltip':
      return React.createElement(
        component,
        withInlinePopupContainer(path, { title: 'Tooltip' }),
        <span className="text-[10px]">Hover</span>
      );
    case 'Popover':
      return React.createElement(
        component,
        withInlinePopupContainer(path, { content: 'Popover' }),
        <span className="text-[10px]">Trigger</span>
      );
    case 'Dropdown':
      return React.createElement(
        component,
        withInlinePopupContainer(path, {
          menu: { items: [{ key: '1', label: 'Item' }] },
        }),
        <button type="button">Menu</button>
      );
    case 'Menu':
      return React.createElement(component, {
        mode: 'horizontal',
        items: [{ key: '1', label: 'Menu' }],
      });
    case 'Tabs':
      return React.createElement(component, {
        size: 'small',
        items: [{ key: '1', label: 'Tab', children: 'Content' }],
      });
    case 'Steps':
      return React.createElement(component, {
        size: 'small',
        current: 1,
        items: [{ title: 'A' }, { title: 'B' }],
      });
    case 'Collapse':
      return React.createElement(component, {
        size: 'small',
        items: [{ key: '1', label: 'Panel', children: 'Content' }],
      });
    case 'Pagination':
      return React.createElement(component, {
        size: 'small',
        total: 50,
        current: 2,
      });
    case 'Breadcrumb':
      return React.createElement(component, {
        items: [{ title: 'Home' }, { title: 'Page' }],
      });
    case 'Table':
      return React.createElement(component, {
        size: 'small',
        pagination: false,
        columns: [{ title: 'Name', dataIndex: 'name', key: 'name' }],
        dataSource: [{ key: '1', name: 'Row' }],
        style: { width: 180 },
      });
    case 'List':
      return React.createElement(component, {
        size: 'small',
        dataSource: ['Item A'],
        renderItem: (item: string) => <span>{item}</span>,
        style: { width: 140 },
      });
    case 'Tree':
      return React.createElement(component, {
        defaultExpandAll: true,
        treeData: [{ key: '1', title: 'Node' }],
      });
    case 'TreeSelect':
      return React.createElement(component, {
        size: commonSize,
        treeData: [{ value: '1', title: 'Node' }],
        defaultValue: '1',
        style: { width: 120 },
      });
    case 'Cascader':
      return React.createElement(component, {
        size: commonSize,
        options: [
          {
            value: 'zhejiang',
            label: 'Zhejiang',
            children: [{ value: 'hangzhou', label: 'Hangzhou' }],
          },
        ],
        style: { width: 120 },
      });
    case 'Transfer':
      return React.createElement(component, {
        dataSource: [{ key: '1', title: 'Item 1' }],
        targetKeys: ['1'],
        render: (item: { title: string }) => item.title,
        style: { width: 180 },
      });
    case 'Descriptions':
      return React.createElement(component, {
        size: 'small',
        column: 1,
        items: [{ key: '1', label: 'Label', children: 'Value' }],
      });
    case 'Image':
      return React.createElement(component, {
        width: 80,
        height: 50,
        src: 'https://picsum.photos/160/100',
        alt: 'preview',
        preview: false,
      });
    case 'Space':
      return React.createElement(
        component,
        null,
        <button type="button">A</button>,
        <button type="button">B</button>
      );
    case 'Space.Compact':
      return React.createElement(
        component,
        null,
        <input
          className="w-20 rounded border border-black/15 px-1 py-[2px] text-[10px]"
          placeholder="Input"
        />,
        <button type="button">Go</button>
      );
    case 'Form': {
      const formItem = getComponentByPath(module, 'Form.Item');
      const input = getComponentByPath(module, 'Input');
      if (!formItem || !input) return null;
      return React.createElement(
        component,
        { layout: 'vertical' },
        React.createElement(
          formItem,
          { label: 'Field', name: 'field' },
          React.createElement(input, {
            size: commonSize,
            placeholder: 'Input',
          })
        )
      );
    }
    default:
      return React.createElement(component, {
        size: commonSize,
      });
  }
};

const defaultPropsForPath = (path: string): Record<string, unknown> => {
  if (path === 'Button') return { type: 'primary', size: 'middle' };
  if (path === 'Input') return { placeholder: 'Input', size: 'middle' };
  if (path === 'Modal')
    return {
      open: false,
      title: 'Modal Title',
      getContainer: false,
      mask: false,
      footer: null,
    };
  if (path === 'Drawer') return { open: false, title: 'Drawer Title' };
  return {};
};

const createPreviewItem = (
  path: string,
  module: AntdModule,
  component: React.ElementType
): ComponentPreviewItem => ({
  id: pathToItemId(path),
  name: path,
  runtimeType: pathToRuntimeType(path),
  defaultProps: defaultPropsForPath(path),
  preview: <div className="text-[10px] text-(--text-muted)">{path}</div>,
  renderPreview: ({ size, status }) => (
    <AntdPreviewBoundary>
      {
        (renderAntdPreview(path, module, component)?.({ size, status }) ??
          renderAntdDefaultPreview(path, module, component, size, status) ?? (
            <div className="text-[10px] text-(--text-muted)">{path}</div>
          )) as React.ReactNode
      }
    </AntdPreviewBoundary>
  ),
  sizeOptions: SIZE_SUPPORT_PATHS.has(path) ? SIZE_OPTIONS : undefined,
});

const buildAntdGroups = (
  discoveredComponents: CanonicalExternalComponent[]
): ExternalCanonicalGroup[] => {
  const componentByPath = new Map(
    discoveredComponents.map((item) => [item.path, item])
  );
  const knownPaths = new Set(ANTD_GROUPS.flatMap((group) => group.components));
  const extraPaths = discoveredComponents
    .map((item) => item.path)
    .filter((path) => !knownPaths.has(path))
    .sort();

  const groups: ExternalCanonicalGroup[] = [];
  ANTD_GROUPS.forEach((group) => {
    const items = group.components
      .map((path) => componentByPath.get(path) ?? null)
      .filter((item): item is CanonicalExternalComponent => Boolean(item));

    if (items.length > 0) {
      groups.push({
        id: group.id,
        title: group.title,
        source: 'external',
        items,
      });
    }
  });

  if (extraPaths.length > 0) {
    groups.push({
      id: 'antd-other',
      title: 'Ant Design / Other',
      source: 'external',
      items: extraPaths
        .map((path) => componentByPath.get(path) ?? null)
        .filter((item): item is CanonicalExternalComponent => Boolean(item)),
    });
  }

  return groups;
};

const toCanonicalComponent = (
  path: string,
  module: AntdModule
): CanonicalExternalComponent | null => {
  const component = getComponentByPath(module, path);
  if (!component) return null;
  const item = createPreviewItem(path, module, component);
  return {
    libraryId: 'antd',
    componentName: path,
    component,
    runtimeType: pathToRuntimeType(path),
    itemId: item.id,
    preview: item.preview,
    renderPreview: item.renderPreview,
    sizeOptions: item.sizeOptions,
    defaultProps: item.defaultProps,
    adapter: getAdapterByPath(path),
    path,
    behaviorTags: [],
    codegenHints: {},
    propsSchema: {},
    slots: [],
  };
};

const collectCanonicalComponents = (
  module: AntdModule,
  paths: string[]
): CanonicalExternalComponent[] =>
  paths
    .map((path) => toCanonicalComponent(path, module))
    .filter((value): value is CanonicalExternalComponent => Boolean(value));

export const antdExternalLibraryProfile: ExternalLibraryProfile = {
  descriptor: createAntdLibraryDescriptor,
  includePaths: ANTD_GROUPS.flatMap((group) => group.components),
  excludeExports: NON_COMPONENT_EXPORTS,
  scanMode: 'include-only',
  manifest: antdLibraryManifest,
  toCanonicalComponents: (module, paths) =>
    collectCanonicalComponents(module as AntdModule, paths),
  toGroups: buildAntdGroups,
};
