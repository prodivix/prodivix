import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const legacyPaths = [
  'apps/web/src/editor/features/blueprint/catalog/groups/HeadlessGroup.tsx',
  'apps/web/src/editor/features/blueprint/editor/runtime/useExternalLibraryRuntime.ts',
  'apps/web/src/editor/features/blueprint/editor/model/radix.ts',
  'apps/web/src/editor/features/blueprint/external/index.ts',
  'apps/web/src/editor/features/blueprint/external/libraries/antdManifest.ts',
  'apps/web/src/editor/features/blueprint/external/libraries/antdProfile.tsx',
  'apps/web/src/editor/features/blueprint/external/libraries/muiManifest.ts',
  'apps/web/src/editor/features/blueprint/external/libraries/muiProfile.test.tsx',
  'apps/web/src/editor/features/blueprint/external/libraries/muiProfile.tsx',
  'apps/web/src/editor/features/blueprint/external/runtime/dtsPropOptions.ts',
  'apps/web/src/editor/features/blueprint/external/runtime/engine.ts',
  'apps/web/src/editor/features/blueprint/external/runtime/loader.ts',
  'apps/web/src/editor/features/blueprint/external/runtime/manifest.ts',
  'apps/web/src/editor/features/blueprint/external/runtime/metaStore.ts',
  'apps/web/src/editor/features/blueprint/external/runtime/profileRegistry.ts',
  'apps/web/src/editor/features/blueprint/external/runtime/registry.ts',
  'apps/web/src/editor/features/blueprint/external/runtime/scanner.ts',
  'apps/web/src/editor/features/blueprint/external/runtime/types.ts',
  'apps/web/src/editor/features/blueprint/external/runtime/utils.ts',
  'packages/prodivix-compiler/src/react/antdAdapter.ts',
  'specs/plugins/examples/plugin-antd.manifest.json',
];

const productionRules = [
  {
    pattern: /\b(?:antd|mui)(?:ExternalLibraryProfile|LibraryManifest)\b/,
    message: 'legacy Ant Design or MUI profile/manifest reference',
  },
  {
    pattern:
      /\b(?:ensureConfiguredExternalLibraries|loadExternalEsmModule|registerExternalLibraryProfile)\b/,
    message: 'legacy main-realm external-library runtime',
  },
  {
    pattern: /\bcreateRadixNodeFromPaletteItem\b/,
    message: 'legacy Radix Palette factory',
  },
  {
    pattern: /\b(?:HEADLESS_GROUP|createHeadlessPrimitive)\b/,
    message: 'legacy hard-coded headless catalog or renderer',
  },
  {
    pattern: /\bensureDefaultExternalLibrary\b/,
    message: 'legacy default Ant Design bootstrap',
  },
  {
    pattern: /['"]data-(?:headless-source|radix-primitive)['"]/,
    message: 'legacy Radix placeholder metadata',
  },
  {
    pattern:
      /['"]Radix(?:Label|Accordion|Tabs|Dialog|Popover|Tooltip|DropdownMenu|Switch)['"]/,
    message: 'legacy single-node Radix placeholder runtime type',
  },
  {
    pattern:
      /(?:node\.type|type)\.startsWith\(\s*['"](?:Antd|Mui|Radix)['"]\s*\)/,
    message: 'library-specific runtime prefix branch',
  },
  {
    pattern:
      /(?:packageName|source)\??\.startsWith\(\s*['"]@(?:mui|radix-ui)\//,
    message: 'library-specific compiler package alias branch',
  },
  {
    pattern: /(?:packageName|source)\s*===\s*['"](?:antd|@mui\/material)['"]/,
    message: 'library-specific package equality branch',
  },
  {
    pattern: /iconRef\.provider\s*===\s*['"](?:ant-design-icons|mui-icons)['"]/,
    message: 'legacy compiler icon-provider branch',
  },
  {
    pattern: /['"](?:ant-design-icons|mui-icons)['"]/,
    message: 'legacy separately configured official icon provider',
  },
  {
    pattern: /^\s*(?:antd|mui):\s*\{\s*$/,
    message: 'duplicated official library metadata in the Resource Manager',
  },
  {
    pattern: /EXTERNAL_COMPONENT_LIBRARY_PRESET_IDS\s*=\s*\[\s*['"]antd['"]/,
    message: 'hard-coded official component-library preset list',
  },
  {
    pattern: /libraryIds:\s*\[\s*['"]antd['"]\s*,\s*['"]mui['"]\s*\]/,
    message: 'hard-coded official component-library category',
  },
  {
    pattern:
      /https:\/\/(?:esm\.sh\/[^\s'"`]*(?:antd|@ant-design\/icons|@mui\/(?:material|icons-material))|cdn\.jsdelivr\.net\/npm\/(?:antd|@mui\/material)@)/,
    message: 'legacy executable or declaration CDN URL for an official library',
  },
  {
    pattern: /\btoAntdPathCandidates\b/,
    message: 'legacy Ant Design declaration URL resolver',
  },
  {
    pattern: /\[&_\.Mui|\[&_\.ant-/,
    message: 'library-specific preview CSS selector',
  },
];

const trackedAndUntracked = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { cwd: repoRoot, encoding: 'utf8' }
)
  .split(/\r?\n/u)
  .map((path) => path.trim())
  .filter(Boolean);

const productionFiles = trackedAndUntracked.filter(
  (path) =>
    existsSync(resolve(repoRoot, path)) &&
    (path.startsWith('apps/web/src/') ||
      path.startsWith('packages/prodivix-compiler/src/') ||
      path === 'apps/web/vitest.config.ts') &&
    /\.(?:m?[jt]sx?)$/u.test(path) &&
    !path.includes('/__tests__/') &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path)
);

const failures = [];

const webPackage = JSON.parse(
  readFileSync(resolve(repoRoot, 'apps/web/package.json'), 'utf8')
);
const webDependencies = Object.keys({
  ...(webPackage.dependencies ?? {}),
  ...(webPackage.devDependencies ?? {}),
});
const directOfficialRuntimeDependencies = webDependencies.filter(
  (dependency) =>
    dependency === 'antd' ||
    dependency.startsWith('@ant-design/') ||
    dependency.startsWith('@mui/') ||
    dependency.startsWith('@radix-ui/')
);
if (directOfficialRuntimeDependencies.length > 0) {
  failures.push(
    `apps/web/package.json: official runtime dependencies belong to their plugin package: ${directOfficialRuntimeDependencies.join(', ')}`
  );
}

for (const path of legacyPaths) {
  if (existsSync(resolve(repoRoot, path))) {
    failures.push(`${path}: legacy production path still exists`);
  }
}

for (const path of productionFiles) {
  const lines = readFileSync(resolve(repoRoot, path), 'utf8').split(/\r?\n/u);
  lines.forEach((line, index) => {
    for (const rule of productionRules) {
      if (rule.pattern.test(line)) {
        failures.push(`${path}:${index + 1}: ${rule.message}`);
      }
    }
  });
}

if (failures.length > 0) {
  console.error('Official plugin cutover still has legacy production paths:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Official plugin cutover source scan passed.');
}
