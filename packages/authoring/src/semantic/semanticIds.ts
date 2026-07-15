const SEMANTIC_ID_PREFIX = 'prodivix.semantic.v1';

export const CURRENT_SEMANTIC_SCHEMA_VERSION = 'prodivix-semantic-v2';

const encodeSemanticIdPart = (value: string): string =>
  `${value.length}:${value}`;

/**
 * Creates an unambiguous semantic fact identity. Length-prefixed parts keep
 * persisted domain IDs opaque, so characters such as `:`, `/`, or `#` never
 * create collisions between providers.
 */
export const createSemanticId = (
  kind: string,
  ...parts: readonly string[]
): string =>
  [
    SEMANTIC_ID_PREFIX,
    encodeSemanticIdPart(kind),
    ...parts.map(encodeSemanticIdPart),
  ].join(':');

export const createWorkspaceScopeId = (workspaceId: string): string =>
  createSemanticId('workspace-scope', workspaceId);

export const createWorkspaceDocumentScopeId = (
  workspaceId: string,
  documentId: string
): string =>
  createSemanticId('workspace-document-scope', workspaceId, documentId);

export const createWorkspaceDocumentSymbolId = (
  workspaceId: string,
  documentId: string
): string =>
  createSemanticId('workspace-document-symbol', workspaceId, documentId);

export const createComponentScopeId = (
  workspaceId: string,
  componentDocumentId: string
): string =>
  createSemanticId('component-scope', workspaceId, componentDocumentId);

export const createComponentSymbolId = (
  workspaceId: string,
  componentDocumentId: string
): string =>
  createSemanticId('component-symbol', workspaceId, componentDocumentId);

export const createComponentContractMemberSymbolId = (
  workspaceId: string,
  componentDocumentId: string,
  memberKind: 'prop' | 'event' | 'slot' | 'variant' | 'part',
  memberId: string
): string =>
  createSemanticId(
    'component-contract-member-symbol',
    workspaceId,
    componentDocumentId,
    memberKind,
    memberId
  );

export const createComponentVariantOptionSymbolId = (
  workspaceId: string,
  componentDocumentId: string,
  variantMemberId: string,
  optionId: string
): string =>
  createSemanticId(
    'component-variant-option-symbol',
    workspaceId,
    componentDocumentId,
    variantMemberId,
    optionId
  );

export const createComponentSlotScopeId = (
  workspaceId: string,
  componentDocumentId: string,
  slotMemberId: string
): string =>
  createSemanticId(
    'component-slot-scope',
    workspaceId,
    componentDocumentId,
    slotMemberId
  );

export const createComponentSlotPropSymbolId = (
  workspaceId: string,
  componentDocumentId: string,
  slotMemberId: string,
  propMemberId: string
): string =>
  createSemanticId(
    'component-slot-prop-symbol',
    workspaceId,
    componentDocumentId,
    slotMemberId,
    propMemberId
  );

export const createCodeArtifactSymbolId = (
  workspaceId: string,
  artifactId: string
): string => createSemanticId('code-artifact-symbol', workspaceId, artifactId);

export const createCodeArtifactScopeId = (
  workspaceId: string,
  artifactId: string
): string => createSemanticId('code-artifact-scope', workspaceId, artifactId);

export const createCodeSymbolId = (
  workspaceId: string,
  artifactId: string,
  symbolId: string
): string => createSemanticId('code-symbol', workspaceId, artifactId, symbolId);

export const createAssetSymbolId = (
  workspaceId: string,
  documentId: string
): string => createSemanticId('asset-symbol', workspaceId, documentId);

export const createDesignTokenDocumentScopeId = (
  workspaceId: string,
  documentId: string
): string =>
  createSemanticId('design-token-document-scope', workspaceId, documentId);

export const createDesignTokenGroupScopeId = (
  workspaceId: string,
  documentId: string,
  groupPath: string
): string =>
  createSemanticId(
    'design-token-group-scope',
    workspaceId,
    documentId,
    groupPath
  );

export const createDesignTokenGroupSymbolId = (
  workspaceId: string,
  documentId: string,
  groupPath: string
): string =>
  createSemanticId(
    'design-token-group-symbol',
    workspaceId,
    documentId,
    groupPath
  );

