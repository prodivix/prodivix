package workspace

// BuildSnapshotResponse is the canonical Workspace wire projection shared by
// authenticated clients and the server-only Agent context adapter.
func BuildSnapshotResponse(snapshot *WorkspaceSnapshot) any {
	return buildSnapshotResponse(snapshot)
}
