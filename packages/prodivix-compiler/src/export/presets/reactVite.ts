import { exportDependenciesToPackageFields } from '#src/export/dependencyPlanner';
import type {
  ExportFileContribution,
  ExportPlannerPreset,
  ExportProgramContribution,
  ExportRuntimeModuleFactory,
  ExportScaffoldContext,
  ExportSourceTrace,
} from '#src/export/types';

export const REACT_VITE_PACKAGE_MANAGER = 'pnpm@10.28.1';

export const REACT_VITE_DEPENDENCIES = {
  react: '^19.2.0',
  'react-dom': '^19.2.0',
} as const;

export const REACT_VITE_DEV_DEPENDENCIES = {
  typescript: '~5.9.3',
  vite: '^7.3.0',
  '@vitejs/plugin-react': '^5.1.2',
  '@types/react': '^19.2.2',
  '@types/react-dom': '^19.2.2',
} as const;

const createSourceTrace = (path: string): ExportSourceTrace[] => [
  {
    sourceRef: {
      domain: 'scaffold',
      id: path,
      path,
    },
  },
];

const normalizePackageName = (name: string) => {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 214);
  return normalized || 'prodivix-export';
};

const createTextFileContribution = (
  path: string,
  kind: ExportFileContribution['kind'],
  contents: string,
  options: {
    language?: string;
    mimeType?: string;
    importMode?: ExportFileContribution['importMode'];
  } = {}
): ExportFileContribution => ({
  id: `scaffold:${path}`,
  desiredPath: path,
  kind,
  contents,
  language: options.language,
  mimeType: options.mimeType,
  importMode: options.importMode ?? 'copy-only',
  sourceTrace: createSourceTrace(path),
  origin: {
    kind: 'generated',
    owner: 'prodivix',
    writePolicy: 'generated',
    updatePolicy: 'regenerate',
  },
});

const createReactVitePackageJson = (
  context: ExportScaffoldContext
): ExportFileContribution => {
  const packageFields = exportDependenciesToPackageFields(context.dependencies);
  return createTextFileContribution(
    'package.json',
    'metadata',
    JSON.stringify(
      {
        name: normalizePackageName(context.projectName),
        private: true,
        version: '0.1.0',
        type: 'module',
        packageManager: context.packageManager ?? REACT_VITE_PACKAGE_MANAGER,
        scripts: {
          dev: 'vite',
          build: 'tsc -b && vite build',
          preview: 'vite preview',
        },
        dependencies: packageFields.dependencies,
        devDependencies: packageFields.devDependencies,
        peerDependencies:
          Object.keys(packageFields.peerDependencies).length > 0
            ? packageFields.peerDependencies
            : undefined,
      },
      null,
      2
    ),
    {
      language: 'json',
      mimeType: 'application/json',
    }
  );
};

export const createReactViteScaffoldContributions = (
  context: ExportScaffoldContext
): ExportProgramContribution[] => [
  {
    files: [
      createReactVitePackageJson(context),
      createTextFileContribution(
        'pnpm-workspace.yaml',
        'config',
        `onlyBuiltDependencies:
  - esbuild
`,
        {
          language: 'yaml',
          mimeType: 'application/yaml',
        }
      ),
      createTextFileContribution(
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
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
        {
          language: 'html',
          mimeType: 'text/html',
        }
      ),
      createTextFileContribution(
        'tsconfig.json',
        'config',
        JSON.stringify(
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
        {
          language: 'json',
          mimeType: 'application/json',
        }
      ),
      createTextFileContribution(
        'vite.config.ts',
        'config',
        `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});`,
        {
          language: 'ts',
          mimeType: 'text/typescript',
        }
      ),
      createTextFileContribution(
        'src/main.tsx',
        'source-module',
        `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
        {
          language: 'tsx',
          mimeType: 'text/typescript',
          importMode: 'module',
        }
      ),
      createTextFileContribution(
        'src/vite-env.d.ts',
        'source-module',
        `/// <reference types="vite/client" />
`,
        {
          language: 'ts',
          mimeType: 'text/typescript',
        }
      ),
    ],
  },
];

const createRuntimeModuleFactory = (
  kind: 'nodegraph-runtime' | 'animation-runtime',
  suggestedName: string,
  body: string
): ExportRuntimeModuleFactory => {
  return (requirement) => ({
    id: `runtime:${kind}`,
    kind: 'runtime-helper',
    suggestedName,
    language: 'ts',
    imports: [],
    body,
    sourceTrace: requirement.sourceTrace,
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  });
};

const reactViteRuntimeModuleFactories = {
  'nodegraph-runtime': createRuntimeModuleFactory(
    'nodegraph-runtime',
    'nodegraph-runtime',
    `export type NodeGraphInput = Record<string, unknown>;
export type NodeGraphOutput = unknown;
export type NodeGraphDefinition = Record<string, unknown>;

export type NodeGraphExecutionOptions = {
  signal?: AbortSignal;
  services?: Record<string, unknown>;
};

export type NodeGraphExecutionContext = NodeGraphExecutionOptions & {
  input: NodeGraphInput;
  definition: NodeGraphDefinition;
};

export type NodeGraphExecutor = (
  input: NodeGraphInput,
  options?: NodeGraphExecutionOptions
) => Promise<NodeGraphOutput>;

export const createNodeGraphExecutor = (
  definition: NodeGraphDefinition,
  executor?: (context: NodeGraphExecutionContext) => NodeGraphOutput | Promise<NodeGraphOutput>
): NodeGraphExecutor => async (input, options = {}) => {
  if (!executor) return { input, definition };
  return executor({
    ...options,
    input,
    definition,
  });
};`
  ),
  'animation-runtime': createRuntimeModuleFactory(
    'animation-runtime',
    'animation-runtime',
    `export type AnimationHandle = {
  play(): void;
  pause(): void;
  cancel(): void;
};

export const createAnimationHandle = (animation: Animation): AnimationHandle => {
  return {
    play: () => animation.play(),
    pause: () => animation.pause(),
    cancel: () => animation.cancel(),
  };
};`
  ),
};

export const createReactViteExportPreset = (): ExportPlannerPreset => ({
  id: 'react-vite',
  target: {
    framework: 'react',
    preset: 'vite',
  },
  sourceRoot: 'src',
  createScaffoldContributions: createReactViteScaffoldContributions,
  runtimeModuleFactories: reactViteRuntimeModuleFactories,
});
