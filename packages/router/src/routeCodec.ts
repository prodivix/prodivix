import {
  composeRouteManifestWithModules,
  validateRouteManifest,
} from './routeCore';
import type {
  RouteModule,
  RouteModuleMount,
  WorkspaceRouteCodeReference,
  WorkspaceRouteManifest,
  WorkspaceRouteNode,
  WorkspaceRouteOutletBinding,
  WorkspaceRouteRuntime,
} from './routeTypes';

export class RouteManifestCodecError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'RouteManifestCodecError';
    this.path = path;
  }
}

/** Resolves a canonical Workspace document type for route-role validation. */
export type RouteDocumentTypeResolver = (
  documentId: string
) => string | undefined;

export type RouteManifestDecodeOptions = Readonly<{
  resolveDocumentType?: RouteDocumentTypeResolver;
  documentExists?: (documentId: string) => boolean;
}>;

export type RouteManifestDecodeInput =
  RouteManifestDecodeOptions | ((documentId: string) => boolean);

const ROUTE_MANIFEST_KEYS = new Set(['version', 'root', 'modules', 'mounts']);
const ROUTE_NODE_KEYS = new Set([
  'id',
  'segment',
  'index',
  'layoutDocId',
  'pageDocId',
  'outletNodeId',
  'outletBindings',
  'runtime',
  'children',
]);
const ROUTE_OUTLET_BINDING_KEYS = new Set(['outletNodeId', 'pageDocId']);
const ROUTE_RUNTIME_KEYS = new Set(['loaderRef', 'actionRef', 'guardRef']);
const ROUTE_CODE_REFERENCE_KEYS = new Set([
  'artifactId',
  'exportName',
  'symbolId',
]);
const ROUTE_MODULE_KEYS = new Set(['moduleId', 'version', 'root']);
const ROUTE_MOUNT_KEYS = new Set([
  'mountId',
  'moduleRef',
  'mountPath',
  'parentRouteNodeId',
]);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const requireRecord = (
  value: unknown,
  path: string
): Record<string, unknown> => {
  if (!isPlainRecord(value)) {
    throw new RouteManifestCodecError(path, 'Expected an object.');
  }
  return value;
};

const requireString = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RouteManifestCodecError(path, 'Expected a non-empty string.');
  }
  return value;
};

const requireCanonicalRouteString = (value: unknown, path: string): string => {
  const result = requireString(value, path);
  if (result !== result.trim()) {
    throw new RouteManifestCodecError(
      path,
      'Route identifiers must not have leading or trailing whitespace.'
    );
  }
  return result;
};

const optionalCanonicalRouteString = (
  value: unknown,
  path: string
): string | undefined =>
  value === undefined ? undefined : requireCanonicalRouteString(value, path);

const requireRouteSegmentString = (value: unknown, path: string): string => {
  if (typeof value !== 'string') {
    throw new RouteManifestCodecError(path, 'Expected a string.');
  }
  return value;
};

const toJsonPointerToken = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const assertAllowedKeys = (
  source: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  path: string
): void => {
  const unknownKey = Object.keys(source).find((key) => !allowedKeys.has(key));
  if (unknownKey) {
    throw new RouteManifestCodecError(
      `${path}/${toJsonPointerToken(unknownKey)}`,
      'Unknown route manifest field.'
    );
  }
};

const parseRouteCodeReference = (
  value: unknown,
  path: string
): WorkspaceRouteCodeReference => {
  const source = requireRecord(value, path);
  assertAllowedKeys(source, ROUTE_CODE_REFERENCE_KEYS, path);
  const exportName = optionalCanonicalRouteString(
    source.exportName,
    `${path}/exportName`
  );
  const symbolId = optionalCanonicalRouteString(
    source.symbolId,
    `${path}/symbolId`
  );
  return {
    artifactId: requireCanonicalRouteString(
      source.artifactId,
      `${path}/artifactId`
    ),
    ...(exportName !== undefined ? { exportName } : {}),
    ...(symbolId !== undefined ? { symbolId } : {}),
  };
};

