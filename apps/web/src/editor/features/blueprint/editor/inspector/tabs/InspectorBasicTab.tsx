import type { ReactNode } from 'react';
import { InspectorComponentPropsFields } from '@/editor/features/blueprint/editor/inspector/fields/InspectorComponentPropsFields';
import { InspectorNodeCapabilitiesFields } from '@/editor/features/blueprint/editor/inspector/fields/InspectorNodeCapabilitiesFields';
import { InspectorNodeIdentityFields } from '@/editor/features/blueprint/editor/inspector/fields/InspectorNodeIdentityFields';

export function InspectorBasicTab({
  domainPanel,
  showElementFields = true,
}: {
  domainPanel?: ReactNode;
  showElementFields?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 [scrollbar-width:none] flex-col gap-2 overflow-y-auto px-4 pt-2 pb-3 [-ms-overflow-style:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0">
      {showElementFields ? (
        <>
          <InspectorNodeIdentityFields />
          <InspectorNodeCapabilitiesFields />
          <InspectorComponentPropsFields />
        </>
      ) : null}
      {domainPanel}
    </div>
  );
}
