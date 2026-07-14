import type {
  PIRCollectionKeyBinding,
  PIRCollectionNode,
  PIRCollectionSourceBinding,
} from '../pir.types';
import {
  resolvePirValueBinding,
  type PIRCodeValueResolver,
  type PIRRuntimeValueScope,
} from './pirComponentProjection';

export const PIR_COLLECTION_PREVIEW_STATES = Object.freeze([
  'auto',
  'item',
  'empty',
  'loading',
  'error',
] as const);

export type PIRCollectionPreviewState =
  (typeof PIR_COLLECTION_PREVIEW_STATES)[number];

export type PIRCollectionResolvedState = Exclude<
  PIRCollectionPreviewState,
  'auto'
>;

export type PIRCollectionPreviewInput = Readonly<{
  state: PIRCollectionPreviewState;
  errorValue?: unknown;
}>;

export type PIRCollectionProjectionLocation = Readonly<{
  documentId: string;
  nodeId: string;
  instancePath: string;
}>;

export const PIR_COLLECTION_PROJECTION_ISSUE_CODES = Object.freeze({
  previewStateInvalid: 'PIR_COLLECTION_PREVIEW_STATE_INVALID',
  itemRegionMissing: 'PIR_COLLECTION_ITEM_REGION_MISSING',
  sourceResolutionFailed: 'PIR_COLLECTION_SOURCE_RESOLUTION_FAILED',
  sourceNotArray: 'PIR_COLLECTION_SOURCE_NOT_ARRAY',
  itemSourceEmpty: 'PIR_COLLECTION_ITEM_SOURCE_EMPTY',
  keyResolutionFailed: 'PIR_COLLECTION_KEY_RESOLUTION_FAILED',
  keyValueInvalid: 'PIR_COLLECTION_KEY_VALUE_INVALID',
  keyDuplicate: 'PIR_COLLECTION_KEY_DUPLICATE',
} as const);

export type PIRCollectionProjectionIssueCode =
  (typeof PIR_COLLECTION_PROJECTION_ISSUE_CODES)[keyof typeof PIR_COLLECTION_PROJECTION_ISSUE_CODES];

export const PIR_COLLECTION_PROJECTION_FACT_CODES = Object.freeze({
  indexKey: 'PIR_COLLECTION_INDEX_KEY_UNSTABLE',
} as const);

export type PIRCollectionProjectionFactCode =
  (typeof PIR_COLLECTION_PROJECTION_FACT_CODES)[keyof typeof PIR_COLLECTION_PROJECTION_FACT_CODES];

export type PIRCollectionProjectionIssue = Readonly<{
  code: PIRCollectionProjectionIssueCode;
  path: string;
  message: string;
  itemIndex?: number;
}>;

export type PIRCollectionProjectionFact = Readonly<{
  code: PIRCollectionProjectionFactCode;
  severity: 'warning';
  path: string;
  message: string;
}>;

export type PIRCollectionKey = string | number;

export type PIRCollectionProjectionPlan = Readonly<{
  nodeId: string;
  sourceStrategy: PIRCollectionSourceBinding['kind'];
  source: PIRCollectionSourceBinding;
  keyStrategy: PIRCollectionKeyBinding['kind'];
  key: PIRCollectionKeyBinding;
  symbols: PIRCollectionNode['symbols'];
  hasItemRegion: boolean;
  regionsByState: Readonly<
    Record<PIRCollectionResolvedState, readonly string[]>
  >;
  facts: readonly PIRCollectionProjectionFact[];
}>;

export type PIRCollectionItemProjection = Readonly<{
  item: unknown;
  index: number;
  key: PIRCollectionKey;
  keyIdentity: string;
  scope: PIRRuntimeValueScope;
}>;

export type PIRCollectionProjection =
  | Readonly<{
      kind: 'items';
      regionName: 'item';
      nodeIds: readonly string[];
      items: readonly PIRCollectionItemProjection[];
    }>
  | Readonly<{
      kind: 'region';
      regionName: Exclude<PIRCollectionResolvedState, 'item'>;
      nodeIds: readonly string[];
      scope: PIRRuntimeValueScope;
    }>;

export type PIRCollectionProjectionResult =
  | Readonly<{
      status: 'ready';
      projection: PIRCollectionProjection;
      facts: readonly PIRCollectionProjectionFact[];
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly PIRCollectionProjectionIssue[];
      facts: readonly PIRCollectionProjectionFact[];
    }>;

export type PIRCollectionProjectionInput = Readonly<{
  node: PIRCollectionNode;
  regions?: Readonly<Record<string, readonly string[]>>;
  parentScope: PIRRuntimeValueScope;
  preview: PIRCollectionPreviewInput;
  resolveCodeValue?: PIRCodeValueResolver;
}>;

const INDEX_KEY_FACT: PIRCollectionProjectionFact = Object.freeze({
  code: PIR_COLLECTION_PROJECTION_FACT_CODES.indexKey,
  severity: 'warning',
  path: '/key',
  message:
    'An explicit index key changes item identity when the source is reordered.',
});

