import type {
  PIRComponentContract,
  PIRDocument,
  PIRJsonValue,
} from '@prodivix/pir';
import {
  createComponentContractMemberSymbolId,
  createComponentSlotPropSymbolId,
  createPirCollectionErrorSymbolId,
  createPirCollectionIndexSymbolId,
  createPirCollectionItemSymbolId,
  createPirDataSymbolId,
  createPirParamSymbolId,
  createPirStateSymbolId,
} from '@prodivix/authoring';
import type { WorkspacePirDocument } from '@prodivix/workspace';
import type { TargetAdapter } from '#src/core/adapter';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import type { PackageResolverOptions } from '#src/core/packageResolver';
import type {
  ExportDependency,
  ExportModule,
  ExportRoot,
} from '#src/export/types';
import { REACT_VITE_DEPENDENCIES } from '#src/export/presets/reactVite';
import { reactAdapter } from '#src/react/adapter';
import { createPirCollectionRuntimeSource } from '#src/react/collectionRuntime';
import { PIR_REACT_COMPILE_DIAGNOSTIC_CODES } from '#src/react/compiler.types';
import { createPirDataOperationRuntimeSource } from '#src/react/dataOperationRuntime';
import { PIRReactImportRegistry } from '#src/react/importRegistry';
import { createPirReactNodeCompiler } from '#src/react/nodeCompiler';
import {
  compilePirRootProjectionPath,
  PIR_PROJECTION_PATH_RUNTIME_SOURCE,
} from '#src/react/projectionPathRuntime';
import {
  PIRReactSourceTraceCollector,
  toPirContractMemberPath,
} from '#src/react/sourceTrace';

export type CompilePIRReactDocumentInput = Readonly<{
  workspaceId: string;
  workspaceDocument: WorkspacePirDocument;
  documentsById: Readonly<Record<string, WorkspacePirDocument>>;
  moduleIdByDocumentId: Readonly<Record<string, string>>;
  moduleNameByDocumentId: Readonly<Record<string, string>>;
  dataOperationKindsByDocumentId: Readonly<
    Record<
      string,
      Readonly<Record<string, 'query' | 'mutation' | 'subscription'>>
    >
  >;
  adapter?: TargetAdapter;
  packageResolver?: PackageResolverOptions;
}>;

