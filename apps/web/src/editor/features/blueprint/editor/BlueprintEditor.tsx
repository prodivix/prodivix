import { useEffect, useMemo } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import type { PIRDataOperationRuntimePort } from '@prodivix/pir-react-renderer';
import {
  useEditorShortcut,
  useWorkspaceHistoryShortcuts,
} from '@/editor/shortcuts';
import {
  selectActiveDocumentId,
  selectWorkspaceId,
  useEditorStore,
} from '@/editor/store/useEditorStore';
import { useAuthStore } from '@/auth/useAuthStore';
import {
  ExecutionCenter,
  executionSessionCoordinator,
  openWorkspaceExecutionSourceTrace,
  type ExecutionServerFunctionSourceNavigationInput,
  type ExecutionServerFunctionSourceNavigationResult,
  useExecutionSession,
} from '@/editor/features/execution';
import { BlueprintAssistantPanel } from './assistant';
import { BlueprintEditorAddressBar } from './addressBar';
import { resolveBlueprintEntryDocumentId } from './authoring/blueprintEntryDocument';
import { ComponentExtractionDialog } from './authoring/ComponentExtractionDialog';
import { BlueprintEditorCanvas } from './canvas';
import { BlueprintEditorComponentTree } from './componentTree';
import { useBlueprintEditorController } from './controller';
import { BlueprintEditorInspector } from './inspector/BlueprintEditorInspector';
import { resolveProjectPreviewUrl, useBlueprintProjectRunner } from './runner';
import { BlueprintEditorSaveIndicator } from './saveIndicator';
import { BlueprintEditorSidebar } from './sidebar';
import { BlueprintEditorViewportBar } from './viewportBar';

export type BlueprintEditorProps = Readonly<{
  entryDocumentId?: string;
  compactHeader?: boolean;
}>;

const BLUEPRINT_AUTHORING_IDLE_DATA_RUNTIME = Object.freeze({
  resolveSnapshot: ({ binding }) =>
    Object.freeze({
      operation: binding.operation,
      sequence: 0,
      status: 'idle' as const,
    }),
} satisfies PIRDataOperationRuntimePort);

const UnavailableAuthoringPanel = ({ label }: { label: string }) => (
  <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-xs text-(--text-muted)">
    {label}
  </div>
);