const parseRouteRuntime = (
  value: unknown,
  path: string
): WorkspaceRouteRuntime => {
  const source = requireRecord(value, path);
  assertAllowedKeys(source, ROUTE_RUNTIME_KEYS, path);
  return {
    ...(source.loaderRef !== undefined
      ? {
          loaderRef: parseRouteCodeReference(
            source.loaderRef,
            `${path}/loaderRef`
          ),
        }
      : {}),
    ...(source.actionRef !== undefined
      ? {
          actionRef: parseRouteCodeReference(
            source.actionRef,
            `${path}/actionRef`
          ),
        }
      : {}),
    ...(source.guardRef !== undefined
      ? {
          guardRef: parseRouteCodeReference(
            source.guardRef,
            `${path}/guardRef`
          ),
        }
      : {}),
  };
};

const parseRouteOutletBindings = (
  value: unknown,
  path: string
): Record<string, WorkspaceRouteOutletBinding> => {
  const source = requireRecord(value, path);
  return Object.fromEntries(
    Object.entries(source).map(([name, rawBinding]) => {
      const bindingPath = `${path}/${toJsonPointerToken(name)}`;
      requireCanonicalRouteString(name, bindingPath);
      const binding = requireRecord(rawBinding, bindingPath);
      assertAllowedKeys(binding, ROUTE_OUTLET_BINDING_KEYS, bindingPath);
      const pageDocId = optionalCanonicalRouteString(
        binding.pageDocId,
        `${bindingPath}/pageDocId`
      );
      return [
        name,
        {
          outletNodeId: requireCanonicalRouteString(
            binding.outletNodeId,
            `${bindingPath}/outletNodeId`
          ),
          ...(pageDocId !== undefined ? { pageDocId } : {}),
        },
      ];
    })
  );
};

const parseRouteNode = (value: unknown, path: string): WorkspaceRouteNode => {
  const source = requireRecord(value, path);
  assertAllowedKeys(source, ROUTE_NODE_KEYS, path);
  if (source.index !== undefined && typeof source.index !== 'boolean') {
    throw new RouteManifestCodecError(`${path}/index`, 'Expected a boolean.');
  }
  if (source.children !== undefined && !Array.isArray(source.children)) {
    throw new RouteManifestCodecError(`${path}/children`, 'Expected an array.');
  }
  const layoutDocId = optionalCanonicalRouteString(
    source.layoutDocId,
    `${path}/layoutDocId`
  );
  const pageDocId = optionalCanonicalRouteString(
    source.pageDocId,
    `${path}/pageDocId`
  );
  const outletNodeId = optionalCanonicalRouteString(
    source.outletNodeId,
    `${path}/outletNodeId`
  );
  return {
    id: requireCanonicalRouteString(source.id, `${path}/id`),
    ...(source.segment !== undefined
      ? {
          segment: requireRouteSegmentString(source.segment, `${path}/segment`),
        }
      : {}),
    ...(source.index !== undefined ? { index: source.index as boolean } : {}),
    ...(layoutDocId !== undefined ? { layoutDocId } : {}),
    ...(pageDocId !== undefined ? { pageDocId } : {}),
    ...(outletNodeId !== undefined ? { outletNodeId } : {}),
    ...(source.outletBindings !== undefined
      ? {
          outletBindings: parseRouteOutletBindings(
            source.outletBindings,
            `${path}/outletBindings`
          ),
        }
      : {}),
    ...(source.runtime !== undefined
      ? { runtime: parseRouteRuntime(source.runtime, `${path}/runtime`) }
      : {}),
    ...(source.children !== undefined
      ? {
          children: (source.children as unknown[]).map((child, index) =>
            parseRouteNode(child, `${path}/children/${index}`)
          ),
        }
      : {}),
  };
};

