import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { createCodeAuthoringRequest } from '@prodivix/authoring';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { useWorkspaceSemanticNavigationStore } from '@/editor/navigation';
import { CodeAuthoringWorkspace } from './CodeAuthoringWorkspace';

type CodeFolder = 'scripts' | 'styles' | 'shaders';

const isCodeFolder = (value: string | null): value is CodeFolder =>
  value === 'scripts' || value === 'styles' || value === 'shaders';

export default function CodeAuthoringPage() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = useEditorStore((state) => state.workspace);
  const semanticNavigationRequest = useWorkspaceSemanticNavigationStore(
    (state) => state.navigationRequest
  );
  const requestedCreateFolder = useMemo(() => {
    const value = searchParams.get('create');
    return isCodeFolder(value) ? value : null;
  }, [searchParams]);
  const workspaceId = workspace?.id ?? projectId ?? 'code-workspace';
  const requestedSourceSpan =
    semanticNavigationRequest &&
    semanticNavigationRequest.workspaceId === workspace?.id &&
    semanticNavigationRequest.projectId === projectId &&
    semanticNavigationRequest.location.kind === 'source-span'
      ? semanticNavigationRequest.location.sourceSpan
      : undefined;
  const request = useMemo(
    () =>
      createCodeAuthoringRequest({
        requestId: `code-workspace:${workspaceId}`,
        workspaceId,
        presentation: 'workspace',
        ...(requestedSourceSpan
          ? {
              artifactId: requestedSourceSpan.artifactId,
              sourceSpan: requestedSourceSpan,
            }
          : {}),
        origin: { surface: 'code-workspace' },
      }),
    [requestedSourceSpan, workspaceId]
  );

  return (
    <CodeAuthoringWorkspace
      request={request}
      requestedCreateFolder={requestedCreateFolder}
      onCreateRequestConsumed={() => {
        const next = new URLSearchParams(searchParams);
        next.delete('create');
        setSearchParams(next, { replace: true });
      }}
    />
  );
}