const UnavailableInspector = ({
  isCollapsed,
  onToggleCollapse,
}: {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) =>
  isCollapsed ? (
    <aside className="BlueprintEditorInspector Collapsed absolute top-3 right-0 z-7 h-0 w-0 overflow-visible border-0 bg-transparent shadow-none">
      <button
        type="button"
        className="absolute top-0 right-0 inline-flex size-8 items-center justify-center rounded-l-xl border border-r-0 border-(--border-default) bg-(--bg-canvas) text-(--text-muted) shadow-(--shadow-sm)"
        onClick={onToggleCollapse}
        aria-label="Expand Inspector"
        title="Expand Inspector"
      >
        <SlidersHorizontal size={15} />
      </button>
    </aside>
  ) : (
    <aside className="BlueprintEditorInspector absolute top-0 right-0 bottom-0 z-4 flex min-h-0 w-(--inspector-width) flex-col rounded-[14px] bg-(--bg-canvas) shadow-(--shadow-md) ring-1 ring-(--border-subtle)">
      <div className="flex items-center justify-between border-b border-(--border-subtle) px-4 py-2.5 text-[13px] font-medium">
        <span>Inspector</span>
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-lg text-(--text-muted) hover:bg-(--bg-raised)"
          onClick={onToggleCollapse}
          aria-label="Collapse Inspector"
          title="Collapse Inspector"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <UnavailableAuthoringPanel label="Load a Workspace to inspect PIR-current nodes." />
    </aside>
  );

export function BlueprintEditor({
  entryDocumentId: requestedDocumentId,
  compactHeader = false,
}: BlueprintEditorProps = {}) {
  const workspace = useEditorStore((state) => state.workspace);
  const accessToken = useAuthStore((state) => state.token);
  const workspaceId = useEditorStore(selectWorkspaceId);
  const activeDocumentId = useEditorStore(selectActiveDocumentId);
  const setActiveDocumentId = useEditorStore(
    (state) => state.setActiveDocumentId
  );
  const entryDocumentId =
    requestedDocumentId ??
    (workspace
      ? resolveBlueprintEntryDocumentId(workspace, activeDocumentId)
      : undefined);
  const controller = useBlueprintEditorController(
    entryDocumentId,
    Boolean(requestedDocumentId)
  );
  const {
    addressBar,
    canvas,
    componentTree,
    dnd,
    inspector,
    saveIndicator,
    sidebar,
    viewportBar,
  } = controller;
  const compositionIssue =
    componentTree.compositionIssue ??
    controller.officialPluginRuntime.activeCompositionIssue;
  const canAuthor = Boolean(
    controller.workspace &&
    controller.entryDocumentId &&
    controller.entry?.status === 'valid'
  );
  const isRunMode = canvas.canvasMode === 'run';
  const projectRunner = useBlueprintProjectRunner(
    controller.workspace,
    canAuthor && isRunMode,
    viewportBar.runProvider,
    accessToken
  );
  const projectExecutionSession = useExecutionSession(projectRunner.sessionId);
  const visibleExecutionSessionId = isRunMode
    ? projectRunner.sessionId
    : (controller.executionSessionId ??
      (projectExecutionSession ? projectRunner.sessionId : undefined));
  const visibleExecutionSession = useExecutionSession(
    visibleExecutionSessionId ?? 'execution:unavailable'
  );
  const showingProjectExecution =
    visibleExecutionSessionId === projectRunner.sessionId;
  const projectPreviewUrl = useMemo(
    () =>
      projectRunner.state.previewUrl
        ? resolveProjectPreviewUrl(
            projectRunner.state.previewUrl,
            addressBar.currentPath
          )
        : undefined,
    [addressBar.currentPath, projectRunner.state.previewUrl]
  );
  const showExecutionCenter = Boolean(
    controller.workspace && (isRunMode || visibleExecutionSession)
  );
  const openExecutionSourceTrace = (
    input: ExecutionServerFunctionSourceNavigationInput
  ): ExecutionServerFunctionSourceNavigationResult => {
    if (!controller.workspace) {
      return { status: 'unavailable', reason: 'source-unavailable' };
    }
    return openWorkspaceExecutionSourceTrace({
      workspace: controller.workspace,
      snapshotId: input.snapshotId,
      sourceTrace: input.sourceTrace,
      originSurface: 'blueprint-canvas',
    });
  };

  useEffect(() => {
    if (
      entryDocumentId &&
      !requestedDocumentId &&
      entryDocumentId !== activeDocumentId
    ) {
      setActiveDocumentId(entryDocumentId);
    }
  }, [
    activeDocumentId,
    entryDocumentId,
    requestedDocumentId,
    setActiveDocumentId,
  ]);

  useWorkspaceHistoryShortcuts({
    workspaceId,
    documentId: entryDocumentId,
    domain: 'pir',
    includeRoute: true,
    suspended: dnd.isDragging,
    shortcutScope: 'blueprint',
  });
  useEditorShortcut('Ctrl+Alt+J', sidebar.onToggleCollapse, {
    scope: 'blueprint',
    priority: 20,
  });
  useEditorShortcut('Ctrl+Alt+K', componentTree.onToggleCollapse, {
    scope: 'blueprint',
    priority: 20,
  });
  useEditorShortcut('Ctrl+Alt+L', inspector.onToggleCollapse, {
    scope: 'blueprint',
    priority: 20,
  });
  useEditorShortcut('Ctrl+Alt+I', viewportBar.onToggleInteractionMode, {
    scope: 'blueprint',
    priority: 20,
  });
  useEditorShortcut('Ctrl+Alt+R', viewportBar.onToggleRunMode, {
    scope: 'blueprint',
    priority: 20,
  });

  return (
    <div
      className={`relative flex flex-col overflow-hidden text-(--text-primary) ${
        compactHeader ? 'h-full min-h-[640px]' : 'h-screen min-h-screen'
      }`}
    >
      <BlueprintEditorAddressBar
        compact={compactHeader}
        currentPath={addressBar.currentPath}
        newPath={addressBar.newPath}
        routes={addressBar.routes}
        matchedRouteNodeId={addressBar.matchedRouteNodeId}
        onCurrentPathChange={addressBar.onCurrentPathChange}
        onNewPathChange={addressBar.onNewPathChange}
        onAddRoute={addressBar.onAddRoute}
        onAddRouteAtPath={addressBar.onAddRouteAtPath}
        onAddChildRoute={addressBar.onAddChildRoute}
        onCreateIndexRoute={addressBar.onCreateIndexRoute}
        onRenameRoute={addressBar.onRenameRoute}
        onMoveRoute={addressBar.onMoveRoute}
        onDeleteRoute={addressBar.onDeleteRoute}
        statusIndicator={
          <BlueprintEditorSaveIndicator
            status={saveIndicator.saveStatus}
            transport={saveIndicator.saveTransport}
            label={saveIndicator.saveIndicatorLabel}
            tone={saveIndicator.saveIndicatorTone}
            isWorkspaceSaveDisabled={saveIndicator.isWorkspaceSaveDisabled}
            hasPendingChanges={saveIndicator.hasPendingChanges}
            isManualSave={saveIndicator.isManualSave}
          />
        }
      />
      <DndContext
        sensors={dnd.sensors}
        onDragStart={dnd.handleDragStart}
        onDragMove={dnd.handleDragMove}
        onDragCancel={dnd.handleDragCancel}
        onDragEnd={dnd.handleDragEnd}
      >
        <div
          className={`BlueprintEditorBody relative flex min-h-0 flex-1 overflow-hidden [--collapsed-panel-width:36px] [--component-tree-height:450px] [--inspector-width:320px] [--sidebar-width:400px] [--tree-width:400px] max-[1100px]:[--component-tree-height:340px] max-[1100px]:[--inspector-width:320px] max-[1100px]:[--sidebar-width:220px] max-[1100px]:[--tree-width:220px] ${sidebar.isCollapsed ? '[--sidebar-width:var(--collapsed-panel-width)]' : ''}`}
        >
          <BlueprintEditorSidebar
            isCollapsed={sidebar.isCollapsed}
            isTreeCollapsed={sidebar.isTreeCollapsed}
            collapsedGroups={sidebar.collapsedGroups}
            expandedPreviews={sidebar.expandedPreviews}
            sizeSelections={sidebar.sizeSelections}
            statusSelections={sidebar.statusSelections}
            officialPluginDiagnostics={
              controller.officialPluginRuntime.officialPluginDiagnostics
            }
            officialLibraryOptions={
              controller.officialPluginRuntime.officialLibraryOptions
            }
            isOfficialPluginLoading={
              controller.officialPluginRuntime.isOfficialPluginLoading
            }
            onReloadOfficialPlugins={
              controller.officialPluginRuntime.reloadOfficialPlugins
            }
            onToggleCollapse={sidebar.onToggleCollapse}
            onToggleGroup={sidebar.onToggleGroup}
            onTogglePreview={sidebar.onTogglePreview}
            onPreviewKeyDown={sidebar.onPreviewKeyDown}
            onAddComponent={sidebar.onAddComponent}
            onSizeSelect={sidebar.onSizeSelect}
            onStatusSelect={sidebar.onStatusSelect}
            onStatusCycleStart={sidebar.onStatusCycleStart}
            onStatusCycleStop={sidebar.onStatusCycleStop}
          />
          {canAuthor && controller.workspace && controller.entryDocumentId ? (
            <BlueprintEditorComponentTree
              workspace={controller.workspace}
              entryDocumentId={controller.entryDocumentId}
              isCollapsed={componentTree.isCollapsed}
              isTreeCollapsed={componentTree.isTreeCollapsed}
              selectedLocation={componentTree.selectedLocation}
              hiddenLocations={componentTree.hiddenLocations}
              dropHint={componentTree.dropHint}
              compositionIssue={compositionIssue}
              pluginDiagnostics={controller.officialPluginRuntime.officialPluginDiagnostics.filter(
                (diagnostic) => typeof diagnostic.meta.nodeId === 'string'
              )}
              onToggleCollapse={componentTree.onToggleCollapse}
              onSelectNode={componentTree.onSelectNode}
              onDeleteSelected={componentTree.onDeleteSelected}
              onDeleteNode={componentTree.onDeleteNode}
              onCopyNode={componentTree.onCopyNode}
              onMoveNode={componentTree.onMoveNode}
              onToggleNodeHidden={componentTree.onToggleNodeHidden}
              onOpenRoutePath={componentTree.onOpenRoutePath}
            />
          ) : (
            <aside className="absolute top-0 bottom-0 left-(--sidebar-width) z-4 flex w-(--tree-width) flex-col rounded-[14px] bg-(--bg-canvas) shadow-(--shadow-md) ring-1 ring-(--border-subtle)">
              <UnavailableAuthoringPanel label="Create or repair a canonical PIR document to populate the Component Tree." />
            </aside>
          )}
          {canAuthor && controller.workspace && controller.entryDocumentId ? (
            <BlueprintEditorCanvas
              workspace={controller.workspace}
              entryDocumentId={controller.entryDocumentId}
              rendererHost={controller.rendererHost}
              dataOperationRuntime={BLUEPRINT_AUTHORING_IDLE_DATA_RUNTIME}
              currentPath={addressBar.currentPath}
              canvasMode={canvas.canvasMode}
              projectRunner={{
                state: projectRunner.state,
                frameRevision: projectRunner.frameRevision,
                onRetry: projectRunner.retry,
              }}
              viewportWidth={canvas.viewportWidth}
              viewportHeight={canvas.viewportHeight}
              zoom={canvas.zoom}
              pan={canvas.pan}
              selectedLocation={canvas.selectedLocation}
              hiddenLocations={canvas.hiddenLocations}
              rootStateById={canvas.rootStateById}
              resolveCollectionPreviewState={
                canvas.resolveCollectionPreviewState
              }
              dispatchTrigger={canvas.dispatchTrigger}
              onPanChange={canvas.onPanChange}
              onZoomChange={canvas.onZoomChange}
              onSelectNode={canvas.onSelectNode}
              onBlockingIssuesChange={canvas.onBlockingIssuesChange}
            />
          ) : (
            <main className="absolute inset-0 flex min-h-0 min-w-0 flex-1 items-center justify-center bg-(--bg-panel) pr-(--inspector-width) pl-[max(var(--sidebar-width),var(--tree-width))]">
              <UnavailableAuthoringPanel label="Blueprint authoring is waiting for a valid canonical PIR document." />
            </main>
          )}
          {controller.workspace ? (
            <BlueprintEditorInspector
              workspace={controller.workspace}
              readonly={controller.readonly}
              selection={inspector.selection}
              isCollapsed={inspector.isCollapsed}
              compositionIssue={compositionIssue}
              collectionPreview={inspector.collectionPreview}
              onToggleCollapse={inspector.onToggleCollapse}
              onSelectLocation={inspector.onSelectLocation}
              onCollectionPreviewChange={inspector.onCollectionPreviewChange}
              onUpdateInstanceBindings={inspector.onUpdateInstanceBindings}
              onUpdateCollection={inspector.onUpdateCollection}
              onBindCollectionDataOperation={
                inspector.onBindCollectionDataOperation
              }
              onOpenDefinition={inspector.onOpenDefinition}
              onFindReferences={inspector.onFindReferences}
              onOpenCodeArtifact={inspector.onOpenCodeArtifact}
              onOpenCodeSlotDefinition={inspector.onOpenCodeSlotDefinition}
              onExtract={inspector.onExtract}
              onStatus={inspector.onStatus}
            />
          ) : (
            <UnavailableInspector
              isCollapsed={inspector.isCollapsed}
              onToggleCollapse={inspector.onToggleCollapse}
            />
          )}
          <BlueprintAssistantPanel
            currentPath={addressBar.currentPath}
            isInspectorCollapsed={inspector.isCollapsed}
            selectedId={canvas.selectedLocation?.nodeId}
          />
          {controller.statusMessage ? (
            <button
              type="button"
              className="absolute bottom-4 left-1/2 z-20 max-w-lg -translate-x-1/2 rounded-lg border border-(--border-default) bg-(--bg-canvas)/95 px-3 py-2 text-left text-xs shadow-(--shadow-md)"
              onClick={controller.dismissStatusMessage}
              title="Dismiss"
            >
              {controller.statusMessage}
            </button>
          ) : null}
        </div>
        <DragOverlay>
          {dnd.activePaletteItemId ? (
            <div className="pointer-events-none inline-flex items-center justify-center rounded-xl border border-(--border-default) bg-(--bg-canvas) px-2.5 py-2 text-xs font-bold tracking-[0.01em] text-(--text-primary) shadow-(--shadow-lg)">
              {dnd.activePaletteItemId}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {showExecutionCenter ? (
        <ExecutionCenter
          sessionId={visibleExecutionSessionId ?? projectRunner.sessionId}
          status={
            showingProjectExecution && isRunMode
              ? projectRunner.state.status
              : undefined
          }
          previewUrl={showingProjectExecution ? projectPreviewUrl : undefined}
          diagnostics={
            showingProjectExecution && isRunMode
              ? projectRunner.state.diagnostics
              : undefined
          }
          terminalClient={
            showingProjectExecution ? projectRunner.terminalClient : undefined
          }
          terminalPermission={
            showingProjectExecution && projectRunner.terminalClient
              ? 'allowed'
              : undefined
          }
          filesystemArtifact={
            showingProjectExecution
              ? projectRunner.state.filesystemChanges
              : undefined
          }
          workspace={controller.workspace}
          workspaceReadonly={controller.readonly}
          onRestart={
            showingProjectExecution
              ? () => {
                  viewportBar.onCanvasModeChange('run');
                  projectRunner.retry();
                }
              : undefined
          }
          onStop={
            showingProjectExecution
              ? () => void projectRunner.stop()
              : visibleExecutionSessionId
                ? () =>
                    void executionSessionCoordinator.cancel(
                      visibleExecutionSessionId,
                      { reason: 'Execution stopped by the user.' }
                    )
                : undefined
          }
          onReloadPreview={
            showingProjectExecution ? projectRunner.reloadPreview : undefined
          }
          onOpenPreview={
            showingProjectExecution
              ? () => {
                  if (!projectPreviewUrl) return;
                  window.open(
                    projectPreviewUrl,
                    '_blank',
                    'noopener,noreferrer'
                  );
                }
              : undefined
          }
          onOpenSourceTrace={openExecutionSourceTrace}
        />
      ) : null}
      <BlueprintEditorViewportBar
        canvasMode={viewportBar.canvasMode}
        onCanvasModeChange={viewportBar.onCanvasModeChange}
        runProvider={viewportBar.runProvider}
        remoteAvailable={Boolean(accessToken)}
        onRunProviderChange={viewportBar.onRunProviderChange}
        viewportWidth={viewportBar.viewportWidth}
        viewportHeight={viewportBar.viewportHeight}
        onViewportWidthChange={viewportBar.onViewportWidthChange}
        onViewportHeightChange={viewportBar.onViewportHeightChange}
        zoom={viewportBar.zoom}
        zoomStep={viewportBar.zoomStep}
        onZoomChange={viewportBar.onZoomChange}
        onResetView={viewportBar.onResetView}
      />
      <ComponentExtractionDialog
        open={controller.extraction.open}
        selection={controller.extraction.selection}
        onClose={controller.extraction.onClose}
        onApplied={({ sourceDocumentId, instanceNodeId }) =>
          controller.extraction.onApplied(sourceDocumentId, instanceNodeId)
        }
      />
    </div>
  );
}

export default BlueprintEditor;
