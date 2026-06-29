import { compileAnimationExportContributions } from '#src/animation/compileAnimation';
import { compileNodeGraphExportContributions } from '#src/nodegraph/compileNodeGraph';
import { compilePirToReactComponent } from '#src/react/compileComponent';
import {
  createContributionBundle,
  createProjectReactBundle,
  createSingleFileBundle,
  REACT_PRODIVIX_PACKAGE_VERSIONS,
} from '#src/react/projectScaffold';
import type {
  ExportResourceType,
  PirDocLike,
  ReactExportBundle,
  ReactGeneratorOptions,
} from '#src/react/types';

type BundleFactory = (
  pirDoc: PirDocLike,
  options?: ReactGeneratorOptions
) => ReactExportBundle;

const resolveGeneratorOptions = (
  options?: ReactGeneratorOptions
): ReactGeneratorOptions => ({
  ...options,
  packageResolver: {
    ...options?.packageResolver,
    packageVersions: {
      ...REACT_PRODIVIX_PACKAGE_VERSIONS,
      ...options?.packageResolver?.packageVersions,
    },
  },
});

const createSingleResourceBundle =
  (type: Exclude<ExportResourceType, 'project'>) =>
  (pirDoc: PirDocLike, options?: ReactGeneratorOptions) =>
    createSingleFileBundle(
      compilePirToReactComponent(pirDoc, {
        ...options,
        includeWorkspaceCodeArtifacts:
          options?.includeWorkspaceCodeArtifacts ?? false,
        exportContributions: options?.exportContributions,
      }),
      type
    );

const bundleFactories: Record<ExportResourceType, BundleFactory> = {
  project: (pirDoc, options) =>
    createProjectReactBundle(
      compilePirToReactComponent(pirDoc, {
        componentName: options?.componentName || 'App',
        adapter: options?.adapter,
        packageResolver: options?.packageResolver,
        codeArtifacts: options?.codeArtifacts,
        includeWorkspaceCodeArtifacts:
          options?.includeWorkspaceCodeArtifacts ?? true,
        exportContributions: [
          ...compileNodeGraphExportContributions(pirDoc),
          ...compileAnimationExportContributions(pirDoc),
          ...(options?.exportContributions ?? []),
        ],
      })
    ),
  component: createSingleResourceBundle('component'),
  page: createSingleResourceBundle('page'),
  route: createSingleResourceBundle('route'),
  nodegraph: (pirDoc, options) =>
    createContributionBundle(
      [
        ...compileNodeGraphExportContributions(pirDoc),
        ...(options?.exportContributions ?? []),
      ],
      'nodegraph',
      'nodegraph.ts'
    ),
  animation: (pirDoc, options) =>
    createContributionBundle(
      [
        ...compileAnimationExportContributions(pirDoc),
        ...(options?.exportContributions ?? []),
      ],
      'animation',
      'animation.ts'
    ),
};

export const generateReactBundle = (
  pirDoc: PirDocLike,
  options?: ReactGeneratorOptions
): ReactExportBundle => {
  const resolvedOptions = resolveGeneratorOptions(options);
  const resourceType = resolvedOptions.resourceType ?? 'project';
  const factory = bundleFactories[resourceType] ?? bundleFactories.project;
  return factory(pirDoc, resolvedOptions);
};

export const generateReactCode = (
  pirDoc: PirDocLike,
  options?: ReactGeneratorOptions
) => {
  const bundle = generateReactBundle(pirDoc, options);
  return (
    bundle.files.find((file) => file.path === bundle.entryFilePath)?.contents ??
    ''
  );
};

export type { ReactExportBundle } from '#src/react/types';
