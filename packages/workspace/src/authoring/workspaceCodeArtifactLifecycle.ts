import {
  resolveCodeArtifactLifecycle,
  writeCodeArtifactLifecycleManifest,
  type CodeArtifact,
  type CodeArtifactLifecycle,
} from '@prodivix/authoring';
import {
  createWorkspaceCodeContentUpdateCommand,
  type WorkspaceCommandEnvelope,
} from '../workspaceCommand';
import type { WorkspaceSnapshot } from '../types';
import { isWorkspaceCodeDocumentContent } from '../workspaceCodeDocument';
import { createWorkspaceCodeArtifactProvider } from './workspaceCodeArtifactProvider';
import {
  createWorkspaceCodeSlotRegistryFromSnapshot,
  type WorkspaceCodeSlotRegistryCompositionResult,
} from './createWorkspaceCodeSlotRegistryFromSnapshot';

export type WorkspaceCodeArtifactLifecycleRecord = Readonly<{
  artifact: CodeArtifact;
  lifecycle: CodeArtifactLifecycle;
}>;

export type WorkspaceCodeArtifactLifecycleProjectionResult =
  | Readonly<{
      status: 'ready';
      records: readonly WorkspaceCodeArtifactLifecycleRecord[];
    }>
  | Extract<WorkspaceCodeSlotRegistryCompositionResult, { status: 'blocked' }>;

export type WorkspaceCodeArtifactModuleConversionResult =
  | Readonly<{ status: 'ready'; command: WorkspaceCommandEnvelope }>
  | Readonly<{ status: 'unchanged' }>
  | Readonly<{
      status: 'rejected';
      message: string;
    }>;

export const projectWorkspaceCodeArtifactLifecycles = (
  workspace: WorkspaceSnapshot
): WorkspaceCodeArtifactLifecycleProjectionResult => {
  const composition = createWorkspaceCodeSlotRegistryFromSnapshot(workspace);
  if (composition.status === 'blocked') return composition;
  const artifacts = createWorkspaceCodeArtifactProvider(workspace)
    .listArtifacts({ surface: 'issues-panel' })
    .sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    status: 'ready',
    records: Object.freeze(
      artifacts.map((artifact) =>
        Object.freeze({
          artifact,
          lifecycle: resolveCodeArtifactLifecycle({
            artifact,
            registry: composition.registry,
          }),
        })
      )
    ),
  });
};

export const collectWorkspaceCodeArtifactLifecycleDiagnostics = (
  workspace: WorkspaceSnapshot
) => {
  const composition = createWorkspaceCodeSlotRegistryFromSnapshot(workspace);
  if (composition.status === 'blocked') return Object.freeze([]);
  const artifactProvider = createWorkspaceCodeArtifactProvider(workspace);
  const missingBindings = composition.registry
    .listBindingProjections({ surface: 'issues-panel' })
    .filter(
      ({ binding }) =>
        !artifactProvider.getArtifact(binding.reference.artifactId)
    )
    .map((projection) =>
      Object.freeze({
        code: 'COD-3001',
        severity: 'error' as const,
        domain: 'code' as const,
        message: `CodeSlot binding references a missing artifact: ${projection.binding.reference.artifactId}.`,
        hint: 'Bind the CodeSlot to an existing artifact or remove the stale binding.',
        docsUrl: '/reference/diagnostic-codes#cod-3001',
        targetRef: projection.ownerRef,
        meta: Object.freeze({
          slotId: projection.binding.slotId,
          artifactId: projection.binding.reference.artifactId,
          semanticReferenceId: projection.semanticReferenceId,
        }),
      })
    );
  const projection = projectWorkspaceCodeArtifactLifecycles(workspace);
  if (projection.status === 'blocked') return Object.freeze(missingBindings);
  return Object.freeze([
    ...missingBindings,
    ...projection.records.flatMap(({ artifact, lifecycle }) =>
      lifecycle.status === 'orphan'
        ? [
            Object.freeze({
              code: 'COD-3017',
              severity: 'warning' as const,
              domain: 'code' as const,
              message: `Code artifact "${artifact.path}" no longer has an active owner binding.`,
              hint: 'Rebind it to a compatible CodeSlot, convert it to a workspace module, or delete it.',
              docsUrl: '/reference/diagnostic-codes#cod-3017',
              targetRef: Object.freeze({
                kind: 'code-artifact' as const,
                artifactId: artifact.id,
              }),
              meta: Object.freeze({
                lifecycleStatus: 'orphan',
                previousSlotId: lifecycle.previousSlot.slotId,
                previousSlotKind: lifecycle.previousSlot.slotKind,
              }),
            }),
          ]
        : []
    ),
  ]);
};

/** Removes slot-managed metadata only after the artifact is truly orphaned. */
export const createWorkspaceOrphanCodeArtifactToModuleCommand = (input: {
  workspace: WorkspaceSnapshot;
  artifactId: string;
  commandId: string;
  issuedAt: string;
}): WorkspaceCodeArtifactModuleConversionResult => {
  const projection = projectWorkspaceCodeArtifactLifecycles(input.workspace);
  if (projection.status === 'blocked') {
    return Object.freeze({
      status: 'rejected',
      message:
        projection.issues[0]?.message ??
        'Workspace CodeSlot projection is unavailable.',
    });
  }
  const record = projection.records.find(
    ({ artifact }) => artifact.id === input.artifactId
  );
  if (!record) {
    return Object.freeze({
      status: 'rejected',
      message: 'Code artifact does not exist.',
    });
  }
  if (record.lifecycle.status === 'workspace-module') {
    return Object.freeze({ status: 'unchanged' });
  }
  if (record.lifecycle.status === 'active') {
    return Object.freeze({
      status: 'rejected',
      message: 'Detach every active CodeSlot binding before converting.',
    });
  }
  const document = input.workspace.docsById[input.artifactId];
  if (
    !document ||
    document.type !== 'code' ||
    !isWorkspaceCodeDocumentContent(document.content)
  ) {
    return Object.freeze({
      status: 'rejected',
      message: 'Code artifact document is invalid.',
    });
  }
  const metadata = writeCodeArtifactLifecycleManifest(
    document.content.metadata,
    null
  );
  const command = createWorkspaceCodeContentUpdateCommand({
    workspaceId: input.workspace.id,
    document,
    content: {
      ...document.content,
      ...(metadata ? { metadata } : { metadata: undefined }),
    },
    commandId: input.commandId,
    issuedAt: input.issuedAt,
    label: `Convert ${document.path} to workspace module`,
  });
  return command
    ? Object.freeze({ status: 'ready', command })
    : Object.freeze({ status: 'unchanged' });
};