const freezeNodeIds = (nodeIds: readonly string[] | undefined) =>
  Object.freeze([...(nodeIds ?? [])]);

/** Creates the immutable target-neutral plan consumed by all Collection projections. */
export const createPirCollectionProjectionPlan = (
  node: PIRCollectionNode,
  regions: Readonly<Record<string, readonly string[]>> = {}
): PIRCollectionProjectionPlan => {
  const facts =
    node.key.kind === 'index'
      ? Object.freeze([INDEX_KEY_FACT])
      : Object.freeze([]);
  return Object.freeze({
    nodeId: node.id,
    sourceStrategy: node.source.kind,
    source: node.source,
    keyStrategy: node.key.kind,
    key: node.key,
    symbols: Object.freeze({ ...node.symbols }),
    hasItemRegion: Object.hasOwn(regions, 'item'),
    regionsByState: Object.freeze({
      item: freezeNodeIds(regions.item),
      empty: freezeNodeIds(regions.empty),
      loading: freezeNodeIds(regions.loading),
      error: freezeNodeIds(regions.error),
    }),
    facts,
  });
};

export const selectPirCollectionResolvedState = (
  previewState: PIRCollectionPreviewState,
  sourceLength?: number
): PIRCollectionResolvedState | undefined => {
  if (previewState !== 'auto') {
    return PIR_COLLECTION_PREVIEW_STATES.includes(previewState)
      ? previewState
      : undefined;
  }
  if (!Number.isSafeInteger(sourceLength) || sourceLength! < 0)
    return undefined;
  return sourceLength === 0 ? 'empty' : 'item';
};

export const selectPirCollectionRegionNodeIds = (
  plan: PIRCollectionProjectionPlan,
  state: PIRCollectionResolvedState
): readonly string[] => plan.regionsByState[state];

const extendCollectionScope = (
  parentScope: PIRRuntimeValueScope,
  symbols: Readonly<Record<string, unknown>>
): PIRRuntimeValueScope =>
  Object.freeze({
    ...parentScope,
    collectionSymbolsById: Object.freeze({
      ...parentScope.collectionSymbolsById,
      ...symbols,
    }),
  });

export const createPirCollectionItemScope = (
  parentScope: PIRRuntimeValueScope,
  symbols: PIRCollectionNode['symbols'],
  item: unknown,
  index: number
): PIRRuntimeValueScope =>
  extendCollectionScope(parentScope, {
    [symbols.itemId]: item,
    [symbols.indexId]: index,
  });

export const createPirCollectionErrorScope = (
  parentScope: PIRRuntimeValueScope,
  symbols: PIRCollectionNode['symbols'],
  errorValue: unknown
): PIRRuntimeValueScope =>
  symbols.errorId
    ? extendCollectionScope(parentScope, { [symbols.errorId]: errorValue })
    : Object.freeze({ ...parentScope });

export const isPirCollectionKey = (value: unknown): value is PIRCollectionKey =>
  typeof value === 'string' ||
  (typeof value === 'number' && Number.isFinite(value));

const encodeProjectionPathSegment = (value: string): string =>
  `${value.length}:${value}`;

/** Produces a type-sensitive, delimiter-safe identity for one valid key. */
export const createPirCollectionKeyIdentity = (
  key: PIRCollectionKey
): string => {
  const kind = typeof key;
  const value = Object.is(key, -0) ? '0' : String(key);
  return `key/${encodeProjectionPathSegment(kind)}/${encodeProjectionPathSegment(value)}`;
};

const createIssue = (
  code: PIRCollectionProjectionIssueCode,
  path: string,
  message: string,
  itemIndex?: number
): PIRCollectionProjectionIssue =>
  Object.freeze({
    code,
    path,
    message,
    ...(itemIndex === undefined ? {} : { itemIndex }),
  });

const blocked = (
  facts: readonly PIRCollectionProjectionFact[],
  issues: readonly PIRCollectionProjectionIssue[]
): PIRCollectionProjectionResult =>
  Object.freeze({
    status: 'blocked',
    issues: Object.freeze([...issues]),
    facts,
  });

const readyRegion = (
  plan: PIRCollectionProjectionPlan,
  state: Exclude<PIRCollectionResolvedState, 'item'>,
  scope: PIRRuntimeValueScope
): PIRCollectionProjectionResult =>
  Object.freeze({
    status: 'ready',
    projection: Object.freeze({
      kind: 'region',
      regionName: state,
      nodeIds: selectPirCollectionRegionNodeIds(plan, state),
      scope,
    }),
    facts: plan.facts,
  });

const resolveSource = (
  plan: PIRCollectionProjectionPlan,
  scope: PIRRuntimeValueScope,
  resolveCodeValue?: PIRCodeValueResolver
): unknown =>
  plan.source.kind === 'literal'
    ? plan.source.value
    : resolvePirValueBinding(plan.source.value, scope, resolveCodeValue);

