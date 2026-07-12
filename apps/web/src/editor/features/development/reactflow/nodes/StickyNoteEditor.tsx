import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { createPortal } from 'react-dom';
import {
  estimateStickyNoteSize,
  type GraphNodeData,
} from '@/editor/features/development/reactflow/graphNodeShared';
import { codeMirrorTypographyTheme } from '@/editor/codeMirrorTypography';
import { useEditorShortcut } from '@/editor/shortcuts';
import { renderMarkdownBlocks } from './annotationMarkdown';
import type { NodeI18n } from './nodeI18n';
import { tNode } from './nodeI18n';

type Props = {
  id: string;
  nodeData: GraphNodeData;
  selected: boolean;
  t: NodeI18n;
};

const parseSize = (
  value: string | number | undefined,
  fallback: number,
  min: number,
  max: number
) => {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt(typeof value === 'string' ? value : '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const clampSize = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const STICKY_NOTE_SIZE = {
  minWidth: 24,
  minHeight: 30,
  maxWidth: 1200,
  maxHeight: 1200,
} as const;

const NOTE_COLOR_THEMES: Record<
  string,
  { border: string; bg: string; text: string }
> = {
  minimal: {
    border: '',
    bg: 'bg-transparent',
    text: 'text-(--nodegraph-strong-text)',
  },
  mono: {
    border: 'border-(--nodegraph-node-border)',
    bg: 'bg-transparent',
    text: 'text-(--nodegraph-strong-text)',
  },
  amber: {
    border: 'border-(--nodegraph-warning)',
    bg: 'bg-transparent',
    text: 'text-(--nodegraph-warning)',
  },
  lime: {
    border: 'border-(--nodegraph-success)',
    bg: 'bg-transparent',
    text: 'text-(--nodegraph-success)',
  },
  sky: {
    border: 'border-(--nodegraph-info)',
    bg: 'bg-transparent',
    text: 'text-(--nodegraph-info)',
  },
  rose: {
    border: 'border-(--nodegraph-danger)',
    bg: 'bg-transparent',
    text: 'text-(--nodegraph-danger)',
  },
};

export const StickyNoteEditor = ({ id, nodeData, selected, t }: Props) => {
  const themeKey = nodeData.color || 'minimal';
  const theme = NOTE_COLOR_THEMES[themeKey] || NOTE_COLOR_THEMES.minimal;
  const isMinimalTheme = themeKey === 'minimal';
  const content = nodeData.description ?? nodeData.value ?? '';
  const fallbackSize = useMemo(() => {
    const estimatedSize = estimateStickyNoteSize(content);
    return {
      width: parseSize(
        nodeData.autoNoteWidth,
        estimatedSize.width,
        STICKY_NOTE_SIZE.minWidth,
        STICKY_NOTE_SIZE.maxWidth
      ),
      height: parseSize(
        nodeData.autoNoteHeight,
        estimatedSize.height,
        STICKY_NOTE_SIZE.minHeight,
        STICKY_NOTE_SIZE.maxHeight
      ),
    };
  }, [content, nodeData.autoNoteHeight, nodeData.autoNoteWidth]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftContent, setDraftContent] = useState(content);
  const [displaySize, setDisplaySize] = useState(fallbackSize);
  const measureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isModalOpen) return;
    setDraftContent(content);
  }, [content, isModalOpen]);

  useEffect(() => {
    setDisplaySize(fallbackSize);
  }, [fallbackSize.height, fallbackSize.width]);

  const renderNoteBody = useCallback(
    (keyPrefix: string) =>
      content.trim() ? (
        <div className={isMinimalTheme ? 'space-y-0.5' : 'space-y-1'}>
          {renderMarkdownBlocks(content, keyPrefix)}
        </div>
      ) : (
        <span className="text-[11px] text-(--nodegraph-muted-text)">
          {tNode(t, 'annotation.stickyNote.emptyText', 'Click to edit note')}
        </span>
      ),
    [content, isMinimalTheme, t]
  );

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const frame = window.requestAnimationFrame(() => {
      const measured = measureRef.current?.getBoundingClientRect();
      if (!measured) return;
      const nextWidth = clampSize(
        Math.ceil(measured.width),
        STICKY_NOTE_SIZE.minWidth,
        STICKY_NOTE_SIZE.maxWidth
      );
      const nextHeight = clampSize(
        Math.ceil(measured.height),
        STICKY_NOTE_SIZE.minHeight,
        STICKY_NOTE_SIZE.maxHeight
      );
      setDisplaySize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [content, isMinimalTheme, selected]);

  const openEditor = useCallback(() => {
    setDraftContent(content);
    setIsModalOpen(true);
  }, [content]);

  const closeEditor = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const saveEditor = useCallback(() => {
    const normalized = draftContent.replace(/\r\n/g, '\n');
    if (normalized !== content) {
      nodeData.onChangeField?.(id, 'description', normalized);
    }
    setIsModalOpen(false);
  }, [content, draftContent, id, nodeData]);

  useEditorShortcut('Escape', closeEditor, {
    enabled: isModalOpen,
    scope: 'modal',
    priority: 100,
    allowInEditable: true,
  });
  useEditorShortcut('Mod+Enter', saveEditor, {
    enabled: isModalOpen,
    scope: 'modal',
    priority: 100,
    allowInEditable: true,
  });

  const noteContainerClass = isMinimalTheme
    ? `relative overflow-visible ${theme.text}`
    : `relative overflow-hidden rounded-xl border ${theme.border} ${theme.bg} ${
        selected ? 'ring-1 ring-(--nodegraph-selection-ring)' : ''
      }`;
  const noteMeasureClass = isMinimalTheme
    ? `inline-block overflow-visible ${theme.text}`
    : `inline-block overflow-hidden rounded-xl border ${theme.border} ${theme.bg} ${theme.text}`;
  const noteBodyClass = isMinimalTheme
    ? 'overflow-visible px-2 py-1 text-[12px] leading-5'
    : 'overflow-hidden px-3 py-3 text-[12px] leading-6';

  return (
    <>
      <div
        className={noteContainerClass}
        style={{ width: displaySize.width, height: displaySize.height }}
      >
        <button
          type="button"
          className={`nopan h-full w-full cursor-text border-none bg-transparent text-left ${theme.text} ${noteBodyClass}`}
          onClick={openEditor}
        >
          {renderNoteBody(`note-${id}`)}
        </button>
      </div>
      <div
        className="pointer-events-none fixed -top-[9999px] -left-[9999px] opacity-0"
        aria-hidden
      >
        <div
          ref={measureRef}
          className={noteMeasureClass}
          style={{ maxWidth: `${STICKY_NOTE_SIZE.maxWidth}px` }}
        >
          <div className={noteBodyClass}>
            {renderNoteBody(`note-measure-${id}`)}
          </div>
        </div>
      </div>
      {isModalOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[1200] flex items-center justify-center bg-(--nodegraph-overlay-bg) p-4"
              role="dialog"
              aria-modal="true"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeEditor();
                }
              }}
            >
              <div
                className="w-[min(980px,100%)] rounded-xl border border-(--nodegraph-node-border-strong) bg-(--nodegraph-node-bg) shadow-(--nodegraph-surface-shadow)"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-(--nodegraph-node-border) px-4 py-3">
                  <div className="text-sm font-medium text-(--nodegraph-strong-text)">
                    {tNode(
                      t,
                      'annotation.stickyNote.modalTitle',
                      'Edit markdown note'
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-xs text-(--nodegraph-muted-text) transition hover:bg-(--nodegraph-node-soft-hover) hover:text-(--nodegraph-strong-text)"
                    onClick={closeEditor}
                  >
                    {tNode(t, 'annotation.stickyNote.close', 'Close')}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2">
                  <section className="min-w-0">
                    <div className="mb-1 text-[11px] font-medium tracking-[0.08em] text-(--nodegraph-muted-text) uppercase">
                      {tNode(
                        t,
                        'annotation.stickyNote.editorLabel',
                        'Markdown'
                      )}
                    </div>
                    <CodeMirror
                      data-editor-native-history="true"
                      value={draftContent}
                      onChange={setDraftContent}
                      extensions={[codeMirrorTypographyTheme]}
                      basicSetup={{
                        lineNumbers: true,
                        foldGutter: false,
                        highlightActiveLine: false,
                      }}
                      height="320px"
                      className="nodrag nopan native-code-node__editor"
                    />
                    <div className="mt-1 text-[10px] text-(--nodegraph-muted-text)">
                      {tNode(
                        t,
                        'annotation.stickyNote.shortcutHint',
                        'Tip: Ctrl/Cmd + Enter to save'
                      )}
                    </div>
                  </section>
                  <section className="min-w-0">
                    <div className="mb-1 text-[11px] font-medium tracking-[0.08em] text-(--nodegraph-muted-text) uppercase">
                      {tNode(
                        t,
                        'annotation.stickyNote.previewLabel',
                        'Preview'
                      )}
                    </div>
                    <div className="h-[320px] overflow-auto rounded-lg border border-(--nodegraph-node-border) bg-(--nodegraph-node-soft-bg) px-3 py-3 text-[12px] leading-6 text-(--nodegraph-strong-text)">
                      {draftContent.trim() ? (
                        <div className="space-y-1">
                          {renderMarkdownBlocks(
                            draftContent,
                            `note-modal-${id}`
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-(--nodegraph-muted-text)">
                          {tNode(
                            t,
                            'annotation.stickyNote.placeholder',
                            'Write markdown note...'
                          )}
                        </span>
                      )}
                    </div>
                  </section>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-(--nodegraph-node-border) px-4 py-3">
                  <button
                    type="button"
                    className="rounded-md border border-(--nodegraph-node-border-strong) px-3 py-1.5 text-xs font-medium text-(--nodegraph-text) transition hover:bg-(--nodegraph-node-soft-hover)"
                    onClick={closeEditor}
                  >
                    {tNode(t, 'annotation.stickyNote.cancel', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-(--nodegraph-strong-text) px-3 py-1.5 text-xs font-medium text-(--nodegraph-node-bg) transition hover:bg-(--nodegraph-text)"
                    onClick={saveEditor}
                  >
                    {tNode(t, 'annotation.stickyNote.save', 'Save')}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
};
