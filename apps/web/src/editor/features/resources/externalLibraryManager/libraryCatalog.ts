import type { LibraryCatalog, LibraryMode } from './types';
import type { BuiltinLibraryCategory } from './ExternalLibraryToolbar';
import { BUNDLED_OFFICIAL_PLUGIN_CATALOG } from '@/plugins/platform/bundledOfficialPlugins';

const bundledComponentLibraries = BUNDLED_OFFICIAL_PLUGIN_CATALOG.entries.map(
  (entry): LibraryCatalog => ({
    id: entry.catalogId,
    label: entry.metadata.displayName,
    scope: entry.metadata.scope,
    packageName: entry.metadata.package.name,
    description: entry.metadata.description,
    license: entry.metadata.package.license,
    packageSizeKb: Math.max(
      1,
      Math.ceil(
        entry.artifact.resources.reduce(
          (total, resource) => total + resource.bytes.length,
          0
        ) / 1024
      )
    ),
    components: entry.metadata.components
      .filter((component) => component.paletteItemId)
      .map((component) => component.path),
    versions: [entry.metadata.package.version],
  })
);

export const EXTERNAL_COMPONENT_LIBRARY_PRESET_IDS =
  bundledComponentLibraries.map((library) => library.id);

export const ICON_LIBRARY_PRESET_IDS = ['fontawesome', 'heroicons'];

export const MODE_OPTIONS: Array<{ id: LibraryMode }> = [
  { id: 'locked' },
  { id: 'latest' },
  { id: 'dev' },
];

export const BUILTIN_LIBRARY_CATEGORIES: BuiltinLibraryCategory[] = [
  {
    id: 'component',
    label: 'component',
    libraryIds: EXTERNAL_COMPONENT_LIBRARY_PRESET_IDS,
  },
  {
    id: 'icon',
    label: 'icon',
    libraryIds: ICON_LIBRARY_PRESET_IDS,
  },
  {
    id: 'other',
    label: 'other',
    libraryIds: ['lodash', 'react'],
  },
];

export const LIBRARY_CATALOG: Record<string, LibraryCatalog> = {
  ...Object.fromEntries(
    bundledComponentLibraries.map((library) => [library.id, library])
  ),
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
