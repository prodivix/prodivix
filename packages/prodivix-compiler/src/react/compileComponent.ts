import type { ComponentNode } from '@prodivix/shared/types/pir';
import { materializePirRoot } from '#src/graph/materialize';
import type { CanonicalNode } from '#src/core/canonicalIR';
import { buildCanonicalIR } from '#src/core/canonicalIR';
import type { AdapterImportSpec } from '#src/core/adapter';
import { createDiagnosticBag } from '#src/core/diagnostics';
import { resolvePackageImport } from '#src/core/packageResolver';
import { createExportPackageOrigin } from '#src/export/packageOriginResolver';
import { resolveRemoteExportSource } from '#src/export/sourceResolver';
import {
  collectExportCodeArtifactContributions,
  createExportCodeArtifactStyleArtifactContribution,
  isExportCssCodeArtifact,
} from '#src/export/codeArtifactPlanner';
import { isBuiltInActionName } from '#src/actions/registry';
import { getNavigateLinkKind, isSafeNavigateTo } from '@prodivix/shared/safety';
import {
  VALUE_REF_IDENTIFIER_PATTERN,
  isDataReference,
  isIndexReference,
  isItemReference,
  isParamReference,
  isStateReference,
  isValueReference,
  parseValueRefPathSegments,
} from '#src/shared/valueRef';
import type {
  PirDocLike,
  ReactGeneratorCodeArtifact,
  ReactCompileOptions,
  ReactComponentCompileResult,
} from '#src/react/types';
import { reactAdapter } from '#src/react/adapter';
import type {
  ExportArtifactContribution,
  ExportRuntimeRequirement,
  ExportSourceOrigin,
  ExportSourceTrace,
  ExportStyleContribution,
} from '#src/export/types';

const toReactEventName = (trigger: string) => {
  const normalized = trigger.toLowerCase();
  if (normalized === 'click') return 'onClick';
  if (normalized === 'change') return 'onChange';
  if (normalized === 'input') return 'onInput';
  if (normalized === 'submit') return 'onSubmit';
  if (normalized === 'focus') return 'onFocus';
  if (normalized === 'blur') return 'onBlur';
  return /^on[A-Z]/.test(trigger)
    ? trigger
    : `on${trigger.charAt(0).toUpperCase()}${trigger.slice(1)}`;
};

const toIdentifier = (value: string) => {
  const normalized = value.replace(/[^a-zA-Z0-9_$]/g, '_');
  return /^[a-zA-Z_$]/.test(normalized) ? normalized : `_${normalized}`;
};

const stringify = (value: unknown) => JSON.stringify(value);

const stringifyLiteral = (value: unknown): string | null => {
  const json = JSON.stringify(value);
  if (json === undefined) return null;
  return json;
};

const compilePathAccessExpression = (
  sourceExpression: string,
  path: string
) => {
  const segments = parseValueRefPathSegments(path);
  const baseExpression = `(${sourceExpression} as any)`;
  if (segments.length === 0) return baseExpression;

  return segments.reduce((expression, segment) => {
    const index = Number(segment);
    if (Number.isInteger(index)) {
      return `${expression}?.[${index}]`;
    }
    if (VALUE_REF_IDENTIFIER_PATTERN.test(segment)) {
      return `${expression}?.${segment}`;
    }
    return `${expression}?.[${JSON.stringify(segment)}]`;
  }, baseExpression);
};

const compileValueExpression = (value: unknown, scopeVar: string): string => {
  if (isParamReference(value)) {
    return toIdentifier(value.$param);
  }
  if (isStateReference(value)) {
    return toIdentifier(value.$state);
  }
  if (isDataReference(value)) {
    return compilePathAccessExpression(`${scopeVar}.data`, value.$data);
  }
  if (isItemReference(value)) {
    return compilePathAccessExpression(`${scopeVar}.item`, value.$item);
  }
  if (isIndexReference(value)) {
    return `${scopeVar}.index`;
  }
  if (typeof value === 'string') {
    return stringify(value);
  }
  const literal = stringifyLiteral(value);
  return literal ?? 'undefined';
};

const compileObjectExpression = (
  value: Record<string, unknown>,
  scopeVar: string
): string =>
  `{ ${Object.entries(value)
    .map(
      ([key, entry]) =>
        `${JSON.stringify(key)}: ${compileValueExpression(entry, scopeVar)}`
    )
    .join(', ')} }`;

const isStaticNavigateParam = (value: unknown) =>
  value === undefined ||
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

const canInlineStaticNavigate = (params: Record<string, unknown>) => {
  if (typeof params.to !== 'string') return false;
  return (
    isStaticNavigateParam(params.target) &&
    isStaticNavigateParam(params.replace) &&
    isStaticNavigateParam(params.state)
  );
};

