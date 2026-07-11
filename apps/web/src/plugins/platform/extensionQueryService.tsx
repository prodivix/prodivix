import { createElement, type ElementType } from 'react';
import type {
  ContributionRegistryReader,
  PluginOwnerRef,
} from '@prodivix/plugin-host';
import type {
  CodegenLibraryPolicy,
  CodegenPolicySnapshot,
  IconCodegenPolicy,
} from '@prodivix/prodivix-compiler';
import {
  createComponentRegistry,
  type ComponentRegistry,
} from '@/pir/renderer/registry';
import type {
  ExternalComponentMetadataProjection,
  RendererComponentProjection,
  WebContributionPointMap,
  WebExtensionQueryService,
  WebExtensionRegistrySnapshot,
} from '@/plugins/platform/types';
import { scopeOfficialPluginComponent } from '@/plugins/platform/officialSurfaceHost';

const createFallbackComponent = (
  runtimeType: string,
  behavior: 'placeholder' | 'omit' | 'error',
  message?: string
): ElementType => {
  if (behavior === 'omit') {
    const OmittedPluginComponent = () => null;
    OmittedPluginComponent.displayName = `Omitted(${runtimeType})`;
    return OmittedPluginComponent;
  }
  const PluginComponentFallback = () =>
    createElement(
      'span',
      {
        'data-plugin-render-fallback': runtimeType,
        'data-plugin-render-severity': behavior,
      },
      message ?? `${runtimeType} is unavailable in the canvas.`
    );
  PluginComponentFallback.displayName = `Fallback(${runtimeType})`;
  return PluginComponentFallback;
};

const isElementType = (value: unknown): value is ElementType =>
  typeof value === 'string' ||
  typeof value === 'function' ||
  (typeof value === 'object' && value !== null && '$$typeof' in value);

const ownerScopedLibraryKey = (owner: PluginOwnerRef, libraryId: string) =>
  `${owner.pluginId}\u0000${owner.installationId}\u0000${owner.generation}\u0000${libraryId}`;

const createRendererComponents = (
  reader: ContributionRegistryReader<WebContributionPointMap>
): readonly RendererComponentProjection[] => {
  const libraries = new Map(
    reader
      .list('externalLibrary')
      .map(
        (record) =>
          [
            ownerScopedLibraryKey(record.owner, record.value.libraryId),
            record.value,
          ] as const
      )
  );
  const components: RendererComponentProjection[] = [];
  reader.list('renderPolicy').forEach((record) => {
    const library = libraries.get(
      ownerScopedLibraryKey(record.owner, record.value.libraryId)
    );
    if (!library) return;
    record.value.rules.forEach((rule) => {
      const external = library.components.find(
        (component) =>
          component.runtimeType === rule.runtimeType &&
          component.exportName === rule.componentExport
      );
      if (!external?.component) return;
      const fallback = () =>
        createFallbackComponent(
          rule.runtimeType,
          rule.fallback.behavior,
          rule.fallback.message
        );
      let component: ElementType = external.component;
      if (rule.portalMode === 'disabled') {
        component = fallback();
      } else if (rule.wrapComponent) {
        try {
          const wrapped = rule.wrapComponent(external.component);
          component = isElementType(wrapped) ? wrapped : fallback();
        } catch {
          component = fallback();
        }
      }
      components.push(
        Object.freeze({
          owner: record.owner,
          contributionId: record.identity.contributionId,
          libraryId: library.libraryId,
          runtimeType: rule.runtimeType,
          component: scopeOfficialPluginComponent(record.owner, component),
          adapter: rule.adapter,
        })
      );
    });
  });
  return Object.freeze(components);
};

