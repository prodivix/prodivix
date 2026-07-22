import './PdxRichTextEditor.scss';
import type { PdxComponent } from '@prodivix/shared';
import { getVisibleTextMetrics } from '@prodivix/shared/safety';
import {
  Bold,
  Eraser,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Underline,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { sanitizeRichTextEditorHtml } from './sanitizeRichTextEditorHtml';

interface PdxRichTextEditorSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  showToolbar?: boolean;
  onChange?: (value: string) => void;
}

export interface PdxRichTextEditorProps
  extends PdxComponent, PdxRichTextEditorSpecificProps {}

function PdxRichTextEditor({
  label,
  description,
  message,
  value,
  defaultValue,
  placeholder = 'Write something...',
  disabled = false,
  readOnly = false,
  showToolbar = true,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxRichTextEditorProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const [toolbarState, setToolbarState] = useState({
    bold: false,
    italic: false,
    underline: false,
    unorderedList: false,
    orderedList: false,
  });
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const currentValue = value !== undefined ? value : internalValue;

  useEffect(() => {
    const sanitizedValue = sanitizeRichTextEditorHtml(currentValue);
    if (editorRef.current && editorRef.current.innerHTML !== sanitizedValue) {
      editorRef.current.innerHTML = sanitizedValue;
    }
  }, [currentValue]);

  const emitChange = () => {
    const html = sanitizeRichTextEditorHtml(editorRef.current?.innerHTML || '');
    if (editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
    if (value === undefined) {
      setInternalValue(html);
    }
    if (onChange) {
      onChange(html);
    }
  };

  const syncToolbarState = () => {
    if (
      typeof document === 'undefined' ||
      typeof document.queryCommandState !== 'function'
    )
      return;
    setToolbarState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
    });
  };

  const focusEditor = () => {
    if (!editorRef.current || disabled || readOnly) return;
    editorRef.current.focus();
  };

  const runCommand = (command: string, commandValue?: string) => {
    if (
      disabled ||
      readOnly ||
      typeof document === 'undefined' ||
      typeof document.execCommand !== 'function'
    )
      return;
    focusEditor();
    document.execCommand(command, false, commandValue);
    syncToolbarState();
    emitChange();
  };

  const handleLink = () => {
    if (disabled || readOnly) return;
    const url =
      typeof window !== 'undefined' ? window.prompt('Enter URL') : undefined;
    if (url) {
      runCommand('createLink', url);
    }
  };

  const insertSanitizedHtml = (html: string) => {
    if (!editorRef.current || typeof document === 'undefined') return;
    if (typeof document.execCommand === 'function') {
      document.execCommand('insertHTML', false, html);
      return;
    }
    const selection =
      typeof window !== 'undefined' ? window.getSelection() : null;
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !editorRef.current.contains(range.commonAncestorContainer)) {
      editorRef.current.insertAdjacentHTML('beforeend', html);
      return;
    }
    range.deleteContents();
    const fragment = range.createContextualFragment(html);
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  const insertClipboardHtml = (
    event:
      React.ClipboardEvent<HTMLDivElement> | React.DragEvent<HTMLDivElement>
  ) => {
    if (disabled || readOnly || typeof document === 'undefined') return;
    event.preventDefault();
    const transfer =
      'clipboardData' in event ? event.clipboardData : event.dataTransfer;
    const rawHtml = transfer.getData('text/html');
    const rawText = transfer.getData('text/plain');
    const textContainer = document.createElement('div');
    textContainer.append(document.createTextNode(rawText));
    const sanitized = rawHtml
      ? sanitizeRichTextEditorHtml(rawHtml)
      : textContainer.innerHTML;
    insertSanitizedHtml(sanitized);
    emitChange();
  };

  useEffect(() => {
    syncToolbarState();
  }, []);

  const { characterCount, wordCount } = getVisibleTextMetrics(currentValue);

  const fullClassName =
    `PdxRichTextEditor ${disabled ? 'Disabled' : ''} ${readOnly ? 'ReadOnly' : ''} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={`PdxField ${fullClassName}`}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {label && (
        <div className="PdxFieldHeader">
          <label className="PdxFieldLabel">{label}</label>
        </div>
      )}
      {description && <div className="PdxFieldDescription">{description}</div>}
      <div className="PdxRichTextEditorSurface">
        {showToolbar && (
          <div
            aria-label="Formatting controls"
            className="PdxRichTextEditorToolbar"
            role="toolbar"
          >
            <button
              type="button"
              className={toolbarState.bold ? 'Active' : ''}
              onClick={() => runCommand('bold')}
              disabled={disabled || readOnly}
              title="Bold (Ctrl/Cmd+B)"
              aria-label="Bold"
            >
              <Bold size={14} />
            </button>
            <button
              type="button"
              className={toolbarState.italic ? 'Active' : ''}
              onClick={() => runCommand('italic')}
              disabled={disabled || readOnly}
              title="Italic (Ctrl/Cmd+I)"
              aria-label="Italic"
            >
              <Italic size={14} />
            </button>
            <button
              type="button"
              className={toolbarState.underline ? 'Active' : ''}
              onClick={() => runCommand('underline')}
              disabled={disabled || readOnly}
              title="Underline (Ctrl/Cmd+U)"
              aria-label="Underline"
            >
              <Underline size={14} />
            </button>
            <button
              type="button"
              className={toolbarState.unorderedList ? 'Active' : ''}
              onClick={() => runCommand('insertUnorderedList')}
              disabled={disabled || readOnly}
              title="Bulleted list"
              aria-label="Bulleted list"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              className={toolbarState.orderedList ? 'Active' : ''}
              onClick={() => runCommand('insertOrderedList')}
              disabled={disabled || readOnly}
              title="Numbered list"
              aria-label="Numbered list"
            >
              <ListOrdered size={14} />
            </button>
            <button
              type="button"
              onClick={handleLink}
              disabled={disabled || readOnly}
              title="Insert link"
              aria-label="Insert link"
            >
              <LinkIcon size={14} />
            </button>
            <button
              type="button"
              onClick={() => runCommand('removeFormat')}
              disabled={disabled || readOnly}
              title="Clear formatting"
              aria-label="Clear formatting"
            >
              <Eraser size={14} />
            </button>
          </div>
        )}
        <div
          ref={editorRef}
          aria-disabled={disabled || undefined}
          aria-multiline="true"
          aria-readonly={readOnly || undefined}
          className="PdxRichTextEditorContent"
          contentEditable={!disabled && !readOnly}
          data-placeholder={placeholder}
          onInput={emitChange}
          onKeyUp={syncToolbarState}
          onMouseUp={syncToolbarState}
          onPaste={insertClipboardHtml}
          onDrop={insertClipboardHtml}
          role="textbox"
          suppressContentEditableWarning
        />
        <div className="PdxRichTextEditorFooter" aria-live="polite">
          <span>{`${wordCount} words`}</span>
          <span>{`${characterCount} chars`}</span>
        </div>
      </div>
      {message && <div className="PdxFieldMessage">{message}</div>}
    </div>
  );
}

export default PdxRichTextEditor;
