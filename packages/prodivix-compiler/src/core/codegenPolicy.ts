import type {
  AdapterImportKind,
  AdapterResolution,
  TargetAdapter,
} from '#src/core/adapter';
import type { CanonicalNode } from '#src/core/canonicalIR';
import {
  isIconPolicyExportIdentifier,
  normalizeIconPolicyExport,
} from '@prodivix/shared';

export type CodegenPolicySource = Readonly<{
  pluginId: string;
  contributionId: string;
  generation: number;
}>;

export type CodegenPolicyDependency = Readonly<{
  name: string;
  version: string;
  kind: 'dependency' | 'peerDependency';
  license: string;
}>;

export type CodegenPolicyPropsTransform = Readonly<{
  defaults?: Readonly<Record<string, unknown>>;
  rename?: readonly Readonly<{ from: string; to: string }>[];
  omit?: readonly string[];
}>;

export type CodegenPolicyChildren =
  | Readonly<{
      mode: 'preserve' | 'text-only' | 'children-only' | 'none';
    }>
  | Readonly<{ mode: 'text-prop'; prop: string }>;

export type CodegenPolicyRule = Readonly<{
  id: string;
  runtimeType: string;
  elementPath: readonly string[];
  import: Readonly<{
    packageName: string;
    subpath?: string;
    kind: AdapterImportKind;
    imported: string;
    local?: string;
  }>;
  props?: CodegenPolicyPropsTransform;
  children: CodegenPolicyChildren;
}>;

export type CodegenLibraryPolicy = Readonly<{
  source: CodegenPolicySource;
  libraryId: string;
  runtimeTypes: readonly string[];
  dependencies: readonly CodegenPolicyDependency[];
  rules: readonly CodegenPolicyRule[];
  unsupported: Readonly<{
    behavior: 'passthrough' | 'warning' | 'error';
    message?: string;
  }>;
}>;

export type IconCodegenPolicy = Readonly<{
  source: CodegenPolicySource;
  providerId: string;
  package: Readonly<{
    name: string;
    version: string;
    license: string;
  }>;
  exports: Readonly<{
    strategy: 'named-exports' | 'default-icon-subpath';
    subpath?: string;
    exportPrefix?: string;
    exportSuffix?: string;
    variants?: readonly Readonly<{
      id: string;
      subpath?: string;
      exportSuffix?: string;
    }>[];
  }>;
  normalization: Readonly<{
    inputCase: 'preserve' | 'kebab' | 'pascal';
    exportCase: 'preserve' | 'kebab' | 'pascal';
    stripSuffix?: string;
    defaultVariant?: string;
    aliases?: readonly Readonly<{ from: string; to: string }>[];
  }>;
  render: Readonly<{
    size:
      | Readonly<{ mode: 'prop'; prop: string }>
      | Readonly<{ mode: 'style-font-size' | 'style-box' }>;
    colorProp?: string;
  }>;
  codegen: Readonly<{
    importKind: 'default' | 'named';
    sourceMode: 'package' | 'icon-subpath';
  }>;
  limits: Readonly<{
    maxIcons: number;
    maxNameLength: number;
    maxResponseBytes: number;
    maxCacheEntries: number;
  }>;
}>;

export type CodegenPolicySnapshot = Readonly<{
  schemaVersion: '1.0';
  registryRevision: number;
  targetPreset: 'react-vite';
  libraries: readonly CodegenLibraryPolicy[];
  iconProviders: readonly IconCodegenPolicy[];
}>;

type StaticIconRef = Readonly<{
  provider: string;
  name: string;
  variant?: string;
}>;

const readStaticIconRef = (value: unknown): StaticIconRef | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  const provider =
    typeof record.provider === 'string' ? record.provider.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!provider || !name) return;
  return {
    provider,
    name,
    ...(typeof record.variant === 'string' ? { variant: record.variant } : {}),
  };
};