export const createDesignTokenSymbolId = (
  workspaceId: string,
  documentId: string,
  tokenPath: string
): string =>
  createSemanticId('design-token-symbol', workspaceId, documentId, tokenPath);

export const createDesignTokenResolverScopeId = (
  workspaceId: string,
  documentId: string
): string =>
  createSemanticId('design-token-resolver-scope', workspaceId, documentId);

export const createDesignSystemSymbolId = (
  workspaceId: string,
  documentId: string
): string => createSemanticId('design-system-symbol', workspaceId, documentId);

export const createDesignTokenSetSymbolId = (
  workspaceId: string,
  documentId: string,
  definitionId: string
): string =>
  createSemanticId(
    'design-token-set-symbol',
    workspaceId,
    documentId,
    definitionId
  );

export const createDesignTokenModifierScopeId = (
  workspaceId: string,
  documentId: string,
  definitionId: string
): string =>
  createSemanticId(
    'design-token-modifier-scope',
    workspaceId,
    documentId,
    definitionId
  );

export const createDesignTokenModifierSymbolId = (
  workspaceId: string,
  documentId: string,
  definitionId: string
): string =>
  createSemanticId(
    'design-token-modifier-symbol',
    workspaceId,
    documentId,
    definitionId
  );

export const createDesignTokenContextSymbolId = (
  workspaceId: string,
  documentId: string,
  modifierDefinitionId: string,
  contextName: string
): string =>
  createSemanticId(
    'design-token-context-symbol',
    workspaceId,
    documentId,
    modifierDefinitionId,
    contextName
  );

export const createRouteScopeId = (
  workspaceId: string,
  routeNodeId: string
): string => createSemanticId('route-scope', workspaceId, routeNodeId);

export const createRouteManifestScopeId = (workspaceId: string): string =>
  createSemanticId('route-manifest-scope', workspaceId);

export const createRouteSymbolId = (
  workspaceId: string,
  routeNodeId: string
): string => createSemanticId('route-symbol', workspaceId, routeNodeId);

export const createRouteParamSymbolId = (
  workspaceId: string,
  routeNodeId: string,
  paramName: string
): string =>
  createSemanticId('route-param-symbol', workspaceId, routeNodeId, paramName);

export const createRouteModuleScopeId = (
  workspaceId: string,
  moduleId: string
): string => createSemanticId('route-module-scope', workspaceId, moduleId);

export const createRouteModuleSymbolId = (
  workspaceId: string,
  moduleId: string
): string => createSemanticId('route-module-symbol', workspaceId, moduleId);

export const createRouteMountSymbolId = (
  workspaceId: string,
  mountId: string
): string => createSemanticId('route-mount-symbol', workspaceId, mountId);

export const createPirNodeScopeId = (
  workspaceId: string,
  documentId: string,
  nodeId: string
): string =>
  createSemanticId('pir-node-scope', workspaceId, documentId, nodeId);

export const createPirNodeSymbolId = (
  workspaceId: string,
  documentId: string,
  nodeId: string
): string =>
  createSemanticId('pir-node-symbol', workspaceId, documentId, nodeId);

export const createPirRegionSymbolId = (
  workspaceId: string,
  documentId: string,
  nodeId: string,
  regionName: string
): string =>
  createSemanticId(
    'pir-region-symbol',
    workspaceId,
    documentId,
    nodeId,
    regionName
  );

export const createPirParamSymbolId = (
  workspaceId: string,
  documentId: string,
  paramName: string
): string =>
  createSemanticId('pir-param-symbol', workspaceId, documentId, paramName);

export const createPirStateSymbolId = (
  workspaceId: string,
  documentId: string,
  stateName: string
): string =>
  createSemanticId('pir-state-symbol', workspaceId, documentId, stateName);

export const createPirDataSymbolId = (
  workspaceId: string,
  documentId: string,
  nodeId: string,
  role = 'node'
): string =>
  createSemanticId('pir-data-symbol', workspaceId, documentId, nodeId, role);

export const createPirListScopeId = (
  workspaceId: string,
  documentId: string,
  nodeId: string
): string =>
  createSemanticId('pir-list-scope', workspaceId, documentId, nodeId);

