package remoteexecution

const (
	workspaceOwnerPermissionID   = "workspace.owner"
	workspaceReadPermissionID    = "workspace.read"
	workspaceWritePermissionID   = "workspace.write"
	workspaceExecutionViewerRole = "viewer"
	workspaceExecutionEditorRole = "editor"
)

var workspaceOwnerExecutionPermissions = []string{
	workspaceOwnerPermissionID,
	workspaceReadPermissionID,
	workspaceWritePermissionID,
}

var workspaceViewerExecutionPermissions = []string{workspaceReadPermissionID}

var workspaceEditorExecutionPermissions = []string{
	workspaceReadPermissionID,
	workspaceWritePermissionID,
}

func cloneExecutionPermissions(permissions []string) []string {
	return append([]string(nil), permissions...)
}

// canonicalWorkspaceExecutionPermissions accepts only the three role projections
// that the Backend can currently attest. Ordering is part of the wire and
// persistence identity, so equivalent unsorted or widened sets fail closed.
func canonicalWorkspaceExecutionPermissions(value []string) ([]string, bool) {
	if len(value) == 1 && value[0] == workspaceReadPermissionID {
		return cloneExecutionPermissions(workspaceViewerExecutionPermissions), true
	}
	if len(value) == 2 && value[0] == workspaceReadPermissionID && value[1] == workspaceWritePermissionID {
		return cloneExecutionPermissions(workspaceEditorExecutionPermissions), true
	}
	if len(value) == 3 && value[0] == workspaceOwnerPermissionID && value[1] == workspaceReadPermissionID && value[2] == workspaceWritePermissionID {
		return cloneExecutionPermissions(workspaceOwnerExecutionPermissions), true
	}
	return nil, false
}

func canonicalWorkspaceExecutionRole(value string) ([]string, bool) {
	switch value {
	case workspaceExecutionViewerRole:
		return cloneExecutionPermissions(workspaceViewerExecutionPermissions), true
	case workspaceExecutionEditorRole:
		return cloneExecutionPermissions(workspaceEditorExecutionPermissions), true
	default:
		return nil, false
	}
}

func hasWorkspaceExecutionPermission(permissions []string, permissionID string) bool {
	for _, candidate := range permissions {
		if candidate == permissionID {
			return true
		}
	}
	return false
}
