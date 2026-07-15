import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import type {
  PIRCollectionNode,
  PIRCollectionPreviewInput,
  PIRCollectionRegions,
} from '@prodivix/pir';
import type { PIRRenderLocation } from '@prodivix/pir-react-renderer';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { IconPickerModal } from './components/IconPickerModal';
import { InspectorContext } from './InspectorContext';
import { InspectorTabBar } from './components/InspectorTabBar';
import { InspectorBasicTab } from './tabs/InspectorBasicTab';
import { InspectorStyleTab } from './tabs/InspectorStyleTab';
import { InspectorDataTab } from './tabs/InspectorDataTab';
import { InspectorCodeTab } from './tabs/InspectorCodeTab';
import {
  CollectionInspectorPanel,
  type CollectionInspectorRegionNavigation,
} from './CollectionInspectorPanel';
import { ComponentInstanceInspectorPanel } from './domain/ComponentInstanceInspectorPanel';
import {
  createCollectionInspectorModel,
  type CollectionInspectorModel,
  type CollectionInspectorSymbolRole,
} from './domain/collectionInspectorModel';
import {
  createComponentInstanceInspectorModel,
  type ComponentInstanceBindingsUpdate,
} from './domain/componentInstanceInspectorModel';
import { useBlueprintEditorInspectorController } from '../controller/useBlueprintEditorInspectorController';
import type { InspectorTab } from './InspectorContext.types';
import type { BlueprintCompositionIssue } from '../model/composition';
import { OfficialReactSurfaceBoundary } from '@/plugins/platform/officialSurfaceHost';
import {
  headerCollapseButtonClassName,
  rightCollapsedButtonClassName,
} from '../collapseButtonStyles';

export type BlueprintEditorInspectorProps = {
  workspace: WorkspaceSnapshot;
  readonly: boolean;
  selection?: PIRRenderLocation;
  isCollapsed: boolean;
  compositionIssue?: BlueprintCompositionIssue;
  collectionPreview?: PIRCollectionPreviewInput;
  onToggleCollapse: () => void;
  onSelectLocation: (location: PIRRenderLocation) => void;
  onCollectionPreviewChange: (preview: PIRCollectionPreviewInput) => void;
  onUpdateInstanceBindings: (
    update: ComponentInstanceBindingsUpdate
  ) => void | Promise<void>;
  onUpdateCollection: (update: {
    documentId: string;
    collection: PIRCollectionNode;
    regions: PIRCollectionRegions;
  }) => void | Promise<void>;
  onOpenDefinition: (documentId: string) => void;
  onFindReferences: (documentId: string) => void;
  onOpenCodeArtifact: (artifactId: string) => void;
  onOpenCodeSlotDefinition: (slotId: string) => void;
  onExtract?: () => void;
  onStatus?: (message: string) => void;
};

const AUTO_COLLECTION_PREVIEW: PIRCollectionPreviewInput = Object.freeze({
  state: 'auto',
});

const collectionRegionsFromModel = (
  model: CollectionInspectorModel
): PIRCollectionRegions => {
  const storedRegions =
    model.document.ui.graph.regionsById?.[model.collection.id] ?? {};
  return {
    item: storedRegions.item ?? [],
    ...(Object.hasOwn(storedRegions, 'empty')
      ? { empty: storedRegions.empty ?? [] }
      : {}),
    ...(Object.hasOwn(storedRegions, 'loading')
      ? { loading: storedRegions.loading ?? [] }
      : {}),
    ...(Object.hasOwn(storedRegions, 'error')
      ? { error: storedRegions.error ?? [] }
      : {}),
  };
};

