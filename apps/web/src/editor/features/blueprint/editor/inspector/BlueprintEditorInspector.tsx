import { useState } from 'react';
import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import { IconPickerModal } from '@/editor/features/blueprint/editor/inspector/components/IconPickerModal';
import { MountedCssEditorModal } from '@/editor/features/blueprint/editor/inspector/components/classProtocol/MountedCssEditorModal';
import { InspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import { InspectorTabBar } from '@/editor/features/blueprint/editor/inspector/components/InspectorTabBar';
import { InspectorBasicTab } from '@/editor/features/blueprint/editor/inspector/tabs/InspectorBasicTab';
import { InspectorStyleTab } from '@/editor/features/blueprint/editor/inspector/tabs/InspectorStyleTab';
import { InspectorDataTab } from '@/editor/features/blueprint/editor/inspector/tabs/InspectorDataTab';
import { InspectorCodeTab } from '@/editor/features/blueprint/editor/inspector/tabs/InspectorCodeTab';
import { useBlueprintEditorInspectorController } from '@/editor/features/blueprint/editor/controller';
import type { InspectorTab } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import type { BlueprintCompositionIssue } from '@/editor/features/blueprint/editor/model/composition';
import { OfficialReactSurfaceBoundary } from '@/plugins/platform/officialSurfaceHost';
import {
  headerCollapseButtonClassName,
  rightCollapsedButtonClassName,
} from '../collapseButtonStyles';

type BlueprintEditorInspectorProps = {
  isCollapsed: boolean;
  compositionIssue?: BlueprintCompositionIssue;
  onToggleCollapse: () => void;
};

export function BlueprintEditorInspector({
  isCollapsed,
  compositionIssue,
  onToggleCollapse,
}: BlueprintEditorInspectorProps) {
  const {
    t,
    selectedNode,
    isIconPickerOpen,
    setIconPickerOpen,
    selectedIconRef,
    applyIconRef,
    sectionContextValue,
    mountedCssEditor,
  } = useBlueprintEditorInspectorController();

  const [activeTab, setActiveTab] = useState<InspectorTab>('basic');
  const selectedCompositionIssue =
    compositionIssue?.nodeId === selectedNode?.id
      ? compositionIssue
      : undefined;

  if (isCollapsed) {
    return (
      <aside className="BlueprintEditorInspector Collapsed absolute top-3 right-0 z-7 h-0 w-0 overflow-visible border-0 bg-transparent shadow-none">
        <button
          type="button"
          className={`BlueprintEditorCollapse absolute top-0 right-0 ${rightCollapsedButtonClassName}`}
          onClick={onToggleCollapse}
          aria-label={t('inspector.expand')}
          title={t('inspector.expand')}
        >
          <SlidersHorizontal size={15} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="BlueprintEditorInspector absolute top-0 right-0 bottom-0 z-4 flex min-h-0 w-(--inspector-width) flex-col rounded-[14px] bg-(--bg-canvas) shadow-(--shadow-md) ring-1 ring-(--border-subtle)">
      <OfficialReactSurfaceBoundary>
        <div className="InspectorHeader flex items-center justify-between border-b border-(--border-subtle) px-4 py-2.5 text-[13px] font-medium text-(--text-primary)">
          <span>{t('inspector.title')}</span>
          <button
            type="button"
            className={`BlueprintEditorCollapse ${headerCollapseButtonClassName}`}
            onClick={onToggleCollapse}
            aria-label={t('inspector.collapse')}
            title={t('inspector.collapse')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {selectedNode ? (
          <InspectorContext.Provider value={sectionContextValue}>
            <InspectorTabBar activeTab={activeTab} onTabChange={setActiveTab} />
            {selectedCompositionIssue ? (
              <div
                role="alert"
                className="border-b border-(--border-default) bg-(--bg-raised) px-4 py-2 text-[11px] text-(--text-secondary)"
              >
                <span className="mr-1 font-medium">
                  [{selectedCompositionIssue.code}]
                </span>
                <span>{selectedCompositionIssue.message}</span>
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden">
              {activeTab === 'basic' && <InspectorBasicTab />}
              {activeTab === 'style' && <InspectorStyleTab />}
              {activeTab === 'data' && <InspectorDataTab />}
              {activeTab === 'code' && <InspectorCodeTab />}
            </div>
          </InspectorContext.Provider>
        ) : (
          <div className="InspectorPlaceholder px-4 pt-2 pb-3">
            <p className="m-0 text-xs text-(--text-muted)">
              {t('inspector.placeholder')}
            </p>
            <div className="InspectorSkeleton mt-3 grid gap-2">
              <span className="h-2 rounded-full bg-(--bg-raised)" />
              <span className="h-2 w-[80%] rounded-full bg-(--bg-raised)" />
              <span className="h-2 w-[65%] rounded-full bg-(--bg-raised)" />
              <span className="h-2 w-[90%] rounded-full bg-(--bg-raised)" />
            </div>
          </div>
        )}
        <IconPickerModal
          open={isIconPickerOpen}
          initialIconRef={selectedIconRef}
          onClose={() => setIconPickerOpen(false)}
          onSelect={applyIconRef}
        />
        <MountedCssEditorModal
          isOpen={mountedCssEditor.isMountedCssEditorOpen}
          path={mountedCssEditor.mountedCssEditorPath}
          value={mountedCssEditor.mountedCssEditorValue}
          highlightedClassName={mountedCssEditor.mountedCssEditorFocusClass}
          highlightedLine={mountedCssEditor.mountedCssEditorFocusLine}
          highlightedColumn={mountedCssEditor.mountedCssEditorFocusColumn}
          error={mountedCssEditor.mountedCssEditorError}
          onChange={mountedCssEditor.setMountedCssEditorValue}
          onClose={mountedCssEditor.closeMountedCssEditor}
          onSave={mountedCssEditor.saveMountedCss}
        />
      </OfficialReactSurfaceBoundary>
    </aside>
  );
}
