import { useEffect, useState } from 'react';
import type { BlueprintInspectorNodeView } from '../../projection';
import type { MountedCssEntry } from './mountedCss';
import { createMountedCssPath } from './mountedCss';

const DEFAULT_MOUNTED_CSS_CONTENT = '/* Mounted CSS */\n';

type UseMountedCssEditorStateParams = {
  selectedNode: BlueprintInspectorNodeView | null;
  mountedCssEntries: MountedCssEntry[];
  writeAvailable: boolean;
  diagnostic?: string;
};

export const useMountedCssEditorState = ({
  selectedNode,
  mountedCssEntries,
  writeAvailable,
  diagnostic,
}: UseMountedCssEditorStateParams) => {
  const [isMountedCssEditorOpen, setMountedCssEditorOpen] = useState(false);
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

  const saveMountedCss = async () => {
    if (!selectedNode?.id) return;
    if (!writeAvailable) {
      setMountedCssEditorError(
        diagnostic ??
          'Mounted CSS is edited through the shared Code Authoring Environment.'
      );
      return;
    }
    setMountedCssEditorError(
      'No Code Authoring write provider is available for this slot.'
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
    writeAvailable,
    diagnostic,
  };
};
