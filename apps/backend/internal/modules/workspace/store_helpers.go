package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"sort"
	"strings"
	"time"
)

func queryWorkspaceDocumentsForUpdate(ctx context.Context, tx *sql.Tx, workspaceID string) ([]WorkspaceDocumentRecord, error) {
	const documentQuery = `SELECT workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY path ASC`
	rows, err := tx.QueryContext(ctx, documentQuery, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	documents := make([]WorkspaceDocumentRecord, 0)
	for rows.Next() {
		document, scanErr := scanWorkspaceDocument(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		documents = append(documents, *document)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return documents, nil
}

func queryWorkspaceRouteManifestForValidation(ctx context.Context, tx *sql.Tx, workspaceID string) (json.RawMessage, error) {
	const routeQuery = `SELECT manifest_json
FROM workspace_routes
WHERE workspace_id = $1`
	var manifestJSON []byte
	if err := tx.QueryRowContext(ctx, routeQuery, workspaceID).Scan(&manifestJSON); err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		manifestJSON = defaultWorkspaceRouteManifest
	}
	return normalizeRouteManifestDocument(manifestJSON)
}

func indexWorkspaceDocumentsAfterRemoval(
	documents []WorkspaceDocumentRecord,
	removedDocumentIDs []string,
) (map[string]WorkspaceDocumentRecord, error) {
	removed := make(map[string]struct{}, len(removedDocumentIDs))
	for _, documentID := range removedDocumentIDs {
		removed[documentID] = struct{}{}
	}
	retained := make([]WorkspaceDocumentRecord, 0, len(documents))
	for _, document := range documents {
		if _, isRemoved := removed[document.ID]; isRemoved {
			continue
		}
		retained = append(retained, document)
	}
	return indexWorkspaceVFSDocuments(retained)
}

func validateWorkspaceDocumentRetention(totalDocumentCount int, removedDocumentCount int) error {
	if totalDocumentCount-removedDocumentCount >= 1 {
		return nil
	}
	return fmt.Errorf("%w: workspace must retain at least one document", ErrWorkspaceVFSInvalid)
}

func insertWorkspaceOperation(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	opSeq int64,
	domain string,
	documentID *string,
	payload json.RawMessage,
	issuedAt time.Time,
) error {
	const query = `INSERT INTO workspace_operations (workspace_id, op_seq, domain, document_id, payload_json, created_at)
VALUES ($1, $2, $3, $4, $5::jsonb, $6)`

	var docID any
	if documentID != nil {
		docID = *documentID
	}

	_, err := tx.ExecContext(ctx, query, workspaceID, opSeq, domain, docID, string(payload), issuedAt)
	return err
}

func normalizeWorkspaceCommand(command WorkspaceCommandEnvelope) (WorkspaceCommandEnvelope, error) {
	command.ID = strings.TrimSpace(command.ID)
	command.Namespace = strings.TrimSpace(command.Namespace)
	command.Type = strings.TrimSpace(command.Type)
	command.Version = strings.TrimSpace(command.Version)
	if !command.IssuedAt.IsZero() {
		command.IssuedAt = command.IssuedAt.UTC()
	}
	command.Target.WorkspaceID = strings.TrimSpace(command.Target.WorkspaceID)
	command.Target.DocumentID = strings.TrimSpace(command.Target.DocumentID)
	command.Target.RouteNodeID = strings.TrimSpace(command.Target.RouteNodeID)
	command.MergeKey = strings.TrimSpace(command.MergeKey)
	command.Label = strings.TrimSpace(command.Label)
	command.DomainHint = strings.TrimSpace(command.DomainHint)

	if command.ForwardOps == nil {
		command.ForwardOps = make([]WorkspacePatchOp, 0)
	}
	if command.ReverseOps == nil {
		command.ReverseOps = make([]WorkspacePatchOp, 0)
	}

	forwardOps, err := normalizeWorkspacePatchOps(command.ForwardOps)
	if err != nil {
		return WorkspaceCommandEnvelope{}, err
	}
	command.ForwardOps = forwardOps

	reverseOps, err := normalizeWorkspacePatchOps(command.ReverseOps)
	if err != nil {
		return WorkspaceCommandEnvelope{}, err
	}
	command.ReverseOps = reverseOps

	return command, nil
}

func normalizeWorkspacePatchOps(ops []WorkspacePatchOp) ([]WorkspacePatchOp, error) {
	normalized := make([]WorkspacePatchOp, 0, len(ops))
	for index, op := range ops {
		op.Op = strings.TrimSpace(strings.ToLower(op.Op))
		if op.Path != strings.TrimSpace(op.Path) {
			return nil, fmt.Errorf("patch operation %d path must not contain surrounding whitespace", index)
		}
		if op.From != strings.TrimSpace(op.From) {
			return nil, fmt.Errorf("patch operation %d from must not contain surrounding whitespace", index)
		}

		if op.Path == "" {
			return nil, fmt.Errorf("patch operation %d missing path", index)
		}
		if !isSupportedPatchOperation(op.Op) {
			return nil, fmt.Errorf("patch operation %d uses unsupported op %q", index, op.Op)
		}
		if (op.Op == "copy" || op.Op == "move") && op.From == "" {
			return nil, fmt.Errorf("patch operation %d missing from for %s", index, op.Op)
		}

		normalized = append(normalized, op)
	}
	return normalized, nil
}

func validateWorkspaceCommand(command WorkspaceCommandEnvelope, workspaceID string, documentID *string) error {
	if command.ID == "" {
		return errors.New("command.id is required")
	}
	if command.Namespace == "" {
		return errors.New("command.namespace is required")
	}
	if command.Type == "" {
		return errors.New("command.type is required")
	}
	if command.Version == "" {
		return errors.New("command.version is required")
	}
	if command.IssuedAt.IsZero() {
		return errors.New("command.issuedAt is required")
	}
	if command.Target.WorkspaceID == "" {
		return errors.New("command.target.workspaceId is required")
	}
	if command.Target.WorkspaceID != workspaceID {
		return errors.New("command.target.workspaceId does not match workspaceID")
	}

	if documentID == nil {
		return nil
	}

	expectedDocumentID := strings.TrimSpace(*documentID)
	if expectedDocumentID == "" {
		return errors.New("documentID is required")
	}
	if command.Target.DocumentID == "" {
		return errors.New("command.target.documentId is required for document mutations")
	}
	if command.Target.DocumentID != expectedDocumentID {
		return errors.New("command.target.documentId does not match documentID")
	}
	return nil
}

func isSupportedPatchOperation(operation string) bool {
	switch operation {
	case "add", "remove", "replace", "move", "copy", "test":
		return true
	default:
		return false
	}
}

func commandDomain(command WorkspaceCommandEnvelope) string {
	return fmt.Sprintf("%s.%s@%s", command.Namespace, command.Type, command.Version)
}

func (store *WorkspaceStore) VerifyWorkspaceOwner(ctx context.Context, ownerID string, workspaceID string) error {
	if store == nil || store.db == nil {
		return errors.New("workspace store is not initialized")
	}
	ownerID = strings.TrimSpace(ownerID)
	workspaceID = strings.TrimSpace(workspaceID)
	if ownerID == "" || workspaceID == "" {
		return ErrWorkspaceNotFound
	}

	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()

	const query = `SELECT 1
FROM workspaces
WHERE id = $1 AND owner_id = $2`
	var marker int
	if err := store.db.QueryRowContext(ctx, query, workspaceID, ownerID).Scan(&marker); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrWorkspaceNotFound
		}
		return err
	}
	return nil
}

