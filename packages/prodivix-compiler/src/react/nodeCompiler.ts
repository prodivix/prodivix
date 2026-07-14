import {
  createPirCollectionProjectionPlan,
  projectPirCollection,
  resolvePirComponentVariantValues,
  selectPirSlotProjection,
  type PIRTriggerBinding,
  type PIRValueBinding,
} from '@prodivix/pir';
import type { TargetAdapterNode } from '#src/core/adapter';
import { compilePirBindingExpression } from '#src/react/bindingCompiler';
import type {
  PIRNodeOfKind,
  PIRReactNodeCompileContext,
  PIRReactNodeCompiler,
} from '#src/react/nodeCompiler.types';
import {
  compilePirComponentProjectionPath,
  compilePirSlotProjectionPath,
} from '#src/react/projectionPathRuntime';
import {
  toPirContractMemberPath,
  toPirCollectionRegionPath,
  toPirCollectionSymbolPath,
  toPirInstanceRegionPath,
  toPirNodePath,
} from '#src/react/sourceTrace';

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

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const toJson = (value: unknown): string => JSON.stringify(value) ?? 'null';

const toIdentifier = (value: string): string => {
  const candidate = value.replace(/[^a-zA-Z0-9_$]/g, '_');
  return /^[a-zA-Z_$]/.test(candidate) ? candidate : `_${candidate}`;
};

