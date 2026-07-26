import { getDataAttributes, mergeClassNames } from '../foundation/component';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * Why an overlay dialog closed. Dismissing is not one event: a confirmation
 * flow usually treats Escape and a scrim press as "cancel" while the close
 * button is an explicit decision, and an editor may want to keep unsaved work
 * on a dismissal it did not ask for.
 *
 * `Programmatic` is the fallback for a dismissal no user gesture explains.
 */
export type PdxOverlayCloseReason =
  'CloseButton' | 'Escape' | 'OutsideInteraction' | 'Programmatic';

export interface OverlayDialogProps {
  /** Class-name block the surface owns, e.g. `PdxModal`. */
  block: string;
  children?: ReactNode;
  className?: string;
  closeLabel: string;
  closeOnEscape: boolean;
  closeOnOverlayClick: boolean;
  contentStyle?: CSSProperties;
  dataAttributes?: Record<string, string>;
  description?: ReactNode;
  footer?: ReactNode;
  id?: string;
  /** Surface-specific class-name modifier, e.g. a size or a placement. */
  modifier?: string;
  onClose?: (reason: PdxOverlayCloseReason) => void;
  onOpenChange?: (open: boolean) => void;
  open: boolean;
  portal: boolean;
  showClose: boolean;
  title: ReactNode;
}

/**
 * Modal and drawer are the same overlay contract with different geometry: a
 * Radix dialog that moves focus into itself on open, traps it while open,
 * returns it to the invoking element on close, and reports why it closed.
 *
 * Radix owns the focus scope, the dismissable layer and the escape key. Two
 * things it cannot own here are decided in this component:
 *
 * 1. Radix restores focus to its own `Dialog.Trigger`. These surfaces are
 *    opened by a controlled `open` prop and render no trigger, so Radix has
 *    nothing to restore to and focus falls to `<body>`. The element that was
 *    focused when the panel mounted is captured and restored instead.
 * 2. The reason for a dismissal. It is recorded on the Radix event that caused
 *    it and read back in `onOpenChange`, which Radix always fires afterwards,
 *    so a close that no event explains is reported as `Programmatic`.
 */
function OverlayDialog({
  block,
  children,
  className,
  closeLabel,
  closeOnEscape,
  closeOnOverlayClick,
  contentStyle,
  dataAttributes,
  description,
  footer,
  id,
  modifier,
  onClose,
  onOpenChange,
  open,
  portal,
  showClose,
  title,
}: OverlayDialogProps) {
  const closeReasonRef = useRef<PdxOverlayCloseReason>('Programmatic');
  const contentRef = useRef<HTMLDivElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      closeReasonRef.current = 'Programmatic';
      onOpenChange?.(true);
      return;
    }

    const reason = closeReasonRef.current;
    closeReasonRef.current = 'Programmatic';
    onOpenChange?.(false);
    onClose?.(reason);
  };

  const content = (
    <>
      <DialogPrimitive.Overlay className={`${block}Overlay`} />
      <DialogPrimitive.Content
        {...getDataAttributes(dataAttributes)}
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={mergeClassNames(block, modifier, className)}
        id={id}
        onEscapeKeyDown={(event) => {
          if (!closeOnEscape) {
            event.preventDefault();
            return;
          }
          closeReasonRef.current = 'Escape';
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          invokerRef.current?.focus();
          invokerRef.current = null;
        }}
        onInteractOutside={(event) => {
          // Covers both halves of "outside": a press on the scrim and focus
          // leaving the layer. Radix reports them through the same event.
          if (!closeOnOverlayClick) {
            event.preventDefault();
            return;
          }
          closeReasonRef.current = 'OutsideInteraction';
        }}
        onOpenAutoFocus={(event) => {
          // Radix would focus the first tabbable control, which is the close
          // button in the header. Focusing the panel instead announces the
          // dialog name and description first and leaves the first Tab for
          // the content the dialog is actually about.
          event.preventDefault();
          const invoker = document.activeElement;
          invokerRef.current = invoker instanceof HTMLElement ? invoker : null;
          contentRef.current?.focus();
        }}
        ref={contentRef}
        style={contentStyle}
      >
        <header className={`${block}Header`}>
          <div className={`${block}Heading`}>
            <DialogPrimitive.Title className={`${block}Title`}>
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className={`${block}Description`}>
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          {showClose ? (
            <button
              aria-label={closeLabel}
              className={`${block}Close`}
              onClick={() => {
                closeReasonRef.current = 'CloseButton';
                handleOpenChange(false);
              }}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          ) : null}
        </header>
        <div className={`${block}Body`}>{children}</div>
        {footer ? <footer className={`${block}Footer`}>{footer}</footer> : null}
      </DialogPrimitive.Content>
    </>
  );

  return (
    <DialogPrimitive.Root onOpenChange={handleOpenChange} open={open}>
      {portal ? (
        <DialogPrimitive.Portal>{content}</DialogPrimitive.Portal>
      ) : (
        content
      )}
    </DialogPrimitive.Root>
  );
}

export default OverlayDialog;
