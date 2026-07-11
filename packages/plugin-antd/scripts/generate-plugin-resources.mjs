import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const check = process.argv.includes('--check');

const groups = [
  {
    id: 'antd-general',
    title: 'Ant Design / General',
    paths: ['App', 'Button', 'FloatButton'],
  },
  {
    id: 'antd-layout',
    title: 'Ant Design / Layout',
    paths: [
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
    paths: [
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
    paths: [
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
    paths: [
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
    paths: [
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

const supportedPaths = new Set([
  'Button',
  'Divider',
  'Flex',
  'Layout',
  'Layout.Header',
  'Layout.Content',
  'Layout.Footer',
  'Layout.Sider',
  'Space',
  'Space.Compact',
  'Breadcrumb',
  'Pagination',
  'Steps',
  'Checkbox',
  'Form',
  'Input',
  'Input.Password',
  'Input.Search',
  'Input.TextArea',
  'InputNumber',
  'Mentions',
  'Radio',
  'Rate',
  'Slider',
  'Switch',
  'Avatar',
  'Badge',
  'Card',
  'Card.Meta',
  'Empty',
  'Image',
  'QRCode',
  'Segmented',
  'Statistic',
  'Tag',
  'Typography',
  'Typography.Text',
  'Typography.Title',
  'Typography.Paragraph',
  'Typography.Link',
  'Alert',
  'Progress',
  'Result',
  'Skeleton',
  'Spin',
  'Watermark',
]);
const inputPaths = new Set([
  'AutoComplete',
  'Cascader',
  'ColorPicker',
  'DatePicker',
  'Input',
  'Input.Password',
  'Input.Search',
  'Input.TextArea',
  'InputNumber',
  'Mentions',
  'Select',
  'TimePicker',
  'Transfer',
  'TreeSelect',
  'Upload',
]);
const sizePaths = new Set([
  'Button',
  'Form.Item',
  'Input',
  'Input.Password',
  'Input.Search',
  'Input.TextArea',
  'InputNumber',
  'Select',
  'DatePicker',
  'TimePicker',
]);
const overlayPaths = new Set([
  'Cascader',
  'ColorPicker',
  'DatePicker',
  'Drawer',
  'Dropdown',
  'Modal',
  'Popconfirm',
  'Popover',
  'Select',
  'TimePicker',
  'Tooltip',
  'Tour',
  'TreeSelect',
]);
const childrenOnlyPaths = new Set([
  'App',
  'Affix',
  'Card',
  'Card.Meta',
  'Carousel',
  'Collapse',
  'Descriptions',
  'Descriptions.Item',
  'Drawer',
  'Dropdown',
  'Flex',
  'Form',
  'Form.Item',
  'Layout',
  'Layout.Header',
  'Layout.Content',
  'Layout.Footer',
  'Layout.Sider',
  'List',
  'List.Item',
  'List.Item.Meta',
  'Modal',
  'Popconfirm',
  'Popover',
  'Space',
  'Space.Compact',
  'Splitter',
  'Tooltip',
  'Watermark',
]);
const noChildrenPaths = new Set([
  ...inputPaths,
  'Anchor',
  'Avatar',
  'Breadcrumb',
  'Calendar',
  'Divider',
  'Empty',
  'FloatButton',
  'Image',
  'Menu',
  'Pagination',
  'Progress',
  'QRCode',
  'Rate',
  'Result',
  'Segmented',
  'Skeleton',
  'Slider',
  'Spin',
  'Statistic',
  'Steps',
  'Switch',
  'Table',
  'Tabs',
  'Timeline',
  'Tour',
  'Tree',
]);

const toPascalCase = (value) =>
  value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join('');
const toKebabCase = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
const defaultPropsForPath = (componentPath) => {
  const defaults = {
    Affix: { offsetTop: 8 },
    Alert: { message: 'Alert', showIcon: true, type: 'info' },
    Anchor: {
      items: [{ key: 'overview', href: '#overview', title: 'Overview' }],
    },
    App: {},
    AutoComplete: { options: [{ value: 'Option' }], placeholder: 'Select' },
    Avatar: { children: 'A' },
    Badge: { count: 5 },
    Breadcrumb: { items: [{ title: 'Home' }, { title: 'Page' }] },
    Button: { type: 'primary' },
    Calendar: { fullscreen: false },
    Card: { size: 'small', title: 'Card' },
    'Card.Meta': { description: 'Description', title: 'Card item' },
    Cascader: {
      options: [{ label: 'Option', value: 'option' }],
      placeholder: 'Select',
    },
    Checkbox: { children: 'Check' },
    Collapse: { items: [{ children: 'Content', key: '1', label: 'Panel' }] },
    ColorPicker: { defaultValue: '#1677ff' },
    DatePicker: { placeholder: 'Select date' },
    Descriptions: {
      column: 1,
      items: [{ children: 'Value', key: '1', label: 'Label' }],
      size: 'small',
    },
    'Descriptions.Item': { children: 'Value', label: 'Label' },
    Divider: { children: 'Divider' },
    Drawer: { open: false, placement: 'right', title: 'Drawer' },
    Dropdown: { menu: { items: [{ key: '1', label: 'Item' }] } },
    Empty: { description: 'No data' },
    Flex: { gap: 'small' },
    FloatButton: { type: 'primary' },
    Form: { layout: 'vertical' },
    'Form.Item': { label: 'Field', name: 'field' },
    Image: {
      alt: 'Preview',
      height: 60,
      preview: false,
      src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      width: 96,
    },
    Input: { placeholder: 'Input' },
    'Input.Password': { placeholder: 'Password' },
    'Input.Search': { placeholder: 'Search' },
    'Input.TextArea': { placeholder: 'Text area', rows: 2 },
    InputNumber: { defaultValue: 12 },
    Layout: { style: { minHeight: 80 } },
    'Layout.Content': { children: 'Content' },
    'Layout.Footer': { children: 'Footer' },
    'Layout.Header': { children: 'Header' },
    'Layout.Sider': { children: 'Sider', width: 96 },
    List: { dataSource: ['Item'] },
    'List.Item': { children: 'List item' },
    'List.Item.Meta': { description: 'Description', title: 'List item' },
    Mentions: { placeholder: 'Mention' },
    Menu: { items: [{ key: '1', label: 'Menu' }], mode: 'horizontal' },
    Modal: { footer: null, open: false, title: 'Modal', width: 360 },
    Pagination: { current: 2, size: 'small', total: 50 },
    Popconfirm: {
      description: 'This action cannot be undone.',
      title: 'Continue?',
    },
    Popover: { content: 'Popover content', title: 'Popover' },
    Progress: { percent: 62, size: 'small' },
    QRCode: { size: 96, value: 'https://prodivix.dev' },
    Radio: { children: 'Radio' },
    Rate: { defaultValue: 3 },
    Result: { status: 'success', subTitle: 'Completed', title: 'Done' },
    Segmented: { options: ['A', 'B'], value: 'A' },
    Select: {
      defaultValue: 'a',
      options: [{ label: 'Option A', value: 'a' }],
      style: { width: 140 },
    },
    Skeleton: { active: true, paragraph: { rows: 1 } },
    Slider: { defaultValue: 36 },
    Space: { size: 'small' },
    'Space.Compact': { block: false },
    Spin: { spinning: true },
    Splitter: { style: { height: 80 } },
    Statistic: { title: 'Total', value: 42 },
    Steps: {
      current: 1,
      items: [{ title: 'A' }, { title: 'B' }],
      size: 'small',
    },
    Switch: { defaultChecked: true },
    Table: {
      columns: [{ dataIndex: 'name', key: 'name', title: 'Name' }],
      dataSource: [{ key: '1', name: 'Row' }],
      pagination: false,
      size: 'small',
    },
    Tabs: { items: [{ children: 'Content', key: '1', label: 'Tab' }] },
    Tag: { children: 'Tag', color: 'blue' },
    TimePicker: { placeholder: 'Select time' },
    Timeline: { items: [{ children: 'Event' }] },
    Tooltip: { title: 'Tooltip' },
    Tour: { open: false, steps: [] },
    Transfer: { dataSource: [{ key: '1', title: 'Item' }], targetKeys: [] },
    Tree: { defaultExpandAll: true, treeData: [{ key: '1', title: 'Node' }] },
    TreeSelect: {
      defaultValue: '1',
      style: { width: 140 },
      treeData: [{ title: 'Node', value: '1' }],
    },
    Typography: { children: 'Typography' },
    'Typography.Link': { children: 'Link', href: '#' },
    'Typography.Paragraph': { children: 'Paragraph' },
    'Typography.Text': { children: 'Text' },
    'Typography.Title': { children: 'Title', level: 4 },
    Upload: { children: 'Upload' },
    Watermark: { content: 'Prodivix' },
  };
  return defaults[componentPath] ?? {};
};
const childrenForPath = (componentPath) => {
  if (childrenOnlyPaths.has(componentPath)) return { mode: 'children-only' };
  if (noChildrenPaths.has(componentPath)) return { mode: 'none' };
  return { mode: 'preserve' };
};
const presentationForPath = (componentPath) => {
  const presentation = { scale: componentPath === 'Modal' ? 0.62 : 0.8 };
  if (sizePaths.has(componentPath)) {
    presentation.sizes = [
      { id: 'small', label: 'S', value: 'small' },
      { id: 'middle', label: 'M', value: 'middle' },
      { id: 'large', label: 'L', value: 'large' },
    ];
  }
  if (componentPath === 'Button') {
    presentation.variants = [
      { id: 'primary', label: 'Primary', props: { type: 'primary' } },
      { id: 'default', label: 'Default', props: { type: 'default' } },
      { id: 'dashed', label: 'Dashed', props: { type: 'dashed' } },
      { id: 'text', label: 'Text', props: { type: 'text' } },
      { id: 'link', label: 'Link', props: { type: 'link' } },
    ];
  }
  if (componentPath === 'Alert') {
    presentation.status = {
      defaultValue: 'info',
      label: 'Type',
      options: [
        { id: 'info', label: 'Info', value: 'info' },
        { id: 'success', label: 'Success', value: 'success' },
        { id: 'warning', label: 'Warning', value: 'warning' },
        { id: 'error', label: 'Error', value: 'error' },
      ],
      prop: 'type',
    };
  }
  return presentation;
};
const propsForPath = (componentPath) => {
  const names = new Set(Object.keys(defaultPropsForPath(componentPath)));
  if (sizePaths.has(componentPath)) names.add('size');
  return [...names].slice(0, 24).map((name) => ({
    name,
    valueType:
      name === 'open' || name === 'disabled' || name === 'preview'
        ? 'boolean'
        : name === 'width' || name === 'height' || name === 'rows'
          ? 'number'
          : name === 'items' || name === 'options' || name === 'dataSource'
            ? 'array'
            : name === 'style' || name === 'columns' || name === 'menu'
              ? 'object'
              : 'string',
  }));
};
const paletteDefaultPropsForPath = (componentPath) =>
  Object.fromEntries(
    Object.entries(defaultPropsForPath(componentPath)).filter(
      ([property]) => property !== 'children'
    )
  );

const components = groups.flatMap((group) =>
  group.paths.map((componentPath) => {
    const pathParts = componentPath.split('.');
    const support =
      componentPath === 'Form.Item'
        ? 'template'
        : supportedPaths.has(componentPath)
          ? 'supported'
          : 'degraded';
    const portal = overlayPaths.has(componentPath)
      ? {
          mode: 'host-overlay',
          canvasOpen: {
            prop: 'open',
            value: true,
            when: 'selected',
          },
        }
      : { mode: 'inline' };
    return {
      groupId: group.id,
      groupTitle: group.title,
      path: componentPath,
      exportName: pathParts.join(''),
      runtimeType: `Antd${pathParts.map(toPascalCase).join('')}`,
      paletteItemId: `antd-${pathParts.map(toKebabCase).join('-')}`,
      support,
      creation: componentPath === 'Form.Item' ? 'template' : 'direct',
      defaultProps: defaultPropsForPath(componentPath),
      presentation: presentationForPath(componentPath),
      children: childrenForPath(componentPath),
      portal,
      elementPath: pathParts,
      props: propsForPath(componentPath),
    };
  })
);

if (components.length !== 81) {
  throw new Error(
    `Ant Design support matrix must contain 81 components, got ${components.length}.`
  );
}

const externalLibrary = {
  schemaVersion: '1.0',
  libraryId: 'antd',
  displayName: 'Ant Design',
  package: { name: 'antd', version: '5.28.0', license: 'MIT' },
  hostImplementationId: 'antd.components',
  exportDiscovery: {
    strategy: 'declared',
    include: components.map((component) => component.exportName),
  },
  components: components.map((component) => ({
    exportName: component.exportName,
    componentName: component.path,
    runtimeType: component.runtimeType,
    ...(component.props.length > 0 ? { props: component.props } : {}),
    ...(!noChildrenPaths.has(component.path)
      ? { slots: [{ name: 'children', cardinality: 'many' }] }
      : {}),
    behaviorTags: [
      component.support === 'degraded'
        ? 'authoring.degraded'
        : 'authoring.supported',
    ],
  })),
  dependencies: [
    {
      name: '@ant-design/cssinjs',
      version: '1.24.0',
      kind: 'dependency',
      license: 'MIT',
    },
    {
      name: '@ant-design/icons',
      version: '6.1.0',
      kind: 'dependency',
      license: 'MIT',
    },
  ],
};

const palette = {
  schemaVersion: '1.0',
  surface: 'blueprint.components',
  groups: groups.map((group) => ({
    id: group.id,
    label: group.title,
    placement: { section: 'external', libraryId: 'antd' },
    items: components
      .filter((component) => component.groupId === group.id)
      .map((component) => ({
        kind: 'component',
        id: component.paletteItemId,
        label: component.path,
        ...(component.creation === 'direct'
          ? { runtimeType: component.runtimeType }
          : {}),
        ...(Object.keys(paletteDefaultPropsForPath(component.path)).length > 0
          ? { defaultProps: paletteDefaultPropsForPath(component.path) }
          : {}),
        presentation: component.presentation,
      })),
  })),
};

const templates = {
  schemaVersion: '1.0',
  surface: 'blueprint.components',
  templates: [
    {
      id: 'antd.form-item-template',
      palette: {
        contributionId: 'antd.palette',
        itemId: 'antd-form-item',
      },
      primaryLocalId: 'field',
      fragment: {
        rootLocalIds: ['field'],
        nodesByLocalId: {
          field: {
            type: 'AntdFormItem',
            props: { label: 'Field', name: 'field' },
          },
          control: {
            type: 'AntdInput',
            props: { placeholder: 'Type here' },
          },
        },
        childIdsByLocalId: { field: ['control'] },
      },
    },
  ],
  compositionRules: [
    {
      id: 'antd.form-item-children',
      runtimeType: 'AntdFormItem',
      parent: { mode: 'any' },
      slots: [
        {
          target: 'children',
          sequence: [
            {
              match: 'runtime-types',
              runtimeTypes: ['AntdInput'],
              minItems: 1,
              maxItems: 1,
            },
          ],
        },
      ],
    },
  ],
};

const renderPolicy = {
  schemaVersion: '1.0',
  libraryId: 'antd',
  rules: components.map((component) => ({
    id: `antd.${toKebabCase(component.path)}`,
    runtimeType: component.runtimeType,
    componentExport: component.exportName,
    hostImplementationId:
      component.portal.mode === 'host-overlay'
        ? 'antd.render.overlay'
        : 'antd.render.provider',
    children: component.children,
    portal: component.portal,
    fallback: {
      behavior: 'error',
      message: `${component.path} is unavailable because the Ant Design plugin is disabled.`,
    },
  })),
};

const codegenPolicy = {
  schemaVersion: '1.0',
  targetPreset: 'react-vite',
  libraryId: 'antd',
  dependencies: [
    { name: 'antd', version: '5.28.0', kind: 'dependency', license: 'MIT' },
  ],
  rules: components.map((component) => ({
    id: `antd.${toKebabCase(component.path)}`,
    runtimeType: component.runtimeType,
    elementPath: component.elementPath,
    import: {
      packageName: 'antd',
      kind: 'named',
      imported: component.elementPath[0],
    },
    children: component.children,
  })),
  unsupported: {
    behavior: 'error',
    message: 'Ant Design component has no official React export policy.',
  },
};

const iconProvider = {
  schemaVersion: '1.0',
  providerId: 'ant-design-icons',
  libraryId: 'antd',
  displayName: 'Ant Design Icons',
  package: { name: '@ant-design/icons', version: '6.1.0', license: 'MIT' },
  hostImplementationId: 'antd.icons',
  exports: {
    strategy: 'named-exports',
    variants: [
      { id: 'outlined', exportSuffix: 'Outlined' },
      { id: 'filled', exportSuffix: 'Filled' },
      { id: 'two-tone', exportSuffix: 'TwoTone' },
    ],
  },
  normalization: {
    inputCase: 'pascal',
    exportCase: 'pascal',
    defaultVariant: 'outlined',
  },
  render: { size: { mode: 'style-font-size' } },
  codegen: { importKind: 'named', sourceMode: 'package' },
  limits: {
    maxIcons: 2048,
    maxNameLength: 120,
    maxResponseBytes: 262144,
    maxCacheEntries: 512,
  },
};

const supportMatrix = {
  schemaVersion: '1.0',
  catalog: {
    catalogId: 'antd',
    description: 'Official Ant Design components and icons for React projects.',
    scope: 'component',
  },
  library: {
    id: 'antd',
    displayName: 'Ant Design',
    package: { name: 'antd', version: '5.28.0', license: 'MIT' },
  },
  hostPackages: [
    { name: '@ant-design/cssinjs', version: '1.24.0' },
    { name: '@ant-design/icons', version: '6.1.0' },
    { name: 'antd', version: '5.28.0' },
  ],
  hostImplementations: [
    { id: 'antd.components', kind: 'component-library' },
    { id: 'antd.icons', kind: 'icon-provider' },
    { id: 'antd.palette', kind: 'palette-projection' },
    { id: 'antd.render.overlay', kind: 'render-policy' },
    { id: 'antd.render.provider', kind: 'render-policy' },
  ],
  components: components.map(
    ({
      path: componentPath,
      exportName,
      runtimeType,
      paletteItemId,
      support,
      creation,
    }) => ({
      path: componentPath,
      exportName,
      runtimeType,
      paletteItemId,
      support,
      creation,
    })
  ),
  omittedExports: [
    'default',
    'message',
    'notification',
    'theme',
    'unstableSetRender',
    'version',
  ],
};

const contributions = [
  ['antd.library', 'externalLibrary', 'external-library.json', externalLibrary],
  ['antd.palette', 'paletteContribution', 'palette.json', palette],
  ['antd.templates', 'blueprintTemplate', 'blueprint-template.json', templates],
  ['antd.render', 'renderPolicy', 'render-policy.json', renderPolicy],
  ['antd.react-codegen', 'codegenPolicy', 'codegen-policy.json', codegenPolicy],
  ['antd.icons', 'iconProvider', 'icon-provider.json', iconProvider],
];
const existingManifest = JSON.parse(
  await readFile(
    path.join(packageRoot, 'plugin', 'manifest.json'),
    'utf8'
  ).catch(() => '{}')
);
const integrityByContributionId = new Map(
  (existingManifest.contributes ?? []).flatMap((contribution) =>
    typeof contribution?.id === 'string' &&
    typeof contribution?.source?.integrity === 'string'
      ? [[contribution.id, contribution.source.integrity]]
      : []
  )
);
const manifest = {
  schemaVersion: '1.0',
  id: '@prodivix/plugin-antd',
  displayName: 'Ant Design Official Plugin',
  version: '0.1.0',
  publisher: 'prodivix',
  engines: { prodivix: '>=0.1.0 <1.0.0' },
  capabilities: contributions.map(([, point]) => ({
    id: 'extension.register',
    scope: point,
    reason: `Register official Ant Design ${point} contribution.`,
  })),
  contributes: contributions.map(([id, point, fileName]) => {
    const integrity = integrityByContributionId.get(id);
    return {
      id,
      point,
      contractVersion: '1.0',
      source: {
        kind: 'resource',
        path: `./contributions/${fileName}`,
        ...(integrity ? { integrity } : {}),
      },
    };
  }),
};

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
};
const prettierConfig =
  (await resolveConfig(path.join(packageRoot, 'package.json'))) ?? {};
const jsonText = (value) =>
  format(JSON.stringify(canonicalize(value)), {
    ...prettierConfig,
    parser: 'json',
  });
const componentCatalogText = await format(
  `/**
 * Generated Ant Design component catalog. DO NOT EDIT.
 */
export const ANTD_COMPONENT_CATALOG = ${JSON.stringify(
    components,
    null,
    2
  )} as const;
`,
  {
    ...prettierConfig,
    parser: 'typescript',
  }
);
const outputs = new Map([
  ['plugin/manifest.json', await jsonText(manifest)],
  ['plugin/support-matrix.json', await jsonText(supportMatrix)],
  ...contributions.map(([, , fileName, value]) => [
    `plugin/contributions/${fileName}`,
    value,
  ]),
  ['src/componentCatalog.generated.ts', componentCatalogText],
]);

for (const [relativePath, value] of outputs) {
  if (relativePath.startsWith('plugin/contributions/')) {
    outputs.set(relativePath, await jsonText(value));
  }
}

for (const [relativePath, content] of outputs) {
  const absolutePath = path.join(packageRoot, relativePath);
  if (check) {
    const current = await readFile(absolutePath, 'utf8').catch(() => undefined);
    if (current !== content) {
      throw new Error(`${relativePath} is stale. Run pnpm generate:resources.`);
    }
    continue;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
}

process.stdout.write(
  `${check ? 'Verified' : 'Generated'} ${outputs.size} Ant Design plugin resources.\n`
);
