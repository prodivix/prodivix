import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import { InspectorPanelFrame } from '@/editor/features/blueprint/editor/inspector/components/InspectorPanelFrame';
import { resolveInspectorPanels } from '@/editor/features/blueprint/editor/inspector/panels/registry';
import { ServerRuntimeRoutePanel } from '@/editor/features/blueprint/editor/inspector/domain/ServerRuntimeRoutePanel';

export function InspectorCodeTab() {
  const {
    t,
    selectedNode,
    expandedPanels,
    togglePanel,
    updateSelectedNode,
    controlledJsxArtifactId,
    controlledCssArtifactId,
    controlledCodeCanCreate,
    createControlledCode,
    openControlledJsx,
    openControlledCss,
  } = useInspectorContext();
  const panels = selectedNode
    ? resolveInspectorPanels(selectedNode, 'code')
    : [];

  return (
    <div className="flex min-h-0 flex-1 [scrollbar-width:none] flex-col gap-2 overflow-y-auto px-4 pt-2 pb-3 [-ms-overflow-style:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0">
      <ServerRuntimeRoutePanel />
      <div className="rounded-md border border-(--border-default) px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-(--text-primary)">
              {t('inspector.controlledCode.title', {
                defaultValue: 'Visual / Code',
              })}
            </div>
            <div className="mt-0.5 text-[10px] leading-4 text-(--text-muted)">
              {controlledJsxArtifactId && controlledCssArtifactId
                ? t('inspector.controlledCode.connected', {
                    defaultValue:
                      'PIR-current, JSX, and CSS update as one atomic change.',
                  })
                : t('inspector.controlledCode.description', {
                    defaultValue:
                      'Create canonical JSX for structure, props, and text, plus standalone CSS for styles.',
                  })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {controlledJsxArtifactId ? (
              <button
                type="button"
                className="rounded-md border border-(--border-default) px-2 py-1 text-[10px] text-(--text-secondary) hover:text-(--text-primary)"
                onClick={openControlledJsx}
              >
                {t('inspector.controlledCode.openJsx', {
                  defaultValue: 'Edit JSX',
                })}
              </button>
            ) : null}
            {controlledCssArtifactId ? (
              <button
                type="button"
                className="rounded-md border border-(--border-default) px-2 py-1 text-[10px] text-(--text-secondary) hover:text-(--text-primary)"
                onClick={openControlledCss}
              >
                {t('inspector.controlledCode.openCss', {
                  defaultValue: 'Edit CSS',
                })}
              </button>
            ) : null}
            {!controlledJsxArtifactId && !controlledCssArtifactId ? (
              <button
                type="button"
                className="rounded-md border border-(--border-default) px-2 py-1 text-[10px] text-(--text-secondary) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!controlledCodeCanCreate}
                onClick={createControlledCode}
              >
                {t('inspector.controlledCode.create', {
                  defaultValue: 'Create Code',
                })}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {panels.map((panel) => {
        const isExpanded = expandedPanels[panel.key] ?? true;
        const panelTitle = t(`inspector.panels.${panel.key}.title`, {
          defaultValue: panel.title,
        });
        return (
          <InspectorPanelFrame
            key={panel.key}
            panelKey={panel.key}
            title={panelTitle}
            isExpanded={isExpanded}
            onToggle={() => togglePanel(panel.key)}
            actions={panel.headerActions}
          >
            {isExpanded
              ? panel.render({
                  node: selectedNode!,
                  updateNode: updateSelectedNode,
                })
              : null}
          </InspectorPanelFrame>
        );
      })}
    </div>
  );
}