const buildStaticNavigateInlineHandler = (params: Record<string, unknown>) => {
  const to = typeof params.to === 'string' ? params.to.trim() : '';
  if (!to || !isSafeNavigateTo(to)) return '{() => {}}';
  const target = params.target === '_self' ? '_self' : '_blank';
  const replace = Boolean(params.replace);
  const linkKind = getNavigateLinkKind(to);
  if (linkKind === 'external' && target === '_blank') {
    return `{() => window.open(${stringify(to)}, '_blank', 'noopener,noreferrer')}`;
  }
  if (linkKind === 'internal') {
    if (replace) {
      return `{() => window.history.replaceState(null, '', ${stringify(to)})}`;
    }
    return `{() => window.history.pushState(null, '', ${stringify(to)})}`;
  }
  if (replace) {
    return `{() => window.location.replace(${stringify(to)})}`;
  }
  return `{() => window.location.assign(${stringify(to)})}`;
};

const buildNavigateInlineHandler = (paramsExpr: string) => {
  return `{() => {
    const params = ${paramsExpr};
    const to = typeof params.to === 'string' ? params.to.trim() : '';
    if (!to) return;
    const linkKind = to.startsWith('https://') || to.startsWith('http://')
      ? 'external'
      : to.startsWith('/') || to.startsWith('#') || to.startsWith('?')
        ? 'internal'
        : null;
    if (!linkKind) return;
    const target = params.target === '_self' ? '_self' : '_blank';
    const replace = Boolean(params.replace);
    if (linkKind === 'external' && target === '_blank') {
      window.open(to, '_blank', 'noopener,noreferrer');
      return;
    }
    if (linkKind === 'internal') {
      if (replace) {
        window.history.replaceState(null, '', to);
        return;
      }
      window.history.pushState(null, '', to);
      return;
    }
    if (replace) {
      window.location.replace(to);
      return;
    }
    window.location.assign(to);
  }}`;
};

const buildExecuteGraphInlineHandler = (paramsExpr: string) => {
  return `{(event) => { const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : \`graph-\${Date.now().toString(36)}-\${Math.random().toString(36).slice(2, 8)}\`; dispatchProdivixEvent('prodivix:execute-graph', { requestId, nodeId: '', trigger: event?.type ?? '', eventKey: event?.type ?? '', params: ${paramsExpr} }); }}`;
};

const buildBuiltInInlineHandler = (
  action: string,
  params: Record<string, unknown>,
  scopeVar: string
) => {
  if (action === 'navigate') {
    if (canInlineStaticNavigate(params)) {
      return buildStaticNavigateInlineHandler(params);
    }
    return buildNavigateInlineHandler(
      compileObjectExpression(params, scopeVar)
    );
  }
  if (action === 'executeGraph')
    return buildExecuteGraphInlineHandler(
      compileObjectExpression(params, scopeVar)
    );
  return null;
};

const compilePropExpression = (
  value: unknown,
  scopeVar: string
): string | null => {
  if (typeof value === 'string') {
    return stringify(value);
  }
  const expr = compileValueExpression(value, scopeVar);
  if (!expr) return null;
  return `{${expr}}`;
};

const canInlineJsxTextLiteral = (value: string) =>
  value.length > 0 && !/^\s|\s$/.test(value) && !/[\n\r\t{}]/.test(value);

const escapeJsxTextLiteral = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const compileTextContent = (value: CanonicalNode['text'], scopeVar: string) => {
  if (value === undefined) return '';
  if (typeof value === 'string') {
    if (canInlineJsxTextLiteral(value)) {
      return escapeJsxTextLiteral(value);
    }
    return `{${stringify(value)}}`;
  }
  if (typeof value === 'object' && value !== null && !isValueReference(value)) {
    return stringify(JSON.stringify(value));
  }
  return `{${compileValueExpression(value, scopeVar)}}`;
};

const renderImport = (item: AdapterImportSpec) => {
  if (item.kind === 'namespace') {
    return `import * as ${item.local ?? item.imported} from '${item.source}';`;
  }
  if (item.kind === 'default') {
    return `import ${item.local ?? item.imported} from '${item.source}';`;
  }
  const imported = item.local
    ? `${item.imported} as ${item.local}`
    : item.imported;
  return `import { ${imported} } from '${item.source}';`;
};

const dedupeImports = (items: AdapterImportSpec[]) => {
  const map = new Map<string, AdapterImportSpec>();
  items.forEach((item) => {
    const key = `${item.kind}:${item.source}:${item.imported}:${item.local ?? ''}`;
    map.set(key, item);
  });
  return Array.from(map.values());
};

