import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import {
  Compartment,
  EditorSelection,
  RangeSetBuilder,
  type Extension,
} from '@codemirror/state';
import {
  EditorView,
  GutterMarker,
  gutter,
  type ViewUpdate,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { css } from '@codemirror/lang-css';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { codeMirrorTypographyTheme } from '@/editor/codeMirrorTypography';

type MountedCssEditorModalProps = {
  isOpen: boolean;
  path: string;
  value: string;
  highlightedClassName?: string;
  highlightedLine?: number;
  highlightedColumn?: number;
  error?: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

const DEFAULT_CSS_CONTENT = `/* Mounted CSS */\n`;
const DEFAULT_INVALID_CSS_MESSAGE = 'Invalid CSS syntax';
const COLOR_TOKEN_MATCHER =
  /(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:transparent|black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|brown|cyan|magenta)\b)/;

const isRenderableColor = (value: string) => {
  const color = value.trim();
  if (!color) return false;
  if (
    /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color) ||
    /^rgba?\([^)]*\)$/.test(color) ||
    /^hsla?\([^)]*\)$/.test(color)
  ) {
    return true;
  }
  return /^(transparent|black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|brown|cyan|magenta)$/.test(
    color.toLowerCase()
  );
};

class ColorSwatchMarker extends GutterMarker {
  constructor(private readonly color: string) {
    super();
  }

  toDOM() {
    const element = document.createElement('span');
    element.className = 'MountedCssColorGutterSwatch';
    element.style.backgroundColor = this.color;
    element.title = this.color;
    return element;
  }
}

const createSyntaxLinterExtension = (message: string): Extension =>
  linter((view): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    syntaxTree(view.state).iterate({
      enter(node) {
        if (!node.type.isError) return;
        diagnostics.push({
          from: node.from,
          to: Math.max(node.to, node.from + 1),
          severity: 'error',
          message,
        });
      },
    });
    return diagnostics;
  });

