import { transformWithEsbuild } from 'vite';
import { describe, expect, it } from 'vitest';
import {
  appendPirProjectionCollectionItemPath,
  appendPirProjectionComponentPath,
  appendPirProjectionSlotPath,
  createPirProjectionRootPath,
  projectPirCollection,
  resolvePirValueBinding,
  type PIRCollectionNode,
  type PIRCollectionPreviewInput,
  type PIRCodeValueResolver,
  type PIRRuntimeValueScope,
} from '@prodivix/pir';
import { createPirCollectionRuntimeSource } from '#src/react/collectionRuntime';
import {
  compilePirComponentProjectionPath,
  compilePirRootProjectionPath,
  compilePirSlotProjectionPath,
  PIR_PROJECTION_PATH_RUNTIME_SOURCE,
} from '#src/react/projectionPathRuntime';

type RuntimeProjection = (
  input: Readonly<{
    parentScope: PIRRuntimeValueScope;
    preview: PIRCollectionPreviewInput;
    symbols: PIRCollectionNode['symbols'];
    resolveSource: () => unknown;
    resolveKey: (scope: PIRRuntimeValueScope, index: number) => unknown;
  }>
) => unknown;

type RuntimeIssueReporter = (
  props: Readonly<{
    runtime: Readonly<{
      reportCollectionProjectionIssues?: (input: unknown) => void;
    }>;
    location: Readonly<{
      documentId: string;
      nodeId: string;
      instancePath: string;
    }>;
    issues: readonly Readonly<{
      code: string;
      path: string;
      message: string;
      itemIndex?: number;
    }>[];
  }>
) => null;

type RuntimeExports = Readonly<{
  project: RuntimeProjection;
  report: RuntimeIssueReporter;
  appendCollectionPath: (
    parentPath: string,
    documentId: string,
    nodeId: string,
    keyIdentity: string
  ) => string;
}>;

type Effect = () => void | (() => void);
type EffectHook = (effect: Effect, dependencies: readonly unknown[]) => void;

const loadRuntime = async (effectHook: EffectHook): Promise<RuntimeExports> => {
  const source = `type __PdxScope = Readonly<Record<string, unknown>>;
type __PdxRuntimePort = Readonly<{ reportCollectionProjectionIssues?: (input: unknown) => void }>;
${createPirCollectionRuntimeSource('__testUseEffect')}
${PIR_PROJECTION_PATH_RUNTIME_SOURCE}
(globalThis as Record<string, unknown>).__runtime = {
  project: __pdxProjectCollection,
  report: __PdxCollectionIssueReporter,
  appendCollectionPath: __pdxAppendCollectionItemPath,
};`;
  const transformed = await transformWithEsbuild(source, 'runtime.ts', {
    loader: 'ts',
    target: 'es2022',
  });
  const target: Record<string, unknown> = {};
  Function(
    '__testUseEffect',
    'globalThis',
    transformed.code
  )(effectHook, target);
  return target.__runtime as RuntimeExports;
};

const normalizeCanonical = (
  result: ReturnType<typeof projectPirCollection>
): unknown => {
  if (result.status === 'blocked') {
    return { status: 'blocked', issues: result.issues };
  }
  if (result.projection.kind === 'items') {
    return {
      status: 'ready',
      kind: 'items',
      items: result.projection.items,
    };
  }
  return {
    status: 'ready',
    kind: 'region',
    regionName: result.projection.regionName,
    scope: result.projection.scope,
  };
};

const projectWithBothRuntimes = async (
  node: PIRCollectionNode,
  preview: PIRCollectionPreviewInput,
  parentScope: PIRRuntimeValueScope = {},
  resolveCodeValue?: PIRCodeValueResolver
): Promise<Readonly<{ canonical: unknown; generated: unknown }>> => {
  const runtime = await loadRuntime(() => undefined);
  const canonical = projectPirCollection({
    node,
    regions: { item: ['item'], empty: [], loading: [], error: [] },
    parentScope,
    preview,
    resolveCodeValue,
  });
  const generated = runtime.project({
    parentScope,
    preview,
    symbols: node.symbols,
    resolveSource: () =>
      node.source.kind === 'literal'
        ? node.source.value
        : resolvePirValueBinding(
            node.source.value,
            parentScope,
            resolveCodeValue
          ),
    resolveKey: (scope, index) =>
      node.key.kind === 'index'
        ? index
        : resolvePirValueBinding(node.key.value, scope, resolveCodeValue),
  });
  return { canonical: normalizeCanonical(canonical), generated };
};

const createCollection = (
  source: PIRCollectionNode['source'],
  key: PIRCollectionNode['key']
): PIRCollectionNode => ({
  id: 'products/:collection',
  kind: 'collection',
  source,
  key,
  symbols: {
    itemId: 'item',
    itemName: 'item',
    indexId: 'index',
    indexName: 'index',
    errorId: 'error',
  },
});

