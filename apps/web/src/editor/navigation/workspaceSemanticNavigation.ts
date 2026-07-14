import { isWorkspaceCodeDocumentContent } from '@prodivix/workspace';
import { getResourceManagerCodeSelectionStorageKey } from '@/editor/features/resources/codeResourceModel';
import { getResourceManagerViewStorageKey } from '@/editor/features/resources/projectResourceOverview';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { resolveWorkspaceSemanticNavigationLocation } from './workspaceSemanticNavigationModel';
import { useWorkspaceSemanticNavigationStore } from './workspaceSemanticNavigationStore';
import type {
  NavigateToWorkspaceSemanticTargetInput,
  WorkspaceNavigationSurface,
  WorkspaceResolvedNavigationLocation,
  WorkspaceSemanticNavigationResult,
} from './workspaceSemanticNavigation.types';
import { resolveSourceSpanOffsets } from './workspaceSourceSpan';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const containsNodeGraphTarget = (
  content: unknown,
  target: Extract<
    WorkspaceResolvedNavigationLocation,
    { kind: 'diagnostic-target' }
  >['targetRef'] & { kind: 'nodegraph-node' | 'nodegraph-port' }
): boolean => {
  if (!isRecord(content) || !Array.isArray(content.nodes)) return false;
  return Boolean(
    content.nodes.some(
      (candidate) => isRecord(candidate) && candidate.id === target.nodeId
    )
  );
};

const containsAnimationTarget = (
  content: unknown,
  target: Extract<
    WorkspaceResolvedNavigationLocation,
    { kind: 'diagnostic-target' }
  >['targetRef'] & { kind: 'animation-timeline' | 'animation-track' }
): boolean => {
  if (!isRecord(content)) return false;
  if (!Array.isArray(content.timelines)) {
    return false;
  }
  const timeline = content.timelines.find(
    (candidate) => isRecord(candidate) && candidate.id === target.timelineId
  );
  if (target.kind === 'animation-timeline') return Boolean(timeline);
  if (!isRecord(timeline) || !Array.isArray(timeline.bindings)) return false;
  const binding = timeline.bindings.find(
    (candidate) => isRecord(candidate) && candidate.id === target.bindingId
  );
  return Boolean(
    isRecord(binding) &&
    Array.isArray(binding.tracks) &&
    binding.tracks.some(
      (candidate) => isRecord(candidate) && candidate.id === target.trackId
    )
  );
};