const toImportKey = (item: AdapterImportSpec) =>
  `${item.kind}:${item.source}:${item.imported}:${item.local ?? ''}`;

const toPascalCase = (value: string) =>
  value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

type StaticIconRef = {
  provider: string;
  name: string;
  variant?: 'outline' | 'solid';
};

const NATIVE_ICON_PROVIDERS = new Set([
  'fontawesome',
  'ant-design-icons',
  'mui-icons',
  'heroicons',
]);

const readStaticIconRef = (value: unknown): StaticIconRef | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const iconRef = value as Record<string, unknown>;
  const provider =
    typeof iconRef.provider === 'string' ? iconRef.provider.trim() : '';
  const name = typeof iconRef.name === 'string' ? iconRef.name.trim() : '';
  if (!provider || !name) return null;
  const variant = iconRef.variant === 'solid' ? 'solid' : 'outline';
  return { provider, name, variant };
};

type ResolvedAdapterImport = AdapterImportSpec & {
  resolution: ReturnType<typeof resolvePackageImport>;
};

const resolveImportAliasPrefix = (item: ResolvedAdapterImport) => {
  const { source, resolution } = item;
  const packageName = resolution.packageName;
  if (packageName === 'antd') return 'Antd';
  if (packageName?.startsWith('@mui/')) return 'Mui';
  if (packageName?.startsWith('@radix-ui/')) return 'Radix';
  if (packageName?.startsWith('@prodivix/')) return 'Pdx';
  if (source === 'antd') return 'Antd';
  if (source.startsWith('@mui/')) return 'Mui';
  if (source.startsWith('@radix-ui/')) return 'Radix';
  if (source.startsWith('@prodivix/')) return 'Pdx';
  const fallback = packageName ?? source;
  return toPascalCase(fallback.replace(/^@/, '').replace(/\//g, '-')) || 'Lib';
};

const assignImportLocals = (items: ResolvedAdapterImport[]) => {
  const localCount = new Map<string, number>();
  items.forEach((item) => {
    const base = item.local ?? item.imported;
    localCount.set(base, (localCount.get(base) ?? 0) + 1);
  });

  const assigned = new Map<string, string>();
  const usedLocals = new Set<string>();

  items.forEach((item) => {
    const key = toImportKey(item);
    const baseLocal = item.local ?? item.imported;
    const needsAlias = (localCount.get(baseLocal) ?? 0) > 1;
    let candidate = baseLocal;

    if (needsAlias) {
      const prefix = resolveImportAliasPrefix(item);
      const safeBase = baseLocal.charAt(0).toUpperCase() + baseLocal.slice(1);
      candidate = `${prefix}${safeBase}`;
    }

    candidate = toIdentifier(candidate);
    let uniqueName = candidate;
    let suffix = 2;
    while (usedLocals.has(uniqueName)) {
      uniqueName = `${candidate}${suffix}`;
      suffix += 1;
    }

    usedLocals.add(uniqueName);
    assigned.set(key, uniqueName);
  });

  return assigned;
};

const rewriteElementWithAlias = (
  element: string,
  imports: AdapterImportSpec[] | undefined,
  importLocalByKey: Map<string, string>
) => {
  if (!imports?.length || !element) return element;
  const [root, ...rest] = element.split('.');
  const matchedImport = imports.find(
    (item) => (item.local ?? item.imported) === root
  );
  if (!matchedImport) return element;
  const nextRoot = importLocalByKey.get(toImportKey(matchedImport)) ?? root;
  if (nextRoot === root) return element;
  return [nextRoot, ...rest].join('.');
};

type UnsafeRecord = Record<string, unknown>;

const INTERNAL_NODE_PROP_KEYS = new Set([
  'codeBindings',
  'mountedCss',
  'styleMount',
  'styleMountCss',
  'textMode',
]);

const INTERNAL_DATA_ATTRIBUTE_PREFIXES = ['data-pir-', 'data-layout-'];

const TEXT_PROP_ONLY_COMPONENTS = new Set(['PdxButton', 'PdxButtonLink']);

const asRecord = (value: unknown): UnsafeRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnsafeRecord)
    : null;

const sanitizePathSegment = (segment: string) =>
  segment.replace(/[^a-zA-Z0-9._-]/g, '-');

const toMountedCssSuggestedPath = (rawPath: string, fallbackName: string) => {
  const normalized = rawPath.replaceAll('\\', '/').trim();
  const rawSegments = normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => segment !== '.' && segment !== '..')
    .map(sanitizePathSegment);

  const segments = rawSegments.length ? rawSegments : [`${fallbackName}.css`];

  if (!segments.length) {
    segments.push(`${fallbackName}.css`);
  }

  const fileName = segments.at(-1) ?? `${fallbackName}.css`;
  if (!fileName.toLowerCase().endsWith('.css')) {
    segments[segments.length - 1] = `${fileName}.css`;
  }

  return segments.join('/');
};

