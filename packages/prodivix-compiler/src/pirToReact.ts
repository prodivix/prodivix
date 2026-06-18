import { compilePirToReactComponent } from '#src/react/compileComponent';
import {
  createProjectReactBundle,
  createSingleFileBundle,
  REACT_PRODIVIX_PACKAGE_VERSIONS,
} from '#src/react/projectScaffold';
import type {
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

const bundleFactories: Record<string, BundleFactory> = {
  project: (pirDoc, options) =>
    createProjectReactBundle(
      compilePirToReactComponent(pirDoc, {
        componentName: options?.componentName || 'App',
        adapter: options?.adapter,
        packageResolver: options?.packageResolver,
        codeArtifacts: options?.codeArtifacts,
      })
    ),
  component: (pirDoc, options) =>
    createSingleFileBundle(
      compilePirToReactComponent(pirDoc, options),
      'component'
    ),
  nodegraph: (pirDoc, options) =>
    createSingleFileBundle(
      compilePirToReactComponent(pirDoc, options),
      'nodegraph'
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
    bundle.files.find((file) => file.path === bundle.entryFilePath)?.content ??
    ''
  );
};

export type { ReactExportBundle } from '#src/react/types';