const joinPackageSource = (packageName: string, ...segments: unknown[]) => {
  const suffix = segments
    .filter((segment): segment is string =>
      Boolean(typeof segment === 'string' && segment.trim())
    )
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return suffix ? `${packageName}/${suffix}` : packageName;
};

const applyPropsTransform = (
  node: CanonicalNode,
  transform: CodegenPolicyPropsTransform | undefined
) => {
  if (!transform) return { ...node.props };
  const props: Record<string, unknown> = {
    ...(transform.defaults ?? {}),
    ...node.props,
  };
  transform.rename?.forEach(({ from, to }) => {
    if (!Object.prototype.hasOwnProperty.call(props, from)) return;
    if (!Object.prototype.hasOwnProperty.call(props, to)) {
      props[to] = props[from];
    }
    delete props[from];
  });
  transform.omit?.forEach((property) => delete props[property]);
  return props;
};

const resolveChildren = (
  node: CanonicalNode,
  policy: CodegenPolicyChildren,
  props: Record<string, unknown>
): Pick<AdapterResolution, 'props' | 'textMode' | 'childrenMode'> => {
  delete props.children;
  if (policy.mode === 'text-prop') {
    if (
      node.text !== undefined &&
      !Object.prototype.hasOwnProperty.call(props, policy.prop)
    ) {
      props[policy.prop] = node.text;
    }
    return { props, textMode: 'omit', childrenMode: 'omit' };
  }
  if (policy.mode === 'text-only') {
    return { props, childrenMode: 'omit' };
  }
  if (policy.mode === 'children-only') {
    return { props, textMode: 'omit' };
  }
  if (policy.mode === 'none') {
    return { props, textMode: 'omit', childrenMode: 'omit' };
  }
  return { props };
};

const resolveLibraryRule = (
  node: CanonicalNode,
  rule: CodegenPolicyRule
): AdapterResolution => {
  const local = rule.import.local ?? rule.import.imported;
  const props = applyPropsTransform(node, rule.props);
  return {
    element: rule.elementPath.join('.'),
    imports: [
      {
        source: joinPackageSource(rule.import.packageName, rule.import.subpath),
        kind: rule.import.kind,
        imported: rule.import.imported,
        ...(local === rule.import.imported ? {} : { local }),
      },
    ],
    ...resolveChildren(node, rule.children, props),
  };
};

const resolveIconPolicy = (
  node: CanonicalNode,
  policy: IconCodegenPolicy,
  iconRef: StaticIconRef,
  fallback: TargetAdapter
): AdapterResolution => {
  const { symbol, variant } = normalizeIconPolicyExport({
    name: iconRef.name,
    variant: iconRef.variant,
    normalization: policy.normalization,
    exports: policy.exports,
  });
  if (
    iconRef.name.length > policy.limits.maxNameLength ||
    !isIconPolicyExportIdentifier(symbol) ||
    (iconRef.variant !== undefined && variant === undefined)
  ) {
    const resolved = fallback.resolveNode(node);
    return {
      ...resolved,
      diagnostics: [
        ...(resolved.diagnostics ?? []),
        {
          code: 'CODEGEN_POLICY_INVALID_ICON_EXPORT',
          severity: 'error',
          source: 'adapter',
          message: `Icon reference ${JSON.stringify(iconRef.name)} cannot be mapped to a safe export for provider ${JSON.stringify(policy.providerId)}.`,
          path: node.path,
          suggestion:
            'Choose an icon name and variant declared by the installed Icon Provider.',
        },
      ],
    };
  }
  const source =
    policy.codegen.sourceMode === 'icon-subpath'
      ? joinPackageSource(
          policy.package.name,
          policy.exports.subpath,
          variant?.subpath,
          symbol
        )
      : joinPackageSource(
          policy.package.name,
          policy.exports.subpath,
          variant?.subpath
        );
  const props = { ...node.props };
  delete props.iconRef;
  const style = { ...node.style };
  const size = props.size;
  if (size !== undefined) {
    if (policy.render.size.mode === 'prop') {
      if (policy.render.size.prop !== 'size') {
        props[policy.render.size.prop] = size;
        delete props.size;
      }
    } else {
      delete props.size;
      if (policy.render.size.mode === 'style-box') {
        style.width = size;
        style.height = size;
      } else {
        style.fontSize = size;
      }
    }
  }
  if (
    policy.render.colorProp &&
    policy.render.colorProp !== 'color' &&
    Object.prototype.hasOwnProperty.call(props, 'color')
  ) {
    props[policy.render.colorProp] = props.color;
    delete props.color;
  }
  return {
    element: symbol,
    imports: [
      {
        source,
        kind: policy.codegen.importKind,
        imported: symbol,
      },
    ],
    props,
    style,
    textMode: 'omit',
    childrenMode: 'omit',
  };
};

