/**
 * Standalone Collection runtime mirrored from the canonical PIR projection
 * algebra. Its behavior is kept locked to `projectPirCollection` by
 * conformance tests so exported applications do not depend on `@prodivix/pir`.
 */
export const createPirCollectionRuntimeSource = (
  useEffectExpression: string
): string => `type __PdxCollectionPreviewState = 'auto' | 'item' | 'empty' | 'loading' | 'error';

type __PdxCollectionPreviewInput = Readonly<{
  state: __PdxCollectionPreviewState;
  errorValue?: unknown;
}>;

type __PdxCollectionLocation = Readonly<{
  documentId: string;
  nodeId: string;
  instancePath: string;
}>;

type __PdxCollectionProjectionIssue = Readonly<{
  code: string;
  path: string;
  message: string;
  itemIndex?: number;
}>;

type __PdxCollectionSymbols = Readonly<{
  itemId: string;
  itemName: string;
  indexId: string;
  indexName: string;
  errorId?: string;
}>;

type __PdxCollectionItemProjection = Readonly<{
  item: unknown;
  index: number;
  key: string | number;
  keyIdentity: string;
  scope: __PdxScope;
}>;

type __PdxCollectionProjectionResult =
  | Readonly<{
      status: 'ready';
      kind: 'items';
      items: readonly __PdxCollectionItemProjection[];
    }>
  | Readonly<{
      status: 'ready';
      kind: 'region';
      regionName: 'empty' | 'loading' | 'error';
      scope: __PdxScope;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly __PdxCollectionProjectionIssue[];
    }>;

type __PdxCollectionProjectionRuntimeInput = Readonly<{
  parentScope: __PdxScope;
  preview: __PdxCollectionPreviewInput;
  symbols: __PdxCollectionSymbols;
  resolveSource: () => unknown;
  resolveKey: (scope: __PdxScope, index: number) => unknown;
}>;

const __pdxCollectionIssue = (
  code: string,
  path: string,
  message: string,
  itemIndex?: number
): __PdxCollectionProjectionIssue => ({
  code,
  path,
  message,
  ...(itemIndex === undefined ? {} : { itemIndex }),
});

const __pdxCollectionItemScope = (
  parentScope: __PdxScope,
  symbols: __PdxCollectionSymbols,
  item: unknown,
  index: number
): __PdxScope => ({
  ...parentScope,
  collectionSymbolsById: {
    ...parentScope.collectionSymbolsById,
    [symbols.itemId]: item,
    [symbols.indexId]: index,
  },
});

const __pdxCollectionErrorScope = (
  parentScope: __PdxScope,
  symbols: __PdxCollectionSymbols,
  errorValue: unknown
): __PdxScope =>
  symbols.errorId
    ? {
        ...parentScope,
        collectionSymbolsById: {
          ...parentScope.collectionSymbolsById,
          [symbols.errorId]: errorValue,
        },
      }
    : { ...parentScope };

const __pdxCollectionKeyIdentity = (key: string | number): string => {
  const kind = typeof key;
  const value = Object.is(key, -0) ? '0' : String(key);
  return \`key/\${kind.length}:\${kind}/\${value.length}:\${value}\`;
};

const __pdxProjectCollection = (
  input: __PdxCollectionProjectionRuntimeInput
): __PdxCollectionProjectionResult => {
  const state = input.preview.state;
  if (!['auto', 'item', 'empty', 'loading', 'error'].includes(state)) {
    return {
      status: 'blocked',
      issues: [
        __pdxCollectionIssue(
          'PIR_COLLECTION_PREVIEW_STATE_INVALID',
          '/preview/state',
          \`Unsupported Collection preview state "\${String(state)}".\`
        ),
      ],
    };
  }
  if (state === 'empty' || state === 'loading' || state === 'error') {
    return {
      status: 'ready',
      kind: 'region',
      regionName: state,
      scope:
        state === 'error'
          ? __pdxCollectionErrorScope(
              input.parentScope,
              input.symbols,
              input.preview.errorValue
            )
          : { ...input.parentScope },
    };
  }

  let source: unknown;
  try {
    source = input.resolveSource();
  } catch (error) {
    return {
      status: 'blocked',
      issues: [
        __pdxCollectionIssue(
          'PIR_COLLECTION_SOURCE_RESOLUTION_FAILED',
          '/source',
          \`Collection source resolution failed: \${error instanceof Error ? error.message : String(error)}\`
        ),
      ],
    };
  }
  if (!Array.isArray(source)) {
    return {
      status: 'blocked',
      issues: [
        __pdxCollectionIssue(
          'PIR_COLLECTION_SOURCE_NOT_ARRAY',
          '/source',
          'Collection source must resolve to an array.'
        ),
      ],
    };
  }
  if (state === 'item' && source.length === 0) {
    return {
      status: 'blocked',
      issues: [
        __pdxCollectionIssue(
          'PIR_COLLECTION_ITEM_SOURCE_EMPTY',
          '/source',
          'Explicit item preview requires a non-empty source array.'
        ),
      ],
    };
  }
  if (state === 'auto' && source.length === 0) {
    return {
      status: 'ready',
      kind: 'region',
      regionName: 'empty',
      scope: { ...input.parentScope },
    };
  }

  const items: __PdxCollectionItemProjection[] = [];
  const keyOwnerIndexByIdentity = new Map<string, number>();
  const issues: __PdxCollectionProjectionIssue[] = [];
  source.forEach((item, index) => {
    const scope = __pdxCollectionItemScope(
      input.parentScope,
      input.symbols,
      item,
      index
    );
    let keyValue: unknown;
    try {
      keyValue = input.resolveKey(scope, index);
    } catch (error) {
      issues.push(
        __pdxCollectionIssue(
          'PIR_COLLECTION_KEY_RESOLUTION_FAILED',
          '/key',
          \`Collection key resolution failed for item \${index}: \${error instanceof Error ? error.message : String(error)}\`,
          index
        )
      );
      return;
    }
    if (
      typeof keyValue !== 'string' &&
      !(typeof keyValue === 'number' && Number.isFinite(keyValue))
    ) {
      issues.push(
        __pdxCollectionIssue(
          'PIR_COLLECTION_KEY_VALUE_INVALID',
          '/key',
          \`Collection key for item \${index} must resolve to a string or finite number.\`,
          index
        )
      );
      return;
    }
    const keyIdentity = __pdxCollectionKeyIdentity(keyValue);
    const previousIndex = keyOwnerIndexByIdentity.get(keyIdentity);
    if (previousIndex !== undefined) {
      issues.push(
        __pdxCollectionIssue(
          'PIR_COLLECTION_KEY_DUPLICATE',
          '/key',
          \`Collection key for item \${index} duplicates item \${previousIndex}.\`,
          index
        )
      );
      return;
    }
    keyOwnerIndexByIdentity.set(keyIdentity, index);
    items.push({ item, index, key: keyValue, keyIdentity, scope });
  });
  return issues.length > 0
    ? { status: 'blocked', issues }
    : { status: 'ready', kind: 'items', items };
};

const __pdxNoCollectionProjectionIssues: readonly __PdxCollectionProjectionIssue[] = [];

const __pdxCollectionIssueIdentity = (
  issues: readonly __PdxCollectionProjectionIssue[]
): string =>
  issues
    .map((issue) =>
      [issue.code, issue.path, issue.message, String(issue.itemIndex ?? '')]
        .map((part) => \`${'${part.length}:${part}'}\`)
        .join('/')
    )
    .join('/issue/');

const __PdxCollectionIssueReporter = ({
  runtime,
  location,
  issues,
}: Readonly<{
  runtime: __PdxRuntimePort;
  location: __PdxCollectionLocation;
  issues: readonly __PdxCollectionProjectionIssue[];
}>) => {
  const issueIdentity = __pdxCollectionIssueIdentity(issues);
  const report = runtime.reportCollectionProjectionIssues;
  ${useEffectExpression}(() => {
    report?.({ location, issues });
    return () =>
      report?.({
        location,
        issues: __pdxNoCollectionProjectionIssues,
      });
  }, [
    report,
    location.documentId,
    location.nodeId,
    location.instancePath,
    issueIdentity,
  ]);
  return null;
};`;