describe('standalone PIR Collection runtime conformance', () => {
  it('matches the canonical evaluator across state, scope and key outcomes', async () => {
    const itemKey = {
      kind: 'binding' as const,
      value: {
        kind: 'collection-symbol' as const,
        symbolId: 'item',
        path: 'id',
      },
    };
    const cases = [
      {
        node: createCollection(
          {
            kind: 'literal',
            value: [
              { id: 'a/:1', label: 'A' },
              { id: 2, label: 'B' },
            ],
          },
          itemKey
        ),
        preview: { state: 'auto' as const },
        parentScope: { collectionSymbolsById: { outer: 'parent' } },
      },
      {
        node: createCollection({ kind: 'literal', value: [] }, itemKey),
        preview: { state: 'auto' as const },
      },
      {
        node: createCollection({ kind: 'literal', value: [] }, itemKey),
        preview: { state: 'loading' as const },
      },
      {
        node: createCollection({ kind: 'literal', value: [] }, itemKey),
        preview: {
          state: 'error' as const,
          errorValue: { message: 'failed' },
        },
      },
      {
        node: createCollection(
          {
            kind: 'literal',
            value: [{ id: 'duplicate' }, { id: 'duplicate' }],
          },
          itemKey
        ),
        preview: { state: 'item' as const },
      },
      {
        node: createCollection(
          { kind: 'binding', value: { kind: 'literal', value: 'not-array' } },
          { kind: 'index' }
        ),
        preview: { state: 'auto' as const },
      },
      {
        node: createCollection(
          { kind: 'literal', value: [{ id: null }] },
          itemKey
        ),
        preview: { state: 'auto' as const },
      },
    ];

    for (const testCase of cases) {
      const result = await projectWithBothRuntimes(
        testCase.node,
        testCase.preview,
        testCase.parentScope
      );
      expect(result.generated).toEqual(result.canonical);
    }

    const codeBacked = createCollection(
      {
        kind: 'binding',
        value: {
          kind: 'code',
          reference: { artifactId: 'collection-source' },
        },
      },
      {
        kind: 'binding',
        value: {
          kind: 'code',
          reference: { artifactId: 'collection-key' },
        },
      }
    );
    const resolveCodeValue: PIRCodeValueResolver = (reference, scope) =>
      reference.artifactId === 'collection-source'
        ? [{ id: 'code/:1' }]
        : (scope.collectionSymbolsById?.item as { id: string }).id;
    const codeResult = await projectWithBothRuntimes(
      codeBacked,
      { state: 'auto' },
      {},
      resolveCodeValue
    );
    expect(codeResult.generated).toEqual(codeResult.canonical);
  });

  it('keeps generated execution paths identical for delimiter-rich identities', async () => {
    const runtime = await loadRuntime(() => undefined);
    const root = createPirProjectionRootPath('page/:你好');
    const component = appendPirProjectionComponentPath(
      root,
      'page/:你好',
      'instance:/1',
      'card:详情'
    );
    const slot = appendPirProjectionSlotPath(
      component,
      'page/:你好',
      'instance:/1',
      'content/:main'
    );
    const expected = appendPirProjectionCollectionItemPath(
      slot,
      'card:详情',
      'products/:collection',
      'key/6:string/5:a/:1'
    );

    expect(
      Function(`return ${compilePirRootProjectionPath('page/:你好')}`)()
    ).toBe(root);
    expect(
      Function(
        '__parent',
        `return ${compilePirComponentProjectionPath('__parent', 'page/:你好', 'instance:/1', 'card:详情')}`
      )(root)
    ).toBe(component);
    expect(
      Function(
        '__parent',
        `return ${compilePirSlotProjectionPath('__parent', 'page/:你好', 'instance:/1', 'content/:main')}`
      )(component)
    ).toBe(slot);
    expect(
      runtime.appendCollectionPath(
        slot,
        'card:详情',
        'products/:collection',
        'key/6:string/5:a/:1'
      )
    ).toBe(expected);
  });

  it('does not repeat or clear an unchanged semantic issue report', async () => {
    let previousDependencies: readonly unknown[] | undefined;
    let cleanup: (() => void) | undefined;
    const effectHook: EffectHook = (effect, dependencies) => {
      const unchanged =
        previousDependencies?.length === dependencies.length &&
        dependencies.every((dependency, index) =>
          Object.is(dependency, previousDependencies?.[index])
        );
      if (unchanged) return;
      cleanup?.();
      cleanup = effect() || undefined;
      previousDependencies = [...dependencies];
    };
    const runtime = await loadRuntime(effectHook);
    const reports: unknown[] = [];
    const props = {
      runtime: {
        reportCollectionProjectionIssues: (input: unknown) =>
          reports.push(input),
      },
      location: {
        documentId: 'page',
        nodeId: 'products',
        instancePath: 'root/4:page',
      },
      issues: [
        {
          code: 'PIR_COLLECTION_SOURCE_NOT_ARRAY',
          path: '/source',
          message: 'Collection source must resolve to an array.',
        },
      ],
    };

    runtime.report(props);
    runtime.report({
      ...props,
      runtime: { ...props.runtime },
      issues: [...props.issues],
    });

    expect(reports).toHaveLength(1);
    cleanup?.();
    expect(reports).toHaveLength(2);
    expect(reports.at(-1)).toEqual(expect.objectContaining({ issues: [] }));
  });
});