const readMountedCssContent = (value: unknown): string | null => {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.content !== 'string') return null;
  const content = record.content.trim();
  if (!content) return null;
  return `${content}\n`;
};

const readMountedCssArtifactIds = (value: unknown): string[] => {
  const candidates = Array.isArray(value) ? value : [value];
  return candidates
    .map((candidate) => {
      const record = asRecord(candidate);
      const reference = asRecord(record?.reference);
      const artifactId = reference?.artifactId;
      return typeof artifactId === 'string' && artifactId.trim()
        ? artifactId.trim()
        : null;
    })
    .filter((artifactId): artifactId is string => Boolean(artifactId));
};

const collectMountedCssStyleContributions = (
  root: ComponentNode,
  codeArtifacts: ReactGeneratorCodeArtifact[] = [],
  ownerRootId = 'app'
): {
  styles: ExportStyleContribution[];
  artifacts: ExportArtifactContribution[];
} => {
  const contributionsById = new Map<string, ExportStyleContribution>();
  const artifactContributionsById = new Map<
    string,
    ExportArtifactContribution
  >();
  const artifactsById = new Map(
    codeArtifacts.map((artifact) => [artifact.id, artifact])
  );
  let sourceOrder = 0;

  const collectFromNode = (node: ComponentNode) => {
    const anyNode = node as ComponentNode & { metadata?: unknown };
    const props = asRecord(anyNode.props);
    const metadata = asRecord(anyNode.metadata);
    const codeBindings = asRecord(props?.codeBindings);
    const mountedCssArtifactIds = readMountedCssArtifactIds(
      codeBindings?.mountedCss
    );

    mountedCssArtifactIds.forEach((artifactId) => {
      const artifact = artifactsById.get(artifactId);
      if (!artifact || !isExportCssCodeArtifact(artifact)) return;
      const content = artifact.source.trim();
      if (!content) return;
      const suggestedName = toMountedCssSuggestedPath(artifact.path, node.id)
        .split('/')
        .pop()
        ?.replace(/\.css$/i, '');
      const contributionId = `mounted-css:${artifact.id}`;
      const existing = artifactContributionsById.get(contributionId);
      if (!existing) {
        artifactContributionsById.set(
          contributionId,
          createExportCodeArtifactStyleArtifactContribution({
            artifact,
            id: contributionId,
            ownerRootId,
            suggestedName,
            cssText: content,
            orderIndex: sourceOrder,
          })
        );
        sourceOrder += 1;
        return;
      }
      if (
        typeof existing.contents === 'string' &&
        !existing.contents.includes(content)
      ) {
        artifactContributionsById.set(contributionId, {
          ...existing,
          contents: `${existing.contents}\n\n${content}`,
        });
      }
    });

    const candidates = [
      props?.mountedCss,
      props?.styleMount,
      props?.styleMountCss,
      metadata?.mountedCss,
      metadata?.styleMount,
    ];

    candidates.forEach((candidate, candidateIndex) => {
      const appendCssFile = (rawEntry: unknown, fallbackPath: string): void => {
        const content = readMountedCssContent(rawEntry);
        if (!content) return;
        const record = asRecord(rawEntry);
        const pathValue =
          typeof record?.path === 'string' && record.path.trim()
            ? record.path
            : fallbackPath;
        const normalizedPath = toMountedCssSuggestedPath(pathValue, node.id);
        const contributionId = `mounted-css:inline:${node.id}:${normalizedPath}`;
        const existing = contributionsById.get(contributionId);
        if (!existing) {
          contributionsById.set(contributionId, {
            id: contributionId,
            ownerRootId,
            scope: 'component',
            suggestedName: normalizedPath
              .split('/')
              .pop()
              ?.replace(/\.css$/i, ''),
            cssText: content.trim(),
            orderHint: {
              group: 'mounted-css',
              index: sourceOrder,
            },
            sourceTrace: [
              {
                sourceRef: {
                  domain: 'pir',
                  id: node.id,
                  path: `/ui/graph/nodesById/${node.id}`,
                },
                ownerRootId,
              },
            ],
            origin: {
              kind: 'generated',
              owner: 'prodivix',
              writePolicy: 'generated',
              updatePolicy: 'regenerate',
            },
          });
          sourceOrder += 1;
          return;
        }
        const trimmedContent = content.trim();
        if (!existing.cssText.includes(trimmedContent)) {
          contributionsById.set(contributionId, {
            ...existing,
            cssText: `${existing.cssText}\n\n${trimmedContent}`,
          });
        }
      };

      if (Array.isArray(candidate)) {
        candidate.forEach((entry, entryIndex) => {
          appendCssFile(
            entry,
            `${node.id}-${candidateIndex + 1}-${entryIndex + 1}.css`
          );
        });
        return;
      }

      appendCssFile(candidate, `${node.id}-${candidateIndex + 1}.css`);
    });

    node.children?.forEach(collectFromNode);
  };

  collectFromNode(root);

  const sortByOrder = <
    T extends { id: string; orderHint?: { index?: number } },
  >(
    items: T[]
  ) =>
    items.sort(
      (a, b) =>
        (a.orderHint?.index ?? Number.MAX_SAFE_INTEGER) -
          (b.orderHint?.index ?? Number.MAX_SAFE_INTEGER) ||
        a.id.localeCompare(b.id)
    );

  return {
    styles: sortByOrder(Array.from(contributionsById.values())),
    artifacts: sortByOrder(Array.from(artifactContributionsById.values())),
  };
};

