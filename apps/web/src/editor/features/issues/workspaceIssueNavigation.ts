import type { NavigateFunction } from 'react-router';
import type { DiagnosticTargetRef, SourceSpan } from '@prodivix/diagnostics';
import { isWorkspaceCodeDocumentContent } from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { getResourceManagerCodeSelectionStorageKey } from '@/editor/features/resources/codeResourceModel';
import { getResourceManagerViewStorageKey } from '@/editor/features/resources/projectResourceOverview';
import { resolveWorkspaceAnimationTrackLocation } from './workspaceAnimationIssueProvider';
import { resolveSourceSpanOffsets } from './workspaceIssueSourceSpan';
import { useWorkspaceIssuesStore } from './workspaceIssuesStore';

type WorkspaceIssuePreferredSurface =
  'animation' | 'blueprint' | 'nodegraph' | 'resources';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const containsNodeGraphTarget = (
  content: unknown,
  target: Extract<
    DiagnosticTargetRef,
    { kind: 'nodegraph-node' | 'nodegraph-port' }
  >
): boolean => {
  if (!isRecord(content) || !isRecord(content.logic)) return false;
  if (!Array.isArray(content.logic.graphs)) return false;
  const graph = content.logic.graphs.find(
    (candidate) => isRecord(candidate) && candidate.id === target.graphId
  );
  return Boolean(
    isRecord(graph) &&
    Array.isArray(graph.nodes) &&
    graph.nodes.some(
      (candidate) => isRecord(candidate) && candidate.id === target.nodeId
    )
  );
};

const pathForDocument = (
  projectId: string,
  documentType: string | undefined,
  preferredSurface?: WorkspaceIssuePreferredSurface
): string => {
  const basePath = `/editor/project/${projectId}`;
  if (preferredSurface) return `${basePath}/${preferredSurface}`;
  if (
    documentType === 'pir-page' ||
    documentType === 'pir-layout' ||
    documentType === 'pir-component'
  ) {
    return `${basePath}/blueprint`;
  }
  if (documentType === 'pir-graph') return `${basePath}/nodegraph`;
  if (documentType === 'pir-animation') return `${basePath}/animation`;
  return `${basePath}/resources`;
};

export const navigateToWorkspaceIssueTarget = (input: {
  projectId: string;
  targetRef: DiagnosticTargetRef;
  navigate: NavigateFunction;
  preferredSurface?: WorkspaceIssuePreferredSurface;
}): boolean => {
  const { projectId, targetRef, navigate, preferredSurface } = input;
  const editor = useEditorStore.getState();
  const basePath = `/editor/project/${projectId}`;
  const openDocument = (documentId: string) => {
    const document = editor.workspace?.docsById[documentId];
    if (!document) return false;
    editor.setActiveDocumentId(documentId);
    navigate(pathForDocument(projectId, document.type, preferredSurface));
    return true;
  };
  const openCodeArtifact = (artifactId: string) => {
    const document = editor.workspace?.docsById[artifactId];
    if (!document || document.type !== 'code') return false;
    editor.setActiveDocumentId(artifactId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        getResourceManagerViewStorageKey(projectId),
        'code'
      );
      window.localStorage.setItem(
        getResourceManagerCodeSelectionStorageKey(projectId),
        artifactId
      );
    }
    navigate(`${basePath}/resources`);
    return true;
  };

  switch (targetRef.kind) {
    case 'workspace':
    case 'workspace-node':
      navigate(`${basePath}/resources`);
      return true;
    case 'document':
      return openDocument(targetRef.documentId);
    case 'pir-node':
    case 'inspector-field':
      if (!openDocument(targetRef.documentId)) return false;
      editor.setBlueprintState(projectId, { selectedId: targetRef.nodeId });
      navigate(`${basePath}/blueprint`);
      return true;
    case 'route':
      editor.setActiveRouteNodeId(targetRef.routeId);
      navigate(`${basePath}/blueprint`);
      return true;
    case 'nodegraph-node':
    case 'nodegraph-port': {
      const document = editor.workspace?.docsById[targetRef.documentId];
      if (!document || !containsNodeGraphTarget(document.content, targetRef)) {
        return false;
      }
      editor.setActiveDocumentId(document.id);
      useWorkspaceIssuesStore.getState().requestNavigation({
        kind: 'nodegraph-node',
        projectId,
        documentId: targetRef.documentId,
        graphId: targetRef.graphId,
        nodeId: targetRef.nodeId,
        ...(targetRef.kind === 'nodegraph-port'
          ? { portId: targetRef.portId }
          : {}),
      });
      navigate(`${basePath}/nodegraph`);
      return true;
    }
    case 'animation-track': {
      if (!editor.workspace) return false;
      const location = resolveWorkspaceAnimationTrackLocation(
        editor.workspace,
        targetRef
      );
      if (!location) return false;
      editor.setActiveDocumentId(location.documentId);
      useWorkspaceIssuesStore.getState().requestNavigation({
        kind: 'animation-track',
        projectId,
        ...location,
      });
      navigate(`${basePath}/animation`);
      return true;
    }
    case 'code-artifact':
      return openCodeArtifact(targetRef.artifactId);
    case 'theme-token':
      navigate(`${basePath}/resources`);
      return true;
    case 'component-slot': {
      if (!editor.workspace?.docsById[targetRef.documentId]) return false;
      editor.setActiveDocumentId(targetRef.documentId);
      editor.setBlueprintState(projectId, { selectedId: targetRef.nodeId });
      navigate(`${basePath}/blueprint`);
      return true;
    }
    case 'viewport':
    case 'runtime-dom':
      navigate(`${basePath}/blueprint`);
      return true;
    case 'operation':
      navigate(`${basePath}/issues`);
      return true;
  }
};

export const navigateToWorkspaceIssueSource = (input: {
  projectId: string;
  sourceSpan: SourceSpan;
  navigate: NavigateFunction;
}): boolean => {
  const editor = useEditorStore.getState();
  const document = editor.workspace?.docsById[input.sourceSpan.artifactId];
  if (
    !document ||
    document.type !== 'code' ||
    !isWorkspaceCodeDocumentContent(document.content) ||
    !resolveSourceSpanOffsets(document.content.source, input.sourceSpan)
  ) {
    return false;
  }
  editor.setActiveDocumentId(document.id);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      getResourceManagerViewStorageKey(input.projectId),
      'code'
    );
    window.localStorage.setItem(
      getResourceManagerCodeSelectionStorageKey(input.projectId),
      document.id
    );
  }
  useWorkspaceIssuesStore.getState().requestNavigation({
    kind: 'code-source',
    projectId: input.projectId,
    sourceSpan: input.sourceSpan,
  });
  input.navigate(`/editor/project/${input.projectId}/resources`);
  return true;
};
