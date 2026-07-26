import {
  createPirCollectionProjectionPlan,
  projectPirCollection,
  selectPirSlotProjection,
  type PIRNode,
} from '@prodivix/pir';
import { compilePirBindingExpression } from '#src/workspace/pirBindingCompiler';
import {
  canStaticallyProjectCollection,
  compareText,
  compileDataScopeExpression,
  compileInstanceVariantValues,
  compileRecord,
  compileTriggerHandler,
  compileTriggerSource,
  createAdapterNode,
  escapeJsonPointerSegment,
  toIdentifier,
  toJson,
} from '#src/workspace/pirNodeExpressions';
import type {
  PIRNodeOfKind,
  PirNodeCompileContext,
  PirNodeCompiler,
} from '#src/workspace/pirNodeCompiler.types';
import {
  compilePirComponentProjectionPath,
  compilePirSlotProjectionPath,
} from '#src/workspace/pirProjectionPathRuntime';
import {
  toPirContractMemberPath,
  toPirCollectionRegionPath,
  toPirCollectionSymbolPath,
  toPirInstanceRegionPath,
  toPirNodePath,
} from '#src/workspace/pirSourceTrace';

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export const createPirNodeCompiler = (
  context: PirNodeCompileContext
): PirNodeCompiler => {
  const graph = context.document.ui.graph;

  const addDiagnostic = (code: string, message: string, path: string): void => {
    context.diagnostics.push({
      code,
      severity: 'error',
      source: 'export',
      message,
      path: `/docsById/${escapeJsonPointerSegment(context.documentId)}/content${path}`,
    });
  };

  const compileNodeList = (
    nodeIds: readonly string[],
    scopeExpression: string,
    instancePathExpression: string
  ): string => {
    if (nodeIds.length === 0) return context.emitter.emptyExpression;
    return context.emitter.fragment(
      nodeIds.map((nodeId) =>
        compileNode(nodeId, scopeExpression, instancePathExpression)
      )
    );
  };

  const compileElement = (
    node: PIRNodeOfKind<'element'>,
    parentScopeExpression: string,
    instancePathExpression: string
  ): string => {
    const nodePath = toPirNodePath(node.id);
    const adapterResult = context.adapter.resolveNode(
      createAdapterNode(node, context.documentId)
    );
    context.imports.addAdapterImports(adapterResult.imports ?? []);
    if (adapterResult.diagnostics?.length) {
      context.diagnostics.push(...adapterResult.diagnostics);
    }
    const element = context.imports.resolveElementLocal(
      adapterResult.element,
      adapterResult.imports ?? []
    );
    if (!context.emitter.isEmittableElement(element)) {
      addDiagnostic(
        'PIR_EXPORT_ELEMENT_UNSUPPORTED',
        `Element type ${node.type} resolved to ${element}, which this target cannot emit.`,
        nodePath
      );
      return context.emitter.emptyExpression;
    }

    const scopeExpression = node.data
      ? `__pdxNodeScope_${toIdentifier(node.id)}`
      : parentScopeExpression;
    const propExpressions = new Map<string, string>();
    for (const [key, binding] of Object.entries(node.props ?? {}).sort(
      ([left], [right]) => compareText(left, right)
    )) {
      if (adapterResult.props && binding.kind === 'literal') continue;
      propExpressions.set(
        key,
        compilePirBindingExpression(binding, scopeExpression)
      );
    }
    for (const [key, value] of Object.entries(adapterResult.props ?? {}).sort(
      ([left], [right]) => compareText(left, right)
    )) {
      if (!propExpressions.has(key)) propExpressions.set(key, toJson(value));
    }
    let styleExpression: string | undefined;
    if (adapterResult.style) {
      const styleExpressions = new Map<string, string>();
      for (const [key, binding] of Object.entries(node.style ?? {}).sort(
        ([left], [right]) => compareText(left, right)
      )) {
        if (binding.kind === 'literal') continue;
        styleExpressions.set(
          key,
          compilePirBindingExpression(binding, scopeExpression)
        );
      }
      for (const [key, value] of Object.entries(adapterResult.style).sort(
        ([left], [right]) => compareText(left, right)
      )) {
        styleExpressions.set(key, toJson(value));
      }
      styleExpression = `{ ${[...styleExpressions.entries()]
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, expression]) => `${toJson(key)}: ${expression}`)
        .join(', ')} }`;
    } else if (node.style && Object.keys(node.style).length > 0) {
      styleExpression = compileRecord(node.style, scopeExpression);
    }
    if (styleExpression) {
      propExpressions.set('style', styleExpression);
    }
    for (const [eventName, trigger] of Object.entries(node.events ?? {}).sort(
      ([left], [right]) => compareText(left, right)
    )) {
      propExpressions.set(
        context.emitter.eventPropName(eventName),
        compileTriggerHandler(
          trigger,
          scopeExpression,
          '__pdxEvent',
          compileTriggerSource(
            context.documentId,
            node.id,
            eventName,
            instancePathExpression
          ),
          (path) => context.traces.addPir(path)
        )
      );
    }
    const propEntries = [...propExpressions.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, expression]) => `${toJson(key)}: ${expression}`);
    const propsExpression = `{ ${propEntries.join(', ')} }`;
    const textExpression =
      node.text && adapterResult.textMode !== 'omit'
        ? `__pdxRenderValue(${compilePirBindingExpression(node.text, scopeExpression)})`
        : '';
    const childIds =
      adapterResult.childrenMode === 'omit'
        ? []
        : (graph.childIdsById[node.id] ?? []);
    const childExpressions = [
      ...(textExpression ? [textExpression] : []),
      ...childIds.map((childId) =>
        compileNode(childId, scopeExpression, instancePathExpression)
      ),
    ];
    const isVoidElement = VOID_ELEMENTS.has(element.toLowerCase());
    if (isVoidElement && childExpressions.length > 0) {
      addDiagnostic(
        'PIR_EXPORT_VOID_ELEMENT_CHILDREN',
        `Void element ${element} cannot project text or children.`,
        nodePath
      );
    }
    const elementExpression = context.emitter.element({
      tag: element,
      propsExpression,
      children: isVoidElement ? [] : childExpressions,
    });
    if (!node.data) return elementExpression;

    const dataExpression = compileDataScopeExpression(
      node,
      parentScopeExpression
    );
    return `(() => { const __pdxNodeData_${toIdentifier(node.id)} = ${dataExpression}; const ${scopeExpression} = { ...${parentScopeExpression}, dataById: { ...${parentScopeExpression}.dataById, ${toJson(node.id)}: __pdxNodeData_${toIdentifier(node.id)} } }; return (${elementExpression}); })()`;
  };

  const compileInstance = (
    node: PIRNodeOfKind<'component-instance'>,
    consumerScopeExpression: string,
    consumerInstancePathExpression: string
  ): string => {
    const nodePath = toPirNodePath(node.id);
    context.traces.addPir(nodePath);
    const targetDocument = context.documentsById[node.componentDocumentId];
    const targetModuleId =
      context.moduleIdByDocumentId[node.componentDocumentId];
    const targetName = context.moduleNameByDocumentId[node.componentDocumentId];
    const contract = targetDocument?.content.componentContract;
    if (!targetDocument || !targetModuleId || !targetName || !contract) {
      addDiagnostic(
        'PIR_EXPORT_COMPONENT_TARGET_UNAVAILABLE',
        `Component Instance ${node.id} has no reachable Definition module.`,
        `${nodePath}/componentDocumentId`
      );
      return context.emitter.emptyExpression;
    }
    const targetLocal = context.imports.addInternalDefault(
      targetModuleId,
      targetName
    );

    for (const memberId of Object.keys(node.bindings.props).sort(compareText)) {
      context.traces.addPir(
        toPirContractMemberPath('propsById', memberId),
        targetDocument.id
      );
    }
    for (const memberId of Object.keys(node.bindings.events).sort(
      compareText
    )) {
      context.traces.addPir(
        toPirContractMemberPath('eventsById', memberId),
        targetDocument.id
      );
    }
    for (const memberId of Object.keys(node.bindings.variants).sort(
      compareText
    )) {
      context.traces.addPir(
        toPirContractMemberPath('variantAxesById', memberId),
        targetDocument.id
      );
    }

    const propsExpression = compileRecord(
      node.bindings.props,
      consumerScopeExpression
    );
    const eventEntries = Object.entries(node.bindings.events)
      .sort(([left], [right]) => compareText(left, right))
      .map(
        ([memberId, trigger]) =>
          `${toJson(memberId)}: ${compileTriggerHandler(
            trigger,
            consumerScopeExpression,
            '__pdxPayload',
            compileTriggerSource(
              context.documentId,
              node.id,
              memberId,
              consumerInstancePathExpression
            ),
            (path) => context.traces.addPir(path)
          )}`
      );
    const eventsExpression = `{ ${eventEntries.join(', ')} }`;
    const variantsExpression = compileInstanceVariantValues(
      context.documentsById[node.componentDocumentId]?.content
        .componentContract,
      node
    );
    const targetInstancePathExpression = compilePirComponentProjectionPath(
      consumerInstancePathExpression,
      context.documentId,
      node.id,
      node.componentDocumentId
    );

    const slotEntries: string[] = [];
    for (const slotMemberId of Object.keys(contract.slotsById).sort(
      compareText
    )) {
      const outlet = Object.values(targetDocument.content.ui.graph.nodesById)
        .filter(
          (candidate): candidate is PIRNodeOfKind<'component-slot-outlet'> =>
            candidate.kind === 'component-slot-outlet' &&
            candidate.slotMemberId === slotMemberId
        )
        .at(0);
      const fallbackNodeIds = outlet
        ? (targetDocument.content.ui.graph.childIdsById[outlet.id] ?? [])
        : [];
      const projection = selectPirSlotProjection({
        consumerGraph: graph,
        instanceNodeId: node.id,
        slotMemberId,
        fallbackNodeIds,
      });
      if (projection.kind !== 'consumer') continue;
      if (!outlet) {
        addDiagnostic(
          'PIR_EXPORT_SLOT_OUTLET_MISSING',
          `Component slot ${slotMemberId} is provided but its Definition has no outlet.`,
          toPirInstanceRegionPath(node.id, slotMemberId)
        );
        continue;
      }
      context.traces.addPir(toPirInstanceRegionPath(node.id, slotMemberId));
      context.traces.addPir(
        toPirContractMemberPath('slotsById', slotMemberId),
        targetDocument.id
      );
      const slotScope = `__pdxSlotScope_${toIdentifier(node.id)}_${toIdentifier(slotMemberId)}`;
      const outletInstancePath = `__pdxOutletInstancePath_${toIdentifier(node.id)}_${toIdentifier(slotMemberId)}`;
      const slotInstancePathExpression = compilePirSlotProjectionPath(
        outletInstancePath,
        context.documentId,
        node.id,
        slotMemberId
      );
      const body = compileNodeList(
        projection.nodeIds,
        slotScope,
        slotInstancePathExpression
      );
      slotEntries.push(
        `${toJson(slotMemberId)}: (__pdxSlotPropsById: Readonly<Record<string, unknown>>, ${outletInstancePath}: string) => { const ${slotScope} = { ...${consumerScopeExpression}, slotPropsById: __pdxSlotPropsById }; return (${body}); }`
      );
    }
    const slotsExpression = `{ ${slotEntries.join(', ')} }`;
    return context.emitter.component({
      localName: targetLocal,
      propsExpression: `{ __pdxRuntime, __pdxInstancePath: ${targetInstancePathExpression}, __pdxRouteId, __pdxPropsById: ${propsExpression}, __pdxEventsById: ${eventsExpression}, __pdxVariantsById: ${variantsExpression}, __pdxSlotsById: ${slotsExpression} }`,
    });
  };

  const compileSlotOutlet = (
    node: PIRNodeOfKind<'component-slot-outlet'>,
    definitionScopeExpression: string,
    definitionInstancePathExpression: string
  ): string => {
    context.traces.addPir(toPirNodePath(node.id));
    context.traces.addPir(
      toPirContractMemberPath('slotsById', node.slotMemberId)
    );
    const propBindings = compileRecord(
      node.bindings.props,
      definitionScopeExpression
    );
    const fallback = compileNodeList(
      graph.childIdsById[node.id] ?? [],
      definitionScopeExpression,
      definitionInstancePathExpression
    );
    return `(Object.prototype.hasOwnProperty.call(__pdxSlotsById, ${toJson(node.slotMemberId)}) ? (__pdxSlotsById[${toJson(node.slotMemberId)}] as __PdxSlotRenderer)(${propBindings}, ${definitionInstancePathExpression}) : (${fallback}))`;
  };

  const compileCollection = (
    node: PIRNodeOfKind<'collection'>,
    parentScopeExpression: string,
    instancePathExpression: string
  ): string => {
    const nodePath = toPirNodePath(node.id);
    const regions = graph.regionsById?.[node.id] ?? {};
    const plan = createPirCollectionProjectionPlan(node, regions);
    context.traces.addPir(nodePath);
    for (const regionName of ['item', 'empty', 'loading', 'error'] as const) {
      if (Object.hasOwn(regions, regionName)) {
        context.traces.addPir(toPirCollectionRegionPath(node.id, regionName));
      }
    }
    context.traces.addPir(toPirCollectionSymbolPath(node.id, 'itemId'));
    context.traces.addPir(toPirCollectionSymbolPath(node.id, 'indexId'));
    if (node.symbols.errorId) {
      context.traces.addPir(toPirCollectionSymbolPath(node.id, 'errorId'));
    }
    for (const fact of plan.facts) {
      context.diagnostics.push({
        code: fact.code,
        severity: fact.severity,
        source: 'export',
        message: fact.message,
        path: `/docsById/${escapeJsonPointerSegment(context.documentId)}/content${nodePath}${fact.path}`,
      });
    }

    if (canStaticallyProjectCollection(node)) {
      const staticProjection = projectPirCollection({
        node,
        regions,
        parentScope: {},
        preview: { state: 'auto' },
      });
      if (staticProjection.status === 'blocked') {
        for (const issue of staticProjection.issues) {
          addDiagnostic(issue.code, issue.message, `${nodePath}${issue.path}`);
        }
      }
    }

    const suffix = toIdentifier(node.id);
    const locationName = `__pdxCollectionLocation_${suffix}`;
    const manualPreviewName = `__pdxCollectionManualPreview_${suffix}`;
    const previewName = `__pdxCollectionPreview_${suffix}`;
    const lifecycleName = `__pdxCollectionLifecycle_${suffix}`;
    const projectionName = `__pdxCollectionProjection_${suffix}`;
    const itemName = `__pdxCollectionItem_${suffix}`;
    const sourceExpression =
      plan.source.kind === 'literal'
        ? toJson(plan.source.value)
        : compilePirBindingExpression(plan.source.value, parentScopeExpression);
    const keyExpression =
      plan.key.kind === 'index'
        ? `__pdxCollectionIndex_${suffix}`
        : compilePirBindingExpression(
            plan.key.value,
            `__pdxCollectionScope_${suffix}`
          );
    const fragmentLocal = context.emitter.resolveFragmentLocal(context.imports);
    const issueReporter = (issuesExpression: string): string =>
      context.emitter.component({
        localName: '__PdxCollectionIssueReporter',
        propsExpression: `{ runtime: __pdxRuntime, location: ${locationName}, issues: ${issuesExpression} }`,
      });
    const regionFragment = (body: string): string =>
      context.emitter.wrappedFragment({
        fragmentLocal,
        children: [issueReporter('__pdxNoCollectionProjectionIssues'), body],
      });
    const itemInstancePath = `__pdxAppendCollectionItemPath(${instancePathExpression}, ${toJson(context.documentId)}, ${toJson(node.id)}, ${itemName}.keyIdentity)`;
    const itemBody = compileNodeList(
      plan.regionsByState.item,
      `${itemName}.scope`,
      itemInstancePath
    );
    const emptyBody = compileNodeList(
      plan.regionsByState.empty,
      `${projectionName}.scope`,
      instancePathExpression
    );
    const loadingBody = compileNodeList(
      plan.regionsByState.loading,
      `${projectionName}.scope`,
      instancePathExpression
    );
    const errorBody = compileNodeList(
      plan.regionsByState.error,
      `${projectionName}.scope`,
      instancePathExpression
    );
    const lifecycleBinding = node.lifecycle
      ? context.document.logic?.dataById?.[node.lifecycle.dataId]
      : undefined;
    if (node.lifecycle && !lifecycleBinding) {
      addDiagnostic(
        'PIR_EXPORT_COLLECTION_DATA_BINDING_MISSING',
        `Collection ${node.id} references missing local data binding ${node.lifecycle.dataId}.`,
        `${nodePath}/lifecycle/dataId`
      );
    }
    const lifecycleSetup = node.lifecycle
      ? `const __pdxCollectionDataBinding_${suffix}: __PdxDataOperationBinding | undefined = ${lifecycleBinding ? toJson(lifecycleBinding) : 'undefined'};
      const __pdxCollectionDataSnapshot_${suffix} = ${parentScopeExpression}.dataLifecycleById[${toJson(node.lifecycle.dataId)}];
      const ${lifecycleName} = ${manualPreviewName}.state === 'auto'
        ? (__pdxCollectionDataBinding_${suffix} && __pdxCollectionDataSnapshot_${suffix}
          ? __pdxResolveCollectionDataLifecycle(
              __pdxCollectionDataBinding_${suffix},
              ${toJson(node.lifecycle)},
              __pdxCollectionDataSnapshot_${suffix}
            )
          : {
              status: 'blocked' as const,
              issues: [__pdxCollectionIssue(
                'PIR_DATA_LIFECYCLE_SNAPSHOT_UNAVAILABLE',
                '/lifecycle/dataId',
                'Collection Data lifecycle is unavailable in this document instance.'
              )],
            })
        : undefined;
      if (${lifecycleName}?.status === 'blocked') {
        return ${issueReporter(`${lifecycleName}.issues`)};
      }
      const ${previewName}: __PdxCollectionPreviewInput = ${lifecycleName}?.status === 'ready'
        ? {
            state: ${lifecycleName}.state,
            ...(${lifecycleName}.errorValue === undefined ? {} : { errorValue: ${lifecycleName}.errorValue }),
          }
        : ${manualPreviewName};`
      : `const ${previewName}: __PdxCollectionPreviewInput = ${manualPreviewName};`;
    return `(() => {
      const ${locationName}: __PdxCollectionLocation = { documentId: ${toJson(context.documentId)}, nodeId: ${toJson(node.id)}, instancePath: ${instancePathExpression} };
      const ${manualPreviewName}: __PdxCollectionPreviewInput = __pdxRuntime.resolveCollectionPreviewState?.(${locationName}) ?? { state: 'auto' as const };
      ${lifecycleSetup}
      const ${projectionName} = __pdxProjectCollection({
        parentScope: ${parentScopeExpression},
        preview: ${previewName},
        symbols: ${toJson(plan.symbols)},
        resolveSource: () => (${sourceExpression}),
        resolveKey: (__pdxCollectionScope_${suffix}, __pdxCollectionIndex_${suffix}) => (${keyExpression}),
      });
      if (${projectionName}.status === 'blocked') {
        return ${issueReporter(`${projectionName}.issues`)};
      }
      if (${projectionName}.kind === 'items') {
        return ${context.emitter.wrappedFragment({
          fragmentLocal,
          children: [
            issueReporter('__pdxNoCollectionProjectionIssues'),
            `${projectionName}.items.map((${itemName}) => (${context.emitter.keyedFragment(
              {
                fragmentLocal,
                keyExpression: `${itemName}.keyIdentity`,
                children: [itemBody],
              }
            )}))`,
          ],
        })};
      }
      switch (${projectionName}.regionName) {
        case 'empty': return ${regionFragment(emptyBody)};
        case 'loading': return ${regionFragment(loadingBody)};
        case 'error': return ${regionFragment(errorBody)};
      }
    })()`;
  };

  /**
   * A route outlet renders the matched child route, falling back to the node's
   * own children when no child route is mounted. Structurally identical to a
   * component slot outlet, keyed by node id instead of slot member id.
   */
  const compileRouteOutlet = (
    node: PIRNode,
    scopeExpression: string,
    instancePathExpression: string
  ): string => {
    const fallback = compileNodeList(
      graph.childIdsById[node.id] ?? [],
      scopeExpression,
      instancePathExpression
    );
    const outletInstancePath = `${instancePathExpression} + '/route-outlet:' + ${toJson(node.id)}`;
    return `(Object.prototype.hasOwnProperty.call(__pdxRouteOutletsById, ${toJson(node.id)}) ? (__pdxRouteOutletsById[${toJson(node.id)}] as __PdxRouteOutletRenderer)(${outletInstancePath}) : (${fallback}))`;
  };

  const compileNode = (
    nodeId: string,
    scopeExpression: string,
    instancePathExpression: string
  ): string => {
    const node = graph.nodesById[nodeId];
    if (!node) {
      addDiagnostic(
        'PIR_EXPORT_NODE_MISSING',
        `PIR node ${nodeId} is missing from nodesById.`,
        toPirNodePath(nodeId)
      );
      return context.emitter.emptyExpression;
    }
    context.traces.addPir(toPirNodePath(nodeId));
    if (context.routeOutletNodeIds.has(nodeId)) {
      return compileRouteOutlet(node, scopeExpression, instancePathExpression);
    }
    switch (node.kind) {
      case 'element':
        return compileElement(node, scopeExpression, instancePathExpression);
      case 'component-instance':
        return compileInstance(node, scopeExpression, instancePathExpression);
      case 'component-slot-outlet':
        return compileSlotOutlet(node, scopeExpression, instancePathExpression);
      case 'collection':
        return compileCollection(node, scopeExpression, instancePathExpression);
    }
  };

  return { compileNode, compileNodeList };
};
