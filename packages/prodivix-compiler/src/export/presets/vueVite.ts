import { exportDependenciesToPackageFields } from '#src/export/dependencyPlanner';
import { collectScaffoldReservedPaths } from '#src/export/pathOwnership';
import { createPirEntrySurfaceCss } from '#src/export/pirEntrySurface';
import { DOMAIN_RUNTIME_MODULE_FACTORIES } from '#src/export/presets/domainRuntimeFactories';
import type {
  ExportFileContribution,
  ExportPlannerPreset,
  ExportProgramContribution,
  ExportScaffoldContext,
  ExportSourceTrace,
} from '#src/export/types';

export const VUE_VITE_PACKAGE_MANAGER = 'pnpm@11.9.0';

export const VUE_VITE_DEPENDENCIES = {
  ajv: '^8.20.0',
  vue: '^3.5.39',
} as const;

export const VUE_VITE_DEV_DEPENDENCIES = {
  '@vitejs/plugin-vue': '^6.0.7',
  typescript: '~5.9.3',
  vite: '^7.3.6',
  vitest: '^4.1.9',
  'vue-tsc': '^3.1.3',
} as const;

const sourceTrace = (path: string): ExportSourceTrace[] => [
  { sourceRef: { domain: 'scaffold', id: path, path } },
];

const packageName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 214) || 'prodivix-vue-export';

const textFile = (
  path: string,
  kind: ExportFileContribution['kind'],
  contents: string,
  options: Readonly<{
    language?: string;
    mimeType?: string;
    importMode?: ExportFileContribution['importMode'];
  }> = {}
): ExportFileContribution => ({
  id: `vue-scaffold:${path}`,
  desiredPath: path,
  kind,
  contents,
  ...(options.language ? { language: options.language } : {}),
  ...(options.mimeType ? { mimeType: options.mimeType } : {}),
  importMode: options.importMode ?? 'copy-only',
  sourceTrace: sourceTrace(path),
  origin: {
    kind: 'generated',
    owner: 'prodivix',
    writePolicy: 'generated',
    updatePolicy: 'regenerate',
  },
});

const packageFile = (
  context: ExportScaffoldContext
): ExportFileContribution => {
  const fields = exportDependenciesToPackageFields(context.dependencies);
  return textFile(
    'package.json',
    'metadata',
    JSON.stringify(
      {
        name: packageName(context.projectName),
        private: true,
        version: '0.1.0',
        type: 'module',
        packageManager: context.packageManager ?? VUE_VITE_PACKAGE_MANAGER,
        scripts: {
          dev: 'vite',
          typecheck: 'vue-tsc --noEmit',
          test: 'vitest run',
          build: 'vue-tsc --noEmit && vite build',
          preview: 'vite preview',
        },
        dependencies: fields.dependencies,
        devDependencies: fields.devDependencies,
        peerDependencies:
          Object.keys(fields.peerDependencies).length > 0
            ? fields.peerDependencies
            : undefined,
      },
      null,
      2
    ),
    { language: 'json', mimeType: 'application/json' }
  );
};

/** Framework scaffold only; canonical Workspace/Data files are added separately. */
export const createVueViteScaffoldContributions = (
  context: ExportScaffoldContext
): ExportProgramContribution[] => [
  {
    entryFilePath: 'src/main.ts',
    files: [
      packageFile(context),
      textFile(
        'pnpm-workspace.yaml',
        'config',
        `allowBuilds:
  esbuild: true
`,
        { language: 'yaml', mimeType: 'application/yaml' }
      ),
      textFile(
        'index.html',
        'metadata',
        `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${context.projectName}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`,
        { language: 'html', mimeType: 'text/html' }
      ),
      textFile(
        'tsconfig.json',
        'config',
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              lib: ['ES2022', 'DOM', 'DOM.Iterable'],
              module: 'ESNext',
              moduleResolution: 'Bundler',
              strict: true,
              skipLibCheck: true,
              noEmit: true,
              types: ['vite/client'],
            },
            include: ['src/**/*.ts', 'src/**/*.vue'],
          },
          null,
          2
        ),
        { language: 'json', mimeType: 'application/json' }
      ),
      textFile(
        'vite.config.ts',
        'config',
        `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
});`,
        { language: 'ts', mimeType: 'text/typescript' }
      ),
      textFile(
        'src/prodivix-entry-surface.css',
        'stylesheet',
        createPirEntrySurfaceCss('vue'),
        { language: 'css', mimeType: 'text/css' }
      ),
      textFile(
        'src/main.ts',
        'source-module',
        `import { createApp } from 'vue';
import './prodivix-entry-surface.css';
import App from './App.vue';

createApp(App).mount('#app');`,
        {
          language: 'ts',
          mimeType: 'text/typescript',
          importMode: 'module',
        }
      ),
      textFile(
        'src/vue-env.d.ts',
        'source-module',
        `/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
`,
        { language: 'ts', mimeType: 'text/typescript' }
      ),
    ],
  },
];

const VUE_VITE_SOURCE_ROOT = 'src';

/**
 * Scaffold file paths are fixed by the entry chain, not by the project, so the
 * reservation list is read back from the scaffold with a placeholder context.
 */
const vueViteScaffoldPathProbeContext: ExportScaffoldContext = {
  projectName: 'prodivix-export',
  dependencies: [],
};

export const createVueViteExportPreset = (): ExportPlannerPreset => ({
  id: 'vue-vite',
  target: { framework: 'vue', preset: 'vite' },
  sourceRoot: VUE_VITE_SOURCE_ROOT,
  reservedPaths: collectScaffoldReservedPaths(
    createVueViteScaffoldContributions(vueViteScaffoldPathProbeContext),
    VUE_VITE_SOURCE_ROOT
  ),
  createScaffoldContributions: createVueViteScaffoldContributions,
  runtimeModuleFactories: DOMAIN_RUNTIME_MODULE_FACTORIES,
});
