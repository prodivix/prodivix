import type { ReactComponentCompileResult, ReactExportBundle } from './types';

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
          scripts: {
            dev: 'vite',
            build: 'tsc -b && vite build',
            preview: 'vite preview',
          },
          dependencies: {
            react: '^18.3.1',
            'react-dom': '^18.3.1',
            ...compiled.dependencies,
          },
          devDependencies: {
            typescript: '^5.6.3',
            vite: '^5.4.10',
            '@vitejs/plugin-react': '^4.3.3',
            '@types/react': '^18.3.12',
            '@types/react-dom': '^18.3.1',
          },
        },
        null,
        2
      ),
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
