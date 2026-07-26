export type PdxComponentMaturity = 'stable' | 'preview' | 'lab';

export type PdxComponentCategory =
  | 'button'
  | 'container'
  | 'data'
  | 'embed'
  | 'feedback'
  | 'form'
  | 'icon'
  | 'image'
  | 'input'
  | 'link'
  | 'navigation'
  | 'text'
  | 'video';

export interface PdxComponentPropManifest {
  authoring?: 'editable' | 'hidden';
  kind: 'array' | 'boolean' | 'enum' | 'node' | 'number' | 'object' | 'string';
  defaultValue?: boolean | number | string;
  options?: readonly string[];
  required?: boolean;
}

export interface PdxComponentManifestEntry {
  runtimeType: string;
  category: PdxComponentCategory;
  maturity: PdxComponentMaturity;
  supportsChildren: boolean;
  props: Readonly<Record<string, PdxComponentPropManifest>>;
  events: readonly string[];
  slots: readonly string[];
}

const entry = (
  runtimeType: string,
  category: PdxComponentCategory,
  maturity: PdxComponentMaturity,
  options: Partial<
    Pick<
      PdxComponentManifestEntry,
      'events' | 'props' | 'slots' | 'supportsChildren'
    >
  > = {}
): PdxComponentManifestEntry => ({
  runtimeType,
  category,
  maturity,
  supportsChildren: options.supportsChildren ?? false,
  props: options.props ?? {},
  events: options.events ?? [],
  slots: options.slots ?? [],
});

const CONTROL_SIZES = ['ExtraSmall', 'Small', 'Medium', 'Large'] as const;
const VALIDATION_STATES = ['Default', 'Error', 'Warning', 'Success'] as const;
const SPACING_SCALE = [
  'None',
  'ExtraSmall',
  'Small',
  'Medium',
  'Large',
  'ExtraLarge',
  'ExtraExtraLarge',
] as const;