const pathForDocument = (
  projectId: string,
  documentType: string | undefined,
  preferredSurface?: WorkspaceNavigationSurface
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

const unavailable = (
  reason: Extract<
    WorkspaceSemanticNavigationResult,
    { status: 'unavailable' }
  >['reason']
): WorkspaceSemanticNavigationResult => ({ status: 'unavailable', reason });

/**
 * Resolves one canonical semantic location, applies shared editor selection,
 * and publishes only the final surface-focus request consumed after routing.
 */
export const navigateToWorkspaceSemanticTarget = (
  input: NavigateToWorkspaceSemanticTargetInput
): WorkspaceSemanticNavigationResult => {
  const editor = useEditorStore.getState();
  const workspace = editor.workspace;
  const semanticIndex =
    workspace && input.resolveSemanticIndex
      ? input.resolveSemanticIndex(workspace)
      : null;
  const resolution = resolveWorkspaceSemanticNavigationLocation({
    workspace,
    semanticIndex,
    target: input.target,
  });
  if (resolution.status === 'unavailable') return resolution;

  const navigationStore = useWorkspaceSemanticNavigationStore.getState();
  navigationStore.clearNavigation();
  const basePath = `/editor/project/${input.projectId}`;
  const finish = (
    route: string,
    location = resolution.location
  ): WorkspaceSemanticNavigationResult => {
    input.navigate(route);
    return { status: 'navigated', location, route };
  };
  const openDocument = (documentId: string) => {
    const document = workspace?.docsById[documentId];
    if (!document) return unavailable('target-unavailable');
    editor.setActiveDocumentId(documentId);
    return finish(
      pathForDocument(input.projectId, document.type, input.preferredSurface)
    );
  };
  const openCodeArtifact = (artifactId: string) => {
    const document = workspace?.docsById[artifactId];
    if (!document || document.type !== 'code') {
      return unavailable('target-unavailable');
    }
    editor.setActiveDocumentId(artifactId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        getResourceManagerViewStorageKey(input.projectId),
        'code'
      );
      window.localStorage.setItem(
        getResourceManagerCodeSelectionStorageKey(input.projectId),
        artifactId
      );
    }
    return finish(`${basePath}/resources`);
  };

  if (resolution.location.kind === 'source-span') {
    const document =
      workspace?.docsById[resolution.location.sourceSpan.artifactId];
    if (
      !workspace ||
      !document ||
      document.type !== 'code' ||
      !isWorkspaceCodeDocumentContent(document.content) ||
      !resolveSourceSpanOffsets(
        document.content.source,
        resolution.location.sourceSpan
      )
    ) {
      return unavailable('source-unavailable');
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
    navigationStore.requestSurfaceNavigation({
      projectId: input.projectId,
      workspaceId: workspace.id,
      location: resolution.location,
    });
    return finish(`${basePath}/resources`);
  }

  const targetRef = resolution.location.targetRef;
  switch (targetRef.kind) {
    case 'workspace':
    case 'workspace-node':
      return finish(`${basePath}/resources`);
    case 'document':
      return openDocument(targetRef.documentId);
    case 'pir-node':
    case 'inspector-field':
      if (!workspace?.docsById[targetRef.documentId]) {
        return unavailable('target-unavailable');
      }
      editor.setActiveDocumentId(targetRef.documentId);
      editor.setBlueprintState(input.projectId, {
        selectedId: targetRef.nodeId,
      });
      return finish(`${basePath}/blueprint`);
    case 'route':
      editor.setActiveRouteNodeId(targetRef.routeId);
      return finish(`${basePath}/blueprint`);
    case 'nodegraph-node':
    case 'nodegraph-port': {
      const document = workspace?.docsById[targetRef.documentId];
      if (
        !workspace ||
        !document ||
        document.type !== 'pir-graph' ||
        !containsNodeGraphTarget(document.content, targetRef)
      ) {
        return unavailable('target-unavailable');
      }
      editor.setActiveDocumentId(document.id);
      navigationStore.requestSurfaceNavigation({
        projectId: input.projectId,
        workspaceId: workspace.id,
        location: resolution.location,
      });
      return finish(`${basePath}/nodegraph`);
    }
    case 'animation-timeline':
    case 'animation-track': {
      const document = workspace?.docsById[targetRef.documentId];
      if (
        !workspace ||
        !document ||
        document.type !== 'pir-animation' ||
        !containsAnimationTarget(document.content, targetRef)
      ) {
        return unavailable('target-unavailable');
      }
      editor.setActiveDocumentId(document.id);
      navigationStore.requestSurfaceNavigation({
        projectId: input.projectId,
        workspaceId: workspace.id,
        location: resolution.location,
      });
      return finish(`${basePath}/animation`);
    }
    case 'code-artifact':
      return openCodeArtifact(targetRef.artifactId);
    case 'theme-token':
      return finish(`${basePath}/resources`);
    case 'component-slot':
      if (!workspace?.docsById[targetRef.documentId]) {
        return unavailable('target-unavailable');
      }
      editor.setActiveDocumentId(targetRef.documentId);
      editor.setBlueprintState(input.projectId, {
        selectedId: targetRef.nodeId,
      });
      return finish(`${basePath}/blueprint`);
    case 'viewport':
    case 'runtime-dom':
      return finish(`${basePath}/blueprint`);
    case 'operation':
      return finish(`${basePath}/issues`);
  }
};
