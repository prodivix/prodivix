import type { ReactComponentCompileResult, ReactExportBundle } from './types';
import webPackageJson from '../../../../package.json';
import rootPackageJson from '../../../../../../package.json';
import sharedPackageJson from '@prodivix/shared/package.json';
import themesPackageJson from '@prodivix/themes/package.json';
import uiPackageJson from '@prodivix/ui/package.json';

const readDependencyVersion = (
  manifest: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  },
  packageName: string
) =>
  manifest.dependencies?.[packageName] ??
  manifest.devDependencies?.[packageName] ??
  manifest.peerDependencies?.[packageName] ??
  'latest';

export const REACT_PROJECT_SCAFFOLD_PRESET = {
  packageManager: rootPackageJson.packageManager,
  dependencies: {
    react: readDependencyVersion(webPackageJson, 'react'),
    'react-dom': readDependencyVersion(webPackageJson, 'react-dom'),
  },
  devDependencies: {
    typescript: readDependencyVersion(webPackageJson, 'typescript'),
    vite: readDependencyVersion(uiPackageJson, 'vite'),
    '@vitejs/plugin-react': readDependencyVersion(
      webPackageJson,
      '@vitejs/plugin-react'
    ),
    '@types/react': readDependencyVersion(webPackageJson, '@types/react'),
    '@types/react-dom': readDependencyVersion(
      webPackageJson,
      '@types/react-dom'
    ),
  },
} as const;

export const REACT_PRODIVIX_PACKAGE_VERSIONS = {
  '@prodivix/shared': sharedPackageJson.version,
  '@prodivix/themes': themesPackageJson.version,
  '@prodivix/ui': uiPackageJson.version,
} as const;

export const createProjectReactBundle = (
  compiled: ReactComponentCompileResult
): ReactExportBundle => ({
  type: 'project',
  entryFilePath: 'src/App.tsx',
  diagnostics: compiled.diagnostics,
  files: [
    {
      path: 'package.json',
      language: 'json',
      content: JSON.stringify(
        {
          name: compiled.componentName.toLowerCase(),
          private: true,
          version: '0.1.0',
          type: 'module',
          packageManager: REACT_PROJECT_SCAFFOLD_PRESET.packageManager,
          scripts: {
            dev: 'vite',
            build: 'tsc -b && vite build',
            preview: 'vite preview',
          },
          dependencies: {
            ...compiled.dependencies,
            ...REACT_PROJECT_SCAFFOLD_PRESET.dependencies,
          },
          devDependencies: REACT_PROJECT_SCAFFOLD_PRESET.devDependencies,
        },
        null,
        2
      ),
    },
    {
      path: 'pnpm-workspace.yaml',
      language: 'yaml',
      content: `onlyBuiltDependencies:
  - esbuild
`,
    },
    {
      path: 'index.html',
      language: 'html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${compiled.componentName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
    },
    {
      path: 'tsconfig.json',
      language: 'json',
      content: JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2020',
            lib: ['ES2020', 'DOM', 'DOM.Iterable'],
            module: 'ESNext',
            moduleResolution: 'Bundler',
            jsx: 'react-jsx',
            strict: true,
            skipLibCheck: true,
            noEmit: true,
          },
          include: ['src'],
        },
        null,
        2
      ),
    },
    {
      path: 'vite.config.ts',
      language: 'typescript',
      content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});`,
    },
    {
      path: 'src/main.tsx',
      language: 'typescript',
      content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
    },
    {
      path: 'src/vite-env.d.ts',
      language: 'typescript',
      content: `/// <reference types="vite/client" />
`,
    },
    {
      path: 'src/App.tsx',
      language: 'typescript',
      content: compiled.code,
    },
    ...compiled.mountedCssFiles.map((file) => ({
      path: `src/${file.path}`,
      language: 'css' as const,
      content: file.content,
    })),
  ],
});

export const createSingleFileBundle = (
  compiled: ReactComponentCompileResult,
  type: 'component' | 'nodegraph'
): ReactExportBundle => ({
  type,
  entryFilePath: `${compiled.componentName}.tsx`,
  diagnostics: compiled.diagnostics,
  files: [
    {
      path: `${compiled.componentName}.tsx`,
      language: 'typescript',
      content: compiled.code,
    },
    ...compiled.mountedCssFiles.map((file) => ({
      path: file.path,
      language: 'css' as const,
      content: file.content,
    })),
  ],
});
