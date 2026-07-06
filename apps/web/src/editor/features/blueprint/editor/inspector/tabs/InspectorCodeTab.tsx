import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import { InspectorPanelFrame } from '@/editor/features/blueprint/editor/inspector/components/InspectorPanelFrame';
import { resolveInspectorPanels } from '@/editor/features/blueprint/editor/inspector/panels/registry';

export function InspectorCodeTab() {
  const { t, selectedNode, expandedPanels, togglePanel, updateSelectedNode } =
    useInspectorContext();
  const panels = selectedNode
    ? resolveInspectorPanels(selectedNode, 'code')
    : [];

  return (
    <div className="flex min-h-0 flex-1 [scrollbar-width:none] flex-col gap-2 overflow-y-auto px-4 pt-2 pb-3 [-ms-overflow-style:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0">
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
