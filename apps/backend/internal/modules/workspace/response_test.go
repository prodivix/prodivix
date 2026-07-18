package workspace

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"
)

func TestBuildConflictPayloadUsesCanonicalExpectedAndCurrentRevisions(t *testing.T) {
	updatedAt := time.Date(2026, time.July, 12, 2, 30, 0, 0, time.UTC)
	payload := BuildConflictPayload(newDocumentRevisionConflict(
		"ws_1",
		"doc_home",
		6,
		11,
		4,
		39,
		WorkspaceConflictDocumentMetadata{
			ID:         "doc_home",
			Type:       WorkspaceDocumentTypePIRPage,
			Path:       "/pages/home.pir.json",
			ContentRev: 7,
			MetaRev:    2,
			UpdatedAt:  updatedAt,
		},
	))

	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal conflict payload: %v", err)
	}
	var wirePayload map[string]any
	if err := json.Unmarshal(encoded, &wirePayload); err != nil {
		t.Fatalf("unmarshal conflict payload: %v", err)
	}
	errorPayload := wirePayload["error"].(map[string]any)
	if errorPayload["code"] != "WKS-4003" || errorPayload["retryable"] != true {
		t.Fatalf("unexpected error envelope: %+v", errorPayload)
	}
	details := errorPayload["details"].(map[string]any)
	if details["conflictType"] != string(WorkspaceConflictDocument) || details["workspaceId"] != "ws_1" {
		t.Fatalf("unexpected conflict identity: %+v", details)
	}
	for _, retiredField := range []string{"serverWorkspaceRev", "serverRouteRev", "opSeq", "serverDocument"} {
		if _, exists := details[retiredField]; exists {
			t.Fatalf("legacy conflict field %q must not be exposed: %+v", retiredField, details)
		}
	}

	expected := details["expected"].(map[string]any)
	expectedDocument := expected["document"].(map[string]any)
	if len(expected) != 1 || expectedDocument["id"] != "doc_home" || expectedDocument["contentRev"] != float64(6) {
		t.Fatalf("unexpected expected revisions: %+v", expected)
	}

	current := details["current"].(map[string]any)
	if current["workspaceRev"] != float64(11) || current["routeRev"] != float64(4) || current["opSeq"] != float64(39) {
		t.Fatalf("unexpected current workspace revisions: %+v", current)
	}
	currentDocument := current["document"].(map[string]any)
	if currentDocument["id"] != "doc_home" ||
		currentDocument["type"] != string(WorkspaceDocumentTypePIRPage) ||
		currentDocument["path"] != "/pages/home.pir.json" ||
		currentDocument["contentRev"] != float64(7) ||
		currentDocument["metaRev"] != float64(2) ||
		currentDocument["updatedAt"] != updatedAt.Format(time.RFC3339) {
		t.Fatalf("unexpected current document metadata: %+v", currentDocument)
	}
	if _, leaked := currentDocument["content"]; leaked {
		t.Fatalf("conflict payload must not include document content: %+v", currentDocument)
	}
}

func TestBuildConflictPayloadRepresentsDocumentPresenceConflicts(t *testing.T) {
	updatedAt := time.Date(2026, time.July, 12, 2, 30, 0, 0, time.UTC)
	currentDocument := WorkspaceConflictDocumentMetadata{
		ID:         "doc_new",
		Type:       WorkspaceDocumentTypeCode,
		Path:       "/new.ts",
		ContentRev: 1,
		MetaRev:    1,
		UpdatedAt:  updatedAt,
	}
	added := ExtractErrorDetails(BuildConflictPayload(newExistingDocumentAgainstAbsentConflictForCommit(
		"ws_1", "doc_new", 2, 1, 8, currentDocument,
	)))
	addedExpected := added["expected"].(map[string]any)["document"].(map[string]any)
	if content, exists := addedExpected["contentRev"]; !exists || content != nil {
		t.Fatalf("expected explicit null contentRev: %+v", addedExpected)
	}
	if meta, exists := addedExpected["metaRev"]; !exists || meta != nil {
		t.Fatalf("expected explicit null metaRev: %+v", addedExpected)
	}

	deleted := ExtractErrorDetails(BuildConflictPayload(newMissingDocumentRevisionConflictForCommit(
		"ws_1", "doc_old", 4, 2, 3, 1, 9,
	)))
	deletedCurrent := deleted["current"].(map[string]any)
	if document, exists := deletedCurrent["document"]; !exists || document != nil {
		t.Fatalf("expected explicit null current document: %+v", deletedCurrent)
	}
}

func TestMapStoreErrorMapsCommitClientFailuresTo422(t *testing.T) {
	tests := []error{
		commitValidation("/operation", "reverse does not restore state"),
		fmt.Errorf("apply command: %w", commitValidation("/operation", "capabilities are invalid")),
		ErrWorkspaceCommitIdentityMismatch,
		ErrDataSourceValidationFailed,
	}
	for _, err := range tests {
		failure := MapStoreError(err)
		encoded, marshalErr := json.Marshal(failure.Payload)
		if marshalErr != nil {
			t.Fatalf("marshal failure payload: %v", marshalErr)
		}
		var payload map[string]any
		if unmarshalErr := json.Unmarshal(encoded, &payload); unmarshalErr != nil {
			t.Fatalf("decode failure payload: %v", unmarshalErr)
		}
		errorPayload := payload["error"].(map[string]any)
		if failure.Status != http.StatusUnprocessableEntity || errorPayload["code"] != ErrorInvalidPayload {
			t.Fatalf("expected 422 commit failure for %v, got %+v", err, failure)
		}
	}
}