export const createPirListItemSymbolId = (
  workspaceId: string,
  documentId: string,
  nodeId: string
): string =>
  createSemanticId('pir-list-item-symbol', workspaceId, documentId, nodeId);

export const createPirListIndexSymbolId = (
  workspaceId: string,
  documentId: string,
  nodeId: string
): string =>
  createSemanticId('pir-list-index-symbol', workspaceId, documentId, nodeId);

export const createPirCollectionScopeId = (
  workspaceId: string,
  documentId: string,
  nodeId: string
): string =>
  createSemanticId('pir-collection-scope', workspaceId, documentId, nodeId);

export const createPirCollectionErrorScopeId = (
  workspaceId: string,
  documentId: string,
  nodeId: string
): string =>
  createSemanticId(
    'pir-collection-error-scope',
    workspaceId,
    documentId,
    nodeId
  );

export const createPirCollectionItemSymbolId = (
  workspaceId: string,
  documentId: string,
  nodeId: string,
  symbolId: string
): string =>
  createSemanticId(
    'pir-collection-item-symbol',
    workspaceId,
    documentId,
    nodeId,
    symbolId
  );

export const createPirCollectionIndexSymbolId = (
  workspaceId: string,
  documentId: string,
  nodeId: string,
  symbolId: string
): string =>
  createSemanticId(
    'pir-collection-index-symbol',
    workspaceId,
    documentId,
    nodeId,
    symbolId
  );

export const createPirCollectionErrorSymbolId = (
  workspaceId: string,
  documentId: string,
  nodeId: string,
  symbolId: string
): string =>
  createSemanticId(
    'pir-collection-error-symbol',
    workspaceId,
    documentId,
    nodeId,
    symbolId
  );

export const createNodeGraphScopeId = (
  workspaceId: string,
  documentId: string
): string => createSemanticId('nodegraph-scope', workspaceId, documentId);

export const createNodeGraphSymbolId = (
  workspaceId: string,
  documentId: string
): string => createSemanticId('nodegraph-symbol', workspaceId, documentId);

export const createNodeGraphNodeScopeId = (
  workspaceId: string,
  documentId: string,
  nodeId: string
): string =>
  createSemanticId('nodegraph-node-scope', workspaceId, documentId, nodeId);

export const createNodeGraphNodeSymbolId = (
  workspaceId: string,
  documentId: string,
  nodeId: string
): string =>
  createSemanticId('nodegraph-node-symbol', workspaceId, documentId, nodeId);

export const createNodeGraphPortSymbolId = (
  workspaceId: string,
  documentId: string,
  nodeId: string,
  portId: string
): string =>
  createSemanticId(
    'nodegraph-port-symbol',
    workspaceId,
    documentId,
    nodeId,
    portId
  );

export const createAnimationDocumentScopeId = (
  workspaceId: string,
  documentId: string
): string => createSemanticId('animation-scope', workspaceId, documentId);

export const createAnimationTimelineScopeId = (
  workspaceId: string,
  documentId: string,
  timelineId: string
): string =>
  createSemanticId(
    'animation-timeline-scope',
    workspaceId,
    documentId,
    timelineId
  );

export const createAnimationBindingScopeId = (
  workspaceId: string,
  documentId: string,
  timelineId: string,
  bindingId: string
): string =>
  createSemanticId(
    'animation-binding-scope',
    workspaceId,
    documentId,
    timelineId,
    bindingId
  );

export const createAnimationTimelineSymbolId = (
  workspaceId: string,
  documentId: string,
  timelineId: string
): string =>
  createSemanticId(
    'animation-timeline-symbol',
    workspaceId,
    documentId,
    timelineId
  );

export const createAnimationBindingSymbolId = (
  workspaceId: string,
  documentId: string,
  timelineId: string,
  bindingId: string
): string =>
  createSemanticId(
    'animation-binding-symbol',
    workspaceId,
    documentId,
    timelineId,
    bindingId
  );

export const createAnimationTrackSymbolId = (
  workspaceId: string,
  documentId: string,
  timelineId: string,
  bindingId: string,
  trackId: string
): string =>
  createSemanticId(
    'animation-track-symbol',
    workspaceId,
    documentId,
    timelineId,
    bindingId,
    trackId
  );
