import type { ReactNode } from 'react';
import { DEFAULT_PREVIEW_SCALE } from '@/editor/features/blueprint/editor/model/data';

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
    className={`ComponentPreviewSurface relative flex h-[60px] min-w-20 items-center justify-center overflow-hidden rounded-md border border-(--border-subtle) bg-(--bg-raised) [&_.MuiDialog-root]:absolute [&_.MuiDialog-root]:inset-0 [&_.MuiPaper-root]:m-0 [&_.MuiPaper-root]:max-h-full [&_.MuiPaper-root]:max-w-[150px] [&_.PdxDrawer]:max-h-full [&_.PdxDrawer]:max-w-full [&_.PdxDrawerOverlay]:absolute [&_.PdxDrawerOverlay]:inset-1 [&_.PdxDrawerOverlay]:z-0 [&_.PdxDrawerOverlay]:rounded-md [&_.PdxModal]:w-[140px] [&_.PdxModal]:max-w-full [&_.PdxModalOverlay]:absolute [&_.PdxModalOverlay]:inset-1 [&_.PdxModalOverlay]:z-0 [&_.PdxModalOverlay]:rounded-md [&_.ant-modal]:my-1 [&_.ant-modal]:max-w-[150px] [&_.ant-modal-root]:relative [&_.ant-modal-root]:inset-auto [&_.ant-modal-root]:z-[1] [&_.ant-modal-wrap]:relative [&_.ant-modal-wrap]:inset-auto [&_.ant-modal-wrap]:overflow-hidden ${wide ? 'Wide w-full' : ''} ${className}`.trim()}
  >
    <div
      className="ComponentPreviewInner pointer-events-none inline-flex origin-center items-center justify-center"
      style={{ transform: `scale(${scale})` }}
    >
      {children}
    </div>
  </div>
);
