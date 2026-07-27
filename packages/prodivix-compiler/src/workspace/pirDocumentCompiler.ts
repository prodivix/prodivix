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
import type { PirElementEmitter } from '#src/workspace/pirElementEmitter';
import type { PirDocumentShellEmitter } from '#src/workspace/pirDocumentShellEmitter';
import type {
  ExportDependency,
  ExportModule,
  ExportRoot,
} from '#src/export/types';

import { createPirGeneratedRuntimePrelude } from '#src/workspace/pirGeneratedRuntimePrelude';
import { PIR_COMPILE_DIAGNOSTIC_CODES } from '#src/react/compiler.types';
import { PirImportRegistry } from '#src/workspace/pirImportRegistry';
import { PirLocalNameRegistry } from '#src/workspace/pirLocalNames';
import { createPirNodeCompiler } from '#src/workspace/pirNodeCompiler';
import { compilePirRootProjectionPath } from '#src/workspace/pirProjectionPathRuntime';
import {
  PirSourceTraceCollector,
  toPirContractMemberPath,
} from '#src/workspace/pirSourceTrace';

export type CompilePirDocumentInput = Readonly<{
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
  adapter: TargetAdapter;
  elementEmitter: PirElementEmitter;
  shell: PirDocumentShellEmitter;
  targetLabel: string;
  /** Route-outlet node ids in this document, from the RouteManifest. */
  routeOutletNodeIds?: ReadonlySet<string>;
  packageResolver?: PackageResolverOptions;
}>;

export type CompilePirDocumentResult = Readonly<{
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
  traces: PirSourceTraceCollector
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

/** Compiles one validated document from the shared PIR projection plan. */
export const compilePirDocument = (
  input: CompilePirDocumentInput
): CompilePirDocumentResult => {
  const documentId = input.workspaceDocument.id;
  const document = input.workspaceDocument.content;
  const moduleId = input.moduleIdByDocumentId[documentId];
  const moduleName = input.moduleNameByDocumentId[documentId];
  const traces = new PirSourceTraceCollector(
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
        ? PIR_COMPILE_DIAGNOSTIC_CODES.dataOperationKindMismatch
        : PIR_COMPILE_DIAGNOSTIC_CODES.dataOperationUnresolved,
      severity: 'error',
      source: 'export',
      message: operation
        ? `PIR data binding "${dataId}" must reference a query operation for ${input.targetLabel} export.`
        : `PIR data binding "${dataId}" references an unresolved Data operation for ${input.targetLabel} export.`,
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
          ? PIR_COMPILE_DIAGNOSTIC_CODES.dataOperationKindMismatch
          : PIR_COMPILE_DIAGNOSTIC_CODES.dataOperationUnresolved,
        severity: 'error',
        source: 'export',
        message: operation
          ? `PIR event "${eventName}" on node "${nodeId}" must reference a mutation operation for ${input.targetLabel} export.`
          : `PIR event "${eventName}" on node "${nodeId}" references an unresolved Data operation for ${input.targetLabel} export.`,
        path: `/docsById/${escapeJsonPointerToken(documentId)}/content/ui/graph/nodesById/${escapeJsonPointerToken(nodeId)}${eventPath}`,
      });
    }
  }
  const shell = input.shell;
  const imports = new PirImportRegistry({
    ...input.packageResolver,
    packageVersions: {
      ...shell.packageVersions(),
      ...input.packageResolver?.packageVersions,
    },
  });
  const collectionIssueReporterSource =
    shell.createCollectionIssueReporterSource(imports);
  addContractSourceTraces(document.componentContract, traces);
  const nodeCompiler = createPirNodeCompiler({
    documentId,
    document,
    workspaceDocument: input.workspaceDocument,
    documentsById: input.documentsById,
    moduleIdByDocumentId: input.moduleIdByDocumentId,
    moduleNameByDocumentId: input.moduleNameByDocumentId,
    adapter: input.adapter,
    emitter: input.elementEmitter,
    routeOutletNodeIds: input.routeOutletNodeIds ?? new Set<string>(),
    imports,
    locals: new PirLocalNameRegistry(),
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
  const body = shell.createModuleBody({
    imports,
    prelude: createPirGeneratedRuntimePrelude(collectionIssueReporterSource),
    moduleName,
    documentIdJson: toJson(documentId),
    rootInstancePath,
    stateValues,
    componentProps,
    componentVariants,
    baseDataRuntimeValues,
    dataRuntimeValues,
    scopeDataRuntimeValues,
    dataOperationBindings,
    rootExpression,
  });
  const sourceTrace = traces.values();
  return {
    module: {
      id: moduleId,
      kind: shell.moduleKind,
      ownerRootId: documentId,
      suggestedName: moduleName,
      language: shell.language,
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
