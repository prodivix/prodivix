package workspace

import "fmt"

func (changes *workspaceCommitChanges) hasDurableDelta() bool {
	return changes != nil && (changes.TreeChanged ||
		changes.RouteChanged ||
		len(changes.DocumentsToWrite) > 0 ||
		len(changes.DocumentsToDelete) > 0)
}

func validateWorkspaceCommitHasDurableDelta(changes *workspaceCommitChanges) error {
	if changes.hasDurableDelta() {
		return nil
	}
	return commitValidation("/operation", "workspace operation has no durable authoring delta")
}

func validateWorkspaceCommitRevisionCapacity(
	workspace *WorkspaceRecord,
	changes *workspaceCommitChanges,
) error {
	if workspace == nil || changes == nil {
		return commitValidation("/operation", "workspace commit revision state is unavailable")
	}
	if workspace.WorkspaceRev > maxJSONSafeInteger || workspace.RouteRev > maxJSONSafeInteger {
		return commitValidation("/workspace", "workspace revisions exceed the JSON safe integer range")
	}
	if workspace.OpSeq >= maxJSONSafeInteger {
		return commitValidation("/workspace/opSeq", "workspace opSeq cannot advance beyond the JSON safe integer range")
	}
	if changes.WorkspaceChanged && workspace.WorkspaceRev >= maxJSONSafeInteger {
		return commitValidation("/workspace/workspaceRev", "workspaceRev cannot advance beyond the JSON safe integer range")
	}
	if changes.RouteChanged && workspace.RouteRev >= maxJSONSafeInteger {
		return commitValidation("/workspace/routeRev", "routeRev cannot advance beyond the JSON safe integer range")
	}
	for _, document := range changes.DocumentsToWrite {
		if document.ContentRev <= 0 || document.ContentRev > maxJSONSafeInteger {
			return commitValidation("/operation", fmt.Sprintf("document %s contentRev exceeds the JSON safe integer range", document.ID))
		}
		if document.MetaRev <= 0 || document.MetaRev > maxJSONSafeInteger {
			return commitValidation("/operation", fmt.Sprintf("document %s metaRev exceeds the JSON safe integer range", document.ID))
		}
	}
	return nil
}

func validateWorkspaceCommitChangesAgainstRequirements(
	before map[string]WorkspaceDocumentRecord,
	after map[string]WorkspaceDocumentRecord,
	changes *workspaceCommitChanges,
	requirements workspaceCommitRequirements,
) error {
	if changes.WorkspaceChanged && !requirements.Workspace {
		return commitValidation("/operation", "workspace state changed outside the declared revision vector")
	}
	if changes.RouteChanged && !requirements.Route {
		return commitValidation("/operation", "route manifest changed outside the declared revision vector")
	}
	documentIDs := make(map[string]struct{}, len(before)+len(after))
	for documentID := range before {
		documentIDs[documentID] = struct{}{}
	}
	for documentID := range after {
		documentIDs[documentID] = struct{}{}
	}
	for documentID := range documentIDs {
		original, existed := before[documentID]
		final, exists := after[documentID]
		requirement, declared := requirements.Documents[documentID]
		switch {
		case existed && !exists:
			if !declared || !requirement.Content || !requirement.Meta || requirement.Absent {
				return commitValidation("/operation", fmt.Sprintf("document %s was removed outside its declared revision vector", documentID))
			}
		case !existed && exists:
			if !declared || !requirement.Absent {
				return commitValidation("/operation", fmt.Sprintf("document %s was added outside its declared revision vector", documentID))
			}
		case existed && exists:
			contentChanged := !jsonBytesEqual(original.Content, final.Content)
			metadataChanged := original.Name != final.Name ||
				original.Path != final.Path ||
				!stringSlicesEqual(original.Capabilities, final.Capabilities)
			if contentChanged && (!declared || !requirement.Content || requirement.Absent) {
				return commitValidation("/operation", fmt.Sprintf("document %s content changed outside its declared revision vector", documentID))
			}
			if metadataChanged && (!declared || !requirement.Meta || requirement.Absent) {
				return commitValidation("/operation", fmt.Sprintf("document %s metadata changed outside its declared revision vector", documentID))
			}
		}
	}
	return nil
}
