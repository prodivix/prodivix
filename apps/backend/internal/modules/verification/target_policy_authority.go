package verification

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/verificationcontract"
)

const maximumClosureEvidenceRecords = 1000

// TargetPolicyAuthorityResolution is the server-owned policy projection frozen
// before a promotion is staged. Consumers must not reconstruct these grants
// from candidate-controlled fields.
type TargetPolicyAuthorityResolution struct {
	Authority                     string
	PolicyID                      string
	PolicyRevision                int64
	PolicyDigest                  string
	TargetPolicy                  TargetPolicy
	RetentionRequest              AuthoritativeRetentionRequest
	MaximumClosureEvidenceRecords int
	Comparison                    TargetPolicyComparison
}

// AuthoritativeRetentionRequest is the server-owned retention projection from
// the canonical VerificationPolicy. A runner can report an outcome, but it
// cannot select a different retention class or release-protection setting.
type AuthoritativeRetentionRequest struct {
	Successful             RetentionClass `json:"successful"`
	Failed                 RetentionClass `json:"failed"`
	ProtectReleaseEvidence bool           `json:"protectReleaseEvidence"`
}

type TargetPolicyComparison struct {
	Authority             string
	PolicyID              string
	PolicyDigest          string
	AllowedMismatchFields []string
}

func (policy TargetPolicyComparison) ComparisonPolicy() ComparisonPolicy {
	return ComparisonPolicy{
		ID:                    policy.PolicyID,
		Digest:                policy.PolicyDigest,
		AllowedMismatchFields: append([]string(nil), policy.AllowedMismatchFields...),
	}
}

type TargetPolicyAuthority interface {
	ResolvePromotionPolicy(
		ctx context.Context,
		workspaceID string,
		candidate EvidenceCandidate,
	) (TargetPolicyAuthorityResolution, error)
	ResolveComparisonPolicy(
		ctx context.Context,
		workspaceID string,
	) (TargetPolicyComparison, error)
}

type PostgreSQLTargetPolicyAuthority struct {
	db *sql.DB
}

func NewPostgreSQLTargetPolicyAuthority(db *sql.DB) *PostgreSQLTargetPolicyAuthority {
	return &PostgreSQLTargetPolicyAuthority{db: db}
}

type persistedVerificationPolicyProjection struct {
	WireVersion int    `json:"wireVersion"`
	ID          string `json:"id"`
	Budgets     struct {
		MaximumClosureEvidenceRecords int `json:"maximumClosureEvidenceRecords"`
	} `json:"budgets"`
	ArtifactCapture struct {
		DefaultCapture string `json:"defaultCapture"`
		Targets        []struct {
			TargetID string `json:"targetId"`
			Capture  string `json:"capture"`
		} `json:"targets"`
	} `json:"artifactCapture"`
	Comparison struct {
		AllowedMismatchFields []string `json:"allowedMismatchFields"`
	} `json:"comparison"`
	RetentionRequest AuthoritativeRetentionRequest `json:"retentionRequest"`
}

type workspacePolicyDocument struct {
	ID         string
	Type       string
	ContentRev int64
	MetaRev    int64
	Content    json.RawMessage
}