const createExternalComponentMetadata = (
  reader: ContributionRegistryReader<WebContributionPointMap>
): ReadonlyMap<string, ExternalComponentMetadataProjection> => {
  const components = new Map<string, ExternalComponentMetadataProjection>();
  reader.list('externalLibrary').forEach((record) => {
    record.value.descriptor.components.forEach((component) => {
      components.set(
        component.runtimeType,
        Object.freeze({
          owner: record.owner,
          contributionId: record.identity.contributionId,
          libraryId: record.value.libraryId,
          componentName: component.componentName,
          runtimeType: component.runtimeType,
          props: Object.freeze(
            (component.props ?? []).map((prop) => Object.freeze({ ...prop }))
          ),
        })
      );
    });
  });
  return components;
};

const sourceFromRecord = (record: {
  identity: Readonly<{ pluginId: string; contributionId: string }>;
  owner: Readonly<{ generation: number }>;
}) =>
  Object.freeze({
    pluginId: record.identity.pluginId,
    contributionId: record.identity.contributionId,
    generation: record.owner.generation,
  });

const createCodegenSnapshot = (
  reader: ContributionRegistryReader<WebContributionPointMap>
): CodegenPolicySnapshot => {
  const libraries = new Map(
    reader
      .list('externalLibrary')
      .map(
        (record) =>
          [
            ownerScopedLibraryKey(record.owner, record.value.libraryId),
            record.value,
          ] as const
      )
  );
  const policies = reader
    .list('codegenPolicy')
    .flatMap((record): readonly CodegenLibraryPolicy[] => {
      const library = libraries.get(
        ownerScopedLibraryKey(record.owner, record.value.libraryId)
      );
      if (!library) return [];
      const descriptor = record.value.descriptor;
      return [
        Object.freeze({
          source: sourceFromRecord(record),
          libraryId: descriptor.libraryId,
          runtimeTypes: Object.freeze(
            library.components.map((component) => component.runtimeType)
          ),
          dependencies: descriptor.dependencies,
          rules: descriptor.rules,
          unsupported: descriptor.unsupported,
        }),
      ];
    });
  const iconProviders = reader
    .list('iconProvider')
    .map((record): IconCodegenPolicy =>
      Object.freeze({
        source: sourceFromRecord(record),
        providerId: record.value.providerId,
        package: record.value.descriptor.package,
        exports: record.value.descriptor.exports,
        normalization: record.value.descriptor.normalization,
        render: record.value.descriptor.render,
        codegen: record.value.descriptor.codegen,
        limits: record.value.descriptor.limits,
      })
    );
  return Object.freeze({
    schemaVersion: '1.0',
    registryRevision: reader.getRevision(),
    targetPreset: 'react-vite',
    libraries: Object.freeze(policies),
    iconProviders: Object.freeze(iconProviders),
  });
};

const createSnapshot = (
  reader: ContributionRegistryReader<WebContributionPointMap>
): WebExtensionRegistrySnapshot =>
  Object.freeze({
    revision: reader.getRevision(),
    externalLibraries: Object.freeze(
      reader.list('externalLibrary').map((record) => record.value)
    ),
    externalComponentsByRuntimeType: createExternalComponentMetadata(reader),
    rendererComponents: createRendererComponents(reader),
    iconProviders: Object.freeze(
      reader.list('iconProvider').map((record) => record.value)
    ),
    codegenPolicy: createCodegenSnapshot(reader),
  });

export const createWebExtensionQueryService = (
  reader: ContributionRegistryReader<WebContributionPointMap>
): WebExtensionQueryService => {
  let cached: WebExtensionRegistrySnapshot | undefined;
  const getSnapshot = () => {
    const revision = reader.getRevision();
    if (cached?.revision === revision) return cached;
    cached = createSnapshot(reader);
    return cached;
  };
  return Object.freeze({
    getSnapshot,
    subscribe: (listener) => {
      const subscription = reader.subscribe(() => {
        cached = undefined;
        listener();
      });
      return () => subscription.dispose();
    },
  });
};

export const createRendererProjectionRegistry = (
  snapshot: WebExtensionRegistrySnapshot
): ComponentRegistry => {
  const registry = createComponentRegistry();
  snapshot.rendererComponents.forEach((projection) => {
    registry.register(
      projection.runtimeType,
      projection.component,
      projection.adapter
    );
  });
  return registry;
};
