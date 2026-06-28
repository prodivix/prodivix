import type { LibraryCatalog, LibraryMode } from './types';
import type { BuiltinLibraryCategory } from './ExternalLibraryToolbar';

export const EXTERNAL_COMPONENT_LIBRARY_PRESET_IDS = ['antd', 'mui'];

export const ICON_LIBRARY_PRESET_IDS = [
  'fontawesome',
  'ant-design-icons',
  'mui-icons',
  'heroicons',
];

export const MODE_OPTIONS: Array<{ id: LibraryMode }> = [
  { id: 'locked' },
  { id: 'latest' },
  { id: 'dev' },
];

export const BUILTIN_LIBRARY_CATEGORIES: BuiltinLibraryCategory[] = [
  {
    id: 'component',
    label: 'component',
    libraryIds: ['antd', 'mui'],
  },
  {
    id: 'icon',
    label: 'icon',
    libraryIds: ['fontawesome', 'ant-design-icons', 'mui-icons', 'heroicons'],
  },
  {
    id: 'other',
    label: 'other',
    libraryIds: ['lodash', 'react'],
  },
];

export const LIBRARY_CATALOG: Record<string, LibraryCatalog> = {
  antd: {
    id: 'antd',
    label: 'Ant Design',
    scope: 'component',
    packageName: 'antd',
    description: 'Enterprise React component library for dashboard and forms.',
    license: 'MIT',
    packageSizeKb: 1218,
    components: ['Button', 'Input', 'Form', 'Modal', 'Table', 'Tabs'],
    versions: ['5.28.0', '5.27.6', '5.26.4', '5.29.0-beta.1'],
  },
  mui: {
    id: 'mui',
    label: 'Material UI',
    scope: 'component',
    packageName: '@mui/material',
    packageDependencies: [
      { name: '@emotion/react', version: '^11.14.0' },
      { name: '@emotion/styled', version: '^11.14.1' },
    ],
    description: 'Material design component system for shell and editor UIs.',
    license: 'MIT',
    packageSizeKb: 936,
    components: ['Button', 'TextField', 'Card', 'Dialog', 'Grid'],
    versions: ['7.3.2', '7.2.8', '7.1.1', '8.0.0-alpha.2'],
  },
  react: {
    id: 'react',
    label: 'React',
    scope: 'utility',
    packageName: 'react',
    description: 'Core rendering runtime and hooks APIs.',
    license: 'MIT',
    packageSizeKb: 132,
    components: ['useState', 'useEffect', 'useMemo', 'useRef', 'createElement'],
    versions: ['19.2.0', '19.1.1', '19.0.0', '19.0.0-rc.1'],
  },
  lodash: {
    id: 'lodash',
    label: 'Lodash',
    scope: 'utility',
    packageName: 'lodash',
    description: 'Utility helper set for object and collection transforms.',
    license: 'MIT',
    packageSizeKb: 72,
    components: ['debounce', 'throttle', 'merge', 'cloneDeep', 'uniqBy'],
    versions: ['4.17.21', '4.17.20', '4.17.15', '5.0.0-dev.2'],
  },
  fontawesome: {
    id: 'fontawesome',
    label: 'Font Awesome',
    scope: 'icon',
    packageName: '@fortawesome/free-solid-svg-icons',
    packageDependencies: [
      { name: '@fortawesome/react-fontawesome', version: '^0.2.6' },
    ],
    description: 'Large icon pack for status and navigation.',
    license: 'CC BY 4.0 + MIT',
    packageSizeKb: 566,
    components: ['faUser', 'faBell', 'faCloud', 'faCode'],
    versions: ['6.7.2', '6.6.0', '6.5.1', '7.0.0-beta.1'],
  },
  'ant-design-icons': {
    id: 'ant-design-icons',
    label: 'Ant Design Icons',
    scope: 'icon',
    packageName: '@ant-design/icons',
    description: 'Icon set aligned with Ant Design visual language.',
    license: 'MIT',
    packageSizeKb: 502,
    components: ['HomeOutlined', 'SearchOutlined', 'SettingOutlined'],
    versions: ['5.6.1', '5.5.0', '5.4.2', '6.0.0-rc.0'],
  },
  'mui-icons': {
    id: 'mui-icons',
    label: 'Material Icons',
    scope: 'icon',
    packageName: '@mui/icons-material',
    description: 'Material icon provider for MUI ecosystem.',
    license: 'MIT',
    packageSizeKb: 548,
    components: ['Add', 'Delete', 'Edit', 'ArrowForward'],
    versions: ['7.3.2', '7.2.8', '7.1.1', '8.0.0-alpha.1'],
  },
  heroicons: {
    id: 'heroicons',
    label: 'Heroicons',
    scope: 'icon',
    packageName: '@heroicons/react',
    description: 'Monochrome icon set for modern product UIs.',
    license: 'MIT',
    packageSizeKb: 436,
    components: ['HomeIcon', 'BoltIcon', 'CodeBracketIcon', 'CubeIcon'],
    versions: ['2.2.0', '2.1.5', '2.0.18', '3.0.0-beta.0'],
  },
};
