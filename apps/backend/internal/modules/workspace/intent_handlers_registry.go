package workspace

func defaultIntentHandlers() []IntentHandler {
	return []IntentHandler{
		routeManifestUpdateHandler{},
		workspaceSettingsUpdateHandler{},
		workspaceDocumentCreateHandler{},
		workspaceDocumentRenameHandler{},
		workspaceDocumentDeleteHandler{},
		workspaceCodeDocumentCreateHandler{},
		workspaceDirectoryCreateHandler{},
		workspaceDirectoryRenameHandler{},
		workspaceDirectoryDeleteHandler{},
		workspaceCodeDocumentRenameHandler{},
		workspaceCodeDocumentDeleteHandler{},
	}
}