const toReactEventName = (eventName: string): string => {
  if (/^on[A-Z]/.test(eventName)) return eventName;
  const normalized = eventName.trim().replace(/^on/i, '');
  return `on${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
};

const literalBindingValues = (
  bindings: Readonly<Record<string, PIRValueBinding>> | undefined
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(bindings ?? {})
      .filter(([, binding]) => binding.kind === 'literal')
      .map(([key, binding]) => [
        key,
        binding.kind === 'literal' ? binding.value : undefined,
      ])
  );

const createAdapterNode = (
  node: PIRNodeOfKind<'element'>,
  documentId: string
): TargetAdapterNode => ({
  id: node.id,
  type: node.type,
  path: `${documentId}${toPirNodePath(node.id)}`,
  text: undefined,
  style: literalBindingValues(node.style),
  props: literalBindingValues(node.props),
  events: {},
  children: [],
});

const isValidJsxElement = (value: string): boolean =>
  /^[A-Za-z][A-Za-z0-9_$.-]*$/.test(value);

const compileRecord = (
  bindings: Readonly<Record<string, PIRValueBinding>> | undefined,
  scopeExpression: string
): string => {
  const entries = Object.entries(bindings ?? {})
    .sort(([left], [right]) => compareText(left, right))
    .map(
      ([key, binding]) =>
        `${toJson(key)}: ${compilePirBindingExpression(binding, scopeExpression)}`
    );
  return `{ ${entries.join(', ')} }`;
};

const compileTriggerHandler = (
  trigger: PIRTriggerBinding,
  scopeExpression: string,
  payloadName: string,
  context: PIRReactNodeCompileContext
): string => {
  if (trigger.kind === 'emit-component-event') {
    context.traces.addPir(
      toPirContractMemberPath('eventsById', trigger.memberId)
    );
    const payload = trigger.payload
      ? compilePirBindingExpression(trigger.payload, scopeExpression)
      : payloadName;
    return `(${payloadName}: unknown) => __pdxEventsById[${toJson(trigger.memberId)}]?.(${payload})`;
  }
  return `(${payloadName}: unknown) => __pdxRuntime.dispatchTrigger({ binding: ${toJson(trigger)}, payload: ${payloadName}, scope: ${scopeExpression}, setStateById: __pdxSetStateById })`;
};

const compileDataScopeExpression = (
  node: PIRNodeOfKind<'element'>,
  parentScopeExpression: string
): string => {
  const data = node.data;
  if (!data) return 'undefined';
  const baseBinding = data.source ?? data.mock ?? data.value;
  let baseExpression = baseBinding
    ? compilePirBindingExpression(baseBinding, parentScopeExpression)
    : 'undefined';
  if (data.pick?.trim()) {
    baseExpression = `__pdxReadPath(${baseExpression}, ${toJson(data.pick)})`;
  }
  if (data.extend === undefined) return baseExpression;
  const extendExpression = compileRecord(data.extend, parentScopeExpression);
  return `__pdxMergeData(${baseExpression}, ${extendExpression})`;
};

const compileInstanceVariantValues = (
  target: PIRNodeOfKind<'component-instance'>,
  context: PIRReactNodeCompileContext
): string => {
  const targetDocument = context.documentsById[target.componentDocumentId];
  const contract = targetDocument?.content.componentContract;
  if (!contract) return '{}';
  return toJson(
    resolvePirComponentVariantValues(contract, target.bindings.variants)
  );
};

const canStaticallyProjectCollection = (
  node: PIRNodeOfKind<'collection'>
): boolean => {
  if (node.source.kind !== 'literal' || node.source.value.length === 0) {
    return node.source.kind === 'literal';
  }
  if (node.key.kind === 'index') return true;
  const binding = node.key.value;
  return (
    binding.kind === 'literal' ||
    (binding.kind === 'collection-symbol' &&
      (binding.symbolId === node.symbols.itemId ||
        binding.symbolId === node.symbols.indexId))
  );
};

export const createPirReactNodeCompiler = (
  context: PIRReactNodeCompileContext
): PIRReactNodeCompiler => {
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
    if (nodeIds.length === 0) return 'null';
    return `<>${nodeIds
      .map(
        (nodeId) =>
          `{${compileNode(nodeId, scopeExpression, instancePathExpression)}}`
      )
      .join('')}</>`;
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
    if (!isValidJsxElement(element)) {
      addDiagnostic(
        'PIR_EXPORT_ELEMENT_UNSUPPORTED',
        `Element type ${node.type} cannot be emitted as a React element.`,
        nodePath
      );
      return 'null';
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
      propExpressions.set(key, toJson(value));
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
        toReactEventName(eventName),
        compileTriggerHandler(trigger, scopeExpression, '__pdxEvent', context)
      );
    }
    const propEntries = [...propExpressions.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, expression]) => `${toJson(key)}: ${expression}`);
    const propsExpression = `{ ${propEntries.join(', ')} }`;
    const textExpression =
      node.text && adapterResult.textMode !== 'omit'
        ? `{__pdxRenderValue(${compilePirBindingExpression(node.text, scopeExpression)})}`
        : '';
    const childIds =
      adapterResult.childrenMode === 'omit'
        ? []
        : (graph.childIdsById[node.id] ?? []);
    const children = childIds
      .map(
        (childId) =>
          `{${compileNode(childId, scopeExpression, instancePathExpression)}}`
      )
      .join('');
    const hasChildren = Boolean(textExpression || children);
    if (VOID_ELEMENTS.has(element.toLowerCase()) && hasChildren) {
      addDiagnostic(
        'PIR_EXPORT_VOID_ELEMENT_CHILDREN',
        `Void element ${element} cannot project text or children.`,
        nodePath
      );
    }
    const elementExpression =
      VOID_ELEMENTS.has(element.toLowerCase()) || !hasChildren
        ? `<${element} {...${propsExpression}} />`
        : `<${element} {...${propsExpression}}>${textExpression}${children}</${element}>`;
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
      return 'null';
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
          `${toJson(memberId)}: ${compileTriggerHandler(trigger, consumerScopeExpression, '__pdxPayload', context)}`
      );
    const eventsExpression = `{ ${eventEntries.join(', ')} }`;
    const variantsExpression = compileInstanceVariantValues(node, context);
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
    return `<${targetLocal} {...{ __pdxRuntime, __pdxInstancePath: ${targetInstancePathExpression}, __pdxPropsById: ${propsExpression}, __pdxEventsById: ${eventsExpression}, __pdxVariantsById: ${variantsExpression}, __pdxSlotsById: ${slotsExpression} }} />`;
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
    const previewName = `__pdxCollectionPreview_${suffix}`;
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
    const fragmentLocal = context.imports.addNamedPackageImport(
      'react',
      'Fragment'
    );
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
    return `(() => {
      const ${locationName}: __PdxCollectionLocation = { documentId: ${toJson(context.documentId)}, nodeId: ${toJson(node.id)}, instancePath: ${instancePathExpression} };
      const ${previewName} = __pdxRuntime.resolveCollectionPreviewState?.(${locationName}) ?? { state: 'auto' as const };
      const ${projectionName} = __pdxProjectCollection({
        parentScope: ${parentScopeExpression},
        preview: ${previewName},
        symbols: ${toJson(plan.symbols)},
        resolveSource: () => (${sourceExpression}),
        resolveKey: (__pdxCollectionScope_${suffix}, __pdxCollectionIndex_${suffix}) => (${keyExpression}),
      });
      if (${projectionName}.status === 'blocked') {
        return <__PdxCollectionIssueReporter runtime={__pdxRuntime} location={${locationName}} issues={${projectionName}.issues} />;
      }
      if (${projectionName}.kind === 'items') {
        return (
          <${fragmentLocal}>
            <__PdxCollectionIssueReporter runtime={__pdxRuntime} location={${locationName}} issues={__pdxNoCollectionProjectionIssues} />
            {${projectionName}.items.map((${itemName}) => (
              <${fragmentLocal} key={${itemName}.keyIdentity}>${itemBody}</${fragmentLocal}>
            ))}
          </${fragmentLocal}>
        );
      }
      switch (${projectionName}.regionName) {
        case 'empty': return (<${fragmentLocal}><__PdxCollectionIssueReporter runtime={__pdxRuntime} location={${locationName}} issues={__pdxNoCollectionProjectionIssues} />${emptyBody}</${fragmentLocal}>);
        case 'loading': return (<${fragmentLocal}><__PdxCollectionIssueReporter runtime={__pdxRuntime} location={${locationName}} issues={__pdxNoCollectionProjectionIssues} />${loadingBody}</${fragmentLocal}>);
        case 'error': return (<${fragmentLocal}><__PdxCollectionIssueReporter runtime={__pdxRuntime} location={${locationName}} issues={__pdxNoCollectionProjectionIssues} />${errorBody}</${fragmentLocal}>);
      }
    })()`;
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
      return 'null';
    }
    context.traces.addPir(toPirNodePath(nodeId));
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
