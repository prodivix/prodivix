import {
  projectWorkspaceServerRuntimeAuthoring,
  readWorkspaceServerRuntimeAuthConfiguration,
  type WorkspaceServerRuntimeAuthoringIssueCode,
  type WorkspaceServerRuntimeRouteSlot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

export type WorkspaceAuthServerRuntimeConfigurationState =
  | Readonly<{ status: 'absent' }>
  | Readonly<{
      status: 'invalid';
      message: string;
      path: string;
    }>
  | Readonly<{
      status: 'ready';
      providerId: string;
      permissionIds: readonly string[];
    }>;

export type WorkspaceAuthServerRuntimeBindingView = Readonly<{
  key: string;
  routeNodeId: string;
  slot: WorkspaceServerRuntimeRouteSlot;
  documentPath: string;
  exportName: string;
  authKind: 'public' | 'authenticated' | 'permission';
  permissionId?: string;
  issueCodes: readonly WorkspaceServerRuntimeAuthoringIssueCode[];
}>;

export type WorkspaceAuthServerRuntimeModel = Readonly<{
  configuration: WorkspaceAuthServerRuntimeConfigurationState;
  bindings: readonly WorkspaceAuthServerRuntimeBindingView[];
  requiredPermissionIds: readonly string[];
  issueCount: number;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** Builds the reference-only Auth/Server Runtime Resources projection. */
export const buildWorkspaceAuthServerRuntimeModel = (
  workspace: WorkspaceSnapshot
): WorkspaceAuthServerRuntimeModel => {
  const configurationRead =
    readWorkspaceServerRuntimeAuthConfiguration(workspace);
  const projection = projectWorkspaceServerRuntimeAuthoring(workspace);
  const candidatesByKey = new Map(
    projection.candidates.map((candidate) => [candidate.key, candidate])
  );
  const bindings = projection.bindings
    .map((binding): WorkspaceAuthServerRuntimeBindingView | undefined => {
      const candidate = candidatesByKey.get(binding.candidateKey);
      if (!candidate) return undefined;
      const issueCodes = projection.issues
        .filter(
          (issue) =>
            issue.routeNodeId === binding.routeNodeId &&
            issue.slot === binding.slot &&
            issue.artifactId === binding.reference.artifactId &&
            issue.exportName === binding.reference.exportName
        )
        .map((issue) => issue.code);
      return Object.freeze({
        key: `${binding.routeNodeId}:${binding.slot}`,
        routeNodeId: binding.routeNodeId,
        slot: binding.slot,
        documentPath: candidate.documentPath,
        exportName: candidate.reference.exportName,
        authKind: candidate.definition.auth.kind,
        ...(candidate.definition.auth.kind === 'permission'
          ? { permissionId: candidate.definition.auth.permissionId }
          : {}),
        issueCodes: Object.freeze(issueCodes),
      });
    })
    .filter(
      (binding): binding is WorkspaceAuthServerRuntimeBindingView =>
        binding !== undefined
    )
    .sort(
      (left, right) =>
        compareText(left.routeNodeId, right.routeNodeId) ||
        compareText(left.slot, right.slot)
    );
  const requiredPermissionIds = [
    ...new Set(
      bindings.flatMap((binding) =>
        binding.permissionId ? [binding.permissionId] : []
      )
    ),
  ].sort(compareText);
  const configuration: WorkspaceAuthServerRuntimeConfigurationState =
    configurationRead.status === 'invalid'
      ? Object.freeze({
          status: 'invalid' as const,
          message:
            configurationRead.issues[0]?.message ??
            'Server Runtime Auth configuration is invalid.',
          path: configurationRead.issues[0]?.path ?? '/config/auth.json',
        })
      : configurationRead.configuration
        ? Object.freeze({
            status: 'ready' as const,
            providerId: configurationRead.configuration.providerId,
            permissionIds: configurationRead.configuration.permissionIds,
          })
        : Object.freeze({ status: 'absent' as const });
  return Object.freeze({
    configuration,
    bindings: Object.freeze(bindings),
    requiredPermissionIds: Object.freeze(requiredPermissionIds),
    issueCount:
      projection.issues.length +
      (configurationRead.status === 'invalid'
        ? configurationRead.issues.length
        : 0),
  });
};