const sanitizeDataAttributesProp = (value: unknown): Record<string, string> => {
  const record = asRecord(value);
  if (!record) return {};
  return Object.entries(record).reduce<Record<string, string>>(
    (acc, [key, item]) => {
      if (
        INTERNAL_DATA_ATTRIBUTE_PREFIXES.some((prefix) =>
          key.startsWith(prefix)
        )
      ) {
        return acc;
      }
      if (typeof item === 'string' || typeof item === 'number') {
        const value = String(item);
        if (value.length > 0) {
          acc[key] = value;
        }
      }
      return acc;
    },
    {}
  );
};

const shouldOmitEmptyExportProp = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

const sanitizeNodePropsForExport = (props: Record<string, unknown>) => {
  const sanitized: Record<string, unknown> = {};
  Object.entries(props).forEach(([key, value]) => {
    if (INTERNAL_NODE_PROP_KEYS.has(key)) return;
    if (
      INTERNAL_DATA_ATTRIBUTE_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      return;
    }
    if (key === 'dataAttributes') {
      const dataAttributes = sanitizeDataAttributesProp(value);
      if (Object.keys(dataAttributes).length > 0) {
        sanitized[key] = dataAttributes;
      }
      return;
    }
    if (shouldOmitEmptyExportProp(value)) return;
    sanitized[key] = value;
  });
  return sanitized;
};