type PolicyPackageCoordinate = Readonly<{
  version: string;
  license: string;
}>;

const collectPolicyPackages = (snapshot: CodegenPolicySnapshot) => {
  const packages = new Map<string, PolicyPackageCoordinate>();
  const conflicts = new Set<string>();
  const add = (name: string, coordinate: PolicyPackageCoordinate) => {
    const current = packages.get(name);
    if (!current) {
      packages.set(name, coordinate);
      return;
    }
    if (
      current.version !== coordinate.version ||
      current.license !== coordinate.license
    ) {
      conflicts.add(name);
    }
  };
  snapshot.libraries.forEach((policy) => {
    policy.dependencies.forEach((dependency) =>
      add(dependency.name, dependency)
    );
  });
  snapshot.iconProviders.forEach((policy) =>
    add(policy.package.name, policy.package)
  );
  return { packages, conflicts };
};

export const getCodegenPolicyDependenciesForUsage = (
  snapshot: CodegenPolicySnapshot,
  usage: Readonly<{
    runtimeTypes: readonly string[];
    iconProviderIds: readonly string[];
  }>
): readonly CodegenPolicyDependency[] => {
  const runtimeTypes = new Set(
    usage.runtimeTypes.map((runtimeType) => runtimeType.trim()).filter(Boolean)
  );
  const iconProviderIds = new Set(
    usage.iconProviderIds.map((providerId) => providerId.trim()).filter(Boolean)
  );
  const iconOwnerPluginIds = new Set(
    snapshot.iconProviders
      .filter((policy) => iconProviderIds.has(policy.providerId))
      .map((policy) => policy.source.pluginId)
  );
  const dependencies = new Map<string, CodegenPolicyDependency>();
  snapshot.libraries.forEach((policy) => {
    const used =
      policy.runtimeTypes.some((runtimeType) =>
        runtimeTypes.has(runtimeType)
      ) || iconOwnerPluginIds.has(policy.source.pluginId);
    if (!used) return;
    policy.dependencies.forEach((dependency) => {
      if (!dependencies.has(dependency.name)) {
        dependencies.set(dependency.name, Object.freeze({ ...dependency }));
      }
    });
  });
  return Object.freeze(
    [...dependencies.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    )
  );
};

const appendPackageConflict = (
  node: CanonicalNode,
  resolution: AdapterResolution,
  packageName: string
): AdapterResolution => ({
  ...resolution,
  diagnostics: [
    ...(resolution.diagnostics ?? []),
    {
      code: 'CODEGEN_POLICY_PACKAGE_CONFLICT',
      severity: 'error',
      source: 'adapter',
      message: `Installed Codegen Policies declare conflicting exact coordinates for package ${JSON.stringify(packageName)}.`,
      path: node.path,
      suggestion:
        'Install compatible plugin versions before exporting this component.',
    },
  ],
});

const appendPackageConflicts = (
  node: CanonicalNode,
  resolution: AdapterResolution,
  packageNames: readonly string[],
  conflicts: ReadonlySet<string>
) =>
  [...new Set(packageNames)]
    .filter((packageName) => conflicts.has(packageName))
    .reduce(
      (current, packageName) =>
        appendPackageConflict(node, current, packageName),
      resolution
    );

