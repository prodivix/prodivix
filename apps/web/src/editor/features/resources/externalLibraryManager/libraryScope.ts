import type { LibraryScope } from './types';
import {
  EXTERNAL_COMPONENT_LIBRARY_PRESET_IDS,
  ICON_LIBRARY_PRESET_IDS,
} from './libraryCatalog';

const KNOWN_ICON_LIBRARY_IDS = new Set(ICON_LIBRARY_PRESET_IDS);

const KNOWN_COMPONENT_LIBRARY_IDS = new Set([
  ...EXTERNAL_COMPONENT_LIBRARY_PRESET_IDS,
  '@tremor/react',
  '@chakra-ui/react',
  '@mantine/core',
  '@headlessui/react',
  '@fluentui/react-components',
  'primereact',
  'react-bootstrap',
  'semantic-ui-react',
  'flowbite-react',
  'rsuite',
  'grommet',
  'evergreen-ui',
]);

const KNOWN_UTILITY_LIBRARY_IDS = new Set([
  'react',
  'react-dom',
  'lodash',
  'axios',
  'dayjs',
  'date-fns',
  'zod',
  'zustand',
  'redux',
  '@reduxjs/toolkit',
  'clsx',
  'classnames',
  'tailwind-merge',
  'react-hook-form',
]);

const COMPONENT_LIBRARY_PACKAGE_PATTERNS = [
  /^@mantine\//,
  /^@chakra-ui\//,
  /^@headlessui\/react$/,
  /^@tremor\/react$/,
  /^@fluentui\/react-/,
  /^@nextui-org\//,
  /^@heroui\//,
  /^@ariakit\/react$/,
  /(^|[-/])ui($|[-/])/,
  /(^|[-/])components?($|[-/])/,
  /(^|[-/])react$/,
  /react[-/]?(ui|components?)$/,
];

const ICON_LIBRARY_PACKAGE_PATTERNS = [
  /(^|[-/])icons?($|[-/])/,
  /iconify/,
  /lucide/,
  /fontawesome/,
];

export const normalizeLibraryIds = (libraryIds: string[]) =>
  [...new Set(libraryIds.map((libraryId) => libraryId.trim().toLowerCase()))]
    .map((libraryId) => libraryId.trim())
    .filter((libraryId) => libraryId.length > 0);

export const normalizeExternalComponentLibraryIds = (libraryIds: string[]) =>
  normalizeLibraryIds(libraryIds).filter(
    (libraryId) => !KNOWN_ICON_LIBRARY_IDS.has(libraryId)
  );

export const inferLibraryScopeFromPackageName = (
  libraryId: string
): LibraryScope | null => {
  const normalized = normalizeLibraryIds([libraryId])[0];
  if (!normalized) return null;
  if (KNOWN_COMPONENT_LIBRARY_IDS.has(normalized)) return 'component';
  if (
    KNOWN_ICON_LIBRARY_IDS.has(normalized) ||
    ICON_LIBRARY_PACKAGE_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return 'icon';
  }
  if (KNOWN_UTILITY_LIBRARY_IDS.has(normalized)) return 'utility';
  if (
    COMPONENT_LIBRARY_PACKAGE_PATTERNS.some((pattern) =>
      pattern.test(normalized)
    )
  ) {
    return 'component';
  }
  return null;
};
