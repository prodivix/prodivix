import type { CodeArtifactLanguage } from '@prodivix/authoring';
import type { WorkspaceRouteManifest } from '@prodivix/router';

export type WorkspaceId = string;
export type WorkspaceDocumentId = string;
export type WorkspaceVfsNodeId = string;

export type WorkspaceDocumentType =
  | 'pir-page'
  | 'pir-layout'
  | 'pir-component'
  | 'pir-graph'
  | 'pir-animation'
  | 'design-tokens'
  | 'design-token-resolver'
  | 'code'
  | 'asset'
  | 'project-config';

export type WorkspaceDocument = {
  id: WorkspaceDocumentId;
  type: WorkspaceDocumentType;
  name?: string;
  path: string;
  contentRev: number;
  metaRev: number;
  content: unknown;
  updatedAt?: string;
  capabilities?: string[];
};

export type WorkspaceCodeDocumentLanguage = CodeArtifactLanguage;

export type WorkspaceCodeDocumentContent = {
  language: WorkspaceCodeDocumentLanguage;
  source: string;
  metadata?: Record<string, unknown>;
};

export type WorkspaceVfsNode = {
  id: WorkspaceVfsNodeId;
  kind: 'dir' | 'doc';
  name: string;
  parentId: WorkspaceVfsNodeId | null;
  children?: WorkspaceVfsNodeId[];
  docId?: WorkspaceDocumentId;
};

export type WorkspaceSnapshot = {
  id: WorkspaceId;
  name?: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  treeRootId: WorkspaceVfsNodeId;
  treeById: Record<WorkspaceVfsNodeId, WorkspaceVfsNode>;
  docsById: Record<WorkspaceDocumentId, WorkspaceDocument>;
  routeManifest: WorkspaceRouteManifest;
  activeDocumentId?: WorkspaceDocumentId;
  activeRouteNodeId?: string;
};

export type WorkspaceValidationIssueCode =
  | 'WKS_SNAPSHOT_REVISION_INVALID'
  | 'WKS_DOCUMENTS_EMPTY'
  | 'WKS_ROOT_ID_INVALID'
  | 'WKS_ROOT_MISSING'
  | 'WKS_ROOT_PARENT_INVALID'
  | 'WKS_ROOT_KIND_INVALID'
  | 'WKS_NODE_ID_INVALID'
  | 'WKS_NODE_ID_MISMATCH'
  | 'WKS_NODE_FIELD_INVALID'
  | 'WKS_NODE_KIND_INVALID'
  | 'WKS_NODE_NAME_INVALID'
  | 'WKS_NODE_PARENT_ID_INVALID'
  | 'WKS_NODE_PARENT_MISSING'
  | 'WKS_NODE_PARENT_LINK_MISSING'
  | 'WKS_DIR_CHILDREN_MISSING'
  | 'WKS_DIR_CHILD_ID_INVALID'
  | 'WKS_DIR_CHILD_MISSING'
  | 'WKS_DIR_CHILD_PARENT_MISMATCH'
  | 'WKS_DIR_DUPLICATE_CHILD'
  | 'WKS_DIR_DUPLICATE_NAME'
  | 'WKS_DOC_REF_MISSING'
  | 'WKS_DOC_REF_ID_INVALID'
  | 'WKS_DOC_REF_DUPLICATE'
  | 'WKS_DOC_NODE_CHILDREN_INVALID'
  | 'WKS_DOCUMENT_ID_MISMATCH'
  | 'WKS_DOCUMENT_FIELD_INVALID'
  | 'WKS_DOCUMENT_TYPE_INVALID'
  | 'WKS_DOCUMENT_NAME_INVALID'
  | 'WKS_DOCUMENT_UPDATED_AT_INVALID'
  | 'WKS_DOCUMENT_CONTENT_INVALID'
  | 'WKS_DOCUMENT_REVISION_INVALID'
  | 'WKS_DOCUMENT_CAPABILITIES_INVALID'
  | 'WKS_DOCUMENT_PATH_INVALID'
  | 'WKS_DOCUMENT_ORPHANED'
  | 'WKS_DOCUMENT_PATH_MISMATCH'
  | 'WKS_TREE_CYCLE'
  | 'WKS_TREE_ORPHANED_NODE'
  | 'WKS_ACTIVE_DOCUMENT_MISSING';

export type WorkspaceValidationIssue = {
  code: WorkspaceValidationIssueCode;
  path: string;
  message: string;
  nodeId?: WorkspaceVfsNodeId;
  documentId?: WorkspaceDocumentId;
};

export type WorkspaceValidationResult = {
  valid: boolean;
  issues: WorkspaceValidationIssue[];
};
