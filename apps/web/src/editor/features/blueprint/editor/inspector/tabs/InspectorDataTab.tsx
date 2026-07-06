import { InspectorDataScopeFields } from '@/editor/features/blueprint/editor/inspector/fields/InspectorDataScopeFields';
import { InspectorListTemplateFields } from '@/editor/features/blueprint/editor/inspector/fields/InspectorListTemplateFields';

export function InspectorDataTab() {
  return (
    <div className="flex min-h-0 flex-1 [scrollbar-width:none] flex-col gap-2 overflow-y-auto px-4 pt-2 pb-3 [-ms-overflow-style:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0">
      <InspectorDataScopeFields />
      <InspectorListTemplateFields />
    </div>
  );
}
