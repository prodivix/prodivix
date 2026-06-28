import type {
  ExportDeploymentContribution,
  ExportDeploymentTarget,
  ExportFileContribution,
  ExportProgramContribution,
  ExportSourceTrace,
  StaticDeploymentTarget,
} from '#src/export/types';

export type StaticDeploymentPresetOptions = {
  target: StaticDeploymentTarget;
  basePath?: string;
  outputDirectory?: string;
};

const createDeploymentSourceTrace = (
  target: ExportDeploymentTarget,
  path: string
): ExportSourceTrace[] => [
  {
    sourceRef: {
      domain: 'deployment',
      id: `${target}:${path}`,
      path,
    },
  },
];

const createDeploymentFile = (
  target: ExportDeploymentTarget,
  path: string,
  contents: string,
  options: {
    language?: string;
    mimeType?: string;
  } = {}
): ExportFileContribution => ({
  id: `deployment:${target}:${path}`,
  desiredPath: path,
  baseDirectory: 'project-root',
  kind: 'deployment',
  language: options.language,
  mimeType: options.mimeType,
  importMode: 'copy-only',
  contents,
  sourceTrace: createDeploymentSourceTrace(target, path),
  origin: {
    kind: 'generated',
    owner: 'prodivix',
    label: `${target} deployment config`,
    writePolicy: 'generated',
    updatePolicy: 'regenerate',
  },
});

const normalizeBasePath = (basePath?: string) => {
  const trimmed = basePath?.trim() ?? '';
  if (!trimmed || trimmed === '/') return '/';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
};

const createStaticHostingDeployment = (
  options: StaticDeploymentPresetOptions
): ExportDeploymentContribution => {
  const outputDirectory = options.outputDirectory?.trim() || 'dist';
  const files: ExportFileContribution[] = [];

  if (options.target === 'vercel') {
    files.push(
      createDeploymentFile(
        options.target,
        'vercel.json',
        `${JSON.stringify(
          {
            outputDirectory,
            cleanUrls: true,
            trailingSlash: false,
            rewrites: [{ source: '/(.*)', destination: '/index.html' }],
          },
          null,
          2
        )}\n`,
        {
          language: 'json',
          mimeType: 'application/json',
        }
      )
    );
  }

  if (options.target === 'netlify') {
    files.push(
      createDeploymentFile(
        options.target,
        'netlify.toml',
        `[build]
  publish = "${outputDirectory}"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`,
        {
          language: 'toml',
          mimeType: 'application/toml',
        }
      )
    );
  }

  if (options.target === 'github-pages') {
    files.push(
      createDeploymentFile(options.target, '.nojekyll', '', {
        language: 'text',
        mimeType: 'text/plain',
      }),
      createDeploymentFile(
        options.target,
        '.prodivix/github-pages.json',
        `${JSON.stringify(
          {
            basePath: normalizeBasePath(options.basePath),
            outputDirectory,
          },
          null,
          2
        )}\n`,
        {
          language: 'json',
          mimeType: 'application/json',
        }
      )
    );
  }

  if (options.target === 'static-hosting') {
    files.push(
      createDeploymentFile(
        options.target,
        '.prodivix/static-hosting.json',
        `${JSON.stringify(
          {
            basePath: normalizeBasePath(options.basePath),
            outputDirectory,
            spaFallback: 'index.html',
          },
          null,
          2
        )}\n`,
        {
          language: 'json',
          mimeType: 'application/json',
        }
      )
    );
  }

  return {
    id: `deployment:${options.target}`,
    target: options.target,
    files,
    metadata: {
      deploymentTarget: options.target,
      basePath: normalizeBasePath(options.basePath),
      outputDirectory,
    },
  };
};

export const createStaticDeploymentExportContribution = (
  options: StaticDeploymentPresetOptions
): ExportProgramContribution => ({
  deployments: [createStaticHostingDeployment(options)],
});
