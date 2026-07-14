export {
  projectWorkspaceToProdivixFiles,
  readWorkspaceFromProdivixFiles,
} from './workspaceProjection';
export { isWorkspaceCodeDocumentContent } from './workspaceCodeDocument';
export {
  WorkspaceDocumentFactoryError,
  createWorkspaceDocumentNodeId,
  createWorkspaceDocumentAtPathCommand,
  createWorkspacePathNodeId,
} from './workspaceDocumentFactory';
export { createWorkspacePirDocumentUpdateCommand } from './workspacePirDocument';
export {
  createWorkspaceAnimationDocumentUpdateCommand,
  decodeWorkspaceAnimationDocument,
  isCanonicalWorkspaceAnimationDocumentContent,
  isWorkspaceAnimationDocument,
  selectWorkspaceAnimationDocument,
  selectWorkspaceAnimationDocumentResults,
} from './workspaceAnimationDocument';
export {
  createWorkspaceNodeGraphDocumentUpdateCommand,
  decodeWorkspaceNodeGraphDocument,
  isCanonicalWorkspaceNodeGraphDocumentContent,
  isWorkspaceNodeGraphDocument,
  selectWorkspaceNodeGraphDocument,
  selectWorkspaceNodeGraphDocumentResults,
} from './workspaceNodeGraphDocument';
export {
  createWorkspaceProjectConfigDocumentContent,
  createWorkspaceProjectConfigValueUpdateCommand,
  isWorkspaceAssetDocumentContent,
  isWorkspaceProjectConfigDocumentContent,
} from './workspaceResourceDocument';
export { createWorkspaceVfsIntentPlan } from './workspaceVfsIntent';
export {
  WorkspaceCodecError,
  applyWorkspaceMutation,
  decodeWorkspaceDocument,
  decodeWorkspaceMutation,
  decodeWorkspaceSnapshot,
  encodeWorkspaceDocument,
  encodeWorkspaceSnapshot,
  isPirWorkspaceDocumentType,
  normalizeWorkspaceDocument,
  normalizeWorkspaceTree,
} from './workspaceCodec';
export { createWorkspaceCodeArtifactProvider } from './authoring/workspaceCodeArtifactProvider';
export {
  WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES,
  createWorkspaceCodeLanguageEditTransactionPlan,
} from './workspaceCodeLanguageEditTransaction';
export {
  decodeWorkspacePirDocument,
  isWorkspacePirDocument,
  isWorkspacePirDocumentType,
  selectWorkspacePirDocument,
  selectWorkspacePirDocumentResults,
} from './component/workspacePirDocument';
export {
  WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES,
  validateWorkspaceComponentGraph,
} from './component/workspaceComponentGraph';
export {
  WORKSPACE_PIR_PROJECTION_ISSUE_CODES,
  createWorkspacePirProjectionPlan,
} from './component/workspacePirProjection';
export {
  WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES,
  createWorkspaceComponentDefinitionTransactionPlan,
} from './component/workspaceComponentDefinitionTransaction';
export {
  WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES,
  createWorkspaceCollectionInsertTransactionPlan,
  createWorkspaceCollectionUpdateTransactionPlan,
  createWorkspaceComponentContractUpdateTransactionPlan,
  createWorkspaceComponentInstanceBindingsUpdateTransactionPlan,
  createWorkspaceComponentInstanceTransactionPlan,
} from './component/workspaceComponentAuthoringTransaction';
export {
  WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES,
  createWorkspacePIRCollectionUnwrapTransactionPlan,
  createWorkspacePIRElementBatchUpdateTransactionPlan,
  createWorkspacePIRElementUpdateTransactionPlan,
  createWorkspacePIRSubtreeDeleteTransactionPlan,
  createWorkspacePIRSubtreeDuplicateTransactionPlan,
  createWorkspacePIRSubtreeMoveTransactionPlan,
} from './component/workspacePirGraphAuthoringTransaction';
export {
  WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES,
  analyzeWorkspaceComponentImpact,
  createWorkspaceComponentDeleteTransactionPlan,
  createWorkspaceComponentRenameTransactionPlan,
} from './component/workspaceComponentImpactPlanner';
export {
  WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS,
  WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES,
  analyzeWorkspaceComponentExtractionReferences,
  createWorkspaceComponentExtractionMemberSourceKey,
} from './component/workspaceComponentExtractionReferences';
export {
  WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES,
  createWorkspaceComponentExtractionTransactionPlan,
} from './component/workspaceComponentExtractionTransaction';
export {
  WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES,
  createWorkspaceSemanticIndexFromSnapshot,
} from './authoring/createWorkspaceSemanticIndexFromSnapshot';
export { createWorkspaceCodeSlotRegistryFromSnapshot } from './authoring/createWorkspaceCodeSlotRegistryFromSnapshot';
export {
  WORKSPACE_SEMANTIC_PROVIDER_ID,
  WORKSPACE_SEMANTIC_PROVIDER_VERSION,
  createWorkspaceSemanticContributionProvider,
} from './authoring/workspaceSemanticContributionProvider';
export { captureWorkspaceSemanticRevisions } from './authoring/workspaceSemanticRevision';
export {
  resolveCanonicalWorkspaceDocumentId,
  type WorkspaceLikeDocument,
} from './resolveCanonicalWorkspaceDocumentId';
export {
  createWorkspaceRouteIntentPlan,
  selectWorkspaceRoute,
} from './workspaceRouteIntent';
export {
  isPirDocumentContent,
  selectActiveDocument,
  selectActivePirDocument,
  selectDocumentById,
  selectDocumentPath,
  selectDocumentsByType,
  selectRouteManifest,
  selectWorkspaceSnapshot,
  selectWorkspaceTree,
} from './workspaceSelectors';
export {
  applyWorkspaceCommand,
  applyWorkspaceDocumentCommand,
  applyWorkspaceTransaction,
  createWorkspaceDirectoryIntentRequest,
  createWorkspaceCodeDocumentCommand,
  createWorkspaceCodeDocumentIntentRequest,
  createWorkspaceCodeSourceUpdateCommand,
  createWorkspaceDocumentIntentRequest,
  deleteWorkspaceDirectoryIntentRequest,
  deleteWorkspaceCodeDocumentIntentRequest,
  deleteWorkspaceDocumentIntentRequest,
  renameWorkspaceDirectoryIntentRequest,
  renameWorkspaceCodeDocumentIntentRequest,
  renameWorkspaceDocumentIntentRequest,
  resolveWorkspaceCommandDomain,
} from './workspaceCommand';
export {
  DEFAULT_WORKSPACE_HISTORY_MERGE_WINDOW_MS,
  DEFAULT_WORKSPACE_HISTORY_MAX_ENTRIES,
  canRedoWorkspaceHistory,
  canUndoWorkspaceHistory,
  collectChangedWorkspaceDocumentIds,
  collectWorkspaceOperationDocumentIds,
  createWorkspaceCommandOperation,
  createWorkspaceHistoryState,
  createWorkspaceTransactionOperation,
  reconcileWorkspaceOperationConfirmation,
  recordWorkspaceOperation,
  redoWorkspaceHistory,
  resolveWorkspaceCommandScope,
  resolveWorkspaceOperationAffectedScopes,
  resolveWorkspaceOperationScope,
  selectRedoWorkspaceHistoryEntry,
  selectUndoWorkspaceHistoryEntry,
  setWorkspaceHistoryLimit,
  setWorkspaceHistoryMergeWindow,
  undoWorkspaceHistory,
  workspaceHistoryScopesEqual,
} from './workspaceHistory';
export {
  getWorkspaceOperationCommands,
  getWorkspaceOperationId,
  getWorkspaceOperationSourceIds,
} from './workspaceOperation';
export {
  validateWorkspaceSnapshot,
  validateWorkspaceVfs,
} from './validateWorkspaceVfs';
export type {
  WorkspaceCommandApplyResult,
  WorkspaceCommandDomain,
  WorkspaceCommandEnvelope,
  WorkspaceDocumentCommandApplyResult,
  WorkspaceCommandIssue,
  WorkspaceCommandIssueCode,
  WorkspaceTransactionApplyResult,
  WorkspaceTransactionEnvelope,
  WorkspaceTransactionIssue,
  WorkspaceTransactionIssueCode,
  WorkspacePatchOperation,
  CreateWorkspaceDirectoryIntentInput,
  CreateWorkspaceCodeDocumentCommandInput,
  CreateWorkspaceCodeDocumentIntentInput,
  CreateWorkspaceCodeSourceUpdateCommandInput,
  CreateWorkspaceDocumentIntentInput,
  DeleteWorkspaceDirectoryIntentInput,
  DeleteWorkspaceCodeDocumentIntentInput,
  DeleteWorkspaceDocumentIntentInput,
  RenameWorkspaceDirectoryIntentInput,
  RenameWorkspaceCodeDocumentIntentInput,
  RenameWorkspaceDocumentIntentInput,
  WorkspaceDirectoryCreateIntentRequest,
  WorkspaceDirectoryDeleteIntentRequest,
  WorkspaceDirectoryRenameIntentRequest,
  WorkspaceCodeDocumentCreateIntentRequest,
  WorkspaceCodeDocumentDeleteIntentRequest,
  WorkspaceCodeDocumentRenameIntentRequest,
  WorkspaceDocumentCreateIntentRequest,
  WorkspaceDocumentDeleteIntentRequest,
  WorkspaceDocumentRenameIntentRequest,
} from './workspaceCommand';
export type {
  WorkspaceHistoryDocumentDomain,
  WorkspaceHistoryEntry,
  WorkspaceHistoryExecutionOptions,
  WorkspaceHistoryIssue,
  WorkspaceHistoryIssueCode,
  WorkspaceHistoryOperationIdContext,
  WorkspaceHistoryRecordOptions,
  WorkspaceHistoryResult,
  WorkspaceHistoryScope,
  WorkspaceHistoryScopeSelector,
  WorkspaceHistoryState,
  WorkspaceHistoryStateOptions,
  WorkspaceOperation,
} from './workspaceHistory';
export type {
  CreateWorkspaceDocumentAtPathCommandInput,
  WorkspaceDocumentAtPathPlan,
  WorkspaceDocumentFactoryErrorCode,
  WorkspaceDocumentNodeIdFactory,
} from './workspaceDocumentFactory';
export type { CreateWorkspacePirDocumentUpdateCommandInput } from './workspacePirDocument';
export type {
  CreateWorkspaceAnimationDocumentUpdateCommandInput,
  WorkspaceAnimationDocument,
  WorkspaceAnimationReadIssue,
  WorkspaceAnimationReadResult,
} from './workspaceAnimationDocument';
export type {
  CreateWorkspaceNodeGraphDocumentUpdateCommandInput,
  WorkspaceNodeGraphDocument,
  WorkspaceNodeGraphReadResult,
} from './workspaceNodeGraphDocument';
export type {
  WorkspaceAssetDocumentContent,
  WorkspaceProjectConfigDocumentContent,
} from './workspaceResourceDocument';
export type {
  WorkspaceVfsIntentPlan,
  WorkspaceVfsIntentRequest,
} from './workspaceVfsIntent';
export type {
  WorkspaceProjectionIssue,
  WorkspaceProjectionIssueCode,
  WorkspaceProjectionReadResult,
  WorkspaceProjectionWriteResult,
  WorkspaceSourceFile,
  WorkspaceSourceFileRole,
} from './workspaceProjection';
export type { WorkspaceTreeViewNode } from './workspaceSelectors';
export type {
  WorkspaceRouteIntent,
  WorkspaceRouteIntentIdFactory,
  WorkspaceRouteIntentPlan,
  WorkspaceRouteIntentPlanOptions,
} from './workspaceRouteIntent';
export type {
  DecodedWorkspaceMutation,
  DecodedWorkspaceSnapshot,
  WorkspaceDocumentWireDto,
  WorkspaceMutationWireDto,
  WorkspaceSnapshotWireDto,
  WorkspaceTreeWireDto,
} from './workspaceCodec';
export type {
  WorkspaceDocument,
  WorkspaceDocumentType,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
  WorkspaceCodeDocumentContent,
  WorkspaceCodeDocumentLanguage,
  WorkspaceDocumentId,
  WorkspaceId,
  WorkspaceValidationIssue,
  WorkspaceValidationIssueCode,
  WorkspaceValidationResult,
  WorkspaceVfsNodeId,
} from './types';
export type {
  CreateWorkspaceCodeLanguageEditTransactionInput,
  WorkspaceCodeLanguageEditPlanIssue,
  WorkspaceCodeLanguageEditPlanIssueCode,
  WorkspaceCodeLanguageEditTransactionPlan,
  WorkspaceCodeLanguageEditTransactionPlanResult,
} from './workspaceCodeLanguageEditTransaction';
export type {
  WorkspaceSemanticIndexCompositionOptions,
  WorkspaceSemanticIndexCompositionResult,
  WorkspaceSemanticIndexIssue,
  WorkspaceSemanticIndexIssueCode,
} from './authoring/createWorkspaceSemanticIndexFromSnapshot';
export type { WorkspaceCodeSlotRegistryCompositionResult } from './authoring/createWorkspaceCodeSlotRegistryFromSnapshot';
export type {
  DecodeWorkspacePirDocumentOptions,
  WorkspacePirDocument,
  WorkspacePirDocumentLocation,
  WorkspacePirDocumentType,
  WorkspacePirReadIssue,
  WorkspacePirReadResult,
} from './component/workspacePirDocument';
export type {
  WorkspaceComponentDependencyEdge,
  WorkspaceComponentDependencyGraph,
  WorkspaceComponentGraphDocument,
  WorkspaceComponentGraphIssue,
  WorkspaceComponentGraphIssueCode,
  WorkspaceComponentGraphValidationResult,
} from './component/workspaceComponentGraph';
export type {
  CreateWorkspacePirProjectionPlanInput,
  WorkspacePirProjectionIssue,
  WorkspacePirProjectionIssueCode,
  WorkspacePirProjectionPlan,
  WorkspacePirProjectionPlanResult,
  WorkspacePirProjectionSnapshotIdentity,
} from './component/workspacePirProjection';
export type {
  CreateWorkspaceComponentDefinitionTransactionInput,
  WorkspaceComponentDefinitionPlanIssue,
  WorkspaceComponentDefinitionPlanIssueCode,
  WorkspaceComponentDefinitionTransactionPlan,
  WorkspaceComponentDefinitionTransactionPlanResult,
} from './component/workspaceComponentDefinitionTransaction';
export type {
  CreateWorkspaceCollectionInsertTransactionInput,
  CreateWorkspaceCollectionUpdateTransactionInput,
  CreateWorkspaceComponentContractUpdateTransactionInput,
  CreateWorkspaceComponentInstanceBindingsUpdateTransactionInput,
  CreateWorkspaceComponentInstanceTransactionInput,
  WorkspaceComponentAuthoringPlanIssue,
  WorkspaceComponentAuthoringPlanIssueCode,
  WorkspaceComponentAuthoringTransactionPlan,
  WorkspaceComponentAuthoringTransactionPlanResult,
} from './component/workspaceComponentAuthoringTransaction';
export type {
  CreateWorkspacePIRCollectionUnwrapTransactionInput,
  CreateWorkspacePIRElementBatchUpdateTransactionInput,
  CreateWorkspacePIRElementUpdateTransactionInput,
  CreateWorkspacePIRSubtreeDeleteTransactionInput,
  CreateWorkspacePIRSubtreeDuplicateTransactionInput,
  CreateWorkspacePIRSubtreeMoveTransactionInput,
  WorkspacePIRGraphAuthoringIssue,
  WorkspacePIRGraphAuthoringIssueCode,
  WorkspacePIRGraphAuthoringTransactionPlan,
  WorkspacePIRGraphAuthoringTransactionPlanResult,
} from './component/workspacePirGraphAuthoringTransaction';
export type {
  AnalyzeWorkspaceComponentImpactInput,
  CreateWorkspaceComponentDeleteTransactionInput,
  CreateWorkspaceComponentRenameTransactionInput,
  WorkspaceComponentContractMemberImpact,
  WorkspaceComponentContractSymbolTarget,
  WorkspaceComponentImpact,
  WorkspaceComponentImpactAnalysisResult,
  WorkspaceComponentImpactPlanIssue,
  WorkspaceComponentImpactPlanIssueCode,
  WorkspaceComponentImpactTransactionPlan,
  WorkspaceComponentImpactTransactionPlanResult,
  WorkspaceComponentInstanceImpact,
  WorkspaceComponentReferenceImpact,
  WorkspaceComponentRenameTarget,
} from './component/workspaceComponentImpactPlanner';
export type {
  AnalyzeWorkspaceComponentExtractionReferencesInput,
  NormalizedWorkspaceComponentExtractionReferenceContext,
  WorkspaceComponentExtractionNodeAddress,
  WorkspaceComponentExtractionNodeRelocation,
  WorkspaceComponentExtractionNodeRelocationInput,
  WorkspaceComponentExtractionPublicMemberKind,
  WorkspaceComponentExtractionPublicMemberMapping,
  WorkspaceComponentExtractionPublicMemberSource,
  WorkspaceComponentExtractionPublicPartMapping,
  WorkspaceComponentExtractionPublicTarget,
  WorkspaceComponentExtractionReference,
  WorkspaceComponentExtractionReferenceClassification,
  WorkspaceComponentExtractionReferenceContribution,
  WorkspaceComponentExtractionReferenceIssue,
  WorkspaceComponentExtractionReferenceIssueCode,
  WorkspaceComponentExtractionReferenceOwner,
  WorkspaceComponentExtractionReferencePlan,
  WorkspaceComponentExtractionReferenceProvider,
  WorkspaceComponentExtractionReferenceProviderContext,
  WorkspaceComponentExtractionReferenceRewrite,
  WorkspaceComponentExtractionReferenceTarget,
} from './component/workspaceComponentExtractionReferences';
export type {
  CreateWorkspaceComponentExtractionTransactionInput,
  WorkspaceComponentExtractionTransactionIssue,
  WorkspaceComponentExtractionTransactionIssueCode,
  WorkspaceComponentExtractionTransactionPlan,
  WorkspaceComponentExtractionTransactionPlanResult,
} from './component/workspaceComponentExtractionTransaction';
