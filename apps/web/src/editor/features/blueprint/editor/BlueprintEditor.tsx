import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useEditorShortcut } from '@/editor/shortcuts';
import { BlueprintAssistantPanel } from './assistant';
import { BlueprintEditorAddressBar } from './addressBar';
import { BlueprintEditorCanvas } from './canvas';
import { BlueprintEditorComponentTree } from './componentTree';
import { BlueprintEditorInspector } from './inspector/BlueprintEditorInspector';
import { BlueprintEditorSaveIndicator } from './saveIndicator';
import { BlueprintEditorSidebar } from './sidebar';
import { BlueprintEditorViewportBar } from './viewportBar';
import { useBlueprintEditorController } from './controller';
import { useExternalLibraryRuntime } from './runtime';

function BlueprintEditor() {
  const {
    externalDiagnostics,
    externalLibraryStates,
    externalLibraryOptions,
    isExternalLibraryLoading,
    reloadExternalLibraries,
    retryExternalLibrary,
  } = useExternalLibraryRuntime();
  const {
    addressBar,
    canvas,
    componentTree,
    dnd,
    inspector,
    saveIndicator,
    sidebar,
    viewportBar,
  } = useBlueprintEditorController();

  useEditorShortcut(
    'Ctrl+Alt+J',
    () => {
      sidebar.onToggleCollapse();
    },
    { scope: 'blueprint', priority: 20 }
  );

  useEditorShortcut(
    'Ctrl+Alt+K',
    () => {
      componentTree.onToggleCollapse();
    },
    { scope: 'blueprint', priority: 20 }
  );
  useEditorShortcut(
    'Ctrl+Alt+L',
    () => {
      inspector.onToggleCollapse();
    },
    { scope: 'blueprint', priority: 20 }
  );
  useEditorShortcut(
    'Ctrl+Alt+I',
    () => {
      viewportBar.onToggleInteractionMode();
    },
    { scope: 'blueprint', priority: 20 }
  );

  return (
    <div className="relative flex h-full min-h-screen flex-col text-(--text-primary)">
      <BlueprintEditorAddressBar
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
            onSaveNow={saveIndicator.onSaveNow}
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
            externalDiagnostics={externalDiagnostics}
            externalLibraryStates={externalLibraryStates}
            externalLibraryOptions={externalLibraryOptions}
            isExternalLibraryLoading={isExternalLibraryLoading}
            onReloadExternalLibraries={reloadExternalLibraries}
            onRetryExternalLibrary={retryExternalLibrary}
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
          <BlueprintEditorComponentTree
            isCollapsed={componentTree.isCollapsed}
            isTreeCollapsed={componentTree.isTreeCollapsed}
            selectedId={componentTree.selectedId}
            hiddenNodeIds={componentTree.hiddenNodeIds}
            dropHint={componentTree.dropHint}
            onToggleCollapse={componentTree.onToggleCollapse}
            onSelectNode={componentTree.onSelectNode}
            onDeleteSelected={componentTree.onDeleteSelected}
            onDeleteNode={componentTree.onDeleteNode}
            onCopyNode={componentTree.onCopyNode}
            onMoveNode={componentTree.onMoveNode}
            onToggleNodeHidden={componentTree.onToggleNodeHidden}
            onOpenRoutePath={componentTree.onOpenRoutePath}
          />
          <BlueprintEditorCanvas
            currentPath={addressBar.currentPath}
            interactionMode={canvas.interactionMode}
            viewportWidth={canvas.viewportWidth}
            viewportHeight={canvas.viewportHeight}
            zoom={canvas.zoom}
            pan={canvas.pan}
            selectedId={canvas.selectedId}
            hiddenNodeIds={canvas.hiddenNodeIds}
            runtimeState={canvas.runtimeState}
            onPanChange={canvas.onPanChange}
            onZoomChange={canvas.onZoomChange}
            onSelectNode={canvas.onSelectNode}
            onNavigateRequest={canvas.onNavigateRequest}
            onExecuteGraphRequest={canvas.onExecuteGraphRequest}
          />
          <BlueprintEditorInspector
            isCollapsed={inspector.isCollapsed}
            onToggleCollapse={inspector.onToggleCollapse}
          />
          <BlueprintAssistantPanel
            currentPath={addressBar.currentPath}
            isInspectorCollapsed={inspector.isCollapsed}
            selectedId={canvas.selectedId}
          />
        </div>
        <DragOverlay>
          {dnd.activePaletteItemId ? (
            <div className="pointer-events-none">
              <div className="inline-flex items-center justify-center rounded-xl border border-(--border-default) bg-(--bg-canvas) px-2.5 py-2 text-xs font-bold tracking-[0.01em] text-(--text-primary) shadow-(--shadow-lg)">
                {dnd.activePaletteItemId}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <BlueprintEditorViewportBar
        interactionMode={viewportBar.interactionMode}
        onInteractionModeChange={viewportBar.onInteractionModeChange}
        viewportWidth={viewportBar.viewportWidth}
        viewportHeight={viewportBar.viewportHeight}
        onViewportWidthChange={viewportBar.onViewportWidthChange}
        onViewportHeightChange={viewportBar.onViewportHeightChange}
        zoom={viewportBar.zoom}
        zoomStep={viewportBar.zoomStep}
        onZoomChange={viewportBar.onZoomChange}
        onResetView={viewportBar.onResetView}
      />
    </div>
  );
}

export default BlueprintEditor;