func (authority *PostgreSQLTargetPolicyAuthority) ResolvePromotionPolicy(
	ctx context.Context,
	workspaceID string,
	candidate EvidenceCandidate,
) (TargetPolicyAuthorityResolution, error) {
	if authority == nil || authority.db == nil {
		return TargetPolicyAuthorityResolution{}, errors.New("verification target policy authority is unavailable")
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := authority.db.BeginTx(ctx, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  true,
	})
	if err != nil {
		return TargetPolicyAuthorityResolution{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var projectID string
	var workspaceRevision int64
	var routeRevision int64
	var operationSequence int64
	err = tx.QueryRowContext(ctx, `SELECT project_id, workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1`, workspaceID).Scan(
		&projectID,
		&workspaceRevision,
		&routeRevision,
		&operationSequence,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return TargetPolicyAuthorityResolution{}, targetPolicyAuthorityFailure()
	}
	if err != nil {
		return TargetPolicyAuthorityResolution{}, err
	}
	if candidate.WorkspaceID != workspaceID ||
		candidate.ProjectID != projectID ||
		candidate.WorkspaceRevision != workspaceRevision ||
		candidate.PartitionRevisions.WorkspaceRev != workspaceRevision ||
		candidate.PartitionRevisions.RouteRev != routeRevision ||
		candidate.PartitionRevisions.OpSeq != operationSequence {
		return TargetPolicyAuthorityResolution{}, targetPolicyAuthorityFailure()
	}

	rows, err := tx.QueryContext(ctx, `SELECT id, doc_type, content_rev, meta_rev, content_json
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY id`, workspaceID)
	if err != nil {
		return TargetPolicyAuthorityResolution{}, err
	}
	defer rows.Close()

	revisions := make(map[string]DocumentRevision)
	var policy *workspacePolicyDocument
	for rows.Next() {
		var document workspacePolicyDocument
		if err := rows.Scan(
			&document.ID,
			&document.Type,
			&document.ContentRev,
			&document.MetaRev,
			&document.Content,
		); err != nil {
			return TargetPolicyAuthorityResolution{}, err
		}
		revisions[document.ID] = DocumentRevision{
			ContentRev: document.ContentRev,
			MetaRev:    document.MetaRev,
		}
		if document.Type == "verification-policy" {
			if policy != nil {
				return TargetPolicyAuthorityResolution{}, targetPolicyAuthorityFailure()
			}
			snapshot := document
			snapshot.Content = append(json.RawMessage(nil), document.Content...)
			policy = &snapshot
		}
	}
	if err := rows.Err(); err != nil {
		return TargetPolicyAuthorityResolution{}, err
	}
	if policy == nil || !sameDocumentRevisionSet(
		candidate.PartitionRevisions.DocumentRevisions,
		revisions,
	) {
		return TargetPolicyAuthorityResolution{}, targetPolicyAuthorityFailure()
	}
	if candidate.PolicyRevision != policy.ContentRev {
		return TargetPolicyAuthorityResolution{}, targetPolicyAuthorityFailure()
	}
	if err := verificationcontract.ValidateDocument(
		"verification-policy",
		policy.ID,
		policy.Content,
	); err != nil {
		return TargetPolicyAuthorityResolution{}, targetPolicyAuthorityFailure()
	}

	normalized, projection, err := normalizePersistedVerificationPolicy(policy.Content)
	if err != nil {
		return TargetPolicyAuthorityResolution{}, targetPolicyAuthorityFailure()
	}
	policyDigest, _, err := canonicalDigest(normalized)
	if err != nil {
		return TargetPolicyAuthorityResolution{}, targetPolicyAuthorityFailure()
	}
	if candidate.PolicyDigest != policyDigest ||
		candidate.Redaction.TargetPolicy.Authority != "verification-policy" ||
		candidate.Redaction.TargetPolicy.PolicyDigest != policyDigest ||
		candidate.Redaction.TargetPolicy.SemanticTargetID != candidate.TargetID {
		return TargetPolicyAuthorityResolution{}, targetPolicyAuthorityFailure()
	}
	if !validAuthoritativeRetentionRequest(projection.RetentionRequest) {
		return TargetPolicyAuthorityResolution{}, targetPolicyAuthorityFailure()
	}
	expectedCapture, ok := verificationTargetCapture(projection, candidate.TargetID)
	if !ok || candidate.Redaction.TargetPolicy.Capture != expectedCapture {
		return TargetPolicyAuthorityResolution{}, targetPolicyAuthorityFailure()
	}
	maximumRecords := projection.Budgets.MaximumClosureEvidenceRecords
	if maximumRecords < 1 || maximumRecords > maximumClosureEvidenceRecords {
		return TargetPolicyAuthorityResolution{}, targetPolicyAuthorityFailure()
	}

	allowedMismatchFields := append(
		[]string(nil),
		projection.Comparison.AllowedMismatchFields...,
	)
	sort.Strings(allowedMismatchFields)
	resolution := TargetPolicyAuthorityResolution{
		Authority:      "verification-policy",
		PolicyID:       policy.ID,
		PolicyRevision: policy.ContentRev,
		PolicyDigest:   policyDigest,
		TargetPolicy: TargetPolicy{
			Authority:        "verification-policy",
			PolicyDigest:     policyDigest,
			SemanticTargetID: candidate.TargetID,
			Capture:          expectedCapture,
		},
		RetentionRequest:              projection.RetentionRequest,
		MaximumClosureEvidenceRecords: maximumRecords,
		Comparison: TargetPolicyComparison{
			Authority:             "verification-policy",
			PolicyID:              policy.ID,
			PolicyDigest:          policyDigest,
			AllowedMismatchFields: allowedMismatchFields,
		},
	}
	if err := tx.Commit(); err != nil {
		return TargetPolicyAuthorityResolution{}, err
	}
	return resolution, nil
}

func (authority *PostgreSQLTargetPolicyAuthority) ResolveComparisonPolicy(
	ctx context.Context,
	workspaceID string,
) (TargetPolicyComparison, error) {
	if authority == nil || authority.db == nil {
		return TargetPolicyComparison{}, errors.New("verification target policy authority is unavailable")
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := authority.db.BeginTx(ctx, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  true,
	})
	if err != nil {
		return TargetPolicyComparison{}, err
	}
	defer func() { _ = tx.Rollback() }()
	var policyID string
	var payload json.RawMessage
	rows, err := tx.QueryContext(ctx, `SELECT d.id, d.content_json
FROM workspace_documents d
JOIN workspaces w ON w.id = d.workspace_id
WHERE d.workspace_id = $1 AND d.doc_type = 'verification-policy'
ORDER BY d.id`, workspaceID)
	if err != nil {
		return TargetPolicyComparison{}, err
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		count++
		if err := rows.Scan(&policyID, &payload); err != nil {
			return TargetPolicyComparison{}, err
		}
	}
	if err := rows.Err(); err != nil {
		return TargetPolicyComparison{}, err
	}
	if count != 1 {
		return TargetPolicyComparison{}, targetPolicyAuthorityFailure()
	}
	if err := verificationcontract.ValidateDocument(
		"verification-policy",
		policyID,
		payload,
	); err != nil {
		return TargetPolicyComparison{}, targetPolicyAuthorityFailure()
	}
	normalized, projection, err := normalizePersistedVerificationPolicy(payload)
	if err != nil {
		return TargetPolicyComparison{}, targetPolicyAuthorityFailure()
	}
	policyDigest, _, err := canonicalDigest(normalized)
	if err != nil {
		return TargetPolicyComparison{}, targetPolicyAuthorityFailure()
	}
	allowedMismatchFields := append(
		[]string(nil),
		projection.Comparison.AllowedMismatchFields...,
	)
	sort.Strings(allowedMismatchFields)
	result := TargetPolicyComparison{
		Authority:             "verification-policy",
		PolicyID:              policyID,
		PolicyDigest:          policyDigest,
		AllowedMismatchFields: allowedMismatchFields,
	}
	if err := tx.Commit(); err != nil {
		return TargetPolicyComparison{}, err
	}
	return result, nil
}

func targetPolicyAuthorityFailure() error {
	return coded(
		"VER-5001",
		"Evidence candidate does not match the current authoritative VerificationPolicy.",
		ErrInvalid,
	)
}

func validateTargetPolicyAuthorityResolution(
	candidate EvidenceCandidate,
	resolution TargetPolicyAuthorityResolution,
) error {
	if resolution.Authority != "verification-policy" ||
		resolution.PolicyRevision != candidate.PolicyRevision ||
		resolution.PolicyDigest != candidate.PolicyDigest ||
		resolution.TargetPolicy != candidate.Redaction.TargetPolicy ||
		!validAuthoritativeRetentionRequest(resolution.RetentionRequest) ||
		resolution.MaximumClosureEvidenceRecords < 1 ||
		resolution.MaximumClosureEvidenceRecords > maximumClosureEvidenceRecords ||
		resolution.Comparison.Authority != resolution.Authority ||
		resolution.Comparison.PolicyID != resolution.PolicyID ||
		resolution.Comparison.PolicyDigest != resolution.PolicyDigest {
		return targetPolicyAuthorityFailure()
	}
	return validateTargetPolicyComparison(resolution.Comparison)
}

func validAuthoritativeRetentionRequest(request AuthoritativeRetentionRequest) bool {
	return validCandidateRetentionClass(request.Successful) &&
		validCandidateRetentionClass(request.Failed)
}

func validCandidateRetentionClass(value RetentionClass) bool {
	return value == RetentionSession ||
		value == RetentionChange ||
		value == RetentionRelease
}

func authoritativeRetentionForOutcome(
	request AuthoritativeRetentionRequest,
	outcome string,
) (RetentionClass, bool) {
	if !validAuthoritativeRetentionRequest(request) {
		return "", false
	}
	if outcome == "passed" {
		return request.Successful, true
	}
	switch outcome {
	case "failed", "blocked", "cancelled", "infrastructure-error":
		return request.Failed, true
	default:
		return "", false
	}
}

func validateTargetPolicyComparison(policy TargetPolicyComparison) error {
	if policy.Authority != "verification-policy" ||
		validateIdentifier(policy.PolicyID, "comparison policy id") != nil ||
		!digestPattern.MatchString(policy.PolicyDigest) {
		return targetPolicyAuthorityFailure()
	}
	fields, err := sortedUnique(policy.AllowedMismatchFields)
	if err != nil || len(fields) != len(policy.AllowedMismatchFields) {
		return targetPolicyAuthorityFailure()
	}
	for index := range fields {
		if fields[index] != policy.AllowedMismatchFields[index] {
			return targetPolicyAuthorityFailure()
		}
	}
	return nil
}

func sameDocumentRevisionSet(left map[string]DocumentRevision, right map[string]DocumentRevision) bool {
	if len(left) != len(right) {
		return false
	}
	for documentID, revision := range left {
		if right[documentID] != revision {
			return false
		}
	}
	return true
}

func normalizePersistedVerificationPolicy(
	payload json.RawMessage,
) (map[string]any, persistedVerificationPolicyProjection, error) {
	var document map[string]any
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	if err := decoder.Decode(&document); err != nil {
		return nil, persistedVerificationPolicyProjection{}, err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err != nil {
			return nil, persistedVerificationPolicyProjection{}, err
		}
		return nil, persistedVerificationPolicyProjection{}, errors.New("verification policy contains trailing JSON")
	}
	delete(document, "wireVersion")

	rules, err := objectArray(document, "rules")
	if err != nil {
		return nil, persistedVerificationPolicyProjection{}, err
	}
	for _, rule := range rules {
		for _, field := range []string{
			"checkKinds",
			"scenarioIds",
			"scenarioTags",
			"criticalities",
			"impactedDomains",
			"riskFlags",
		} {
			if err := sortStringArray(rule, field); err != nil {
				return nil, persistedVerificationPolicyProjection{}, err
			}
		}
	}
	sortObjectsByStringField(rules, "id")
	setObjectArray(document, "rules", rules)

	matrixProfiles, err := objectArray(document, "matrixProfiles")
	if err != nil {
		return nil, persistedVerificationPolicyProjection{}, err
	}
	for _, profile := range matrixProfiles {
		matrix, ok := profile["matrix"].(map[string]any)
		if !ok {
			return nil, persistedVerificationPolicyProjection{}, errors.New("verification matrix is invalid")
		}
		for _, field := range []string{
			"frameworkTargets",
			"surfaces",
			"browserEngines",
			"colorSchemes",
			"motions",
			"locales",
		} {
			if err := sortStringArray(matrix, field); err != nil {
				return nil, persistedVerificationPolicyProjection{}, err
			}
		}
		viewports, err := objectArray(matrix, "viewports")
		if err != nil {
			return nil, persistedVerificationPolicyProjection{}, err
		}
		sortObjectsByStringField(viewports, "id")
		setObjectArray(matrix, "viewports", viewports)
	}
	sortObjectsByStringField(matrixProfiles, "id")
	setObjectArray(document, "matrixProfiles", matrixProfiles)

	retryPolicies, err := objectArray(document, "retryPolicies")
	if err != nil {
		return nil, persistedVerificationPolicyProjection{}, err
	}
	for _, retryPolicy := range retryPolicies {
		if err := sortStringArray(retryPolicy, "retryableOutcomes"); err != nil {
			return nil, persistedVerificationPolicyProjection{}, err
		}
	}
	sortObjectsByStringField(retryPolicies, "id")
	setObjectArray(document, "retryPolicies", retryPolicies)

	exemptions, err := objectArray(document, "exemptions")
	if err != nil {
		return nil, persistedVerificationPolicyProjection{}, err
	}
	sortObjectsByStringField(exemptions, "id")
	setObjectArray(document, "exemptions", exemptions)

	artifactCapture, ok := document["artifactCapture"].(map[string]any)
	if !ok {
		return nil, persistedVerificationPolicyProjection{}, errors.New("verification artifact capture policy is invalid")
	}
	captureTargets, err := objectArray(artifactCapture, "targets")
	if err != nil {
		return nil, persistedVerificationPolicyProjection{}, err
	}
	sortObjectsByStringField(captureTargets, "targetId")
	setObjectArray(artifactCapture, "targets", captureTargets)

	comparison, ok := document["comparison"].(map[string]any)
	if !ok {
		return nil, persistedVerificationPolicyProjection{}, errors.New("verification comparison policy is invalid")
	}
	if err := sortStringArray(comparison, "allowedMismatchFields"); err != nil {
		return nil, persistedVerificationPolicyProjection{}, err
	}

	evidenceRequirements, ok := document["evidenceRequirements"].(map[string]any)
	if !ok {
		return nil, persistedVerificationPolicyProjection{}, errors.New("verification evidence requirements are invalid")
	}
	for _, field := range []string{"acceptedTrust", "requiredArtifactKinds"} {
		if err := sortStringArray(evidenceRequirements, field); err != nil {
			return nil, persistedVerificationPolicyProjection{}, err
		}
	}

	normalizedBytes, err := canonicalBytes(document)
	if err != nil {
		return nil, persistedVerificationPolicyProjection{}, err
	}
	wireBytes, err := canonicalBytes(func() map[string]any {
		wire := make(map[string]any, len(document)+1)
		for key, value := range document {
			wire[key] = value
		}
		wire["wireVersion"] = 1
		return wire
	}())
	if err != nil {
		return nil, persistedVerificationPolicyProjection{}, err
	}
	var projection persistedVerificationPolicyProjection
	if err := json.Unmarshal(wireBytes, &projection); err != nil {
		return nil, persistedVerificationPolicyProjection{}, err
	}
	var normalized map[string]any
	decoder = json.NewDecoder(bytes.NewReader(normalizedBytes))
	decoder.UseNumber()
	if err := decoder.Decode(&normalized); err != nil {
		return nil, persistedVerificationPolicyProjection{}, err
	}
	return normalized, projection, nil
}

func objectArray(document map[string]any, field string) ([]map[string]any, error) {
	values, ok := document[field].([]any)
	if !ok {
		return nil, fmt.Errorf("verification policy field %s must be an array", field)
	}
	objects := make([]map[string]any, 0, len(values))
	for _, value := range values {
		object, ok := value.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("verification policy field %s must contain objects", field)
		}
		objects = append(objects, object)
	}
	return objects, nil
}

func setObjectArray(document map[string]any, field string, objects []map[string]any) {
	values := make([]any, len(objects))
	for index, object := range objects {
		values[index] = object
	}
	document[field] = values
}

func sortObjectsByStringField(objects []map[string]any, field string) {
	sort.Slice(objects, func(left int, right int) bool {
		leftValue, _ := objects[left][field].(string)
		rightValue, _ := objects[right][field].(string)
		return leftValue < rightValue
	})
}

func sortStringArray(document map[string]any, field string) error {
	values, ok := document[field].([]any)
	if !ok {
		return fmt.Errorf("verification policy field %s must be an array", field)
	}
	strings := make([]string, 0, len(values))
	for _, value := range values {
		text, ok := value.(string)
		if !ok {
			return fmt.Errorf("verification policy field %s must contain strings", field)
		}
		strings = append(strings, text)
	}
	sort.Strings(strings)
	for index, value := range strings {
		values[index] = value
	}
	return nil
}

func verificationTargetCapture(
	policy persistedVerificationPolicyProjection,
	targetID string,
) (string, bool) {
	if policy.ArtifactCapture.DefaultCapture != "allowed" &&
		policy.ArtifactCapture.DefaultCapture != "masked" &&
		policy.ArtifactCapture.DefaultCapture != "forbidden-sensitive" {
		return "", false
	}
	capture := policy.ArtifactCapture.DefaultCapture
	seen := make(map[string]struct{}, len(policy.ArtifactCapture.Targets))
	for _, target := range policy.ArtifactCapture.Targets {
		if _, exists := seen[target.TargetID]; exists {
			return "", false
		}
		seen[target.TargetID] = struct{}{}
		if target.Capture != "allowed" &&
			target.Capture != "masked" &&
			target.Capture != "forbidden-sensitive" {
			return "", false
		}
		if target.TargetID == targetID {
			capture = target.Capture
		}
	}
	return capture, true
}