export const PDX_COMPONENT_MANIFEST = [
  entry('PdxButton', 'button', 'stable', {
    props: {
      text: { kind: 'string' },
      size: { kind: 'enum', options: CONTROL_SIZES, defaultValue: 'Medium' },
      variant: {
        kind: 'enum',
        options: ['Primary', 'Secondary', 'Ghost'],
        defaultValue: 'Secondary',
      },
      tone: {
        kind: 'enum',
        options: ['Neutral', 'Danger', 'Warning'],
        defaultValue: 'Neutral',
      },
      disabled: { kind: 'boolean', defaultValue: false },
      loading: { kind: 'boolean', defaultValue: false },
    },
    events: ['onClick'],
    slots: ['icon'],
  }),
  entry('PdxButtonLink', 'button', 'stable', {
    props: {
      to: { kind: 'string', required: true },
      text: { kind: 'string' },
      size: { kind: 'enum', options: CONTROL_SIZES, defaultValue: 'Medium' },
      variant: {
        kind: 'enum',
        options: ['Primary', 'Secondary', 'Ghost'],
        defaultValue: 'Secondary',
      },
      tone: {
        kind: 'enum',
        options: ['Neutral', 'Danger', 'Warning'],
        defaultValue: 'Neutral',
      },
      disabled: { kind: 'boolean', defaultValue: false },
    },
    events: ['onClick'],
    slots: ['icon'],
  }),
  entry('PdxIconLink', 'icon', 'stable', {
    props: {
      to: { kind: 'string', required: true },
      label: { kind: 'string', required: true },
      size: { kind: 'number', defaultValue: 20 },
    },
    events: ['onClick'],
    slots: ['icon'],
  }),
  entry('PdxLink', 'link', 'stable', {
    supportsChildren: true,
    props: {
      to: { kind: 'string', required: true },
      text: { kind: 'string' },
      disabled: { kind: 'boolean', defaultValue: false },
      underline: { kind: 'boolean', defaultValue: true },
    },
    events: ['onClick'],
  }),
  entry('PdxIcon', 'icon', 'stable', {
    props: {
      size: { kind: 'number', defaultValue: 24 },
      title: { kind: 'string' },
    },
    slots: ['icon'],
  }),
  ...['PdxInput', 'PdxTextarea', 'PdxSearch', 'PdxSelect'].map((runtimeType) =>
    entry(
      runtimeType,
      runtimeType === 'PdxSelect' ? 'form' : 'input',
      'stable',
      {
        props: {
          value: { kind: 'string' },
          placeholder: { kind: 'string' },
          size: {
            kind: 'enum',
            options: CONTROL_SIZES,
            defaultValue: 'Medium',
          },
          state: {
            kind: 'enum',
            options: VALIDATION_STATES,
            defaultValue: 'Default',
          },
          disabled: { kind: 'boolean', defaultValue: false },
        },
        events: ['onValueChange'],
      }
    )
  ),
  entry('PdxRadioGroup', 'form', 'stable', {
    props: {
      value: { kind: 'string' },
      layout: {
        kind: 'enum',
        options: ['Vertical', 'Horizontal'],
        defaultValue: 'Vertical',
      },
      disabled: { kind: 'boolean', defaultValue: false },
    },
    events: ['onValueChange'],
  }),
  entry('PdxCheckbox', 'form', 'preview', {
    props: {
      checked: { kind: 'boolean' },
      defaultChecked: { kind: 'boolean', defaultValue: false },
      indeterminate: { kind: 'boolean', defaultValue: false },
      label: { kind: 'node' },
      description: { kind: 'node' },
      message: { kind: 'node' },
      size: { kind: 'enum', options: CONTROL_SIZES, defaultValue: 'Medium' },
      state: {
        kind: 'enum',
        options: VALIDATION_STATES,
        defaultValue: 'Default',
      },
      disabled: { kind: 'boolean', defaultValue: false },
      required: { kind: 'boolean', defaultValue: false },
    },
    events: ['onCheckedChange', 'onChange'],
  }),
  entry('PdxSwitch', 'form', 'preview', {
    props: {
      checked: { kind: 'boolean' },
      defaultChecked: { kind: 'boolean', defaultValue: false },
      label: { kind: 'node' },
      description: { kind: 'node' },
      labelPosition: {
        kind: 'enum',
        options: ['Start', 'End'],
        defaultValue: 'End',
      },
      size: { kind: 'enum', options: CONTROL_SIZES, defaultValue: 'Medium' },
      disabled: { kind: 'boolean', defaultValue: false },
    },
    events: ['onCheckedChange', 'onClick'],
  }),
  entry('PdxStack', 'container', 'preview', {
    supportsChildren: true,
    props: {
      direction: {
        kind: 'enum',
        options: ['Row', 'Column', 'RowReverse', 'ColumnReverse'],
        defaultValue: 'Column',
      },
      gap: { kind: 'enum', options: SPACING_SCALE, defaultValue: 'Small' },
      align: {
        kind: 'enum',
        options: ['Start', 'Center', 'End', 'Stretch', 'Baseline'],
        defaultValue: 'Stretch',
      },
      justify: {
        kind: 'enum',
        options: [
          'Start',
          'Center',
          'End',
          'SpaceBetween',
          'SpaceAround',
          'SpaceEvenly',
        ],
        defaultValue: 'Start',
      },
      wrap: { kind: 'boolean', defaultValue: false },
      inline: { kind: 'boolean', defaultValue: false },
    },
    events: ['onClick'],
    slots: ['children'],
  }),
  entry('PdxGrid', 'container', 'preview', {
    supportsChildren: true,
    props: {
      columns: { kind: 'number', defaultValue: 2 },
      columnsMedium: { kind: 'number' },
      columnsLarge: { kind: 'number' },
      gap: { kind: 'enum', options: SPACING_SCALE, defaultValue: 'Medium' },
      rowGap: { kind: 'enum', options: SPACING_SCALE },
      align: {
        kind: 'enum',
        options: ['Start', 'Center', 'End', 'Stretch'],
        defaultValue: 'Stretch',
      },
      justify: {
        kind: 'enum',
        options: ['Start', 'Center', 'End', 'Stretch'],
        defaultValue: 'Stretch',
      },
    },
    events: ['onClick'],
    slots: ['children'],
  }),
  entry('PdxDivider', 'container', 'preview', {
    props: {
      orientation: {
        kind: 'enum',
        options: ['Horizontal', 'Vertical'],
        defaultValue: 'Horizontal',
      },
      label: { kind: 'node' },
      labelPosition: {
        kind: 'enum',
        options: ['Start', 'Center', 'End'],
        defaultValue: 'Center',
      },
      spacing: {
        kind: 'enum',
        options: SPACING_SCALE,
        defaultValue: 'Medium',
      },
      variant: {
        kind: 'enum',
        options: ['Solid', 'Dashed'],
        defaultValue: 'Solid',
      },
    },
    events: ['onClick'],
  }),
  entry('PdxSpacer', 'container', 'preview', {
    props: {
      axis: {
        kind: 'enum',
        options: ['Horizontal', 'Vertical', 'Both'],
        defaultValue: 'Vertical',
      },
      size: { kind: 'enum', options: SPACING_SCALE, defaultValue: 'Medium' },
      flexible: { kind: 'boolean', defaultValue: false },
    },
  }),
  entry('PdxTabs', 'navigation', 'stable', {
    props: {
      items: { kind: 'array', required: true },
      activeKey: { kind: 'string' },
      defaultActiveKey: { kind: 'string' },
      activationMode: {
        kind: 'enum',
        options: ['Automatic', 'Manual'],
        defaultValue: 'Automatic',
      },
      orientation: {
        kind: 'enum',
        options: ['Horizontal', 'Vertical'],
        defaultValue: 'Horizontal',
      },
      size: {
        kind: 'enum',
        options: ['Small', 'Medium'],
        defaultValue: 'Medium',
      },
      variant: {
        kind: 'enum',
        options: ['Underline', 'Pills'],
        defaultValue: 'Underline',
      },
    },
    events: ['onActiveKeyChange'],
  }),
  entry('PdxCollapse', 'navigation', 'stable', {
    props: {
      items: { kind: 'array', required: true },
      activeKeys: { kind: 'array' },
      defaultActiveKeys: { kind: 'array' },
      accordion: { kind: 'boolean', defaultValue: false },
      keepMounted: { kind: 'boolean', defaultValue: false },
    },
    events: ['onExpandedKeysChange'],
  }),
  entry('PdxPagination', 'navigation', 'stable', {
    props: {
      page: { kind: 'number', required: true, defaultValue: 1 },
      total: { kind: 'number', required: true, defaultValue: 0 },
      pageSize: { kind: 'number', defaultValue: 10 },
      maxButtons: { kind: 'number', defaultValue: 7 },
      disabled: { kind: 'boolean', defaultValue: false },
    },
    events: ['onPageChange'],
  }),
  entry('PdxTable', 'data', 'stable', {
    props: {
      data: { kind: 'array', required: true },
      columns: { kind: 'array', required: true },
      size: {
        kind: 'enum',
        options: ['Small', 'Medium', 'Large'],
        defaultValue: 'Medium',
      },
      bordered: { kind: 'boolean', defaultValue: false },
      striped: { kind: 'boolean', defaultValue: false },
      hoverable: { kind: 'boolean', defaultValue: false },
      loading: { kind: 'boolean', defaultValue: false },
      stickyHeader: { kind: 'boolean', defaultValue: false },
    },
  }),
  entry('PdxMessage', 'feedback', 'stable', {
    props: {
      text: { kind: 'node', required: true, defaultValue: 'Message' },
      type: {
        kind: 'enum',
        options: ['Info', 'Success', 'Warning', 'Danger'],
        defaultValue: 'Info',
      },
      closable: { kind: 'boolean', defaultValue: false },
      showIcon: { kind: 'boolean', defaultValue: true },
    },
    events: ['onClose'],
    slots: ['icon'],
  }),
  entry('PdxNotification', 'feedback', 'stable', {
    props: {
      title: {
        kind: 'node',
        required: true,
        defaultValue: 'Notification',
      },
      description: { kind: 'node' },
      type: {
        kind: 'enum',
        options: ['Info', 'Success', 'Warning', 'Danger'],
        defaultValue: 'Info',
      },
      closable: { kind: 'boolean', defaultValue: false },
      showIcon: { kind: 'boolean', defaultValue: true },
    },
    events: ['onClose'],
    slots: ['actions', 'icon'],
  }),
  entry('PdxEmpty', 'feedback', 'stable', {
    props: {
      title: { kind: 'node', defaultValue: 'No data' },
      description: { kind: 'node' },
      size: {
        kind: 'enum',
        options: ['Small', 'Medium', 'Large'],
        defaultValue: 'Medium',
      },
      variant: {
        kind: 'enum',
        options: ['Plain', 'Panel'],
        defaultValue: 'Plain',
      },
      showIcon: { kind: 'boolean', defaultValue: true },
    },
    slots: ['action', 'icon'],
  }),
  entry('PdxModal', 'feedback', 'stable', {
    supportsChildren: true,
    props: {
      open: { kind: 'boolean', required: true, defaultValue: false },
      title: { kind: 'node', required: true, defaultValue: 'Modal' },
      description: { kind: 'node' },
      size: {
        kind: 'enum',
        options: ['Small', 'Medium', 'Large'],
        defaultValue: 'Medium',
      },
      closeOnEscape: { kind: 'boolean', defaultValue: true },
      closeOnOverlayClick: { kind: 'boolean', defaultValue: true },
      showClose: { kind: 'boolean', defaultValue: true },
      portal: { kind: 'boolean', defaultValue: true, authoring: 'hidden' },
    },
    events: ['onOpenChange', 'onClose'],
    slots: ['footer'],
  }),
  entry('PdxDrawer', 'feedback', 'stable', {
    supportsChildren: true,
    props: {
      open: { kind: 'boolean', required: true, defaultValue: false },
      title: { kind: 'node', required: true, defaultValue: 'Drawer' },
      description: { kind: 'node' },
      placement: {
        kind: 'enum',
        options: ['Left', 'Right', 'Top', 'Bottom'],
        defaultValue: 'Right',
      },
      size: { kind: 'number', defaultValue: 360 },
      closeOnEscape: { kind: 'boolean', defaultValue: true },
      closeOnOverlayClick: { kind: 'boolean', defaultValue: true },
      showClose: { kind: 'boolean', defaultValue: true },
      portal: { kind: 'boolean', defaultValue: true, authoring: 'hidden' },
    },
    events: ['onOpenChange', 'onClose'],
    slots: ['footer'],
  }),
  entry('PdxTooltip', 'feedback', 'stable', {
    supportsChildren: true,
    props: {
      content: { kind: 'node', required: true, defaultValue: 'Tooltip' },
      placement: {
        kind: 'enum',
        options: ['Top', 'Right', 'Bottom', 'Left'],
        defaultValue: 'Top',
      },
      align: {
        kind: 'enum',
        options: ['Start', 'Center', 'End'],
        defaultValue: 'Center',
      },
      delayDuration: { kind: 'number', defaultValue: 400 },
      disabled: { kind: 'boolean', defaultValue: false },
      portal: { kind: 'boolean', defaultValue: true, authoring: 'hidden' },
    },
    events: ['onOpenChange'],
  }),
  entry('PdxPopover', 'feedback', 'stable', {
    supportsChildren: true,
    props: {
      content: { kind: 'node', required: true, defaultValue: 'Details' },
      title: { kind: 'node' },
      panelLabel: {
        kind: 'string',
        required: true,
        defaultValue: 'Popover',
      },
      placement: {
        kind: 'enum',
        options: ['Top', 'Right', 'Bottom', 'Left'],
        defaultValue: 'Bottom',
      },
      align: {
        kind: 'enum',
        options: ['Start', 'Center', 'End'],
        defaultValue: 'Start',
      },
      defaultOpen: { kind: 'boolean', defaultValue: false },
      modal: { kind: 'boolean', defaultValue: false },
      portal: { kind: 'boolean', defaultValue: true, authoring: 'hidden' },
    },
    events: ['onOpenChange'],
  }),
  ...[
    'PdxNav',
    'PdxNavbar',
    'PdxSidebar',
    'PdxBreadcrumb',
    'PdxAnchorNavigation',
    'PdxRoute',
    'PdxOutlet',
  ].map((runtimeType) =>
    entry(runtimeType, 'navigation', 'preview', { supportsChildren: true })
  ),
  ...['PdxText', 'PdxHeading', 'PdxParagraph', 'PdxKbd'].map((runtimeType) =>
    entry(runtimeType, 'text', 'preview', { supportsChildren: true })
  ),
  ...['PdxDiv', 'PdxSection', 'PdxCard', 'PdxPanel'].map((runtimeType) =>
    entry(runtimeType, 'container', 'preview', { supportsChildren: true })
  ),
  ...['PdxImage', 'PdxAvatar', 'PdxImageGallery'].map((runtimeType) =>
    entry(runtimeType, 'image', 'preview')
  ),
  ...['PdxVideo', 'PdxAudio'].map((runtimeType) =>
    entry(runtimeType, 'video', 'preview')
  ),
  ...['PdxIframe', 'PdxEmbed'].map((runtimeType) =>
    entry(runtimeType, 'embed', 'preview')
  ),
  ...[
    'PdxDatePicker',
    'PdxDateRangePicker',
    'PdxTimePicker',
    'PdxRegionPicker',
    'PdxVerificationCode',
    'PdxPasswordStrength',
    'PdxRegexInput',
    'PdxRating',
    'PdxColorPicker',
    'PdxSlider',
    'PdxRange',
  ].map((runtimeType) => entry(runtimeType, 'form', 'preview')),
  ...['PdxFileUpload', 'PdxImageUpload', 'PdxRichTextEditor'].map(
    (runtimeType) => entry(runtimeType, 'form', 'lab')
  ),
  ...[
    'PdxList',
    'PdxCheckList',
    'PdxTag',
    'PdxBadge',
    'PdxProgress',
    'PdxSpinner',
    'PdxStatistic',
    'PdxTimeline',
    'PdxSteps',
  ].map((runtimeType) => entry(runtimeType, 'data', 'preview')),
  ...['PdxDataGrid', 'PdxTree', 'PdxTreeSelect'].map((runtimeType) =>
    entry(runtimeType, 'data', 'lab')
  ),
  entry('PdxSkeleton', 'feedback', 'preview'),
  entry('PdxSplitter', 'container', 'preview', {
    props: {
      panes: { kind: 'array', required: true },
      orientation: {
        kind: 'enum',
        options: ['Horizontal', 'Vertical'],
        defaultValue: 'Horizontal',
      },
      sizes: { kind: 'array' },
      defaultSizes: { kind: 'array' },
      keyboardStep: { kind: 'number', defaultValue: 16 },
    },
    events: ['onSizesChange'],
  }),
  entry('PdxVirtualList', 'data', 'preview', {
    props: {
      items: { kind: 'array', required: true },
      rowHeight: { kind: 'number', defaultValue: 32 },
      height: { kind: 'number', defaultValue: 320 },
      overscan: { kind: 'number', defaultValue: 4 },
      activeKey: { kind: 'string' },
      defaultActiveKey: { kind: 'string' },
      selectedKey: { kind: 'string' },
      defaultSelectedKey: { kind: 'string' },
    },
    events: ['onActiveKeyChange', 'onSelectedKeyChange'],
  }),
] as const satisfies readonly PdxComponentManifestEntry[];

export const PDX_COMPONENT_MANIFEST_BY_TYPE = Object.fromEntries(
  PDX_COMPONENT_MANIFEST.map((component) => [component.runtimeType, component])
) as Readonly<Record<string, PdxComponentManifestEntry>>;
