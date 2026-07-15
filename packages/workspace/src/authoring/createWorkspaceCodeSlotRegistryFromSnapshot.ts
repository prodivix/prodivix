import {
  createCodeSlotRegistry,
  type CodeSlotRegistry,
} from '@prodivix/authoring';
import { createAnimationCodeSlotProvider } from '@prodivix/animation';
import { createNodeGraphCodeSlotProvider } from '@prodivix/nodegraph';
import { createPirCodeSlotProvider } from '@prodivix/pir';
import { createRouteRuntimeCodeSlotProvider } from '@prodivix/router';
import {
  decodeWorkspacePirDocument,
  isWorkspacePirDocumentType,
} from '../component/workspacePirDocument';
import type { WorkspaceSnapshot } from '../types';
import { decodeWorkspaceAnimationDocument } from '../workspaceAnimationDocument';
import { decodeWorkspaceNodeGraphDocument } from '../workspaceNodeGraphDocument';
import {
  createWorkspaceSemanticIndexFromSnapshot,
  type WorkspaceSemanticIndexIssue,
} from './createWorkspaceSemanticIndexFromSnapshot';
import {
  createWorkspaceExternalAdapterCodeSlotProvider,
  readWorkspaceExternalAdapterConfig,
} from './workspaceExternalAdapter';

export type WorkspaceCodeSlotRegistryCompositionResult =
  | Readonly<{ status: 'ready'; registry: CodeSlotRegistry }>
  | Readonly<{
      status: 'blocked';
      issues: readonly WorkspaceSemanticIndexIssue[];
    }>;

/**
 * Composes domain CodeSlot providers from the same canonical snapshot accepted
 * by the Workspace Semantic Index. Bindings remain owned by their documents.
 */
export const createWorkspaceCodeSlotRegistryFromSnapshot = (
  snapshot: WorkspaceSnapshot
): WorkspaceCodeSlotRegistryCompositionResult => {
  const semanticComposition =
    createWorkspaceSemanticIndexFromSnapshot(snapshot);
  if (semanticComposition.status === 'blocked') {
    return semanticComposition;
  }

  const registry = createCodeSlotRegistry();
  registry.register(
    createRouteRuntimeCodeSlotProvider(snapshot.id, snapshot.routeManifest)
  );

  const externalAdapters = readWorkspaceExternalAdapterConfig(snapshot);
  if (externalAdapters.status === 'invalid') {
    return {
      status: 'blocked',
      issues: externalAdapters.issues.map((issue) => ({
        code: 'WKS_SEMANTIC_INDEX_DOCUMENT_INVALID',
        path: issue.path,
        message: issue.message,
        ...(issue.documentId ? { documentId: issue.documentId } : {}),
      })),
    };
  }
  if (externalAdapters.document) {
    externalAdapters.entries.forEach((entry) => {
      registry.register(
        createWorkspaceExternalAdapterCodeSlotProvider({
          workspaceId: snapshot.id,
          configDocumentId: externalAdapters.document!.id,
          entry,
        })
      );
    });
  }

  for (const document of Object.values(snapshot.docsById).sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    if (isWorkspacePirDocumentType(document.type)) {
      const read = decodeWorkspacePirDocument(document, {
        workspaceId: snapshot.id,
      });
      if (read.status === 'valid') {
        registry.register(
          createPirCodeSlotProvider({
            workspaceId: snapshot.id,
            documentId: document.id,
            document: read.decodedContent,
          })
        );
      }
      continue;
    }
    if (document.type === 'pir-graph') {
      const read = decodeWorkspaceNodeGraphDocument(document);
      if (read.status === 'valid') {
        registry.register(
          createNodeGraphCodeSlotProvider({
            workspaceId: snapshot.id,
            documentId: document.id,
            graph: read.decodedContent,
          })
        );
      }
      continue;
    }
    if (document.type === 'pir-animation') {
      const read = decodeWorkspaceAnimationDocument(document, snapshot);
      if (read.status === 'valid') {
        registry.register(
          createAnimationCodeSlotProvider({
            workspaceId: snapshot.id,
            documentId: document.id,
            definition: read.decodedContent,
          })
        );
      }
    }
  }

  return Object.freeze({ status: 'ready', registry });
};