func TestMapStoreErrorMapsRevisionLimitsTo422(t *testing.T) {
	failure := MapStoreError(validateRevisionCanAdvance("opSeq", maxJSONSafeInteger))
	if failure.Status != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 revision capacity failure, got %+v", failure)
	}
	details := ExtractErrorDetails(failure.Payload)
	if details["field"] != "opSeq" || details["reason"] != revisionLimitReasonCapacity {
		t.Fatalf("unexpected revision capacity details: %+v", details)
	}
}

func TestMapStoreErrorPreservesBinaryAssetFailureCodes(t *testing.T) {
	tests := []struct {
		err    error
		status int
		code   string
	}{
		{err: ErrWorkspaceAssetBlobInvalid, status: http.StatusUnprocessableEntity, code: ErrorWorkspaceAssetBlobInvalid},
		{err: ErrWorkspaceAssetBlobNotFound, status: http.StatusUnprocessableEntity, code: ErrorWorkspaceAssetBlobNotFound},
		{err: ErrWorkspaceAssetBlobConflict, status: http.StatusConflict, code: ErrorWorkspaceAssetBlobConflict},
	}
	for _, test := range tests {
		failure := MapStoreError(fmt.Errorf("asset commit: %w", test.err))
		encoded, err := json.Marshal(failure.Payload)
		if err != nil {
			t.Fatal(err)
		}
		var payload map[string]any
		if err := json.Unmarshal(encoded, &payload); err != nil {
			t.Fatal(err)
		}
		errorPayload := payload["error"].(map[string]any)
		if failure.Status != test.status || errorPayload["code"] != test.code {
			t.Fatalf("unexpected asset failure mapping: %+v", failure)
		}
	}
}

func TestBuildConflictPayloadIncludesOnlyApplicableExpectedPartitions(t *testing.T) {
	payload := BuildConflictPayload(newRouteRevisionConflict("ws_1", 9, 4, 9, 5, 35))
	details := ExtractErrorDetails(payload)
	expected := details["expected"].(map[string]any)
	if len(expected) != 2 || expected["workspaceRev"] != int64(9) || expected["routeRev"] != int64(4) {
		t.Fatalf("unexpected route conflict baseline: %+v", expected)
	}
	current := details["current"].(map[string]any)
	if _, exists := current["document"]; exists {
		t.Fatalf("route conflict must not synthesize a document: %+v", current)
	}
}

func TestBuildConflictPayloadIncludesWorkspaceConflictBaseline(t *testing.T) {
	payload := BuildConflictPayload(newWorkspaceRevisionConflict("ws_1", 8, 9, 3, 24))
	details := ExtractErrorDetails(payload)
	if details["conflictType"] != WorkspaceConflictWorkspace || details["workspaceId"] != "ws_1" {
		t.Fatalf("unexpected workspace conflict identity: %+v", details)
	}
	expected := details["expected"].(map[string]any)
	if len(expected) != 1 || expected["workspaceRev"] != int64(8) {
		t.Fatalf("unexpected workspace conflict baseline: %+v", expected)
	}
	current := details["current"].(map[string]any)
	if len(current) != 3 ||
		current["workspaceRev"] != int64(9) ||
		current["routeRev"] != int64(3) ||
		current["opSeq"] != int64(24) {
		t.Fatalf("unexpected current workspace revisions: %+v", current)
	}
}

func TestBuildMutationSuccessPayloadIncludesExactChangedPartitions(t *testing.T) {
	result := &WorkspaceMutationResult{
		WorkspaceID:   "ws_1",
		WorkspaceRev:  6,
		RouteRev:      3,
		OpSeq:         11,
		Tree:          json.RawMessage(`{"treeRootId":"root","treeById":{}}`),
		RouteManifest: json.RawMessage(`{"version":"1","root":{"id":"root"}}`),
		Settings:      json.RawMessage(`{"theme":"dark"}`),
		UpdatedDocuments: []WorkspaceDocumentRevision{{
			ID:           "doc_code",
			Type:         WorkspaceDocumentTypeCode,
			Name:         "main.ts",
			Path:         "/main.ts",
			ContentRev:   3,
			MetaRev:      2,
			Content:      json.RawMessage(`{"language":"ts","source":"next"}`),
			Capabilities: []string{"execute"},
			UpdatedAt:    time.Date(2026, time.July, 12, 2, 30, 0, 0, time.UTC),
		}},
		RemovedDocumentIDs: []string{"doc_removed"},
	}
	payload := BuildMutationSuccessPayload(result, "tx_1")
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal mutation payload: %v", err)
	}
	var wire map[string]any
	if err := json.Unmarshal(encoded, &wire); err != nil {
		t.Fatalf("decode mutation payload: %v", err)
	}
	if wire["acceptedMutationId"] != "tx_1" || wire["routeManifest"] == nil || wire["settings"] == nil || wire["tree"] == nil {
		t.Fatalf("missing mutation partitions: %+v", wire)
	}
	documents := wire["updatedDocuments"].([]any)
	document := documents[0].(map[string]any)
	if document["name"] != "main.ts" || len(document["capabilities"].([]any)) != 1 {
		t.Fatalf("document metadata was lost: %+v", document)
	}
}
