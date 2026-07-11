import type { ReactNode } from 'react';
import { OfficialReactSurfaceBoundary } from '@/plugins/platform/officialSurfaceHost';
import { DEFAULT_PREVIEW_SCALE } from './previewScale';

type SidebarPreviewFrameProps = {
  scale?: number;
  className?: string;
  wide?: boolean;
  children: ReactNode;
};

export const SidebarPreviewFrame = ({
  scale = DEFAULT_PREVIEW_SCALE,
  className = '',
  wide = false,
  children,
}: SidebarPreviewFrameProps) => (
  <div
    className={`ComponentPreviewSurface relative flex h-[60px] min-w-20 items-center justify-center overflow-hidden rounded-md border border-(--border-subtle) bg-(--bg-raised) [&_.PdxDrawer]:max-h-full [&_.PdxDrawer]:max-w-full [&_.PdxDrawerOverlay]:absolute [&_.PdxDrawerOverlay]:inset-1 [&_.PdxDrawerOverlay]:z-0 [&_.PdxDrawerOverlay]:rounded-md [&_.PdxModal]:w-[140px] [&_.PdxModal]:max-w-full [&_.PdxModalOverlay]:absolute [&_.PdxModalOverlay]:inset-1 [&_.PdxModalOverlay]:z-0 [&_.PdxModalOverlay]:rounded-md ${wide ? 'Wide w-full' : ''} ${className}`.trim()}
  >
    <OfficialReactSurfaceBoundary>
      <div
        className="ComponentPreviewInner pointer-events-none inline-flex origin-center items-center justify-center"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </OfficialReactSurfaceBoundary>
  </div>
);