/** Hosts the complete four-tab Inspector over the PIR-current projection. */
export function BlueprintEditorInspector({
  workspace,
  readonly,
  selection,
  isCollapsed,
  compositionIssue,
  collectionPreview = AUTO_COLLECTION_PREVIEW,
  onToggleCollapse,
  onSelectLocation,
  onCollectionPreviewChange,
  onUpdateInstanceBindings,
  onUpdateCollection,
  onOpenDefinition,
  onFindReferences,
  onOpenCodeArtifact,
  onOpenCodeSlotDefinition,
  onStatus,
}: BlueprintEditorInspectorProps) {
  const {
    t,
    selectedNode,
    isIconPickerOpen,
    setIconPickerOpen,
    selectedIconRef,
    applyIconRef,
    sectionContextValue,
  } = useBlueprintEditorInspectorController({
    workspace,
    selection,
    onStatus,
  });
  const componentInstanceModel = useMemo(
    () => createComponentInstanceInspectorModel(workspace, selection),
    [selection, workspace]
  );
  const collectionProjection = useMemo(
    () =>
      selection
        ? createCollectionInspectorModel({ workspace, location: selection })
        : undefined,
    [selection, workspace]
  );
  const collectionModel =
    collectionProjection?.status === 'ready'
      ? collectionProjection.model
      : undefined;
  const componentDomainSelected = componentInstanceModel.status !== 'hidden';
  const domainSelectionKind = componentDomainSelected
    ? 'component-instance'
    : collectionModel
      ? 'collection'
      : 'element';
  const [activeTab, setActiveTab] = useState<InspectorTab>('basic');
  useEffect(() => {
    if (domainSelectionKind === 'component-instance') setActiveTab('basic');
    if (domainSelectionKind === 'collection') setActiveTab('data');
  }, [
    domainSelectionKind,
    selection?.documentId,
    selection?.instancePath,
    selection?.nodeId,
  ]);
  const hasInspectorSelection = Boolean(
    selectedNode || componentDomainSelected || collectionModel
  );
  const selectedCompositionIssue =
    compositionIssue?.nodeId === selectedNode?.id
      ? compositionIssue
      : undefined;

  const updateCollectionNode = (collection: PIRCollectionNode) => {
    if (!collectionModel) return;
    return onUpdateCollection({
      documentId: collectionModel.location.documentId,
      collection,
      regions: collectionRegionsFromModel(collectionModel),
    });
  };

  const handleCollectionSymbolNameChange = (
    role: Extract<CollectionInspectorSymbolRole, 'item' | 'index'>,
    name: string
  ) => {
    if (!collectionModel) return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      onStatus?.('Collection symbol names cannot be empty.');
      return;
    }
    void updateCollectionNode({
      ...collectionModel.collection,
      symbols: {
        ...collectionModel.collection.symbols,
        ...(role === 'item'
          ? { itemName: normalizedName }
          : { indexName: normalizedName }),
      },
    });
  };

  const handleCollectionRegionNavigate = (
    navigation: CollectionInspectorRegionNavigation
  ) => {
    if (!collectionModel) return;
    onCollectionPreviewChange({ state: navigation.regionName });
    const nodeId = navigation.nodeIds[0];
    if (!nodeId) {
      onStatus?.(`Collection ${navigation.regionName} region is empty.`);
      return;
    }
    onSelectLocation({
      ...collectionModel.location,
      documentId: navigation.documentId,
      nodeId,
    });
  };

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
        {hasInspectorSelection ? (
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
            {sectionContextValue.bindingDiagnostics.length > 0 ? (
              <div className="border-b border-(--border-default) bg-(--bg-raised) px-4 py-2 text-[10px] text-(--text-muted)">
                {sectionContextValue.bindingDiagnostics.join(' ')}
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden">
              {activeTab === 'basic' && (
                <InspectorBasicTab
                  showElementFields={Boolean(selectedNode)}
                  domainPanel={
                    <ComponentInstanceInspectorPanel
                      model={componentInstanceModel}
                      disabled={readonly}
                      onUpdateBindings={onUpdateInstanceBindings}
                      onOpenDefinition={onOpenDefinition}
                      onFindReferences={onFindReferences}
                      onOpenCodeArtifact={onOpenCodeArtifact}
                      onOpenCodeSlotDefinition={onOpenCodeSlotDefinition}
                    />
                  }
                />
              )}
              {activeTab === 'style' && <InspectorStyleTab />}
              {activeTab === 'data' && (
                <InspectorDataTab
                  showElementFields={Boolean(selectedNode)}
                  domainPanel={
                    collectionModel ? (
                      <CollectionInspectorPanel
                        model={collectionModel}
                        preview={collectionPreview}
                        disabled={readonly}
                        onSourceChange={(source) =>
                          void updateCollectionNode({
                            ...collectionModel.collection,
                            source,
                          })
                        }
                        onKeyChange={(key) =>
                          void updateCollectionNode({
                            ...collectionModel.collection,
                            key,
                          })
                        }
                        onSymbolNameChange={handleCollectionSymbolNameChange}
                        onPreviewChange={onCollectionPreviewChange}
                        onRegionNavigate={handleCollectionRegionNavigate}
                      />
                    ) : undefined
                  }
                />
              )}
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
      </OfficialReactSurfaceBoundary>
    </aside>
  );
}