export const createCodegenPolicyTargetAdapter = (
  snapshot: CodegenPolicySnapshot,
  fallback: TargetAdapter
): TargetAdapter => {
  const rules = new Map<string, CodegenPolicyRule>();
  const policiesByRuntimeType = new Map<string, CodegenLibraryPolicy>();
  snapshot.libraries.forEach((policy) => {
    policy.runtimeTypes.forEach((runtimeType) => {
      if (!policiesByRuntimeType.has(runtimeType)) {
        policiesByRuntimeType.set(runtimeType, policy);
      }
    });
    policy.rules.forEach((rule) => {
      if (!rules.has(rule.runtimeType)) rules.set(rule.runtimeType, rule);
    });
  });
  const iconProviders = new Map(
    snapshot.iconProviders.map((policy) => [policy.providerId, policy])
  );
  const { conflicts: packageConflicts } = collectPolicyPackages(snapshot);

  const adapter: TargetAdapter = {
    id: `react-policy-snapshot:${snapshot.registryRevision}`,
    resolveNode: (node: CanonicalNode): AdapterResolution => {
      if (node.type === 'PdxIcon') {
        const iconRef = readStaticIconRef(node.props.iconRef);
        const iconPolicy = iconRef
          ? iconProviders.get(iconRef.provider)
          : undefined;
        if (iconRef && iconPolicy) {
          const resolved = resolveIconPolicy(
            node,
            iconPolicy,
            iconRef,
            fallback
          );
          const relatedDependencies = snapshot.libraries
            .filter(
              (policy) => policy.source.pluginId === iconPolicy.source.pluginId
            )
            .flatMap((policy) =>
              policy.dependencies.map((dependency) => dependency.name)
            );
          return appendPackageConflicts(
            node,
            resolved,
            [iconPolicy.package.name, ...relatedDependencies],
            packageConflicts
          );
        }
      }
      const rule = rules.get(node.type);
      if (rule) {
        const resolved = resolveLibraryRule(node, rule);
        const policy = policiesByRuntimeType.get(node.type);
        return appendPackageConflicts(
          node,
          resolved,
          [
            rule.import.packageName,
            ...(policy?.dependencies.map((dependency) => dependency.name) ??
              []),
          ],
          packageConflicts
        );
      }
      const policy = policiesByRuntimeType.get(node.type);
      const resolved = fallback.resolveNode(node);
      if (!policy || policy.unsupported.behavior === 'passthrough') {
        return resolved;
      }
      return {
        ...resolved,
        diagnostics: [
          ...(resolved.diagnostics ?? []),
          {
            code: 'CODEGEN_POLICY_UNSUPPORTED_RUNTIME_TYPE',
            severity:
              policy.unsupported.behavior === 'error'
                ? ('error' as const)
                : ('warning' as const),
            source: 'adapter',
            message:
              policy.unsupported.message ??
              `No codegen rule is available for runtime type ${JSON.stringify(node.type)}.`,
            path: node.path,
            suggestion:
              'Install a compatible codegen policy or replace the unsupported component.',
          },
        ],
      };
    },
  };
  return Object.freeze(adapter);
};

export const getCodegenPolicyPackageVersions = (
  snapshot: CodegenPolicySnapshot
): Readonly<Record<string, string>> => {
  const versions: Record<string, string> = {};
  collectPolicyPackages(snapshot).packages.forEach((coordinate, name) => {
    versions[name] = coordinate.version;
  });
  return Object.freeze(versions);
};

export const getCodegenPolicyPackageMetadata = (
  snapshot: CodegenPolicySnapshot
): Readonly<
  Record<string, Readonly<{ license: string; owner: 'third-party' }>>
> => {
  const metadata: Record<
    string,
    Readonly<{ license: string; owner: 'third-party' }>
  > = {};
  collectPolicyPackages(snapshot).packages.forEach((coordinate, name) => {
    metadata[name] = Object.freeze({
      license: coordinate.license,
      owner: 'third-party',
    });
  });
  return Object.freeze(metadata);
};