func (store *WorkspaceStore) resolveDocumentLookupError(ctx context.Context, workspaceID string) error {
	const query = `SELECT 1 FROM workspaces WHERE id = $1`
	var marker int
	err := store.db.QueryRowContext(ctx, query, workspaceID).Scan(&marker)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrWorkspaceNotFound
		}
		return err
	}
	return ErrWorkspaceDocumentNotFound
}

func scanWorkspaceDocument(scanner interface{ Scan(dest ...any) error }) (*WorkspaceDocumentRecord, error) {
	record := &WorkspaceDocumentRecord{}
	var docType string
	var contentBytes []byte
	var capabilitiesBytes []byte
	if err := scanner.Scan(
		&record.WorkspaceID,
		&record.ID,
		&docType,
		&record.Name,
		&record.Path,
		&record.ContentRev,
		&record.MetaRev,
		&contentBytes,
		&capabilitiesBytes,
		&record.UpdatedAt,
	); err != nil {
		return nil, err
	}
	record.Type = WorkspaceDocumentType(docType)
	record.Content = json.RawMessage(contentBytes)
	if len(capabilitiesBytes) > 0 {
		if err := json.Unmarshal(capabilitiesBytes, &record.Capabilities); err != nil {
			return nil, err
		}
	}
	if len(record.Capabilities) == 0 {
		record.Capabilities = nil
	}
	return record, nil
}

func toWorkspaceDocumentRevision(document WorkspaceDocumentRecord) WorkspaceDocumentRevision {
	return WorkspaceDocumentRevision{
		ID:           document.ID,
		Type:         document.Type,
		Name:         document.Name,
		Path:         document.Path,
		ContentRev:   document.ContentRev,
		MetaRev:      document.MetaRev,
		Content:      document.Content,
		Capabilities: append([]string(nil), document.Capabilities...),
		UpdatedAt:    document.UpdatedAt,
	}
}

func normalizeJSONDocument(payload json.RawMessage, fallback json.RawMessage) (json.RawMessage, error) {
	if len(payload) == 0 || strings.TrimSpace(string(payload)) == "" {
		return fallback, nil
	}
	var decoded any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, err
	}
	normalized, err := json.Marshal(decoded)
	if err != nil {
		return nil, err
	}
	return normalized, nil
}

func normalizeWorkspaceDocumentContent(documentType WorkspaceDocumentType, payload json.RawMessage) (json.RawMessage, error) {
	fallback := defaultPIRDocument
	if documentType == WorkspaceDocumentTypePIRGraph {
		fallback = defaultNodeGraphDocument
	} else if documentType == WorkspaceDocumentTypeCode {
		fallback = defaultCodeDocument
	} else if !isPIRWorkspaceDocumentType(documentType) {
		fallback = defaultGenericDocument
	}
	normalized, err := normalizeJSONDocument(payload, fallback)
	if err != nil {
		return nil, err
	}
	if err := validateWorkspaceDocumentContent(documentType, normalized); err != nil {
		return nil, err
	}
	return normalized, nil
}

