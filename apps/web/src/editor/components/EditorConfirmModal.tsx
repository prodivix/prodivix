import { CornerDownLeft, Delete } from 'lucide-react';
import { PdxButton, PdxModal } from '@prodivix/ui';
import { useEditorShortcut } from '@/editor/shortcuts';

type EditorConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  cancelText: string;
  confirmText: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function EditorConfirmModal({
  open,
  title,
  message,
  cancelText,
  confirmText,
  onCancel,
  onConfirm,
}: EditorConfirmModalProps) {
  useEditorShortcut('Escape', onCancel, {
    enabled: open,
    scope: 'modal',
    priority: 100,
    allowInEditable: true,
  });
  useEditorShortcut('Backspace', onCancel, {
    enabled: open,
    scope: 'modal',
    priority: 100,
    allowInEditable: true,
  });
  useEditorShortcut('Enter', onConfirm, {
    enabled: open,
    scope: 'modal',
    priority: 100,
  });

  return (
    <PdxModal
      open={open}
      title={title}
      size="Small"
      onClose={onCancel}
      footer={
        <>
          <PdxButton
            text={cancelText}
            category="Ghost"
            size="Small"
            icon={<Delete size={15} className="opacity-60" />}
            iconPosition="Right"
            onClick={onCancel}
          />
          <PdxButton
            text={confirmText}
            category="Primary"
            size="Small"
            icon={<CornerDownLeft size={15} className="opacity-60" />}
            iconPosition="Right"
            onClick={onConfirm}
          />
        </>
      }
    >
      <p className="m-0 text-sm text-(--text-secondary)">{message}</p>
    </PdxModal>
  );
}
