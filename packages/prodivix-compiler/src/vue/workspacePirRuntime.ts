import {
  createComponentContractMemberSymbolId,
  createPirCollectionErrorSymbolId,
  createPirCollectionIndexSymbolId,
  createPirCollectionItemSymbolId,
  createPirDataSymbolId,
  createPirParamSymbolId,
  createPirStateSymbolId,
} from '@prodivix/authoring';
import {
  isWorkspacePirDocument,
  type WorkspacePirDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { ExportModule } from '#src/export';

export const WORKSPACE_VUE_PIR_RUNTIME_MODULE_ID =
  'workspace-vue-pir-runtime' as const;

type RuntimeValueIdentity = Readonly<{
  paramsById: Readonly<Record<string, string>>;
  stateById: Readonly<Record<string, string>>;
  dataById: Readonly<Record<string, string>>;
  componentPropsById: Readonly<Record<string, string>>;
  componentVariantsById: Readonly<Record<string, string>>;
  collectionsByNodeId: Readonly<
    Record<
      string,
      Readonly<{
        itemLocalId: string;
        itemId: string;
        indexLocalId: string;
        indexId: string;
        errorLocalId?: string;
        errorId?: string;
      }>
    >
  >;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const orderedRecord = <T>(
  entries: readonly (readonly [string, T])[]
): Readonly<Record<string, T>> =>
  Object.freeze(
    Object.fromEntries(
      [...entries].sort(([left], [right]) => compareText(left, right))
    )
  );

const runtimeValueIdentity = (
  workspaceId: string,
  document: WorkspacePirDocument
): RuntimeValueIdentity => {
  const content = document.content;
  return Object.freeze({
    paramsById: orderedRecord(
      Object.keys(content.logic?.props ?? {}).map((paramId) => [
        paramId,
        createPirParamSymbolId(workspaceId, document.id, paramId),
      ])
    ),
    stateById: orderedRecord(
      Object.keys(content.logic?.state ?? {}).map((stateId) => [
        stateId,
        createPirStateSymbolId(workspaceId, document.id, stateId),
      ])
    ),
    dataById: orderedRecord(
      Object.keys(content.logic?.dataById ?? {}).map((dataId) => [
        dataId,
        createPirDataSymbolId(workspaceId, document.id, dataId),
      ])
    ),
    componentPropsById: orderedRecord(
      Object.keys(content.componentContract?.propsById ?? {}).map(
        (memberId) => [
          memberId,
          createComponentContractMemberSymbolId(
            workspaceId,
            document.id,
            'prop',
            memberId
          ),
        ]
      )
    ),
    componentVariantsById: orderedRecord(
      Object.keys(content.componentContract?.variantAxesById ?? {}).map(
        (memberId) => [
          memberId,
          createComponentContractMemberSymbolId(
            workspaceId,
            document.id,
            'variant',
            memberId
          ),
        ]
      )
    ),
    collectionsByNodeId: orderedRecord(
      Object.values(content.ui.graph.nodesById).flatMap((node) =>
        node.kind === 'collection'
          ? [
              [
                node.id,
                Object.freeze({
                  itemLocalId: node.symbols.itemId,
                  itemId: createPirCollectionItemSymbolId(
                    workspaceId,
                    document.id,
                    node.id,
                    node.symbols.itemId
                  ),
                  indexLocalId: node.symbols.indexId,
                  indexId: createPirCollectionIndexSymbolId(
                    workspaceId,
                    document.id,
                    node.id,
                    node.symbols.indexId
                  ),
                  ...(node.symbols.errorId
                    ? {
                        errorLocalId: node.symbols.errorId,
                        errorId: createPirCollectionErrorSymbolId(
                          workspaceId,
                          document.id,
                          node.id,
                          node.symbols.errorId
                        ),
                      }
                    : {}),
                }),
              ] as const,
            ]
          : []
      )
    ),
  });
};

const runtimeSource = (
  workspace: WorkspaceSnapshot,
  documents: readonly WorkspacePirDocument[]
): string => {
  const documentsById = orderedRecord(
    documents.map((document) => [document.id, document.content])
  );
  const runtimeValuesByDocumentId = orderedRecord(
    documents.map((document) => [
      document.id,
      runtimeValueIdentity(workspace.id, document),
    ])
  );
  return `type JsonRecord = Readonly<Record<string, any>>;

type PirDocument = Readonly<{
  metadata?: JsonRecord;
  componentContract?: JsonRecord;
  ui: Readonly<{ graph: Readonly<{
    rootId: string;
    nodesById: Readonly<Record<string, JsonRecord>>;
    childIdsById: Readonly<Record<string, readonly string[]>>;
    regionsById?: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  }> }>;
  logic?: Readonly<{
    props?: Readonly<Record<string, JsonRecord>>;
    state?: Readonly<Record<string, JsonRecord>>;
    dataById?: Readonly<Record<string, JsonRecord>>;
  }>;
}>;

export type WorkspaceVuePirRuntimePort = Readonly<{
  subscribeDataLifecycle?(listener: () => void): () => void;
  resolveDataLifecycleSnapshot(request: JsonRecord): JsonRecord;
  activateDataBindings?(request: JsonRecord): void | Promise<void>;
  dispatchDataMutation(request: JsonRecord): Promise<unknown>;
  dispatchTrigger(input: JsonRecord): void;
  resolveCodeValue(reference: JsonRecord, scope: JsonRecord): unknown;
}>;

type PirScope = Readonly<{
  paramsById: JsonRecord;
  stateById: JsonRecord;
  dataById: JsonRecord;
  dataLifecycleById: JsonRecord;
  collectionSymbolsById: JsonRecord;
  componentPropsById: JsonRecord;
  componentVariantsById: JsonRecord;
  slotPropsById: JsonRecord;
}>;

type PirDocumentComponentProps = Readonly<{
  runtime: WorkspaceVuePirRuntimePort;
  routeId?: string;
  instancePath?: string;
  paramsById?: JsonRecord;
  propsById?: JsonRecord;
  eventsById?: Readonly<Record<string, (payload: unknown) => void>>;
  variantsById?: Readonly<Record<string, string | undefined>>;
  slotsById?: Readonly<Record<string, (props: JsonRecord, instancePath: string) => any>>;
  routeOutletsByNodeId?: Readonly<Record<string, () => any>>;
}>;

const documentsById = ${JSON.stringify(documentsById)} as unknown as Readonly<Record<string, PirDocument>>;
const runtimeValuesByDocumentId = ${JSON.stringify(runtimeValuesByDocumentId)} as unknown as Readonly<Record<string, JsonRecord>>;

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const readPath = (source: unknown, path: unknown): unknown => {
  if (typeof path !== 'string' || !path.trim()) return source;
  const tokens = Array.from(path.trim().matchAll(/[^.[\\]]+|\\[(\\d+)\\]/g)).map((token) => token[1] ?? token[0]);
  let cursor = source;
  for (const token of tokens) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      const index = Number(token);
      if (!Number.isInteger(index)) return undefined;
      cursor = cursor[index];
      continue;
    }
    if (typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[token];
  }
  return cursor;
};

const resolveBinding = (
  binding: unknown,
  scope: PirScope,
  runtime: WorkspaceVuePirRuntimePort
): unknown => {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return undefined;
  const value = binding as JsonRecord;
  let resolved: unknown;
  if (value.kind === 'literal') resolved = value.value;
  else if (value.kind === 'param') resolved = scope.paramsById[value.paramId];
  else if (value.kind === 'state') resolved = scope.stateById[value.stateId];
  else if (value.kind === 'data') resolved = scope.dataById[value.dataId];
  else if (value.kind === 'collection-symbol') resolved = scope.collectionSymbolsById[value.symbolId];
  else if (value.kind === 'component-prop') resolved = scope.componentPropsById[value.memberId];
  else if (value.kind === 'component-variant') resolved = scope.componentVariantsById[value.memberId];
  else if (value.kind === 'slot-prop') resolved = scope.slotPropsById[value.memberId];
  else if (value.kind === 'code') resolved = runtime.resolveCodeValue(value.reference as JsonRecord, scope);
  return readPath(resolved, value.path);
};

const resolveRecord = (
  bindings: unknown,
  scope: PirScope,
  runtime: WorkspaceVuePirRuntimePort
): JsonRecord => {
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) return Object.freeze({});
  return Object.freeze(Object.fromEntries(
    Object.entries(bindings as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, binding]) => [key, resolveBinding(binding, scope, runtime)])
  ));
};

const runtimeValues = (documentId: string, scope: PirScope): JsonRecord => {
  const identity = runtimeValuesByDocumentId[documentId] ?? {};
  const values: Record<string, unknown> = {};
  const project = (ids: unknown, source: JsonRecord) => {
    if (!ids || typeof ids !== 'object' || Array.isArray(ids)) return;
    Object.entries(ids as Record<string, unknown>).forEach(([localId, semanticId]) => {
      if (typeof semanticId === 'string') values[semanticId] = source[localId];
    });
  };
  project(identity.paramsById, scope.paramsById);
  project(identity.stateById, scope.stateById);
  project(identity.dataById, scope.dataById);
  project(identity.componentPropsById, scope.componentPropsById);
  project(identity.componentVariantsById, scope.componentVariantsById);
  const collections = identity.collectionsByNodeId;
  if (collections && typeof collections === 'object' && !Array.isArray(collections)) {
    Object.values(collections as Record<string, JsonRecord>).forEach((collection) => {
      if (typeof collection.itemId === 'string' && typeof collection.itemLocalId === 'string') values[collection.itemId] = scope.collectionSymbolsById[collection.itemLocalId];
      if (typeof collection.indexId === 'string' && typeof collection.indexLocalId === 'string') values[collection.indexId] = scope.collectionSymbolsById[collection.indexLocalId];
      if (typeof collection.errorId === 'string' && typeof collection.errorLocalId === 'string') values[collection.errorId] = scope.collectionSymbolsById[collection.errorLocalId];
    });
  }
  return Object.freeze(values);
};

const normalizeDomProp = (key: string): string =>
  key === 'className' ? 'class' : key === 'htmlFor' ? 'for' : key;

const eventProp = (name: string): string => {
  const normalized = name.trim().replace(/^on/i, '');
  return 'on' + normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const projectData = (
  documentId: string,
  document: PirDocument,
  instancePath: string,
  runtime: WorkspaceVuePirRuntimePort
): Readonly<{ dataById: JsonRecord; lifecycleById: JsonRecord }> => {
  const dataById: Record<string, unknown> = {};
  const lifecycleById: Record<string, unknown> = {};
  Object.entries(document.logic?.dataById ?? {}).forEach(([dataId, binding]) => {
    const snapshot = runtime.resolveDataLifecycleSnapshot({ documentId, instancePath, dataId, binding });
    lifecycleById[dataId] = snapshot;
    if (snapshot.status === 'success') dataById[dataId] = snapshot.value;
  });
  return Object.freeze({
    dataById: Object.freeze(dataById),
    lifecycleById: Object.freeze(lifecycleById),
  });
};

type RenderContext = Readonly<{
  documentId: string;
  document: PirDocument;
  runtime: WorkspaceVuePirRuntimePort;
  routeId?: string;
  setState(stateId: string, value: unknown): void;
  eventsById: Readonly<Record<string, (payload: unknown) => void>>;
  slotsById: Readonly<Record<string, (props: JsonRecord, instancePath: string) => any>>;
  routeOutletsByNodeId: Readonly<Record<string, () => any>>;
}>;

const renderNodeList = (
  context: RenderContext,
  nodeIds: readonly string[],
  scope: PirScope,
  instancePath: string
): any[] => nodeIds.map((nodeId) => renderNode(context, nodeId, scope, instancePath));

const renderCollection = (
  context: RenderContext,
  node: JsonRecord,
  scope: PirScope,
  instancePath: string
): any => {
  const graph = context.document.ui.graph;
  const regions = graph.regionsById?.[node.id] ?? {};
  const lifecycle = node.lifecycle?.kind === 'data-operation'
    ? scope.dataLifecycleById[node.lifecycle.dataId]
    : undefined;
  const status = lifecycle?.status === 'idle'
    ? node.lifecycle?.idle
    : lifecycle?.status;
  const renderRegion = (name: string, nextScope = scope) => {
    const nodeIds = regions[name] ?? [];
    if (!nodeIds.length) {
      return h('p', { 'data-prodivix-data-status': name, role: name === 'error' ? 'alert' : undefined }, name);
    }
    return h(Fragment, null, renderNodeList(context, nodeIds, nextScope, instancePath));
  };
  if (status === 'loading') return renderRegion('loading');
  if (status === 'error') {
    const errorId = node.symbols?.errorId;
    const errorScope = errorId
      ? { ...scope, collectionSymbolsById: { ...scope.collectionSymbolsById, [errorId]: lifecycle?.error } }
      : scope;
    return renderRegion('error', errorScope);
  }
  if (status === 'empty') return renderRegion('empty');
  const source = node.source?.kind === 'literal'
    ? node.source.value
    : resolveBinding(node.source?.value, scope, context.runtime);
  if (!Array.isArray(source) || source.length === 0) return renderRegion('empty');
  const itemNodes = regions.item ?? graph.childIdsById[node.id] ?? [];
  return source.map((item, index) => {
    const symbols = Object.freeze({
      ...scope.collectionSymbolsById,
      [node.symbols.itemId]: item,
      [node.symbols.indexId]: index,
    });
    const itemScope = Object.freeze({ ...scope, collectionSymbolsById: symbols });
    const rawKey = node.key?.kind === 'index'
      ? index
      : resolveBinding(node.key?.value, itemScope, context.runtime);
    const key = typeof rawKey === 'string' || typeof rawKey === 'number' ? rawKey : index;
    return h(Fragment, { key }, renderNodeList(context, itemNodes, itemScope, instancePath + '/collection:' + node.id + ':' + String(key)));
  });
};

const renderNode = (
  context: RenderContext,
  nodeId: string,
  parentScope: PirScope,
  instancePath: string
): any => {
  const graph = context.document.ui.graph;
  const node = graph.nodesById[nodeId];
  if (!node) return null;
  const routeOutlet = context.routeOutletsByNodeId[nodeId];
  if (routeOutlet) return routeOutlet();
  if (node.kind === 'collection') return renderCollection(context, node, parentScope, instancePath);
  if (node.kind === 'component-instance') {
    const target = createWorkspacePirDocumentComponent(node.componentDocumentId);
    const propsById = resolveRecord(node.bindings?.props, parentScope, context.runtime);
    const eventsById = Object.freeze(Object.fromEntries(
      Object.entries(node.bindings?.events ?? {}).map(([memberId, binding]) => [
        memberId,
        (payload: unknown) => context.runtime.dispatchTrigger({
          binding,
          payload,
          scope: parentScope,
          runtimeValuesById: runtimeValues(context.documentId, parentScope),
          source: { documentId: context.documentId, nodeId, eventName: memberId, instancePath },
        }),
      ])
    ));
    const slotsById = Object.freeze(Object.fromEntries(
      Object.entries(graph.regionsById?.[nodeId] ?? {}).map(([slotId, nodeIds]) => [
        slotId,
        (slotPropsById: JsonRecord, outletPath: string) => renderNodeList(
          context,
          nodeIds,
          Object.freeze({ ...parentScope, slotPropsById }),
          outletPath + '/slot:' + nodeId + ':' + slotId
        ),
      ])
    ));
    return h(target, {
      runtime: context.runtime,
      routeId: context.routeId,
      instancePath: instancePath + '/component:' + nodeId + ':' + node.componentDocumentId,
      propsById,
      eventsById,
      variantsById: node.bindings?.variants ?? {},
      slotsById,
    });
  }
  if (node.kind === 'component-slot-outlet') {
    const slot = context.slotsById[node.slotMemberId];
    if (slot) return slot(resolveRecord(node.bindings?.props, parentScope, context.runtime), instancePath);
    return h(Fragment, null, renderNodeList(context, graph.childIdsById[nodeId] ?? [], parentScope, instancePath));
  }
  if (node.kind !== 'element' || typeof node.type !== 'string') return null;
  let scope = parentScope;
  if (node.data) {
    const baseBinding = node.data.source ?? node.data.mock ?? node.data.value;
    let data = baseBinding ? resolveBinding(baseBinding, parentScope, context.runtime) : undefined;
    if (typeof node.data.pick === 'string') data = readPath(data, node.data.pick);
    const extension = resolveRecord(node.data.extend, parentScope, context.runtime);
    if (Object.keys(extension).length) {
      data = Object.freeze({
        ...(data && typeof data === 'object' && !Array.isArray(data) ? data as JsonRecord : {}),
        ...extension,
      });
    }
    scope = Object.freeze({ ...parentScope, dataById: Object.freeze({ ...parentScope.dataById, [node.id]: data }) });
  }
  const props: Record<string, unknown> = {};
  Object.entries(node.props ?? {}).forEach(([key, binding]) => {
    props[normalizeDomProp(key)] = resolveBinding(binding, scope, context.runtime);
  });
  if (node.style) props.style = resolveRecord(node.style, scope, context.runtime);
  Object.entries(node.events ?? {}).forEach(([name, binding]) => {
    props[eventProp(name)] = (payload: unknown) => {
      const trigger = binding as JsonRecord;
      if (trigger.kind === 'emit-component-event') {
        const emitted = trigger.payload ? resolveBinding(trigger.payload, scope, context.runtime) : payload;
        context.eventsById[trigger.memberId]?.(emitted);
        return;
      }
      context.runtime.dispatchTrigger({
        binding,
        payload,
        scope,
        runtimeValuesById: runtimeValues(context.documentId, scope),
        setStateById: context.setState,
        source: { documentId: context.documentId, nodeId, eventName: name, instancePath },
      });
    };
  });
  const children: any[] = [];
  if (node.text) children.push(resolveBinding(node.text, scope, context.runtime));
  children.push(...renderNodeList(context, graph.childIdsById[nodeId] ?? [], scope, instancePath));
  return h(node.type, props, children.length ? children : undefined);
};

const componentByDocumentId = new Map<string, ReturnType<typeof defineComponent>>();

export const createWorkspacePirDocumentComponent = (documentId: string) => {
  const existing = componentByDocumentId.get(documentId);
  if (existing) return existing;
  const document = documentsById[documentId];
  if (!document) throw new Error('VUE_PIR_DOCUMENT_UNAVAILABLE');
  const component = defineComponent({
    name: typeof document.metadata?.name === 'string' ? document.metadata.name : 'ProdivixDocument',
    inheritAttrs: false,
    props: {
      runtime: { type: Object, required: true },
      routeId: { type: String, required: false },
      instancePath: { type: String, required: false },
      paramsById: { type: Object, required: false },
      propsById: { type: Object, required: false },
      eventsById: { type: Object, required: false },
      variantsById: { type: Object, required: false },
      slotsById: { type: Object, required: false },
      routeOutletsByNodeId: { type: Object, required: false },
    },
    setup(rawProps) {
      const props = rawProps as unknown as PirDocumentComponentProps;
      const instancePath = props.instancePath ?? '/document:' + documentId;
      const stateById = ref<JsonRecord>(Object.freeze(Object.fromEntries(
        Object.entries(document.logic?.state ?? {}).map(([stateId, state]) => [stateId, state.initial])
      )));
      const revision = ref(0);
      let unsubscribe: () => void = () => undefined;
      const setState = (stateId: string, value: unknown) => {
        stateById.value = Object.freeze({ ...stateById.value, [stateId]: value });
      };
      onMounted(() => {
        unsubscribe = props.runtime.subscribeDataLifecycle?.(() => { revision.value += 1; }) ?? (() => undefined);
        const projection = projectData(documentId, document, instancePath, props.runtime);
        const scope: PirScope = Object.freeze({
          paramsById: props.paramsById ?? {},
          stateById: stateById.value,
          dataById: projection.dataById,
          dataLifecycleById: projection.lifecycleById,
          collectionSymbolsById: {},
          componentPropsById: props.propsById ?? {},
          componentVariantsById: props.variantsById ?? {},
          slotPropsById: {},
        });
        void props.runtime.activateDataBindings?.({
          documentId,
          instancePath,
          ...(props.routeId ? { currentRouteId: props.routeId } : {}),
          bindingsByDataId: document.logic?.dataById ?? {},
          runtimeValuesById: runtimeValues(documentId, scope),
        });
      });
      onUnmounted(() => unsubscribe());
      return () => {
        void revision.value;
        const projection = projectData(documentId, document, instancePath, props.runtime);
        const defaults = Object.fromEntries(Object.entries(document.componentContract?.propsById ?? {}).map(
          ([memberId, member]) => [memberId, hasOwn(props.propsById ?? {}, memberId) ? props.propsById?.[memberId] : (member as JsonRecord).defaultValue]
        ));
        const variantDefaults = Object.fromEntries(Object.entries(document.componentContract?.variantAxesById ?? {}).map(
          ([memberId, member]) => [memberId, hasOwn(props.variantsById ?? {}, memberId) ? props.variantsById?.[memberId] : (member as JsonRecord).defaultOptionId]
        ));
        const scope: PirScope = Object.freeze({
          paramsById: props.paramsById ?? {},
          stateById: stateById.value,
          dataById: projection.dataById,
          dataLifecycleById: projection.lifecycleById,
          collectionSymbolsById: {},
          componentPropsById: Object.freeze(defaults),
          componentVariantsById: Object.freeze(variantDefaults),
          slotPropsById: {},
        });
        return renderNode({
          documentId,
          document,
          runtime: props.runtime,
          ...(props.routeId ? { routeId: props.routeId } : {}),
          setState,
          eventsById: props.eventsById ?? {},
          slotsById: props.slotsById ?? {},
          routeOutletsByNodeId: props.routeOutletsByNodeId ?? {},
        }, document.ui.graph.rootId, scope, instancePath);
      };
    },
  });
  componentByDocumentId.set(documentId, component);
  return component;
};

export const workspaceVuePirDocumentIds = Object.freeze(Object.keys(documentsById).sort());
`;
};

/** Emits the bounded semantic Vue PIR renderer from exact canonical documents. */
export const createWorkspaceVuePirRuntimeModule = (
  workspace: WorkspaceSnapshot
): ExportModule => {
  const documents = Object.values(workspace.docsById)
    .filter(isWorkspacePirDocument)
    .sort(
      (left, right) =>
        compareText(left.path, right.path) || compareText(left.id, right.id)
    );
  return {
    id: WORKSPACE_VUE_PIR_RUNTIME_MODULE_ID,
    kind: 'runtime-helper',
    suggestedName: 'prodivixVuePirRuntime',
    desiredPath: 'src/prodivix-pir-runtime.ts',
    language: 'ts',
    imports: [
      {
        kind: 'named',
        source: 'vue',
        imported: 'Fragment',
        local: 'Fragment',
      },
      {
        kind: 'named',
        source: 'vue',
        imported: 'defineComponent',
        local: 'defineComponent',
      },
      { kind: 'named', source: 'vue', imported: 'h', local: 'h' },
      {
        kind: 'named',
        source: 'vue',
        imported: 'onMounted',
        local: 'onMounted',
      },
      {
        kind: 'named',
        source: 'vue',
        imported: 'onUnmounted',
        local: 'onUnmounted',
      },
      { kind: 'named', source: 'vue', imported: 'ref', local: 'ref' },
    ],
    body: runtimeSource(workspace, documents),
    sourceTrace: documents.map((document) => ({
      sourceRef: {
        domain: 'workspace-document',
        id: document.id,
        path: document.path,
      },
      ownerRootId: document.id,
    })),
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  };
};