func normalizeWorkspaceCapabilities(capabilities []string) ([]string, error) {
	result := make([]string, 0, len(capabilities))
	seen := make(map[string]struct{}, len(capabilities))
	for _, capability := range capabilities {
		capability = strings.TrimSpace(capability)
		if capability == "" {
			return nil, errors.New("workspace document capabilities must be non-empty strings")
		}
		if _, exists := seen[capability]; exists {
			continue
		}
		seen[capability] = struct{}{}
		result = append(result, capability)
	}
	sort.Strings(result)
	return result, nil
}

func mustMarshalWorkspaceCapabilities(capabilities []string) string {
	if capabilities == nil {
		capabilities = []string{}
	}
	payload, err := json.Marshal(capabilities)
	if err != nil {
		panic(err)
	}
	return string(payload)
}

func validateWorkspaceDocumentContent(documentType WorkspaceDocumentType, payload json.RawMessage) error {
	if documentType == WorkspaceDocumentTypePIRGraph {
		return validateNodeGraphDocument(payload)
	}
	if documentType == WorkspaceDocumentTypePIRAnimation {
		return validateAnimationDocument(payload)
	}
	if documentType == WorkspaceDocumentTypeCode {
		return validateWorkspaceCodeDocument(payload)
	}
	if isPIRWorkspaceDocumentType(documentType) {
		return validatePIRDocument(payload)
	}
	if documentType == WorkspaceDocumentTypeAsset {
		return validateWorkspaceAssetDocument(payload)
	}
	if documentType == WorkspaceDocumentTypeProjectConfig {
		return validateWorkspaceProjectConfigDocument(payload)
	}
	return nil
}

func validateWorkspaceAssetDocument(payload json.RawMessage) error {
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		return err
	}
	if document["kind"] != "asset" {
		return errors.New("asset document kind must be asset")
	}
	mime, ok := document["mime"].(string)
	if !ok || strings.TrimSpace(mime) == "" {
		return errors.New("asset document mime is required")
	}
	if size, exists := document["size"]; exists {
		number, ok := size.(float64)
		if !ok || number < 0 || number != math.Trunc(number) || number > float64(maxJSONSafeInteger) {
			return errors.New("asset document size must be a non-negative safe integer")
		}
	}
	if metadata, exists := document["metadata"]; exists {
		if _, ok := metadata.(map[string]any); !ok {
			return errors.New("asset document metadata must be an object")
		}
	}
	return nil
}

func validateWorkspaceProjectConfigDocument(payload json.RawMessage) error {
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		return err
	}
	if document["kind"] != "config" {
		return errors.New("project-config document kind must be config")
	}
	if _, exists := document["value"]; !exists {
		return errors.New("project-config document value is required")
	}
	if metadata, exists := document["metadata"]; exists {
		if _, ok := metadata.(map[string]any); !ok {
			return errors.New("project-config document metadata must be an object")
		}
	}
	return nil
}

func validateWorkspaceCodeDocument(payload json.RawMessage) error {
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		return err
	}
	language, ok := document["language"].(string)
	if !ok || strings.TrimSpace(language) == "" {
		return errors.New("code document language is required")
	}
	source, ok := document["source"].(string)
	if !ok {
		return errors.New("code document source must be a string")
	}
	document["language"] = strings.TrimSpace(language)
	document["source"] = source
	if metadata, exists := document["metadata"]; exists {
		if _, ok := metadata.(map[string]any); !ok {
			return errors.New("code document metadata must be an object")
		}
	}
	return nil
}

func jsonBytesEqual(left json.RawMessage, right json.RawMessage) bool {
	var leftValue any
	var rightValue any
	if err := json.Unmarshal(left, &leftValue); err != nil {
		return false
	}
	if err := json.Unmarshal(right, &rightValue); err != nil {
		return false
	}
	return reflect.DeepEqual(leftValue, rightValue)
}

func withStoreTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithTimeout(ctx, 5*time.Second)
}

func isValidWorkspaceDocumentType(documentType WorkspaceDocumentType) bool {
	switch documentType {
	case WorkspaceDocumentTypePIRPage, WorkspaceDocumentTypePIRLayout, WorkspaceDocumentTypePIRComponent, WorkspaceDocumentTypePIRGraph, WorkspaceDocumentTypePIRAnimation, WorkspaceDocumentTypeCode, WorkspaceDocumentTypeAsset, WorkspaceDocumentTypeProjectConfig:
		return true
	default:
		return false
	}
}

func isPIRWorkspaceDocumentType(documentType WorkspaceDocumentType) bool {
	switch documentType {
	case WorkspaceDocumentTypePIRPage, WorkspaceDocumentTypePIRLayout, WorkspaceDocumentTypePIRComponent:
		return true
	default:
		return false
	}
}