export function MountedCssEditorModal({
  isOpen,
  path,
  value,
  highlightedClassName,
  highlightedLine,
  highlightedColumn,
  error,
  onChange,
  onClose,
  onSave,
}: MountedCssEditorModalProps) {
  const resolveTheme = () => {
    if (typeof document === 'undefined') return 'light';
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'dark' ? 'dark' : 'light';
  };
  const { t } = useTranslation('blueprint');
  const [editorTheme, setEditorTheme] = useState<'light' | 'dark'>(
    () => resolveTheme() as 'light' | 'dark'
  );
  const [isSaving, setSaving] = useState(false);
  const invalidSyntaxMessage = t(
    'inspector.classProtocol.mountedCss.invalidSyntax',
    {
      defaultValue: DEFAULT_INVALID_CSS_MESSAGE,
    }
  );
  const [lintCompartment] = useState(() => new Compartment());
  const extensions = useMemo(() => {
    const colorGutter = gutter({
      class: 'MountedCssColorGutter',
      markers(view) {
        const builder = new RangeSetBuilder<GutterMarker>();
        for (let lineNo = 1; lineNo <= view.state.doc.lines; lineNo += 1) {
          const line = view.state.doc.line(lineNo);
          const matched = COLOR_TOKEN_MATCHER.exec(line.text);
          if (!matched) continue;
          const token = matched[1];
          if (!isRenderableColor(token)) continue;
          builder.add(line.from, line.from, new ColorSwatchMarker(token));
        }
        return builder.finish();
      },
      lineMarkerChange(update: ViewUpdate) {
        return update.docChanged || update.viewportChanged;
      },
    });
    const lintTheme = EditorView.theme({
      '.cm-lintRange-error': {
        textDecoration: 'underline wavy rgba(220,74,74,0.95)',
        textDecorationThickness: '1px',
      },
      '.cm-diagnostic-error': {
        borderLeftColor: 'rgba(220,74,74,0.95)',
      },
      '.cm-gutters .MountedCssColorGutter': {
        width: '14px',
      },
      '.MountedCssColorGutterSwatch': {
        display: 'inline-flex',
        width: '8px',
        height: '8px',
        marginLeft: '3px',
        borderRadius: '999px',
        border: '1px solid rgba(0,0,0,0.18)',
        boxSizing: 'border-box',
      },
    });
    return [
      css(),
      colorGutter,
      lintCompartment.of(createSyntaxLinterExtension(invalidSyntaxMessage)),
      lintGutter(),
      lintTheme,
      codeMirrorTypographyTheme,
    ];
  }, [invalidSyntaxMessage, lintCompartment]);
  const editorRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const syncTheme = () => {
      const nextTheme = root.getAttribute('data-theme');
      setEditorTheme(nextTheme === 'dark' ? 'dark' : 'light');
    };
    syncTheme();
    const observer = new MutationObserver((mutations) => {
      if (
        mutations.some((mutation) => mutation.attributeName === 'data-theme')
      ) {
        syncTheme();
      }
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.dispatch({
      effects: lintCompartment.reconfigure(
        createSyntaxLinterExtension(invalidSyntaxMessage)
      ),
    });
  }, [invalidSyntaxMessage, lintCompartment]);

  useEffect(() => {
    if (!isOpen) return;
    const editor = editorRef.current;
    if (!editor) return;
    const docLength = editor.state.doc.length;
    let anchor = 0;
    if (highlightedLine && highlightedLine > 0) {
      const targetLine =
        highlightedLine > editor.state.doc.lines
          ? editor.state.doc.lines
          : highlightedLine;
      const line = editor.state.doc.line(targetLine);
      const column = Math.max((highlightedColumn ?? 1) - 1, 0);
      anchor = Math.min(line.from + column, line.to);
    } else if (highlightedClassName) {
      const escapedClassName = highlightedClassName.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );
      const pattern = new RegExp(`\\.${escapedClassName}(?![_a-zA-Z0-9-])`);
      const matched = pattern.exec(editor.state.doc.toString());
      if (matched?.index !== undefined) {
        anchor = matched.index + 1;
      }
    }
    anchor = Math.min(Math.max(anchor, 0), docLength);
    editor.dispatch({
      selection: EditorSelection.cursor(anchor),
      effects: EditorView.scrollIntoView(anchor, { y: 'center' }),
    });
    editor.focus();
  }, [isOpen, highlightedClassName, highlightedLine, highlightedColumn]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (isSaving) return;
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      data-testid="mounted-css-modal"
    >
      <div className="grid h-[min(80vh,720px)] w-[min(880px,96vw)] grid-rows-[auto_1fr_auto] rounded-xl border border-(--border-default) bg-(--bg-canvas) shadow-(--shadow-lg)">
        <header className="flex items-center justify-between border-b border-(--border-default) px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium text-(--text-primary)">
              {t('inspector.classProtocol.mountedCss.title', {
                defaultValue: 'Mounted CSS',
              })}
            </div>
            <div className="truncate text-[11px] text-(--text-muted)">
              {path ||
                t('inspector.classProtocol.mountedCss.untitled', {
                  defaultValue: 'untitled.css',
                })}
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary)"
            onClick={onClose}
            aria-label={t('inspector.classProtocol.mountedCss.close', {
              defaultValue: 'Close mounted CSS editor',
            })}
          >
            <X size={14} />
          </button>
        </header>
        <div className="min-h-0 overflow-hidden px-3 py-2">
          {highlightedClassName ? (
            <div className="mb-2 text-[11px] text-(--text-muted)">
              {t('inspector.classProtocol.mountedCss.focusClass', {
                defaultValue: 'Focus class',
              })}
              : <code>.{highlightedClassName}</code>
            </div>
          ) : null}
          <div className="h-[calc(100%-2px)] overflow-hidden rounded-md border border-(--border-default)">
            <CodeMirror
              data-editor-native-history="true"
              value={value || DEFAULT_CSS_CONTENT}
              height="100%"
              extensions={extensions}
              theme={editorTheme}
              onChange={(next) => onChange(next)}
              onCreateEditor={(view) => {
                editorRef.current = view;
                view.dispatch({
                  effects: lintCompartment.reconfigure(
                    createSyntaxLinterExtension(invalidSyntaxMessage)
                  ),
                });
              }}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
              }}
            />
          </div>
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-(--border-default) px-3 py-2">
          <div className="min-w-0 text-[11px] text-(--danger-color)">
            {error ? (
              <span role="alert" data-testid="mounted-css-error">
                {error}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="h-7 rounded-md border border-(--border-default) px-3 text-xs text-(--text-muted) hover:border-(--border-strong) hover:text-(--text-primary)"
              onClick={onClose}
            >
              {t('inspector.classProtocol.mountedCss.cancel', {
                defaultValue: 'Cancel',
              })}
            </button>
            <button
              type="button"
              className="h-7 rounded-md bg-(--text-primary) px-3 text-xs text-(--text-inverse)"
              onClick={handleSave}
              disabled={isSaving}
              data-testid="mounted-css-save"
            >
              {t('inspector.classProtocol.mountedCss.save', {
                defaultValue: 'Save CSS',
              })}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