export const compilePirToReactComponent = (
  pirDoc: PirDocLike,
  options?: ReactCompileOptions
): ReactComponentCompileResult => {
  const bag = createDiagnosticBag();
  const canonical = buildCanonicalIR(pirDoc, bag);
  const mountedCssContributions = collectMountedCssStyleContributions(
    materializePirRoot(pirDoc),
    options?.codeArtifacts
  );
  const fileArtifactContributions = options?.includeWorkspaceCodeArtifacts
    ? collectExportCodeArtifactContributions(options?.codeArtifacts)
    : [];

  const componentName =
    options?.componentName ||
    canonical.metadata?.name?.replace(/\s+/g, '') ||
    'PdxComponent';
  const moduleId = `react-component:${componentName}`;
  const interfaceName = `${componentName}Props`;
  const propsDef = canonical.logic?.props ?? {};
  const hasProps = Object.keys(propsDef).length > 0;
  const propFunctionKeys = Object.entries(propsDef)
    .filter(([, def]) => {
      const type = typeof def?.type === 'string' ? def.type : '';
      return type.includes('=>') || type.toLowerCase().includes('function');
    })
    .map(([key]) => key);
  const hasState = Boolean(
    canonical.logic?.state && Object.keys(canonical.logic.state).length > 0
  );
  const adapter = options?.adapter ?? reactAdapter;
  const runtimeRequirementsById = new Map<string, ExportRuntimeRequirement>();
  const requireEventRuntime = (nodeId: string, eventKey: string) => {
    const id = `event-runtime:${moduleId}`;
    if (runtimeRequirementsById.has(id)) return;
    runtimeRequirementsById.set(id, {
      id,
      kind: 'event-runtime',
      ownerModuleId: moduleId,
      importName: 'dispatchProdivixEvent',
      importKind: 'named',
      sourceTrace: [
        {
          sourceRef: {
            domain: 'pir',
            id: nodeId,
            path: `/ui/graph/nodesById/${nodeId}/events/${eventKey}`,
          },
          ownerRootId: 'app',
        },
      ],
    });
  };

  const adapterImports: AdapterImportSpec[] = [];
  const collectAdapterArtifacts = (node: CanonicalNode) => {
    const adapterResult = adapter.resolveNode(node);
    if (adapterResult.imports?.length) {
      adapterImports.push(...adapterResult.imports);
    }
    if (adapterResult.diagnostics?.length) {
      bag.diagnostics.push(...adapterResult.diagnostics);
    }
    node.children.forEach(collectAdapterArtifacts);
  };
  collectAdapterArtifacts(canonical.root);

  const resolvedImports: ResolvedAdapterImport[] = dedupeImports(
    adapterImports
  ).map((item) => ({
    ...item,
    resolution: resolvePackageImport(item.source, options?.packageResolver),
  }));
  const importLocalByKey = assignImportLocals(resolvedImports);
  const findCanonicalNodeById = (
    target: CanonicalNode,
    nodeId: string
  ): CanonicalNode | null => {
    if (target.id === nodeId) return target;
    for (const child of target.children) {
      const found = findCanonicalNodeById(child, nodeId);
      if (found) return found;
    }
    return null;
  };

  const compileNode = (
    node: CanonicalNode,
    indent = '    ',
    scopeVar = 'scope',
    extraProps: string[] = []
  ): string => {
    if (node.list) {
      const listSourceExpr =
        node.list.source !== undefined
          ? compileValueExpression(node.list.source, scopeVar)
          : scopeVar === 'scope'
            ? '[]'
            : `${scopeVar}.data`;
      const itemAlias =
        typeof node.list.itemAs === 'string' && node.list.itemAs.trim()
          ? node.list.itemAs.trim()
          : 'item';
      const indexAlias =
        typeof node.list.indexAs === 'string' && node.list.indexAs.trim()
          ? node.list.indexAs.trim()
          : 'index';
      const nodeWithoutList: CanonicalNode = {
        ...node,
        list: undefined,
      };
      const keyExpr =
        typeof node.list.keyBy === 'string' && node.list.keyBy.trim()
          ? `${compilePathAccessExpression('item', node.list.keyBy)} ?? index`
          : 'index';
      const bodyNodeWithItemScope = compileNode(
        nodeWithoutList,
        `${indent}    `,
        'itemScope',
        [`key={String(${keyExpr})}`]
      );
      const needsItemScope = /\bitemScope\b/.test(bodyNodeWithItemScope);
      const bodyNode = needsItemScope
        ? bodyNodeWithItemScope
        : compileNode(nodeWithoutList, `${indent}  `, 'itemScope', [
            `key={String(${keyExpr})}`,
          ]);
      let emptyRender = 'null';
      if (
        typeof node.list.emptyNodeId === 'string' &&
        node.list.emptyNodeId.trim()
      ) {
        const emptyNodeId = node.list.emptyNodeId.trim();
        const emptyNode =
          emptyNodeId === node.id
            ? null
            : findCanonicalNodeById(canonical.root, emptyNodeId);
        if (emptyNode) {
          emptyRender = compileNode(
            emptyNode,
            `${indent}      `,
            scopeVar
          ).trim();
        }
      }
      const normalizedItemsExpr =
        listSourceExpr === '[]'
          ? '[]'
          : `(Array.isArray(${listSourceExpr}) ? ${listSourceExpr} : [])`;
      const mapPrelude = needsItemScope
        ? `${indent}  const itemData =
${indent}    item && typeof item === 'object' && !Array.isArray(item)
${indent}      ? {
${indent}          ...(${scopeVar}.data && typeof ${scopeVar}.data === 'object' && !Array.isArray(${scopeVar}.data)
${indent}            ? (${scopeVar}.data as Record<string, unknown>)
${indent}            : {}),
${indent}          ...(item as Record<string, unknown>),
${indent}        }
${indent}      : item;
${indent}  const itemScope = {
${indent}    ...${scopeVar},
${indent}    item,
${indent}    index,
${indent}    data: itemData,
${indent}    params: {
${indent}      ...${scopeVar}.params,
${indent}      ${JSON.stringify(itemAlias)}: item,
${indent}      ${JSON.stringify(indexAlias)}: index,
${indent}    },
${indent}  };`
        : '';
      const mapExpr = mapPrelude
        ? `${normalizedItemsExpr}.map((item, index) => {
${mapPrelude}
${indent}  return (
${bodyNode}
${indent}  );
${indent}})`
        : `${normalizedItemsExpr}.map((item, index) => (
${bodyNode}
${indent}))`;
      if (emptyRender === 'null') {
        return `${indent}{${mapExpr}}`;
      }
      return `${indent}{${normalizedItemsExpr}.length > 0 ? ${mapExpr} : ${emptyRender}}`;
    }
    const adapterResult = adapter.resolveNode(node);
    const tag = rewriteElementWithAlias(
      adapterResult.element,
      adapterResult.imports,
      importLocalByKey
    );
    const staticIconRef = readStaticIconRef(node.props?.iconRef);
    const sanitizedProps = sanitizeNodePropsForExport(node.props);
    if (staticIconRef && NATIVE_ICON_PROVIDERS.has(staticIconRef.provider)) {
      delete sanitizedProps.iconRef;
    }
    const propsArray: string[] = [];
    const nativeIconSize = sanitizedProps.size;
    if (staticIconRef && NATIVE_ICON_PROVIDERS.has(staticIconRef.provider)) {
      delete sanitizedProps.size;
    }

    const baseStyleExpr =
      Object.keys(node.style).length > 0 ? stringifyLiteral(node.style) : null;
    if (
      nativeIconSize !== undefined &&
      staticIconRef &&
      NATIVE_ICON_PROVIDERS.has(staticIconRef.provider)
    ) {
      const sizeExpr = compileValueExpression(nativeIconSize, scopeVar);
      const sizeStyleExpr =
        staticIconRef.provider === 'heroicons'
          ? `{ width: ${sizeExpr}, height: ${sizeExpr} }`
          : `{ fontSize: ${sizeExpr} }`;
      if (baseStyleExpr) {
        propsArray.push(`style={{ ...${baseStyleExpr}, ...${sizeStyleExpr} }}`);
      } else {
        propsArray.push(`style={${sizeStyleExpr}}`);
      }
    } else if (baseStyleExpr) {
      propsArray.push(`style={${baseStyleExpr}}`);
    }
    if (extraProps.length > 0) {
      propsArray.push(...extraProps);
    }

    Object.entries(sanitizedProps).forEach(([key, value]) => {
      const expr = compilePropExpression(value, scopeVar);
      if (expr !== null) {
        propsArray.push(`${key}=${expr}`);
      }
    });

    const shouldMapTextToProp =
      TEXT_PROP_ONLY_COMPONENTS.has(tag) &&
      node.text !== undefined &&
      !Object.prototype.hasOwnProperty.call(sanitizedProps, 'text');
    if (shouldMapTextToProp) {
      const expr = compilePropExpression(node.text, scopeVar);
      if (expr !== null) {
        propsArray.push(`text=${expr}`);
      }
    }

    if (
      staticIconRef?.provider === 'fontawesome' &&
      !Object.prototype.hasOwnProperty.call(sanitizedProps, 'icon')
    ) {
      const iconImport = adapterResult.imports?.find(
        (item) =>
          item.kind === 'named' &&
          item.source === '@fortawesome/free-solid-svg-icons'
      );
      if (iconImport) {
        const iconLocal =
          importLocalByKey.get(toImportKey(iconImport)) ??
          iconImport.local ??
          iconImport.imported;
        propsArray.push(`icon={${iconLocal}}`);
      }
    }

    Object.entries(node.events).forEach(([eventKey, eventDef]) => {
      const trigger = eventDef.trigger || eventKey;
      const reactEventName = toReactEventName(trigger);
      if (!reactEventName) return;

      if (eventDef.action && propFunctionKeys.includes(eventDef.action)) {
        propsArray.push(`${reactEventName}={${toIdentifier(eventDef.action)}}`);
        return;
      }

      if (eventDef.action && isBuiltInActionName(eventDef.action)) {
        if (eventDef.action === 'executeGraph') {
          requireEventRuntime(node.id, eventKey);
        }
        const handlerExpr = buildBuiltInInlineHandler(
          eventDef.action,
          eventDef.params ?? {},
          scopeVar
        );
        if (handlerExpr) {
          propsArray.push(`${reactEventName}=${handlerExpr}`);
        }
      }
    });

    const allProps = propsArray.length ? ` ${propsArray.join(' ')}` : '';
    const textContent = shouldMapTextToProp
      ? ''
      : compileTextContent(node.text, scopeVar);
    const childJsx =
      node.children
        .map((child) => compileNode(child, `${indent}  `, scopeVar))
        .join('\n') || '';

    if (!childJsx && !textContent) {
      return `${indent}<${tag}${allProps} />`;
    }

    const textBlock = textContent ? `${indent}  ${textContent}\n` : '';
    const childBlock = childJsx ? `${childJsx}\n` : '';
    return `${indent}<${tag}${allProps}>\n${textBlock}${childBlock}${indent}</${tag}>`;
  };

  const interfaceFields = Object.entries(propsDef)
    .map(([key, value]) => `  ${toIdentifier(key)}?: ${value.type || 'any'};`)
    .join('\n');
  const interfaceBlock = hasProps
    ? `interface ${interfaceName} {\n${interfaceFields}\n}\n`
    : '';
  const destructuredProps = Object.entries(propsDef)
    .map(([key, value]) => {
      const safeKey = toIdentifier(key);
      if (value.default === undefined) return safeKey;
      const serialized = stringifyLiteral(value.default);
      if (serialized === null) return safeKey;
      return `${safeKey} = ${serialized}`;
    })
    .join(', ');
  const stateBlock = hasState
    ? Object.entries(canonical.logic?.state ?? {})
        .map(([key, value]) => {
          const safeKey = toIdentifier(key);
          const setter = `set${safeKey.charAt(0).toUpperCase()}${safeKey.slice(1)}`;
          const initial = stringifyLiteral(value.initial) ?? 'null';
          return `  const [${safeKey}, ${setter}] = useState(${initial});`;
        })
        .join('\n')
    : '';

  const reactImport = hasState
    ? "import React, { useState } from 'react';"
    : "import React from 'react';";
  const rootJsx = compileNode(canonical.root);
  const adapterImportBlock = resolvedImports
    .map((item) => {
      const importKey = toImportKey(item);
      const assignedLocal = importLocalByKey.get(importKey);
      const baseLocal = item.local ?? item.imported;
      const local =
        assignedLocal && assignedLocal !== baseLocal
          ? assignedLocal
          : item.local;
      return renderImport({
        ...item,
        local,
        source: item.resolution.importSource,
      });
    })
    .join('\n');
  const packageStyleImportBlock = resolvedImports.some(
    (item) => item.resolution.packageName === '@prodivix/ui'
  )
    ? "import '@prodivix/ui/style.css';"
    : '';
  const functionSignature = `export default function ${componentName}(${
    hasProps ? `{ ${destructuredProps} }: ${interfaceName}` : ''
  }) {`;
  const shouldEmitScope = rootJsx.includes('scope.');
  const scopeParamEntries = Object.keys(propsDef)
    .map((key) => `${JSON.stringify(key)}: ${toIdentifier(key)}`)
    .join(', ');
  const scopeBlock = shouldEmitScope
    ? `  const scope = { data: undefined as unknown, item: undefined as unknown, index: undefined as number | undefined, params: ${scopeParamEntries ? `{ ${scopeParamEntries} }` : '{}'} };`
    : '';
  const functionBodyPrelude = [stateBlock, scopeBlock]
    .filter((block) => block.length > 0)
    .join('\n');

  const code = [
    reactImport,
    adapterImportBlock,
    packageStyleImportBlock,
    interfaceBlock.trim(),
    `${functionSignature}
${functionBodyPrelude ? `${functionBodyPrelude}\n` : ''}  return (
${rootJsx}
  );
}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const dependencies = resolvedImports.reduce<Record<string, string>>(
    (acc, item) => {
      const { packageName, packageVersion, declareDependency } =
        item.resolution;
      if (!packageName || !declareDependency) return acc;
      acc[packageName] = packageVersion ?? 'latest';
      return acc;
    },
    {}
  );
  const remoteSourceOrigins: ExportSourceOrigin[] = [];
  const dependencyOrigins = resolvedImports.reduce<
    Record<string, ReactComponentCompileResult['dependencyOrigins'][string]>
  >((acc, item) => {
    const { packageName, packageVersion, declareDependency, sourceKind, url } =
      item.resolution;
    if (!packageName) return acc;
    if (sourceKind === 'esm-sh' || sourceKind === 'remote-url') {
      const origin = resolveRemoteExportSource({
        url: url ?? item.resolution.importSource,
        label: packageName,
        updatePolicy: 'follow-package',
      }).origin;
      acc[packageName] = origin;
      remoteSourceOrigins.push(origin);
      return acc;
    }
    if (!declareDependency) return acc;
    acc[packageName] = createExportPackageOrigin(
      packageName,
      packageVersion ?? 'latest',
      {
        updatePolicy: 'follow-package',
      }
    );
    return acc;
  }, {});
  const sourceTrace: ExportSourceTrace[] = [
    {
      sourceRef: {
        domain: 'pir',
        id: 'root',
        path: '/ui/graph/rootId',
      },
      ownerRootId: 'app',
    },
  ];
  const module: ReactComponentCompileResult['module'] = {
    id: moduleId,
    kind: 'react-component',
    ownerRootId: 'app',
    suggestedName: componentName,
    language: 'tsx',
    imports: [],
    body: code,
    sourceTrace,
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  };

  return {
    componentName,
    code,
    diagnostics: bag.diagnostics,
    canonicalIR: canonical,
    dependencies,
    dependencyOrigins,
    module,
    styles: mountedCssContributions.styles,
    artifacts: [
      ...mountedCssContributions.artifacts,
      ...fileArtifactContributions,
    ],
    runtimeRequirements: Array.from(runtimeRequirementsById.values()),
    exportContributions: [
      ...(options?.exportContributions ?? []),
      ...(remoteSourceOrigins.length ? [{ sources: remoteSourceOrigins }] : []),
    ],
    sourceTrace,
  };
};