const parseRouteModules = (
  value: unknown,
  path: string
): Record<string, RouteModule> => {
  const source = requireRecord(value, path);
  return Object.fromEntries(
    Object.entries(source).map(([key, rawModule]) => {
      const modulePath = `${path}/${toJsonPointerToken(key)}`;
      requireCanonicalRouteString(key, modulePath);
      const module = requireRecord(rawModule, modulePath);
      assertAllowedKeys(module, ROUTE_MODULE_KEYS, modulePath);
      const moduleId = requireCanonicalRouteString(
        module.moduleId,
        `${modulePath}/moduleId`
      );
      if (moduleId !== key) {
        throw new RouteManifestCodecError(
          `${modulePath}/moduleId`,
          'Route module key must match moduleId.'
        );
      }
      return [
        key,
        {
          moduleId,
          version: requireCanonicalRouteString(
            module.version,
            `${modulePath}/version`
          ),
          root: parseRouteNode(module.root, `${modulePath}/root`),
        },
      ];
    })
  );
};

const parseRouteMounts = (value: unknown, path: string): RouteModuleMount[] => {
  if (!Array.isArray(value)) {
    throw new RouteManifestCodecError(path, 'Expected an array.');
  }
  return value.map((rawMount, index) => {
    const mountPath = `${path}/${index}`;
    const mount = requireRecord(rawMount, mountPath);
    assertAllowedKeys(mount, ROUTE_MOUNT_KEYS, mountPath);
    const rawMountPath =
      mount.mountPath === undefined
        ? undefined
        : requireRouteSegmentString(mount.mountPath, `${mountPath}/mountPath`);
    const parentRouteNodeId = optionalCanonicalRouteString(
      mount.parentRouteNodeId,
      `${mountPath}/parentRouteNodeId`
    );
    return {
      mountId: requireCanonicalRouteString(
        mount.mountId,
        `${mountPath}/mountId`
      ),
      moduleRef: requireCanonicalRouteString(
        mount.moduleRef,
        `${mountPath}/moduleRef`
      ),
      ...(rawMountPath !== undefined ? { mountPath: rawMountPath } : {}),
      ...(parentRouteNodeId !== undefined ? { parentRouteNodeId } : {}),
    };
  });
};

const validateCanonicalRouteManifestStructure = (
  manifest: WorkspaceRouteManifest,
  options: RouteManifestDecodeOptions
): void => {
  if (manifest.root.id !== 'root') {
    throw new RouteManifestCodecError(
      '/routeManifest/root/id',
      'Route manifest root id must be root.'
    );
  }

  const routePathsById = new Map<string, string>();
  const validateDocumentReference = (
    documentId: string,
    path: string,
    allowedTypes: ReadonlySet<string>,
    role: string
  ): void => {
    const resolvedType = options.resolveDocumentType?.(documentId);
    const exists = options.resolveDocumentType
      ? resolvedType !== undefined
      : options.documentExists?.(documentId);
    if (exists === false) {
      throw new RouteManifestCodecError(
        path,
        `RTE-2001: Route ${role} references missing document ${documentId}.`
      );
    }
    if (resolvedType !== undefined && !allowedTypes.has(resolvedType)) {
      throw new RouteManifestCodecError(
        path,
        `Route ${role} must reference ${[...allowedTypes].join(' or ')}, received ${resolvedType}.`
      );
    }
  };
  const pageDocumentTypes: ReadonlySet<string> = new Set([
    'pir-page',
    'pir-component',
  ]);
  const layoutDocumentTypes: ReadonlySet<string> = new Set(['pir-layout']);
  const walk = (node: WorkspaceRouteNode, path: string): void => {
    const previousPath = routePathsById.get(node.id);
    if (previousPath) {
      throw new RouteManifestCodecError(
        `${path}/id`,
        `Route node id must be unique; first seen at ${previousPath}.`
      );
    }
    routePathsById.set(node.id, path);
    if (node.layoutDocId) {
      validateDocumentReference(
        node.layoutDocId,
        `${path}/layoutDocId`,
        layoutDocumentTypes,
        'layoutDocId'
      );
    }
    if (node.pageDocId) {
      validateDocumentReference(
        node.pageDocId,
        `${path}/pageDocId`,
        pageDocumentTypes,
        'pageDocId'
      );
    }
    Object.entries(node.outletBindings ?? {}).forEach(([name, binding]) => {
      if (binding.pageDocId) {
        validateDocumentReference(
          binding.pageDocId,
          `${path}/outletBindings/${toJsonPointerToken(name)}/pageDocId`,
          pageDocumentTypes,
          'outlet binding pageDocId'
        );
      }
    });
    (node.children ?? []).forEach((child, index) =>
      walk(child, `${path}/children/${index}`)
    );
  };

  walk(manifest.root, '/routeManifest/root');
  Object.keys(manifest.modules ?? {})
    .sort()
    .forEach((moduleId) => {
      walk(
        manifest.modules![moduleId].root,
        `/routeManifest/modules/${toJsonPointerToken(moduleId)}/root`
      );
    });

  const mountIds = new Set<string>();
  (manifest.mounts ?? []).forEach((mount, index) => {
    const path = `/routeManifest/mounts/${index}`;
    if (mountIds.has(mount.mountId)) {
      throw new RouteManifestCodecError(
        `${path}/mountId`,
        'Route module mountId must be unique.'
      );
    }
    mountIds.add(mount.mountId);
    if (!manifest.modules?.[mount.moduleRef]) {
      throw new RouteManifestCodecError(
        `${path}/moduleRef`,
        'Route module mount references a missing module.'
      );
    }
    if (
      mount.parentRouteNodeId !== undefined &&
      !routePathsById.has(mount.parentRouteNodeId)
    ) {
      throw new RouteManifestCodecError(
        `${path}/parentRouteNodeId`,
        'Route module mount parentRouteNodeId is missing.'
      );
    }
  });
};

