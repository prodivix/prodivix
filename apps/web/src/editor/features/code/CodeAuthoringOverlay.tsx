import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PdxModal } from '@prodivix/ui';
import { EditorConfirmModal } from '@/editor/components/EditorConfirmModal';
import { useWorkspaceSemanticNavigationStore } from '@/editor/navigation';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { CodeAuthoringWorkspace } from './CodeAuthoringWorkspace';
import { getCodeAuthoringSelectionStorageKey } from './codeAuthoringModel';
import { useCodeAuthoringOverlayStore } from './codeAuthoringOverlayStore';

type PendingAction = 'close' | 'open-workspace' | null;

/** Hosts both quick CodeSlot editing and maximized artifact authoring without replacing the active domain editor route. */
export function CodeAuthoringOverlay() {
  const { t } = useTranslation('editor');
  const navigate = useNavigate();
  const { projectId } = useParams();
  const workspace = useEditorStore((state) => state.workspace);
  const setActiveDocumentId = useEditorStore(
    (state) => state.setActiveDocumentId
  );
  const request = useCodeAuthoringOverlayStore((state) => state.request);
  const close = useCodeAuthoringOverlayStore((state) => state.close);
  const [dirty, setDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const artifactId = request?.artifactId;
  const artifact = artifactId ? workspace?.docsById[artifactId] : null;
  const isMaximized = request?.presentation === 'maximized';

  useEffect(() => {
    setDirty(false);
    setPendingAction(null);
  }, [request?.requestId]);

  useEffect(() => {
    if (request && workspace?.id !== request.workspaceId) {
      close(request.requestId);
    }
  }, [close, request, workspace?.id]);

  // Compact and maximized requests always carry a resolved artifact; bail out
  // instead of opening an overlay that has nothing to author.
  if (!request || !artifactId || workspace?.id !== request.workspaceId) {
    return null;
  }

  const performAction = (action: Exclude<PendingAction, null>) => {
    if (action === 'open-workspace' && projectId) {
      setActiveDocumentId(artifactId);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          getCodeAuthoringSelectionStorageKey(projectId),
          artifactId
        );
      }
      if (request.sourceSpan) {
        useWorkspaceSemanticNavigationStore
          .getState()
          .requestSurfaceNavigation({
            projectId,
            workspaceId: request.workspaceId,
            location: { kind: 'source-span', sourceSpan: request.sourceSpan },
          });
      }
      close(request.requestId);
      navigate(`/editor/project/${projectId}/code`);
      return;
    }
    close(request.requestId);
  };

  const requestAction = (action: Exclude<PendingAction, null>) => {
    if (dirty) {
      setPendingAction(action);
      return;
    }
    performAction(action);
  };

  const title = isMaximized
    ? t('codeAuthoring.overlay.maximizedTitle')
    : t('codeAuthoring.overlay.compactTitle');
  const path = artifact?.path ?? artifactId;

  return (
    <>
      <PdxModal
        open
        title={title}
        description={path}
        closeLabel={t('codeAuthoring.overlay.close')}
        closeOnOverlayClick={false}
        dataAttributes={{
          'data-testid': isMaximized
            ? 'code-authoring-maximized-modal'
            : 'code-authoring-compact-modal',
        }}
        className="[&_.PdxModalBody]:min-h-0 [&_.PdxModalBody]:flex-1 [&_.PdxModalBody]:overflow-hidden [&_.PdxModalBody]:p-3"
        size="Large"
        style={
          isMaximized
            ? {
                width: 'calc(100vw - 32px)',
                height: 'calc(100dvh - 32px)',
                maxWidth: 'none',
                maxHeight: 'none',
              }
            : {
                width: 'min(880px, calc(100vw - 32px))',
                height: 'min(720px, calc(100dvh - 32px))',
                maxWidth: 'none',
              }
        }
        onClose={() => requestAction('close')}
        footer={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-black/12 bg-(--bg-canvas) px-3 py-2 text-xs font-medium text-(--text-primary) hover:bg-black/5"
            onClick={() => requestAction('open-workspace')}
          >
            <Maximize2 size={14} />
            {t('codeAuthoring.overlay.openWorkspace')}
          </button>
        }
      >
        <CodeAuthoringWorkspace
          key={request.requestId}
          request={request}
          onDirtyChange={setDirty}
        />
      </PdxModal>

      <EditorConfirmModal
        open={pendingAction !== null}
        title={t('codeAuthoring.overlay.discardTitle')}
        message={t('codeAuthoring.overlay.discardMessage')}
        cancelText={t('codeAuthoring.overlay.keepEditing')}
        confirmText={t('codeAuthoring.overlay.discard')}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          if (action) performAction(action);
        }}
      />
    </>
  );
}
