import type { ReactNode } from 'react';
import type { WorkspacePirDocument } from '@prodivix/workspace';

export type BlueprintPirEntrySurfaceMode = 'viewport' | 'intrinsic';

export const resolveBlueprintPirEntrySurfaceMode = (
  documentType: WorkspacePirDocument['type']
): BlueprintPirEntrySurfaceMode =>
  documentType === 'pir-component' ? 'intrinsic' : 'viewport';

/**
 * Establishes the authoring viewport as the containing block for page/layout
 * roots without injecting layout props into canonical PIR.
 */
export function BlueprintPirEntrySurface({
  documentType,
  children,
}: {
  documentType: WorkspacePirDocument['type'];
  children: ReactNode;
}) {
  const mode = resolveBlueprintPirEntrySurfaceMode(documentType);
  if (mode === 'intrinsic') return children;

  return (
    <div
      className="BlueprintPirEntrySurface [container-type:size] grid h-full min-h-0 w-full min-w-0"
      data-prodivix-pir-entry-surface={mode}
    >
      {children}
    </div>
  );
}
