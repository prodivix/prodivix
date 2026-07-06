import { useEffect, useState } from 'react';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import type { MountedCssEntry } from './mountedCss';
import { createMountedCssPath } from './mountedCss';

const DEFAULT_MOUNTED_CSS_CONTENT = '/* Mounted CSS */\n';

type UseMountedCssEditorStateParams = {
  selectedNode: ComponentNode | null;
  mountedCssEntries: MountedCssEntry[];
  updateSelectedNode: (updater: (node: ComponentNode) => ComponentNode) => void;
  saveMountedCssToVfs?: (value: string) => Promise<boolean>;
};

export const useMountedCssEditorState = ({
  selectedNode,
  mountedCssEntries,
  updateSelectedNode,
  saveMountedCssToVfs,
}: UseMountedCssEditorStateParams) => {
  const [isMountedCssEditorOpen, setMountedCssEditorOpen] = useState(false);
  const [mountedCssEditorEntryId, setMountedCssEditorEntryId] = useState<
    string | null
  >(null);
  const [mountedCssEditorPath, setMountedCssEditorPath] = useState('');
  const [mountedCssEditorValue, setMountedCssEditorValue] = useState(
    DEFAULT_MOUNTED_CSS_CONTENT
  );
  const [mountedCssEditorFocusClass, setMountedCssEditorFocusClass] =
    useState<string>();
  const [mountedCssEditorFocusLine, setMountedCssEditorFocusLine] = useState<
    number | undefined
  >();
  const [mountedCssEditorFocusColumn, setMountedCssEditorFocusColumn] =
    useState<number | undefined>();
  const [mountedCssEditorError, setMountedCssEditorError] = useState('');

  useEffect(() => {
    setMountedCssEditorOpen(false);
    setMountedCssEditorEntryId(null);
    setMountedCssEditorPath('');
    setMountedCssEditorValue(DEFAULT_MOUNTED_CSS_CONTENT);
    setMountedCssEditorFocusClass(undefined);
    setMountedCssEditorFocusLine(undefined);
    setMountedCssEditorFocusColumn(undefined);
    setMountedCssEditorError('');
  }, [selectedNode?.id]);

  const openMountedCssEditor = (target?: {
    path?: string;
    className?: string;
    line?: number;
    column?: number;
  }) => {
    if (!selectedNode?.id) return;
    const matchedEntry = target?.path
      ? mountedCssEntries.find((entry) => entry.path === target.path)
      : mountedCssEntries[0];
    const fallbackPath = createMountedCssPath(selectedNode.id);
    setMountedCssEditorEntryId(matchedEntry?.id ?? null);
    setMountedCssEditorPath(matchedEntry?.path ?? fallbackPath);
    setMountedCssEditorValue(
      matchedEntry?.content ?? DEFAULT_MOUNTED_CSS_CONTENT
    );
    setMountedCssEditorFocusClass(target?.className);
    setMountedCssEditorFocusLine(target?.line);
    setMountedCssEditorFocusColumn(target?.column);
    setMountedCssEditorError('');
    setMountedCssEditorOpen(true);
  };

  const closeMountedCssEditor = () => {
    setMountedCssEditorOpen(false);
    setMountedCssEditorFocusClass(undefined);
    setMountedCssEditorFocusLine(undefined);
    setMountedCssEditorFocusColumn(undefined);
    setMountedCssEditorError('');
  };

  const resetMountedCssEditor = () => {
    setMountedCssEditorOpen(false);
    setMountedCssEditorEntryId(null);
    setMountedCssEditorFocusClass(undefined);
    setMountedCssEditorFocusLine(undefined);
    setMountedCssEditorFocusColumn(undefined);
    setMountedCssEditorError('');
  };

  const saveMountedCss = async () => {
    if (!selectedNode?.id) return;
    try {
      const savedToVfs = await saveMountedCssToVfs?.(
        mountedCssEditorValue || DEFAULT_MOUNTED_CSS_CONTENT
      );
      if (savedToVfs) {
        resetMountedCssEditor();
        return;
      }
    } catch (error) {
      console.warn('[blueprint] mounted CSS VFS save failed', error);
    }
    setMountedCssEditorError(
      'Mounted CSS must be saved as a Workspace VFS code document.'
    );
  };

  return {
    isMountedCssEditorOpen,
    mountedCssEditorPath,
    mountedCssEditorValue,
    mountedCssEditorFocusClass,
    mountedCssEditorFocusLine,
    mountedCssEditorFocusColumn,
    mountedCssEditorError,
    setMountedCssEditorValue,
    openMountedCssEditor,
    closeMountedCssEditor,
    saveMountedCss,
  };
};
