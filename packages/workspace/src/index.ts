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
export { createWorkspaceCodeBindingTransaction } from './workspaceCodeBindingTransaction';
export {
  WorkspaceCodecError,
  applyWorkspaceMutation,
  decodeWorkspaceMutation,
  decodeWorkspaceRouteManifest,
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  hasRouteNodeId,
  isPirWorkspaceDocumentType,
  isWorkspacePirDocument,
  normalizeRouteManifest,
  normalizeWorkspaceDocument,
  normalizeWorkspaceTree,
  resolveActiveRouteNodeId,
  resolveDefaultActiveRouteNodeId,
} from './workspaceCodec';
export { createWorkspaceCodeArtifactProvider } from './authoring/workspaceCodeArtifactProvider';
export {
  resolveCanonicalWorkspaceDocumentId,
  type WorkspaceLikeDocument,
} from './resolveCanonicalWorkspaceDocumentId';
export {
  createWorkspaceRouteIntentPlan,
  selectWorkspaceRoute,
} from './workspaceRouteIntent';
export {
  createNodeDeleteTransaction,
  createNodeRenameTransaction,
  createNodeSubtreeRemovalTransaction,
} from './workspaceNodeReferenceTransaction';
export {
  isPirDocumentContent,
  selectActiveDocument,
  selectActivePirDocument,
  selectActivePirWorkspaceDocument,
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
export type { CreateWorkspaceCodeBindingTransactionInput } from './workspaceCodeBindingTransaction';
export type {
  WorkspaceProjectionIssue,
  WorkspaceProjectionIssueCode,
  WorkspaceProjectionReadResult,
  WorkspaceProjectionWriteResult,
  WorkspaceSourceFile,
  WorkspaceSourceFileRole,
} from './workspaceProjection';
export type {
  WorkspacePirDocument,
  WorkspacePirDocumentType,
  WorkspaceTreeViewNode,
} from './workspaceSelectors';
export type {
  WorkspaceRouteIntent,
  WorkspaceRouteIntentIdFactory,
  WorkspaceRouteIntentPlan,
  WorkspaceRouteIntentPlanOptions,
} from './workspaceRouteIntent';
export type {
  CreateNodeRemovalTransactionInput,
  CreateNodeRenameTransactionInput,
} from './workspaceNodeReferenceTransaction';
export type {
  DecodedWorkspaceMutation,
  DecodedWorkspaceSnapshot,
  WorkspaceDocumentWireDto,
  WorkspaceMutationWireDto,
  WorkspaceRouteDocumentTypeResolver,
  WorkspaceRouteManifestDecodeInput,
  WorkspaceRouteManifestDecodeOptions,
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