export type CompilePIRReactDocumentResult = Readonly<{
  module: ExportModule;
  root: ExportRoot;
  dependencies: readonly ExportDependency[];
  diagnostics: readonly CompileDiagnostic[];
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const toJson = (value: unknown): string => JSON.stringify(value) ?? 'null';

const escapeJsonPointerToken = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const compileDefaultedRecord = (
  sourceExpression: string,
  defaults: Readonly<Record<string, PIRJsonValue | string | undefined>>
): string => {
  const entries = Object.entries(defaults)
    .sort(([left], [right]) => compareText(left, right))
    .map(([memberId, defaultValue]) => {
      const key = toJson(memberId);
      return `${key}: Object.prototype.hasOwnProperty.call(${sourceExpression}, ${key}) ? ${sourceExpression}[${key}] : ${defaultValue === undefined ? 'undefined' : toJson(defaultValue)}`;
    });
  return `{ ${entries.join(', ')} }`;
};

const compileComponentPropValues = (
  contract: PIRComponentContract | undefined
): string => {
  if (!contract) return '__pdxPropsById';
  return compileDefaultedRecord(
    '__pdxPropsById',
    Object.fromEntries(
      Object.entries(contract.propsById).map(([memberId, member]) => [
        memberId,
        member.defaultValue,
      ])
    )
  );
};

const compileComponentVariantValues = (
  contract: PIRComponentContract | undefined
): string => {
  if (!contract) return '__pdxVariantsById';
  return compileDefaultedRecord(
    '__pdxVariantsById',
    Object.fromEntries(
      Object.entries(contract.variantAxesById).map(([memberId, member]) => [
        memberId,
        member.defaultOptionId,
      ])
    )
  );
};

const compileStateValues = (document: PIRDocument): string =>
  `{ ${Object.entries(document.logic?.state ?? {})
    .sort(([left], [right]) => compareText(left, right))
    .map(([stateId, state]) => `${toJson(stateId)}: ${toJson(state.initial)}`)
    .join(', ')} }`;

const compileBaseDataRuntimeValues = (
  workspaceId: string,
  documentId: string,
  document: PIRDocument
): string => {
  const entries = [
    ...Object.keys(document.logic?.props ?? {}).map(
      (paramId) =>
        [
          createPirParamSymbolId(workspaceId, documentId, paramId),
          `__pdxParamsById[${toJson(paramId)}]`,
        ] as const
    ),
    ...Object.keys(document.logic?.state ?? {}).map(
      (stateId) =>
        [
          createPirStateSymbolId(workspaceId, documentId, stateId),
          `__pdxStateById[${toJson(stateId)}]`,
        ] as const
    ),
    ...Object.keys(document.componentContract?.propsById ?? {}).map(
      (memberId) =>
        [
          createComponentContractMemberSymbolId(
            workspaceId,
            documentId,
            'prop',
            memberId
          ),
          `__pdxComponentPropsById[${toJson(memberId)}]`,
        ] as const
    ),
    ...Object.keys(document.componentContract?.variantAxesById ?? {}).map(
      (memberId) =>
        [
          createComponentContractMemberSymbolId(
            workspaceId,
            documentId,
            'variant',
            memberId
          ),
          `__pdxComponentVariantsById[${toJson(memberId)}]`,
        ] as const
    ),
  ].sort(([left], [right]) => compareText(left, right));
  return `{ ${entries
    .map(([symbolId, expression]) => `${toJson(symbolId)}: ${expression}`)
    .join(', ')} }`;
};

const compileDataRuntimeValues = (
  workspaceId: string,
  documentId: string,
  document: PIRDocument
): string =>
  `{ ${Object.keys(document.logic?.dataById ?? {})
    .sort(compareText)
    .map(
      (dataId) =>
        `${toJson(createPirDataSymbolId(workspaceId, documentId, dataId))}: __pdxDataProjection.dataById[${toJson(dataId)}]`
    )
    .join(', ')} }`;

const compileScopeDataRuntimeValues = (
  workspaceId: string,
  documentId: string,
  document: PIRDocument
): string => {
  const entries: Array<readonly [string, string]> = [
    ...Object.keys(document.logic?.props ?? {}).map(
      (paramId) =>
        [
          createPirParamSymbolId(workspaceId, documentId, paramId),
          `__pdxScope.paramsById[${toJson(paramId)}]`,
        ] as const
    ),
    ...Object.keys(document.logic?.state ?? {}).map(
      (stateId) =>
        [
          createPirStateSymbolId(workspaceId, documentId, stateId),
          `__pdxScope.stateById[${toJson(stateId)}]`,
        ] as const
    ),
    ...Object.keys(document.logic?.dataById ?? {}).map(
      (dataId) =>
        [
          createPirDataSymbolId(workspaceId, documentId, dataId),
          `__pdxScope.dataById[${toJson(dataId)}]`,
        ] as const
    ),
    ...Object.keys(document.componentContract?.propsById ?? {}).map(
      (memberId) =>
        [
          createComponentContractMemberSymbolId(
            workspaceId,
            documentId,
            'prop',
            memberId
          ),
          `__pdxScope.componentPropsById[${toJson(memberId)}]`,
        ] as const
    ),
    ...Object.keys(document.componentContract?.variantAxesById ?? {}).map(
      (memberId) =>
        [
          createComponentContractMemberSymbolId(
            workspaceId,
            documentId,
            'variant',
            memberId
          ),
          `__pdxScope.componentVariantsById[${toJson(memberId)}]`,
        ] as const
    ),
  ];
  for (const [nodeId, node] of Object.entries(document.ui.graph.nodesById)) {
    if (node.kind !== 'collection') continue;
    entries.push(
      [
        createPirCollectionItemSymbolId(
          workspaceId,
          documentId,
          nodeId,
          node.symbols.itemId
        ),
        `__pdxScope.collectionSymbolsById[${toJson(node.symbols.itemId)}]`,
      ],
      [
        createPirCollectionIndexSymbolId(
          workspaceId,
          documentId,
          nodeId,
          node.symbols.indexId
        ),
        `__pdxScope.collectionSymbolsById[${toJson(node.symbols.indexId)}]`,
      ]
    );
    if (node.symbols.errorId)
      entries.push([
        createPirCollectionErrorSymbolId(
          workspaceId,
          documentId,
          nodeId,
          node.symbols.errorId
        ),
        `__pdxScope.collectionSymbolsById[${toJson(node.symbols.errorId)}]`,
      ]);
  }
  for (const [slotId, slot] of Object.entries(
    document.componentContract?.slotsById ?? {}
  )) {
    for (const propId of Object.keys(slot.propsById ?? {}))
      entries.push([
        createComponentSlotPropSymbolId(
          workspaceId,
          documentId,
          slotId,
          propId
        ),
        `__pdxScope.slotPropsById[${toJson(propId)}]`,
      ]);
  }
  return `{ ${entries
    .sort(([left], [right]) => compareText(left, right))
    .map(([symbolId, expression]) => `${toJson(symbolId)}: ${expression}`)
    .join(', ')} }`;
};

const addContractSourceTraces = (
  contract: PIRComponentContract | undefined,
  traces: PIRReactSourceTraceCollector
): void => {
  if (!contract) return;
  traces.addPir('/componentContract');
  const collections = [
    ['propsById', contract.propsById],
    ['eventsById', contract.eventsById],
    ['slotsById', contract.slotsById],
    ['variantAxesById', contract.variantAxesById],
  ] as const;
  for (const [collection, members] of collections) {
    for (const memberId of Object.keys(members).sort(compareText)) {
      traces.addPir(toPirContractMemberPath(collection, memberId));
    }
  }
};

const getRootKind = (document: WorkspacePirDocument): ExportRoot['kind'] => {
  if (document.type === 'pir-page') return 'page';
  if (document.type === 'pir-layout') return 'layout';
  return 'component';
};

const createGeneratedRuntimePrelude = (useEffectExpression: string): string =>
  `type __PdxScope = Readonly<{
  paramsById: Readonly<Record<string, unknown>>;
  stateById: Readonly<Record<string, unknown>>;
  dataById: Readonly<Record<string, unknown>>;
  dataLifecycleById: Readonly<Record<string, __PdxDataLifecycleSnapshot>>;
  collectionSymbolsById: Readonly<Record<string, unknown>>;
  componentPropsById: Readonly<Record<string, unknown>>;
  componentVariantsById: Readonly<Record<string, unknown>>;
  slotPropsById: Readonly<Record<string, unknown>>;
}>;

type __PdxSourceSpan = Readonly<{
  artifactId: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}>;

type __PdxCodeReference = Readonly<{
  artifactId: string;
  exportName?: string;
  symbolId?: string;
  sourceSpan?: __PdxSourceSpan;
}>;

type __PdxRuntimePort = Readonly<{
  dispatchTrigger(input: Readonly<{ binding: unknown; payload: unknown; scope: __PdxScope; runtimeValuesById: Readonly<Record<string, unknown>>; setStateById: __PdxStateUpdater; source: Readonly<{ documentId: string; nodeId: string; eventName: string; instancePath: string }> }>): void;
  resolveCollectionPreviewState?(location: __PdxCollectionLocation): __PdxCollectionPreviewInput | undefined;
  reportCollectionProjectionIssues?(input: Readonly<{ location: __PdxCollectionLocation; issues: readonly __PdxCollectionProjectionIssue[] }>): void;
  resolveDataLifecycleSnapshot(request: __PdxDataLifecycleSnapshotRequest): __PdxDataLifecycleSnapshot | undefined;
  activateDataBindings?(request: __PdxDataBindingsActivationRequest): void | Promise<void>;
  subscribeDataLifecycle?(listener: () => void): () => void;
  resolveCodeValue(reference: __PdxCodeReference, scope: __PdxScope): unknown;
}>;

type __PdxStateUpdater = (stateId: string, value: unknown) => void;

type __PdxSlotRenderer = (
  slotPropsById: Readonly<Record<string, unknown>>,
  outletInstancePath: string
) => any;

type __PdxModuleProps = Readonly<{
  __pdxRuntime: __PdxRuntimePort;
  __pdxInstancePath?: string;
  __pdxRouteId?: string;
  __pdxParamsById?: Readonly<Record<string, unknown>>;
  __pdxPropsById?: Readonly<Record<string, unknown>>;
  __pdxEventsById?: Readonly<Record<string, (payload: unknown) => void>>;
  __pdxVariantsById?: Readonly<Record<string, string | undefined>>;
  __pdxSlotsById?: Readonly<Record<string, __PdxSlotRenderer>>;
}>;

const __pdxReadPath = (source: unknown, path: string): unknown => {
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

const __pdxMergeData = (base: unknown, extension: Readonly<Record<string, unknown>>): unknown => ({
  ...(base && typeof base === 'object' && !Array.isArray(base) ? base as Record<string, unknown> : {}),
  ...extension,
});

const __pdxRenderValue = (value: unknown): any => value;

${createPirCollectionRuntimeSource(useEffectExpression)}

${createPirDataOperationRuntimeSource()}

${PIR_PROJECTION_PATH_RUNTIME_SOURCE}`;

/** Compiles one validated document from the shared PIR projection plan. */
export const compilePirReactDocument = (
  input: CompilePIRReactDocumentInput
): CompilePIRReactDocumentResult => {
  const documentId = input.workspaceDocument.id;
  const document = input.workspaceDocument.content;
  const moduleId = input.moduleIdByDocumentId[documentId];
  const moduleName = input.moduleNameByDocumentId[documentId];
  const traces = new PIRReactSourceTraceCollector(
    documentId,
    moduleId,
    input.workspaceDocument.path
  );
  const diagnostics: CompileDiagnostic[] = [];
  for (const [dataId, binding] of Object.entries(
    document.logic?.dataById ?? {}
  ).sort(([left], [right]) => compareText(left, right))) {
    const operation =
      input.dataOperationKindsByDocumentId[binding.operation.documentId]?.[
        binding.operation.operationId
      ];
    if (operation === 'query') continue;
    diagnostics.push({
      code: operation
        ? PIR_REACT_COMPILE_DIAGNOSTIC_CODES.dataOperationKindMismatch
        : PIR_REACT_COMPILE_DIAGNOSTIC_CODES.dataOperationUnresolved,
      severity: 'error',
      source: 'export',
      message: operation
        ? `PIR data binding "${dataId}" must reference a query operation for React export.`
        : `PIR data binding "${dataId}" references an unresolved Data operation for React export.`,
      path: `/docsById/${escapeJsonPointerToken(documentId)}/content/logic/dataById/${escapeJsonPointerToken(dataId)}`,
    });
  }
  for (const [nodeId, node] of Object.entries(document.ui.graph.nodesById).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    const events =
      node.kind === 'element'
        ? node.events
        : node.kind === 'component-instance'
          ? node.bindings.events
          : undefined;
    if (!events) continue;
    for (const [eventName, trigger] of Object.entries(events).sort(
      ([left], [right]) => compareText(left, right)
    )) {
      if (trigger.kind !== 'dispatch-data-operation') continue;
      const operation =
        input.dataOperationKindsByDocumentId[trigger.operation.documentId]?.[
          trigger.operation.operationId
        ];
      if (operation === 'mutation') continue;
      const eventPath =
        node.kind === 'component-instance'
          ? `/bindings/events/${escapeJsonPointerToken(eventName)}`
          : `/events/${escapeJsonPointerToken(eventName)}`;
      diagnostics.push({
        code: operation
          ? PIR_REACT_COMPILE_DIAGNOSTIC_CODES.dataOperationKindMismatch
          : PIR_REACT_COMPILE_DIAGNOSTIC_CODES.dataOperationUnresolved,
        severity: 'error',
        source: 'export',
        message: operation
          ? `PIR event "${eventName}" on node "${nodeId}" must reference a mutation operation for React export.`
          : `PIR event "${eventName}" on node "${nodeId}" references an unresolved Data operation for React export.`,
        path: `/docsById/${escapeJsonPointerToken(documentId)}/content/ui/graph/nodesById/${escapeJsonPointerToken(nodeId)}${eventPath}`,
      });
    }
  }
  const imports = new PIRReactImportRegistry({
    ...input.packageResolver,
    packageVersions: {
      react: REACT_VITE_DEPENDENCIES.react,
      ...input.packageResolver?.packageVersions,
    },
  });
  const useStateLocal = imports.addNamedPackageImport('react', 'useState');
  const useCallbackLocal = imports.addNamedPackageImport(
    'react',
    'useCallback'
  );
  const useEffectLocal = imports.addNamedPackageImport('react', 'useEffect');
  addContractSourceTraces(document.componentContract, traces);
  const nodeCompiler = createPirReactNodeCompiler({
    documentId,
    document,
    workspaceDocument: input.workspaceDocument,
    documentsById: input.documentsById,
    moduleIdByDocumentId: input.moduleIdByDocumentId,
    moduleNameByDocumentId: input.moduleNameByDocumentId,
    adapter: input.adapter ?? reactAdapter,
    imports,
    traces,
    diagnostics,
  });
  const rootExpression = nodeCompiler.compileNode(
    document.ui.graph.rootId,
    '__pdxDefinitionScope',
    '__pdxInstancePath'
  );
  const rootInstancePath = compilePirRootProjectionPath(documentId);
  const componentProps = compileComponentPropValues(document.componentContract);
  const componentVariants = compileComponentVariantValues(
    document.componentContract
  );
  const stateValues = compileStateValues(document);
  const dataOperationBindings = toJson(document.logic?.dataById ?? {});
  const baseDataRuntimeValues = compileBaseDataRuntimeValues(
    input.workspaceId,
    documentId,
    document
  );
  const dataRuntimeValues = compileDataRuntimeValues(
    input.workspaceId,
    documentId,
    document
  );
  const scopeDataRuntimeValues = compileScopeDataRuntimeValues(
    input.workspaceId,
    documentId,
    document
  );
  const body = `${createGeneratedRuntimePrelude(useEffectLocal)}

export default function ${moduleName}({
  __pdxRuntime,
  __pdxInstancePath = ${rootInstancePath},
  __pdxRouteId,
  __pdxParamsById = {},
  __pdxPropsById = {},
  __pdxEventsById = {},
  __pdxVariantsById = {},
  __pdxSlotsById = {},
}: __PdxModuleProps) {
  const [__pdxStateById, __pdxSetStateRecord] = ${useStateLocal}<Readonly<Record<string, unknown>>>(() => (${stateValues}));
  const __pdxSetStateById = ${useCallbackLocal}<__PdxStateUpdater>((stateId, value) => {
    __pdxSetStateRecord((previous) => ({ ...previous, [stateId]: value }));
  }, []);
  const [, __pdxSetDataRuntimeRevision] = ${useStateLocal}(0);
  ${useEffectLocal}(() => __pdxRuntime.subscribeDataLifecycle?.(() => {
    __pdxSetDataRuntimeRevision((previous) => previous + 1);
  }), [__pdxRuntime]);
  const __pdxComponentPropsById = ${componentProps};
  const __pdxComponentVariantsById = ${componentVariants};
  const __pdxBaseDataRuntimeValuesById = ${baseDataRuntimeValues};
  const __pdxDataProjection = __pdxProjectDocumentDataLifecycle(
    __pdxRuntime,
    ${toJson(documentId)},
    __pdxInstancePath,
    ${dataOperationBindings}
  );
  const __pdxDataRuntimeValuesById = {
    ...__pdxBaseDataRuntimeValuesById,
    ...${dataRuntimeValues},
  };
  const __pdxDataRuntimeValuesFromScope = (__pdxScope: __PdxScope): Readonly<Record<string, unknown>> => (${scopeDataRuntimeValues});
  const __pdxDataRuntimeValuesDigest = JSON.stringify(__pdxDataRuntimeValuesById);
  ${useEffectLocal}(() => {
    void __pdxRuntime.activateDataBindings?.({
      documentId: ${toJson(documentId)},
      instancePath: __pdxInstancePath,
      ...(__pdxRouteId ? { currentRouteId: __pdxRouteId } : {}),
      bindingsByDataId: ${dataOperationBindings},
      runtimeValuesById: __pdxDataRuntimeValuesById,
    });
  }, [__pdxRuntime, __pdxInstancePath, __pdxRouteId, __pdxDataRuntimeValuesDigest]);
  if (__pdxDataProjection.status === 'blocked') return null;
  const __pdxDefinitionScope: __PdxScope = {
    paramsById: __pdxParamsById,
    stateById: __pdxStateById,
    dataById: __pdxDataProjection.dataById,
    dataLifecycleById: __pdxDataProjection.lifecycleByDataId,
    collectionSymbolsById: {},
    componentPropsById: __pdxComponentPropsById,
    componentVariantsById: __pdxComponentVariantsById,
    slotPropsById: {},
  };
  return (${rootExpression});
}
`;
  const sourceTrace = traces.values();
  return {
    module: {
      id: moduleId,
      kind: 'react-component',
      ownerRootId: documentId,
      suggestedName: moduleName,
      language: 'tsx',
      imports: imports.getImports(),
      body,
      sourceTrace,
      origin: {
        kind: 'generated',
        owner: 'prodivix',
        writePolicy: 'generated',
        updatePolicy: 'regenerate',
      },
    },
    root: {
      id: documentId,
      kind: getRootKind(input.workspaceDocument),
      displayName:
        document.metadata?.name ?? input.workspaceDocument.name ?? moduleName,
      sourceRef: {
        domain: 'workspace-document',
        id: documentId,
        path: input.workspaceDocument.path,
      },
    },
    dependencies: imports.getDependencies(),
    diagnostics,
  };
};
