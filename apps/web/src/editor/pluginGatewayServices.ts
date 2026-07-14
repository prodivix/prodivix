import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  validateJsonValue,
} from '@prodivix/plugin-contracts';
import type { BuiltInGatewayServicePorts } from '@prodivix/plugin-browser';
import {
  asNonEmptyDiagnostics,
  pluginHostFailure,
  pluginHostSuccess,
  type PluginHostResult,
} from '@prodivix/plugin-host';
import { flattenRouteManifest } from '@prodivix/router';
import {
  selectActivePirDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';

const unavailable = (method: string) =>
  pluginHostFailure([
    createPluginDiagnostic(
      PLUGIN_DIAGNOSTIC_CODES.GATEWAY_HANDLER_UNAVAILABLE,
      'The editor has not registered a stable write contract for this Gateway method.',
      { contractVersion: '1.0', protocolMethod: method }
    ),
  ]);

const requireWorkspaceState = (
  workspaceId: string
): PluginHostResult<WorkspaceSnapshot> => {
  const workspace = useEditorStore.getState().workspace;
  if (!workspace || workspace.id !== workspaceId) {
    return pluginHostFailure([
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.GATEWAY_SESSION_STALE,
        'Gateway service is not bound to the active editor workspace.',
        { workspaceId }
      ),
    ]);
  }
  return pluginHostSuccess(workspace);
};

export const createEditorPluginGatewayServices = (
  workspaceId: string
): BuiltInGatewayServicePorts =>
  Object.freeze({
    workspace: Object.freeze({
      readSummary: async () => {
        const current = requireWorkspaceState(workspaceId);
        if (current.ok === false) {
          return pluginHostFailure(current.diagnostics);
        }
        const workspace = current.value;
        const activePirDocument = selectActivePirDocument(workspace);
        return pluginHostSuccess(
          Object.freeze({
            workspaceId,
            revision: workspace.workspaceRev,
            documentCount: Object.keys(workspace.docsById).length,
            routeCount: flattenRouteManifest(workspace.routeManifest).length,
            componentCount: Object.keys(
              activePirDocument?.content.ui.graph.nodesById ?? {}
            ).length,
          })
        );
      },
      dispatchIntent: async () => unavailable('workspace/dispatch-intent'),
    }),
    documents: Object.freeze({
      read: async (_context, request) => {
        const current = requireWorkspaceState(workspaceId);
        if (current.ok === false) {
          return pluginHostFailure(current.diagnostics);
        }
        const document = current.value.docsById[request.documentId];
        if (!document) {
          return pluginHostFailure([
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.GATEWAY_HANDLER_FAILED,
              'Requested Workspace document does not exist.',
              {
                workspaceId,
                documentId: request.documentId,
                capabilityScope: request.scope,
              }
            ),
          ]);
        }
        const content = validateJsonValue(document.content);
        if (!content.ok) {
          return pluginHostFailure(
            asNonEmptyDiagnostics(content.diagnostics) ?? [
              createPluginDiagnostic(
                PLUGIN_DIAGNOSTIC_CODES.GATEWAY_HANDLER_FAILED,
                'Workspace document content is not JSON serializable.',
                { workspaceId, documentId: document.id }
              ),
            ]
          );
        }
        return pluginHostSuccess(
          Object.freeze({
            documentId: document.id,
            revision: document.contentRev,
            content: content.value,
          })
        );
      },
      applyPatch: async () => unavailable('document/apply-patch'),
    }),
  });
