import type { PIRDocument } from '@/core/types/engine.types';

export type WorkspaceId = string;
export type WorkspaceDocumentId = string;
export type WorkspaceVfsNodeId = string;

export type StableWorkspaceDocumentType =
  | 'pir-page'
  | 'pir-layout'
  | 'pir-component'
  | 'pir-graph'
  | 'pir-animation'
  | 'code'
  | 'asset'
  | 'project-config';

export type StableWorkspaceDocument = {
  id: WorkspaceDocumentId;
  type: StableWorkspaceDocumentType;
  name?: string;
  path: string;
  contentRev: number;
  metaRev: number;
  content: PIRDocument | unknown;
  updatedAt?: string;
  capabilities?: string[];
};

export type WorkspaceCodeDocumentLanguage =
  | 'ts'
  | 'js'
  | 'css'
  | 'scss'
  | 'glsl'
  | 'wgsl'
  | 'expr';

export type WorkspaceCodeDocumentContent = {
  language: WorkspaceCodeDocumentLanguage;
  source: string;
  metadata?: Record<string, unknown>;
};

export type StableWorkspaceVfsNode = {
  id: WorkspaceVfsNodeId;
  kind: 'dir' | 'doc';
  name: string;
  parentId: WorkspaceVfsNodeId | null;
  children?: WorkspaceVfsNodeId[];
  docId?: WorkspaceDocumentId;
};

export type StableWorkspaceRouteManifest = {
  version: string;
  root: unknown;
};

export type StableWorkspaceSnapshot = {
  id: WorkspaceId;
  name?: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  treeRootId: WorkspaceVfsNodeId;
  treeById: Record<WorkspaceVfsNodeId, StableWorkspaceVfsNode>;
  docsById: Record<WorkspaceDocumentId, StableWorkspaceDocument>;
  routeManifest: StableWorkspaceRouteManifest;
  activeDocumentId?: WorkspaceDocumentId;
  activeRouteNodeId?: string;
};

export type WorkspaceValidationIssueCode =
  | 'WKS_ROOT_MISSING'
  | 'WKS_ROOT_PARENT_INVALID'
  | 'WKS_NODE_ID_MISMATCH'
  | 'WKS_NODE_PARENT_MISSING'
  | 'WKS_NODE_PARENT_LINK_MISSING'
  | 'WKS_DIR_CHILDREN_MISSING'
  | 'WKS_DIR_CHILD_MISSING'
  | 'WKS_DIR_CHILD_PARENT_MISMATCH'
  | 'WKS_DIR_DUPLICATE_CHILD'
  | 'WKS_DIR_DUPLICATE_NAME'
  | 'WKS_DOC_REF_MISSING'
  | 'WKS_DOC_REF_DUPLICATE'
  | 'WKS_DOC_NODE_CHILDREN_INVALID'
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
