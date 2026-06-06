import { compilePirToReactComponent } from './react/compileComponent';
import {
  createProjectReactBundle,
  createSingleFileBundle,
} from './react/projectScaffold';
import type {
  PirDocLike,
  ReactExportBundle,
  ReactGeneratorOptions,
} from './react/types';

type BundleFactory = (
  pirDoc: PirDocLike,
  options?: ReactGeneratorOptions
) => ReactExportBundle;

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
  const resourceType = options?.resourceType ?? 'project';
  const factory = bundleFactories[resourceType] ?? bundleFactories.project;
  return factory(pirDoc, options);
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

export type { ReactExportBundle } from './react/types';