/** Decodes the closed RouteManifest wire model and validates document roles when a resolver is provided. */
export const decodeRouteManifest = (
  value: unknown,
  input: RouteManifestDecodeInput = {}
): WorkspaceRouteManifest => {
  const options: RouteManifestDecodeOptions =
    typeof input === 'function' ? { documentExists: input } : input;
  const documentExists =
    options.documentExists ??
    (options.resolveDocumentType
      ? (documentId: string) =>
          options.resolveDocumentType?.(documentId) !== undefined
      : undefined);
  const source = requireRecord(value, '/routeManifest');
  assertAllowedKeys(source, ROUTE_MANIFEST_KEYS, '/routeManifest');
  const manifest: WorkspaceRouteManifest = {
    version: requireCanonicalRouteString(
      source.version,
      '/routeManifest/version'
    ),
    root: parseRouteNode(source.root, '/routeManifest/root'),
    ...(source.modules !== undefined
      ? { modules: parseRouteModules(source.modules, '/routeManifest/modules') }
      : {}),
    ...(source.mounts !== undefined
      ? { mounts: parseRouteMounts(source.mounts, '/routeManifest/mounts') }
      : {}),
  };
  validateCanonicalRouteManifestStructure(manifest, options);
  const issues = validateRouteManifest({ manifest, documentExists });
  if (issues.length) {
    throw new RouteManifestCodecError(
      '/routeManifest',
      issues.map((issue) => `${issue.code}: ${issue.message}`).join('; ')
    );
  }
  return manifest;
};

export const normalizeRouteManifest = decodeRouteManifest;

export const hasRouteNodeId = (
  node: WorkspaceRouteNode,
  nodeId: string
): boolean =>
  node.id === nodeId ||
  (node.children ?? []).some((child) => hasRouteNodeId(child, nodeId));

export const resolveDefaultActiveRouteNodeId = (
  manifest: WorkspaceRouteManifest
): string => manifest.root.children?.[0]?.id ?? manifest.root.id;

export const resolveActiveRouteNodeId = (
  manifest: WorkspaceRouteManifest,
  candidateIds: Array<string | undefined>
): string => {
  const composedManifest = composeRouteManifestWithModules(manifest).manifest;
  const candidate = candidateIds.find(
    (value) =>
      value?.trim() && hasRouteNodeId(composedManifest.root, value.trim())
  );
  return candidate?.trim() ?? resolveDefaultActiveRouteNodeId(composedManifest);
};