const resolveKey = (
  plan: PIRCollectionProjectionPlan,
  scope: PIRRuntimeValueScope,
  index: number,
  resolveCodeValue?: PIRCodeValueResolver
): unknown =>
  plan.key.kind === 'index'
    ? index
    : resolvePirValueBinding(plan.key.value, scope, resolveCodeValue);

/**
 * Resolves Collection state, source, item scopes and keys as one fail-closed
 * operation. Renderer and compiler conformance use this function as the
 * canonical runtime oracle.
 */
export const projectPirCollection = (
  input: PIRCollectionProjectionInput
): PIRCollectionProjectionResult => {
  const plan = createPirCollectionProjectionPlan(input.node, input.regions);
  const previewState = input.preview.state as string;
  if (
    !(PIR_COLLECTION_PREVIEW_STATES as readonly string[]).includes(previewState)
  ) {
    return blocked(plan.facts, [
      createIssue(
        PIR_COLLECTION_PROJECTION_ISSUE_CODES.previewStateInvalid,
        '/preview/state',
        `Unsupported Collection preview state "${previewState}".`
      ),
    ]);
  }
  if (!plan.hasItemRegion) {
    return blocked(plan.facts, [
      createIssue(
        PIR_COLLECTION_PROJECTION_ISSUE_CODES.itemRegionMissing,
        '/regions/item',
        'Collection must define its required item region.'
      ),
    ]);
  }

  const state = previewState as PIRCollectionPreviewState;
  if (state === 'empty' || state === 'loading' || state === 'error') {
    const scope =
      state === 'error'
        ? createPirCollectionErrorScope(
            input.parentScope,
            plan.symbols,
            input.preview.errorValue
          )
        : Object.freeze({ ...input.parentScope });
    return readyRegion(plan, state, scope);
  }

  let source: unknown;
  try {
    source = resolveSource(plan, input.parentScope, input.resolveCodeValue);
  } catch (error) {
    return blocked(plan.facts, [
      createIssue(
        PIR_COLLECTION_PROJECTION_ISSUE_CODES.sourceResolutionFailed,
        '/source',
        `Collection source resolution failed: ${error instanceof Error ? error.message : String(error)}`
      ),
    ]);
  }
  if (!Array.isArray(source)) {
    return blocked(plan.facts, [
      createIssue(
        PIR_COLLECTION_PROJECTION_ISSUE_CODES.sourceNotArray,
        '/source',
        'Collection source must resolve to an array.'
      ),
    ]);
  }
  if (state === 'item' && source.length === 0) {
    return blocked(plan.facts, [
      createIssue(
        PIR_COLLECTION_PROJECTION_ISSUE_CODES.itemSourceEmpty,
        '/source',
        'Explicit item preview requires a non-empty source array.'
      ),
    ]);
  }
  const resolvedState = selectPirCollectionResolvedState(state, source.length);
  if (resolvedState === 'empty') {
    return readyRegion(plan, 'empty', Object.freeze({ ...input.parentScope }));
  }

  const items: PIRCollectionItemProjection[] = [];
  const keyOwnerIndexByIdentity = new Map<string, number>();
  const issues: PIRCollectionProjectionIssue[] = [];
  source.forEach((item, index) => {
    const scope = createPirCollectionItemScope(
      input.parentScope,
      plan.symbols,
      item,
      index
    );
    let keyValue: unknown;
    try {
      keyValue = resolveKey(plan, scope, index, input.resolveCodeValue);
    } catch (error) {
      issues.push(
        createIssue(
          PIR_COLLECTION_PROJECTION_ISSUE_CODES.keyResolutionFailed,
          '/key',
          `Collection key resolution failed for item ${index}: ${error instanceof Error ? error.message : String(error)}`,
          index
        )
      );
      return;
    }
    if (!isPirCollectionKey(keyValue)) {
      issues.push(
        createIssue(
          PIR_COLLECTION_PROJECTION_ISSUE_CODES.keyValueInvalid,
          '/key',
          `Collection key for item ${index} must resolve to a string or finite number.`,
          index
        )
      );
      return;
    }
    const keyIdentity = createPirCollectionKeyIdentity(keyValue);
    const previousIndex = keyOwnerIndexByIdentity.get(keyIdentity);
    if (previousIndex !== undefined) {
      issues.push(
        createIssue(
          PIR_COLLECTION_PROJECTION_ISSUE_CODES.keyDuplicate,
          '/key',
          `Collection key for item ${index} duplicates item ${previousIndex}.`,
          index
        )
      );
      return;
    }
    keyOwnerIndexByIdentity.set(keyIdentity, index);
    items.push(
      Object.freeze({ item, index, key: keyValue, keyIdentity, scope })
    );
  });
  if (issues.length > 0) return blocked(plan.facts, issues);
  return Object.freeze({
    status: 'ready',
    projection: Object.freeze({
      kind: 'items',
      regionName: 'item',
      nodeIds: selectPirCollectionRegionNodeIds(plan, 'item'),
      items: Object.freeze(items),
    }),
    facts: plan.facts,
  });
};
