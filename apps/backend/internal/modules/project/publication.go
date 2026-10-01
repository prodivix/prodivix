package project

import "strings"

func validPublicationExpected(expected *PublicationExpected) bool {
	const maximum = int64(1<<53 - 1)
	validRevision := func(value int64) bool { return value > 0 && value <= maximum }
	if expected == nil || !validRevision(expected.WorkspaceRev) || !validRevision(expected.RouteRev) || !validRevision(expected.OpSeq) || expected.Documents == nil {
		return false
	}
	ids := map[string]bool{}
	for _, document := range expected.Documents {
		if document.DocumentID == "" || document.DocumentID != strings.TrimSpace(document.DocumentID) || ids[document.DocumentID] || !validRevision(document.ContentRev) || !validRevision(document.MetaRev) {
			return false
		}
		ids[document.DocumentID] = true
	}
	return true
}
