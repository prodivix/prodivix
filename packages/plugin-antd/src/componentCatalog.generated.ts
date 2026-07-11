/**
 * Generated Ant Design component catalog. DO NOT EDIT.
 */
export const ANTD_COMPONENT_CATALOG = [
  {
    groupId: 'antd-general',
    groupTitle: 'Ant Design / General',
    path: 'App',
    exportName: 'App',
    runtimeType: 'AntdApp',
    paletteItemId: 'antd-app',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {},
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['App'],
    props: [],
  },
  {
    groupId: 'antd-general',
    groupTitle: 'Ant Design / General',
    path: 'Button',
    exportName: 'Button',
    runtimeType: 'AntdButton',
    paletteItemId: 'antd-button',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      type: 'primary',
    },
    presentation: {
      scale: 0.8,
      sizes: [
        {
          id: 'small',
          label: 'S',
          value: 'small',
        },
        {
          id: 'middle',
          label: 'M',
          value: 'middle',
        },
        {
          id: 'large',
          label: 'L',
          value: 'large',
        },
      ],
      variants: [
        {
          id: 'primary',
          label: 'Primary',
          props: {
            type: 'primary',
          },
        },
        {
          id: 'default',
          label: 'Default',
          props: {
            type: 'default',
          },
        },
        {
          id: 'dashed',
          label: 'Dashed',
          props: {
            type: 'dashed',
          },
        },
        {
          id: 'text',
          label: 'Text',
          props: {
            type: 'text',
          },
        },
        {
          id: 'link',
          label: 'Link',
          props: {
            type: 'link',
          },
        },
      ],
    },
    children: {
      mode: 'preserve',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Button'],
    props: [
      {
        name: 'type',
        valueType: 'string',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-general',
    groupTitle: 'Ant Design / General',
    path: 'FloatButton',
    exportName: 'FloatButton',
    runtimeType: 'AntdFloatButton',
    paletteItemId: 'antd-float-button',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      type: 'primary',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['FloatButton'],
    props: [
      {
        name: 'type',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-layout',
    groupTitle: 'Ant Design / Layout',
    path: 'Divider',
    exportName: 'Divider',
    runtimeType: 'AntdDivider',
    paletteItemId: 'antd-divider',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Divider',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Divider'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-layout',
    groupTitle: 'Ant Design / Layout',
    path: 'Flex',
    exportName: 'Flex',
    runtimeType: 'AntdFlex',
    paletteItemId: 'antd-flex',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      gap: 'small',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Flex'],
    props: [
      {
        name: 'gap',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-layout',
    groupTitle: 'Ant Design / Layout',
    path: 'Layout',
    exportName: 'Layout',
    runtimeType: 'AntdLayout',
    paletteItemId: 'antd-layout',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      style: {
        minHeight: 80,
      },
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Layout'],
    props: [
      {
        name: 'style',
        valueType: 'object',
      },
    ],
  },
  {
    groupId: 'antd-layout',
    groupTitle: 'Ant Design / Layout',
    path: 'Layout.Header',
    exportName: 'LayoutHeader',
    runtimeType: 'AntdLayoutHeader',
    paletteItemId: 'antd-layout-header',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Header',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Layout', 'Header'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-layout',
    groupTitle: 'Ant Design / Layout',
    path: 'Layout.Content',
    exportName: 'LayoutContent',
    runtimeType: 'AntdLayoutContent',
    paletteItemId: 'antd-layout-content',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Content',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Layout', 'Content'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-layout',
    groupTitle: 'Ant Design / Layout',
    path: 'Layout.Footer',
    exportName: 'LayoutFooter',
    runtimeType: 'AntdLayoutFooter',
    paletteItemId: 'antd-layout-footer',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Footer',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Layout', 'Footer'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-layout',
    groupTitle: 'Ant Design / Layout',
    path: 'Layout.Sider',
    exportName: 'LayoutSider',
    runtimeType: 'AntdLayoutSider',
    paletteItemId: 'antd-layout-sider',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Sider',
      width: 96,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Layout', 'Sider'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
      {
        name: 'width',
        valueType: 'number',
      },
    ],
  },
  {
    groupId: 'antd-layout',
    groupTitle: 'Ant Design / Layout',
    path: 'Space',
    exportName: 'Space',
    runtimeType: 'AntdSpace',
    paletteItemId: 'antd-space',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      size: 'small',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Space'],
    props: [
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-layout',
    groupTitle: 'Ant Design / Layout',
    path: 'Space.Compact',
    exportName: 'SpaceCompact',
    runtimeType: 'AntdSpaceCompact',
    paletteItemId: 'antd-space-compact',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      block: false,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Space', 'Compact'],
    props: [
      {
        name: 'block',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-layout',
    groupTitle: 'Ant Design / Layout',
    path: 'Splitter',
    exportName: 'Splitter',
    runtimeType: 'AntdSplitter',
    paletteItemId: 'antd-splitter',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      style: {
        height: 80,
      },
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Splitter'],
    props: [
      {
        name: 'style',
        valueType: 'object',
      },
    ],
  },
  {
    groupId: 'antd-navigation',
    groupTitle: 'Ant Design / Navigation',
    path: 'Affix',
    exportName: 'Affix',
    runtimeType: 'AntdAffix',
    paletteItemId: 'antd-affix',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      offsetTop: 8,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Affix'],
    props: [
      {
        name: 'offsetTop',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-navigation',
    groupTitle: 'Ant Design / Navigation',
    path: 'Anchor',
    exportName: 'Anchor',
    runtimeType: 'AntdAnchor',
    paletteItemId: 'antd-anchor',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      items: [
        {
          key: 'overview',
          href: '#overview',
          title: 'Overview',
        },
      ],
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Anchor'],
    props: [
      {
        name: 'items',
        valueType: 'array',
      },
    ],
  },
  {
    groupId: 'antd-navigation',
    groupTitle: 'Ant Design / Navigation',
    path: 'Breadcrumb',
    exportName: 'Breadcrumb',
    runtimeType: 'AntdBreadcrumb',
    paletteItemId: 'antd-breadcrumb',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      items: [
        {
          title: 'Home',
        },
        {
          title: 'Page',
        },
      ],
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Breadcrumb'],
    props: [
      {
        name: 'items',
        valueType: 'array',
      },
    ],
  },
  {
    groupId: 'antd-navigation',
    groupTitle: 'Ant Design / Navigation',
    path: 'Dropdown',
    exportName: 'Dropdown',
    runtimeType: 'AntdDropdown',
    paletteItemId: 'antd-dropdown',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      menu: {
        items: [
          {
            key: '1',
            label: 'Item',
          },
        ],
      },
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['Dropdown'],
    props: [
      {
        name: 'menu',
        valueType: 'object',
      },
    ],
  },
  {
    groupId: 'antd-navigation',
    groupTitle: 'Ant Design / Navigation',
    path: 'Menu',
    exportName: 'Menu',
    runtimeType: 'AntdMenu',
    paletteItemId: 'antd-menu',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      items: [
        {
          key: '1',
          label: 'Menu',
        },
      ],
      mode: 'horizontal',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Menu'],
    props: [
      {
        name: 'items',
        valueType: 'array',
      },
      {
        name: 'mode',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-navigation',
    groupTitle: 'Ant Design / Navigation',
    path: 'Pagination',
    exportName: 'Pagination',
    runtimeType: 'AntdPagination',
    paletteItemId: 'antd-pagination',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      current: 2,
      size: 'small',
      total: 50,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Pagination'],
    props: [
      {
        name: 'current',
        valueType: 'string',
      },
      {
        name: 'size',
        valueType: 'string',
      },
      {
        name: 'total',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-navigation',
    groupTitle: 'Ant Design / Navigation',
    path: 'Steps',
    exportName: 'Steps',
    runtimeType: 'AntdSteps',
    paletteItemId: 'antd-steps',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      current: 1,
      items: [
        {
          title: 'A',
        },
        {
          title: 'B',
        },
      ],
      size: 'small',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Steps'],
    props: [
      {
        name: 'current',
        valueType: 'string',
      },
      {
        name: 'items',
        valueType: 'array',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-navigation',
    groupTitle: 'Ant Design / Navigation',
    path: 'Tabs',
    exportName: 'Tabs',
    runtimeType: 'AntdTabs',
    paletteItemId: 'antd-tabs',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      items: [
        {
          children: 'Content',
          key: '1',
          label: 'Tab',
        },
      ],
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Tabs'],
    props: [
      {
        name: 'items',
        valueType: 'array',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'AutoComplete',
    exportName: 'AutoComplete',
    runtimeType: 'AntdAutoComplete',
    paletteItemId: 'antd-auto-complete',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      options: [
        {
          value: 'Option',
        },
      ],
      placeholder: 'Select',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['AutoComplete'],
    props: [
      {
        name: 'options',
        valueType: 'array',
      },
      {
        name: 'placeholder',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Cascader',
    exportName: 'Cascader',
    runtimeType: 'AntdCascader',
    paletteItemId: 'antd-cascader',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      options: [
        {
          label: 'Option',
          value: 'option',
        },
      ],
      placeholder: 'Select',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['Cascader'],
    props: [
      {
        name: 'options',
        valueType: 'array',
      },
      {
        name: 'placeholder',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Checkbox',
    exportName: 'Checkbox',
    runtimeType: 'AntdCheckbox',
    paletteItemId: 'antd-checkbox',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Check',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'preserve',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Checkbox'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'ColorPicker',
    exportName: 'ColorPicker',
    runtimeType: 'AntdColorPicker',
    paletteItemId: 'antd-color-picker',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      defaultValue: '#1677ff',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['ColorPicker'],
    props: [
      {
        name: 'defaultValue',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'DatePicker',
    exportName: 'DatePicker',
    runtimeType: 'AntdDatePicker',
    paletteItemId: 'antd-date-picker',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      placeholder: 'Select date',
    },
    presentation: {
      scale: 0.8,
      sizes: [
        {
          id: 'small',
          label: 'S',
          value: 'small',
        },
        {
          id: 'middle',
          label: 'M',
          value: 'middle',
        },
        {
          id: 'large',
          label: 'L',
          value: 'large',
        },
      ],
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['DatePicker'],
    props: [
      {
        name: 'placeholder',
        valueType: 'string',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Form',
    exportName: 'Form',
    runtimeType: 'AntdForm',
    paletteItemId: 'antd-form',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      layout: 'vertical',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Form'],
    props: [
      {
        name: 'layout',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Form.Item',
    exportName: 'FormItem',
    runtimeType: 'AntdFormItem',
    paletteItemId: 'antd-form-item',
    support: 'template',
    creation: 'template',
    defaultProps: {
      label: 'Field',
      name: 'field',
    },
    presentation: {
      scale: 0.8,
      sizes: [
        {
          id: 'small',
          label: 'S',
          value: 'small',
        },
        {
          id: 'middle',
          label: 'M',
          value: 'middle',
        },
        {
          id: 'large',
          label: 'L',
          value: 'large',
        },
      ],
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Form', 'Item'],
    props: [
      {
        name: 'label',
        valueType: 'string',
      },
      {
        name: 'name',
        valueType: 'string',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Input',
    exportName: 'Input',
    runtimeType: 'AntdInput',
    paletteItemId: 'antd-input',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      placeholder: 'Input',
    },
    presentation: {
      scale: 0.8,
      sizes: [
        {
          id: 'small',
          label: 'S',
          value: 'small',
        },
        {
          id: 'middle',
          label: 'M',
          value: 'middle',
        },
        {
          id: 'large',
          label: 'L',
          value: 'large',
        },
      ],
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Input'],
    props: [
      {
        name: 'placeholder',
        valueType: 'string',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Input.Password',
    exportName: 'InputPassword',
    runtimeType: 'AntdInputPassword',
    paletteItemId: 'antd-input-password',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      placeholder: 'Password',
    },
    presentation: {
      scale: 0.8,
      sizes: [
        {
          id: 'small',
          label: 'S',
          value: 'small',
        },
        {
          id: 'middle',
          label: 'M',
          value: 'middle',
        },
        {
          id: 'large',
          label: 'L',
          value: 'large',
        },
      ],
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Input', 'Password'],
    props: [
      {
        name: 'placeholder',
        valueType: 'string',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Input.Search',
    exportName: 'InputSearch',
    runtimeType: 'AntdInputSearch',
    paletteItemId: 'antd-input-search',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      placeholder: 'Search',
    },
    presentation: {
      scale: 0.8,
      sizes: [
        {
          id: 'small',
          label: 'S',
          value: 'small',
        },
        {
          id: 'middle',
          label: 'M',
          value: 'middle',
        },
        {
          id: 'large',
          label: 'L',
          value: 'large',
        },
      ],
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Input', 'Search'],
    props: [
      {
        name: 'placeholder',
        valueType: 'string',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Input.TextArea',
    exportName: 'InputTextArea',
    runtimeType: 'AntdInputTextArea',
    paletteItemId: 'antd-input-text-area',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      placeholder: 'Text area',
      rows: 2,
    },
    presentation: {
      scale: 0.8,
      sizes: [
        {
          id: 'small',
          label: 'S',
          value: 'small',
        },
        {
          id: 'middle',
          label: 'M',
          value: 'middle',
        },
        {
          id: 'large',
          label: 'L',
          value: 'large',
        },
      ],
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Input', 'TextArea'],
    props: [
      {
        name: 'placeholder',
        valueType: 'string',
      },
      {
        name: 'rows',
        valueType: 'number',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'InputNumber',
    exportName: 'InputNumber',
    runtimeType: 'AntdInputNumber',
    paletteItemId: 'antd-input-number',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      defaultValue: 12,
    },
    presentation: {
      scale: 0.8,
      sizes: [
        {
          id: 'small',
          label: 'S',
          value: 'small',
        },
        {
          id: 'middle',
          label: 'M',
          value: 'middle',
        },
        {
          id: 'large',
          label: 'L',
          value: 'large',
        },
      ],
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['InputNumber'],
    props: [
      {
        name: 'defaultValue',
        valueType: 'string',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Mentions',
    exportName: 'Mentions',
    runtimeType: 'AntdMentions',
    paletteItemId: 'antd-mentions',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      placeholder: 'Mention',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Mentions'],
    props: [
      {
        name: 'placeholder',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Radio',
    exportName: 'Radio',
    runtimeType: 'AntdRadio',
    paletteItemId: 'antd-radio',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Radio',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'preserve',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Radio'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Rate',
    exportName: 'Rate',
    runtimeType: 'AntdRate',
    paletteItemId: 'antd-rate',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      defaultValue: 3,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Rate'],
    props: [
      {
        name: 'defaultValue',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Select',
    exportName: 'Select',
    runtimeType: 'AntdSelect',
    paletteItemId: 'antd-select',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      defaultValue: 'a',
      options: [
        {
          label: 'Option A',
          value: 'a',
        },
      ],
      style: {
        width: 140,
      },
    },
    presentation: {
      scale: 0.8,
      sizes: [
        {
          id: 'small',
          label: 'S',
          value: 'small',
        },
        {
          id: 'middle',
          label: 'M',
          value: 'middle',
        },
        {
          id: 'large',
          label: 'L',
          value: 'large',
        },
      ],
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['Select'],
    props: [
      {
        name: 'defaultValue',
        valueType: 'string',
      },
      {
        name: 'options',
        valueType: 'array',
      },
      {
        name: 'style',
        valueType: 'object',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Slider',
    exportName: 'Slider',
    runtimeType: 'AntdSlider',
    paletteItemId: 'antd-slider',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      defaultValue: 36,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Slider'],
    props: [
      {
        name: 'defaultValue',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Switch',
    exportName: 'Switch',
    runtimeType: 'AntdSwitch',
    paletteItemId: 'antd-switch',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      defaultChecked: true,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Switch'],
    props: [
      {
        name: 'defaultChecked',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'TimePicker',
    exportName: 'TimePicker',
    runtimeType: 'AntdTimePicker',
    paletteItemId: 'antd-time-picker',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      placeholder: 'Select time',
    },
    presentation: {
      scale: 0.8,
      sizes: [
        {
          id: 'small',
          label: 'S',
          value: 'small',
        },
        {
          id: 'middle',
          label: 'M',
          value: 'middle',
        },
        {
          id: 'large',
          label: 'L',
          value: 'large',
        },
      ],
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['TimePicker'],
    props: [
      {
        name: 'placeholder',
        valueType: 'string',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Transfer',
    exportName: 'Transfer',
    runtimeType: 'AntdTransfer',
    paletteItemId: 'antd-transfer',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      dataSource: [
        {
          key: '1',
          title: 'Item',
        },
      ],
      targetKeys: [],
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Transfer'],
    props: [
      {
        name: 'dataSource',
        valueType: 'array',
      },
      {
        name: 'targetKeys',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'TreeSelect',
    exportName: 'TreeSelect',
    runtimeType: 'AntdTreeSelect',
    paletteItemId: 'antd-tree-select',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      defaultValue: '1',
      style: {
        width: 140,
      },
      treeData: [
        {
          title: 'Node',
          value: '1',
        },
      ],
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['TreeSelect'],
    props: [
      {
        name: 'defaultValue',
        valueType: 'string',
      },
      {
        name: 'style',
        valueType: 'object',
      },
      {
        name: 'treeData',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-entry',
    groupTitle: 'Ant Design / Data Entry',
    path: 'Upload',
    exportName: 'Upload',
    runtimeType: 'AntdUpload',
    paletteItemId: 'antd-upload',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      children: 'Upload',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Upload'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Avatar',
    exportName: 'Avatar',
    runtimeType: 'AntdAvatar',
    paletteItemId: 'antd-avatar',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'A',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Avatar'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Badge',
    exportName: 'Badge',
    runtimeType: 'AntdBadge',
    paletteItemId: 'antd-badge',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      count: 5,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'preserve',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Badge'],
    props: [
      {
        name: 'count',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Calendar',
    exportName: 'Calendar',
    runtimeType: 'AntdCalendar',
    paletteItemId: 'antd-calendar',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      fullscreen: false,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Calendar'],
    props: [
      {
        name: 'fullscreen',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Card',
    exportName: 'Card',
    runtimeType: 'AntdCard',
    paletteItemId: 'antd-card',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      size: 'small',
      title: 'Card',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Card'],
    props: [
      {
        name: 'size',
        valueType: 'string',
      },
      {
        name: 'title',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Card.Meta',
    exportName: 'CardMeta',
    runtimeType: 'AntdCardMeta',
    paletteItemId: 'antd-card-meta',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      description: 'Description',
      title: 'Card item',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Card', 'Meta'],
    props: [
      {
        name: 'description',
        valueType: 'string',
      },
      {
        name: 'title',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Carousel',
    exportName: 'Carousel',
    runtimeType: 'AntdCarousel',
    paletteItemId: 'antd-carousel',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {},
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Carousel'],
    props: [],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Collapse',
    exportName: 'Collapse',
    runtimeType: 'AntdCollapse',
    paletteItemId: 'antd-collapse',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      items: [
        {
          children: 'Content',
          key: '1',
          label: 'Panel',
        },
      ],
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Collapse'],
    props: [
      {
        name: 'items',
        valueType: 'array',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Descriptions',
    exportName: 'Descriptions',
    runtimeType: 'AntdDescriptions',
    paletteItemId: 'antd-descriptions',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      column: 1,
      items: [
        {
          children: 'Value',
          key: '1',
          label: 'Label',
        },
      ],
      size: 'small',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Descriptions'],
    props: [
      {
        name: 'column',
        valueType: 'string',
      },
      {
        name: 'items',
        valueType: 'array',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Descriptions.Item',
    exportName: 'DescriptionsItem',
    runtimeType: 'AntdDescriptionsItem',
    paletteItemId: 'antd-descriptions-item',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      children: 'Value',
      label: 'Label',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Descriptions', 'Item'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
      {
        name: 'label',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Empty',
    exportName: 'Empty',
    runtimeType: 'AntdEmpty',
    paletteItemId: 'antd-empty',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      description: 'No data',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Empty'],
    props: [
      {
        name: 'description',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Image',
    exportName: 'Image',
    runtimeType: 'AntdImage',
    paletteItemId: 'antd-image',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      alt: 'Preview',
      height: 60,
      preview: false,
      src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      width: 96,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Image'],
    props: [
      {
        name: 'alt',
        valueType: 'string',
      },
      {
        name: 'height',
        valueType: 'number',
      },
      {
        name: 'preview',
        valueType: 'boolean',
      },
      {
        name: 'src',
        valueType: 'string',
      },
      {
        name: 'width',
        valueType: 'number',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'List',
    exportName: 'List',
    runtimeType: 'AntdList',
    paletteItemId: 'antd-list',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      dataSource: ['Item'],
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['List'],
    props: [
      {
        name: 'dataSource',
        valueType: 'array',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'List.Item',
    exportName: 'ListItem',
    runtimeType: 'AntdListItem',
    paletteItemId: 'antd-list-item',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      children: 'List item',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['List', 'Item'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'List.Item.Meta',
    exportName: 'ListItemMeta',
    runtimeType: 'AntdListItemMeta',
    paletteItemId: 'antd-list-item-meta',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      description: 'Description',
      title: 'List item',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['List', 'Item', 'Meta'],
    props: [
      {
        name: 'description',
        valueType: 'string',
      },
      {
        name: 'title',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Popover',
    exportName: 'Popover',
    runtimeType: 'AntdPopover',
    paletteItemId: 'antd-popover',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      content: 'Popover content',
      title: 'Popover',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['Popover'],
    props: [
      {
        name: 'content',
        valueType: 'string',
      },
      {
        name: 'title',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'QRCode',
    exportName: 'QRCode',
    runtimeType: 'AntdQRCode',
    paletteItemId: 'antd-qrcode',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      size: 96,
      value: 'https://prodivix.dev',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['QRCode'],
    props: [
      {
        name: 'size',
        valueType: 'string',
      },
      {
        name: 'value',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Segmented',
    exportName: 'Segmented',
    runtimeType: 'AntdSegmented',
    paletteItemId: 'antd-segmented',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      options: ['A', 'B'],
      value: 'A',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Segmented'],
    props: [
      {
        name: 'options',
        valueType: 'array',
      },
      {
        name: 'value',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Statistic',
    exportName: 'Statistic',
    runtimeType: 'AntdStatistic',
    paletteItemId: 'antd-statistic',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      title: 'Total',
      value: 42,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Statistic'],
    props: [
      {
        name: 'title',
        valueType: 'string',
      },
      {
        name: 'value',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Table',
    exportName: 'Table',
    runtimeType: 'AntdTable',
    paletteItemId: 'antd-table',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      columns: [
        {
          dataIndex: 'name',
          key: 'name',
          title: 'Name',
        },
      ],
      dataSource: [
        {
          key: '1',
          name: 'Row',
        },
      ],
      pagination: false,
      size: 'small',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Table'],
    props: [
      {
        name: 'columns',
        valueType: 'object',
      },
      {
        name: 'dataSource',
        valueType: 'array',
      },
      {
        name: 'pagination',
        valueType: 'string',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Tag',
    exportName: 'Tag',
    runtimeType: 'AntdTag',
    paletteItemId: 'antd-tag',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Tag',
      color: 'blue',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'preserve',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Tag'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
      {
        name: 'color',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Timeline',
    exportName: 'Timeline',
    runtimeType: 'AntdTimeline',
    paletteItemId: 'antd-timeline',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      items: [
        {
          children: 'Event',
        },
      ],
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Timeline'],
    props: [
      {
        name: 'items',
        valueType: 'array',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Tooltip',
    exportName: 'Tooltip',
    runtimeType: 'AntdTooltip',
    paletteItemId: 'antd-tooltip',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      title: 'Tooltip',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['Tooltip'],
    props: [
      {
        name: 'title',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Tour',
    exportName: 'Tour',
    runtimeType: 'AntdTour',
    paletteItemId: 'antd-tour',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      open: false,
      steps: [],
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['Tour'],
    props: [
      {
        name: 'open',
        valueType: 'boolean',
      },
      {
        name: 'steps',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Tree',
    exportName: 'Tree',
    runtimeType: 'AntdTree',
    paletteItemId: 'antd-tree',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      defaultExpandAll: true,
      treeData: [
        {
          key: '1',
          title: 'Node',
        },
      ],
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Tree'],
    props: [
      {
        name: 'defaultExpandAll',
        valueType: 'string',
      },
      {
        name: 'treeData',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Typography',
    exportName: 'Typography',
    runtimeType: 'AntdTypography',
    paletteItemId: 'antd-typography',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Typography',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'preserve',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Typography'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Typography.Text',
    exportName: 'TypographyText',
    runtimeType: 'AntdTypographyText',
    paletteItemId: 'antd-typography-text',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Text',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'preserve',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Typography', 'Text'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Typography.Title',
    exportName: 'TypographyTitle',
    runtimeType: 'AntdTypographyTitle',
    paletteItemId: 'antd-typography-title',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Title',
      level: 4,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'preserve',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Typography', 'Title'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
      {
        name: 'level',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Typography.Paragraph',
    exportName: 'TypographyParagraph',
    runtimeType: 'AntdTypographyParagraph',
    paletteItemId: 'antd-typography-paragraph',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Paragraph',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'preserve',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Typography', 'Paragraph'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-data-display',
    groupTitle: 'Ant Design / Data Display',
    path: 'Typography.Link',
    exportName: 'TypographyLink',
    runtimeType: 'AntdTypographyLink',
    paletteItemId: 'antd-typography-link',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      children: 'Link',
      href: '#',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'preserve',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Typography', 'Link'],
    props: [
      {
        name: 'children',
        valueType: 'string',
      },
      {
        name: 'href',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-feedback',
    groupTitle: 'Ant Design / Feedback',
    path: 'Alert',
    exportName: 'Alert',
    runtimeType: 'AntdAlert',
    paletteItemId: 'antd-alert',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      message: 'Alert',
      showIcon: true,
      type: 'info',
    },
    presentation: {
      scale: 0.8,
      status: {
        defaultValue: 'info',
        label: 'Type',
        options: [
          {
            id: 'info',
            label: 'Info',
            value: 'info',
          },
          {
            id: 'success',
            label: 'Success',
            value: 'success',
          },
          {
            id: 'warning',
            label: 'Warning',
            value: 'warning',
          },
          {
            id: 'error',
            label: 'Error',
            value: 'error',
          },
        ],
        prop: 'type',
      },
    },
    children: {
      mode: 'preserve',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Alert'],
    props: [
      {
        name: 'message',
        valueType: 'string',
      },
      {
        name: 'showIcon',
        valueType: 'string',
      },
      {
        name: 'type',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-feedback',
    groupTitle: 'Ant Design / Feedback',
    path: 'Drawer',
    exportName: 'Drawer',
    runtimeType: 'AntdDrawer',
    paletteItemId: 'antd-drawer',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      open: false,
      placement: 'right',
      title: 'Drawer',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['Drawer'],
    props: [
      {
        name: 'open',
        valueType: 'boolean',
      },
      {
        name: 'placement',
        valueType: 'string',
      },
      {
        name: 'title',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-feedback',
    groupTitle: 'Ant Design / Feedback',
    path: 'Modal',
    exportName: 'Modal',
    runtimeType: 'AntdModal',
    paletteItemId: 'antd-modal',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      footer: null,
      open: false,
      title: 'Modal',
      width: 360,
    },
    presentation: {
      scale: 0.62,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['Modal'],
    props: [
      {
        name: 'footer',
        valueType: 'string',
      },
      {
        name: 'open',
        valueType: 'boolean',
      },
      {
        name: 'title',
        valueType: 'string',
      },
      {
        name: 'width',
        valueType: 'number',
      },
    ],
  },
  {
    groupId: 'antd-feedback',
    groupTitle: 'Ant Design / Feedback',
    path: 'Popconfirm',
    exportName: 'Popconfirm',
    runtimeType: 'AntdPopconfirm',
    paletteItemId: 'antd-popconfirm',
    support: 'degraded',
    creation: 'direct',
    defaultProps: {
      description: 'This action cannot be undone.',
      title: 'Continue?',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'host-overlay',
      canvasOpen: {
        prop: 'open',
        value: true,
        when: 'selected',
      },
    },
    elementPath: ['Popconfirm'],
    props: [
      {
        name: 'description',
        valueType: 'string',
      },
      {
        name: 'title',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-feedback',
    groupTitle: 'Ant Design / Feedback',
    path: 'Progress',
    exportName: 'Progress',
    runtimeType: 'AntdProgress',
    paletteItemId: 'antd-progress',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      percent: 62,
      size: 'small',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Progress'],
    props: [
      {
        name: 'percent',
        valueType: 'string',
      },
      {
        name: 'size',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-feedback',
    groupTitle: 'Ant Design / Feedback',
    path: 'Result',
    exportName: 'Result',
    runtimeType: 'AntdResult',
    paletteItemId: 'antd-result',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      status: 'success',
      subTitle: 'Completed',
      title: 'Done',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Result'],
    props: [
      {
        name: 'status',
        valueType: 'string',
      },
      {
        name: 'subTitle',
        valueType: 'string',
      },
      {
        name: 'title',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-feedback',
    groupTitle: 'Ant Design / Feedback',
    path: 'Skeleton',
    exportName: 'Skeleton',
    runtimeType: 'AntdSkeleton',
    paletteItemId: 'antd-skeleton',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      active: true,
      paragraph: {
        rows: 1,
      },
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Skeleton'],
    props: [
      {
        name: 'active',
        valueType: 'string',
      },
      {
        name: 'paragraph',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-feedback',
    groupTitle: 'Ant Design / Feedback',
    path: 'Spin',
    exportName: 'Spin',
    runtimeType: 'AntdSpin',
    paletteItemId: 'antd-spin',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      spinning: true,
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'none',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Spin'],
    props: [
      {
        name: 'spinning',
        valueType: 'string',
      },
    ],
  },
  {
    groupId: 'antd-feedback',
    groupTitle: 'Ant Design / Feedback',
    path: 'Watermark',
    exportName: 'Watermark',
    runtimeType: 'AntdWatermark',
    paletteItemId: 'antd-watermark',
    support: 'supported',
    creation: 'direct',
    defaultProps: {
      content: 'Prodivix',
    },
    presentation: {
      scale: 0.8,
    },
    children: {
      mode: 'children-only',
    },
    portal: {
      mode: 'inline',
    },
    elementPath: ['Watermark'],
    props: [
      {
        name: 'content',
        valueType: 'string',
      },
    ],
  },
] as const;
