package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

// EvaluationVerificationAttemptGrantReceiptRecord is the durable, offline-
// verifiable bridge between one frozen evaluation descriptor and one real G3
// Verification AttemptGrant. It exists before the terminal attempt fact.
type EvaluationVerificationAttemptGrantReceiptRecord struct {
	NamespaceID                    string
	EvaluationPlanDigest           string
	RepositoryCommit               string
	AttemptID                      string
	DescriptorDigest               string
	CapabilityDescriptorDigest     string
	CaseID                         string
	Generation                     int64
	WorkspaceID                    string
	WorkspaceRevision              int64
	VerificationPlanDigest         string
	CellID                         string
	RequestDigest                  string
	RequestBytes                   []byte
	IssuanceBindingDigest          string
	VerificationAttemptGrantID     string
	VerificationAttemptGrantDigest string
	ReceiptDigest                  string
	ReceiptBytes                   []byte
	IssuedAt                       time.Time
	ExpiresAt                      time.Time
}

func decodeEvaluationVerificationAttemptGrantReceipt(
	source []byte,
) (evaluationVerificationAttemptGrantReceipt, []byte, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil {
		return evaluationVerificationAttemptGrantReceipt{}, nil, err
	}
	if !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "evaluationPlanDigest", "repositoryCommit",
		"evaluationAttemptId", "descriptorDigest", "capabilityDescriptorDigest", "caseId",
		"generation", "verificationPlanDigest", "cellId", "requestDigest",
		"issuanceBindingDigest", "grant", "receiptDigest",
	}) || value["format"] != evaluationVerificationAttemptGrantReceiptFormat {
		return evaluationVerificationAttemptGrantReceipt{}, nil, invalid("evaluation Verification AttemptGrant receipt shape is invalid")
	}
	version, versionOK := integerMember(value, "version")
	grantValue, grantOK := objectMember(value, "grant")
	retention, retentionOK := objectMember(grantValue, "retentionRequest")
	if !versionOK || version != evaluationVerificationAttemptGrantVersion || !grantOK || !retentionOK ||
		!exactEvaluationKeys(grantValue, []string{
			"grantId", "grantDigest", "workspaceId", "projectId", "workspaceRevision",
			"partitionRevisionsDigest", "policyRevision", "policyDigest", "policyEvaluationInstant",
			"impactDigest", "verificationPlanDigest", "cellId", "checkId", "checkKind", "targetId",
			"attemptId", "runId", "providerId", "producerId", "trustCeiling", "retentionRequest",
			"maximumClosureEvidenceRecords", "issuedBy", "issuedAt", "expiresAt",
		}, "jobId", "sessionId") ||
		!exactEvaluationKeys(retention, []string{"successful", "failed", "protectReleaseEvidence"}) {
		return evaluationVerificationAttemptGrantReceipt{}, nil, invalid("evaluation Verification AttemptGrant nested shape is invalid")
	}
	var receipt evaluationVerificationAttemptGrantReceipt
	if err := json.Unmarshal(canonical, &receipt); err != nil {
		return evaluationVerificationAttemptGrantReceipt{}, nil, invalid("evaluation Verification AttemptGrant receipt is malformed")
	}
	for _, identity := range []string{
		receipt.NamespaceID, receipt.EvaluationAttemptID, receipt.CaseID, receipt.CellID,
		receipt.Grant.GrantID, receipt.Grant.WorkspaceID, receipt.Grant.ProjectID,
		receipt.Grant.CheckID, receipt.Grant.TargetID, receipt.Grant.AttemptID,
		receipt.Grant.RunID, receipt.Grant.ProviderID, receipt.Grant.ProducerID,
		receipt.Grant.IssuedBy,
	} {
		if _, err := evaluationAuthenticityIdentity(identity, "Verification AttemptGrant identity"); err != nil {
			return evaluationVerificationAttemptGrantReceipt{}, nil, err
		}
	}
	for _, optionalIdentity := range []string{receipt.Grant.JobID, receipt.Grant.SessionID} {
		if optionalIdentity != "" {
			if _, err := evaluationAuthenticityIdentity(optionalIdentity, "Verification AttemptGrant optional identity"); err != nil {
				return evaluationVerificationAttemptGrantReceipt{}, nil, err
			}
		}
	}
	for _, digest := range []string{
		receipt.EvaluationPlanDigest, receipt.DescriptorDigest, receipt.CapabilityDescriptorDigest,
		receipt.VerificationPlanDigest, receipt.RequestDigest, receipt.IssuanceBindingDigest,
		receipt.Grant.GrantDigest, receipt.Grant.PartitionRevisionsDigest, receipt.Grant.PolicyDigest,
		receipt.Grant.ImpactDigest, receipt.ReceiptDigest,
	} {
		if !evaluationDigestPattern.MatchString(digest) {
			return evaluationVerificationAttemptGrantReceipt{}, nil, invalid("evaluation Verification AttemptGrant digest is invalid")
		}
	}
	issuedAt, issuedAtErr := parseEvaluationServiceInstant(receipt.Grant.IssuedAt)
	expiresAt, expiresAtErr := parseEvaluationServiceInstant(receipt.Grant.ExpiresAt)
	_, policyAtErr := parseEvaluationServiceInstant(receipt.Grant.PolicyEvaluationInstant)
	workspaceRevision := receipt.Grant.WorkspaceRevision
	policyRevision := receipt.Grant.PolicyRevision
	maximumRecords := receipt.Grant.MaximumClosureEvidenceRecords
	protectReleaseEvidence, protectOK := retention["protectReleaseEvidence"].(bool)
	_ = protectReleaseEvidence
	computedReceiptDigest, receiptDigestErr := canonicaljson.Digest(receipt.evaluationVerificationAttemptGrantReceiptBase)
	computedGrantDigest, grantDigestErr := evaluationVerificationAttemptGrantDigest(receipt.Grant)
	binding := evaluationVerificationAttemptGrantBinding{
		NamespaceID: receipt.NamespaceID, EvaluationPlanDigest: receipt.EvaluationPlanDigest,
		RepositoryCommit: receipt.RepositoryCommit, EvaluationAttemptID: receipt.EvaluationAttemptID,
		DescriptorDigest: receipt.DescriptorDigest, CapabilityDescriptorDigest: receipt.CapabilityDescriptorDigest,
		CaseID: receipt.CaseID, Generation: receipt.Generation,
		WorkspaceID: receipt.Grant.WorkspaceID, WorkspaceRevision: receipt.Grant.WorkspaceRevision,
		ProjectID: receipt.Grant.ProjectID, VerificationPlanDigest: receipt.VerificationPlanDigest,
		CellID: receipt.CellID,
	}
	computedBindingDigest, bindingDigestErr := canonicaljson.Digest(binding)
	if !evaluationRepositoryCommitPattern.MatchString(receipt.RepositoryCommit) || receipt.Generation < 1 ||
		workspaceRevision < 1 || policyRevision < 1 || maximumRecords < 1 || maximumRecords > 1_000 ||
		issuedAtErr != nil || expiresAtErr != nil || policyAtErr != nil || !expiresAt.After(issuedAt) ||
		!protectOK || !oneOfString(receipt.Grant.CheckKind, "diagnostics", "build", "unit", "integration", "e2e", "visual", "accessibility", "performance", "security") ||
		!oneOfString(string(receipt.Grant.TrustCeiling), "local-unattested", "remote-attested", "ci-attested") ||
		!oneOfString(string(receipt.Grant.RetentionRequest.Successful), "session", "change", "release") ||
		!oneOfString(string(receipt.Grant.RetentionRequest.Failed), "session", "change", "release") ||
		receipt.Grant.ProducerID != evaluationVerificationAttemptGrantProducerID ||
		receipt.Grant.VerificationPlanDigest != receipt.VerificationPlanDigest || receipt.Grant.CellID != receipt.CellID ||
		receipt.Grant.AttemptID != receipt.EvaluationAttemptID ||
		receipt.Grant.GrantID != "attempt-grant-"+receipt.Grant.GrantDigest[len("sha256-"):] ||
		receipt.Grant.GrantDigest != computedGrantDigest || grantDigestErr != nil ||
		receipt.IssuanceBindingDigest != computedBindingDigest || bindingDigestErr != nil ||
		receipt.ReceiptDigest != computedReceiptDigest || receiptDigestErr != nil {
		return evaluationVerificationAttemptGrantReceipt{}, nil, invalid("evaluation Verification AttemptGrant receipt binding or digest is invalid")
	}
	return receipt, canonical, nil
}

func decodeEvaluationVerificationAttemptGrantRecord(
	source []byte,
) (EvaluationVerificationAttemptGrantReceiptRecord, error) {
	receipt, canonical, err := decodeEvaluationVerificationAttemptGrantReceipt(source)
	if err != nil {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, err
	}
	issuedAt, _ := parseEvaluationServiceInstant(receipt.Grant.IssuedAt)
	expiresAt, _ := parseEvaluationServiceInstant(receipt.Grant.ExpiresAt)
	return EvaluationVerificationAttemptGrantReceiptRecord{
		NamespaceID: receipt.NamespaceID, EvaluationPlanDigest: receipt.EvaluationPlanDigest,
		RepositoryCommit: receipt.RepositoryCommit, AttemptID: receipt.EvaluationAttemptID,
		DescriptorDigest: receipt.DescriptorDigest, CapabilityDescriptorDigest: receipt.CapabilityDescriptorDigest,
		CaseID: receipt.CaseID, Generation: receipt.Generation,
		WorkspaceID: receipt.Grant.WorkspaceID, WorkspaceRevision: receipt.Grant.WorkspaceRevision,
		VerificationPlanDigest: receipt.VerificationPlanDigest, CellID: receipt.CellID,
		RequestDigest: receipt.RequestDigest, IssuanceBindingDigest: receipt.IssuanceBindingDigest,
		VerificationAttemptGrantID:     receipt.Grant.GrantID,
		VerificationAttemptGrantDigest: receipt.Grant.GrantDigest,
		ReceiptDigest:                  receipt.ReceiptDigest, ReceiptBytes: canonical,
		IssuedAt: issuedAt, ExpiresAt: expiresAt,
	}, nil
}

type evaluationVerificationAttemptGrantReceiptStore interface {
	StoreEvaluationVerificationAttemptGrantReceipt(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		evaluationVerificationAttemptGrantIssue,
		evaluationVerificationAttemptGrantReceipt,
	) (EvaluationVerificationAttemptGrantReceiptRecord, bool, error)
}

type evaluationVerificationAttemptGrantReceiptReader interface {
	GetEvaluationVerificationAttemptGrantReceipt(
		context.Context, EvaluationAuthority, EvaluationPlanPartition, string,
	) (EvaluationVerificationAttemptGrantReceiptRecord, error)
	ListEvaluationVerificationAttemptGrantReceipts(
		context.Context, EvaluationAuthority, EvaluationPlanPartition,
	) ([]EvaluationVerificationAttemptGrantReceiptRecord, error)
}

func evaluationVerificationAttemptGrantDigest(
	grant evaluationVerificationAttemptGrant,
) (string, error) {
	return canonicaljson.Digest(struct {
		Format                        string `json:"format"`
		Version                       int    `json:"version"`
		WorkspaceID                   string `json:"workspaceId"`
		ProjectID                     string `json:"projectId"`
		WorkspaceRevision             int64  `json:"workspaceRevision"`
		PartitionRevisionsDigest      string `json:"partitionRevisionsDigest"`
		PolicyRevision                int64  `json:"policyRevision"`
		PolicyDigest                  string `json:"policyDigest"`
		PolicyEvaluationInstant       string `json:"policyEvaluationInstant"`
		ImpactDigest                  string `json:"impactDigest"`
		PlanDigest                    string `json:"planDigest"`
		CellID                        string `json:"cellId"`
		CheckID                       string `json:"checkId"`
		CheckKind                     string `json:"checkKind"`
		TargetID                      string `json:"targetId"`
		AttemptID                     string `json:"attemptId"`
		RunID                         string `json:"runId"`
		ProviderID                    string `json:"providerId"`
		JobID                         string `json:"jobId,omitempty"`
		SessionID                     string `json:"sessionId,omitempty"`
		ProducerID                    string `json:"producerId"`
		TrustCeiling                  string `json:"trustCeiling"`
		RetentionRequest              any    `json:"retentionRequest"`
		MaximumClosureEvidenceRecords int    `json:"maximumClosureEvidenceRecords"`
		IssuedBy                      string `json:"issuedBy"`
		IssuedAt                      string `json:"issuedAt"`
		ExpiresAt                     string `json:"expiresAt"`
	}{
		Format: "prodivix.verification-attempt-grant", Version: 1,
		WorkspaceID: grant.WorkspaceID, ProjectID: grant.ProjectID,
		WorkspaceRevision: grant.WorkspaceRevision, PartitionRevisionsDigest: grant.PartitionRevisionsDigest,
		PolicyRevision: grant.PolicyRevision, PolicyDigest: grant.PolicyDigest,
		PolicyEvaluationInstant: grant.PolicyEvaluationInstant, ImpactDigest: grant.ImpactDigest,
		PlanDigest: grant.VerificationPlanDigest, CellID: grant.CellID, CheckID: grant.CheckID,
		CheckKind: grant.CheckKind, TargetID: grant.TargetID, AttemptID: grant.AttemptID,
		RunID: grant.RunID, ProviderID: grant.ProviderID, JobID: grant.JobID, SessionID: grant.SessionID,
		ProducerID: grant.ProducerID, TrustCeiling: string(grant.TrustCeiling),
		RetentionRequest:              grant.RetentionRequest,
		MaximumClosureEvidenceRecords: grant.MaximumClosureEvidenceRecords,
		IssuedBy:                      grant.IssuedBy, IssuedAt: grant.IssuedAt, ExpiresAt: grant.ExpiresAt,
	})
}

func validateEvaluationVerificationAttemptGrantReceipt(
	partition EvaluationPlanPartition,
	issue evaluationVerificationAttemptGrantIssue,
	receipt evaluationVerificationAttemptGrantReceipt,
) ([]byte, []byte, error) {
	requestDigest, requestDigestErr := canonicaljson.Digest(issue.base())
	bindingDigest, bindingDigestErr := canonicaljson.Digest(issue.binding())
	receiptDigest, receiptDigestErr := canonicaljson.Digest(receipt.evaluationVerificationAttemptGrantReceiptBase)
	grantDigest, grantDigestErr := evaluationVerificationAttemptGrantDigest(receipt.Grant)
	requestBytes, requestBytesErr := canonicaljson.Bytes(issue.base())
	receiptBytes, receiptBytesErr := canonicaljson.Bytes(receipt)
	issuedAt, issuedAtErr := parseEvaluationServiceInstant(receipt.Grant.IssuedAt)
	expiresAt, expiresAtErr := parseEvaluationServiceInstant(receipt.Grant.ExpiresAt)
	grantIdentityValid := evaluationDigestPattern.MatchString(receipt.Grant.GrantDigest) &&
		receipt.Grant.GrantID == "attempt-grant-"+receipt.Grant.GrantDigest[len("sha256-"):]
	if requestDigestErr != nil || bindingDigestErr != nil || receiptDigestErr != nil ||
		grantDigestErr != nil || requestBytesErr != nil || receiptBytesErr != nil ||
		issuedAtErr != nil || expiresAtErr != nil ||
		issue.EvaluationPlanDigest != partition.PlanDigest || issue.RepositoryCommit != partition.RepositoryCommit ||
		issue.RequestDigest != requestDigest || receipt.RequestDigest != requestDigest ||
		receipt.EvaluationPlanDigest != issue.EvaluationPlanDigest ||
		receipt.NamespaceID != issue.NamespaceID ||
		receipt.RepositoryCommit != issue.RepositoryCommit ||
		receipt.EvaluationAttemptID != issue.EvaluationAttemptID ||
		receipt.DescriptorDigest != issue.DescriptorDigest ||
		receipt.CapabilityDescriptorDigest != issue.CapabilityDescriptorDigest ||
		receipt.CaseID != issue.CaseID || receipt.Generation != issue.Generation ||
		receipt.VerificationPlanDigest != issue.VerificationPlanDigest || receipt.CellID != issue.CellID ||
		receipt.IssuanceBindingDigest != bindingDigest || receipt.ReceiptDigest != receiptDigest ||
		receipt.Grant.GrantDigest != grantDigest || !grantIdentityValid ||
		receipt.Grant.AttemptID != issue.EvaluationAttemptID ||
		receipt.Grant.WorkspaceID != issue.WorkspaceID ||
		receipt.Grant.ProjectID != issue.ProjectID ||
		receipt.Grant.WorkspaceRevision != issue.WorkspaceRevision ||
		receipt.Grant.VerificationPlanDigest != issue.VerificationPlanDigest ||
		receipt.Grant.CellID != issue.CellID || receipt.Grant.RunID != issue.Run.RunID ||
		receipt.Grant.ProviderID != issue.Run.ProviderID || receipt.Grant.JobID != issue.Run.JobID ||
		receipt.Grant.SessionID != issue.Run.SessionID || receipt.Grant.TrustCeiling != issue.TrustCeiling ||
		receipt.Grant.ExpiresAt != issue.ExpiresAt || receipt.Grant.ProducerID != evaluationVerificationAttemptGrantProducerID ||
		!expiresAt.After(issuedAt) {
		return nil, nil, ErrInvalid
	}
	return requestBytes, receiptBytes, nil
}

func evaluationVerificationAttemptGrantReceiptRecord(
	namespaceID string,
	partition EvaluationPlanPartition,
	issue evaluationVerificationAttemptGrantIssue,
	receipt evaluationVerificationAttemptGrantReceipt,
	requestBytes []byte,
	receiptBytes []byte,
) EvaluationVerificationAttemptGrantReceiptRecord {
	issuedAt, _ := parseEvaluationServiceInstant(receipt.Grant.IssuedAt)
	expiresAt, _ := parseEvaluationServiceInstant(receipt.Grant.ExpiresAt)
	return EvaluationVerificationAttemptGrantReceiptRecord{
		NamespaceID: namespaceID, EvaluationPlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, AttemptID: issue.EvaluationAttemptID,
		DescriptorDigest: issue.DescriptorDigest, CapabilityDescriptorDigest: issue.CapabilityDescriptorDigest,
		CaseID:     issue.CaseID,
		Generation: issue.Generation, WorkspaceID: issue.WorkspaceID, WorkspaceRevision: issue.WorkspaceRevision,
		VerificationPlanDigest: issue.VerificationPlanDigest, CellID: issue.CellID,
		RequestDigest: issue.RequestDigest, RequestBytes: append([]byte(nil), requestBytes...),
		IssuanceBindingDigest:          receipt.IssuanceBindingDigest,
		VerificationAttemptGrantID:     receipt.Grant.GrantID,
		VerificationAttemptGrantDigest: receipt.Grant.GrantDigest,
		ReceiptDigest:                  receipt.ReceiptDigest, ReceiptBytes: append([]byte(nil), receiptBytes...),
		IssuedAt: issuedAt, ExpiresAt: expiresAt,
	}
}

func (repository *Repository) StoreEvaluationVerificationAttemptGrantReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	issue evaluationVerificationAttemptGrantIssue,
	receipt evaluationVerificationAttemptGrantReceipt,
) (EvaluationVerificationAttemptGrantReceiptRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, false, err
	}
	if err := validateEvaluationPartition(partition); err != nil || issue.NamespaceID != authority.NamespaceID {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, false, ErrInvalid
	}
	requestBytes, receiptBytes, err := validateEvaluationVerificationAttemptGrantReceipt(partition, issue, receipt)
	if err != nil {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, false, err
	}
	record := evaluationVerificationAttemptGrantReceiptRecord(
		authority.NamespaceID, partition, issue, receipt, requestBytes, receiptBytes,
	)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `INSERT INTO agent_evaluation_verification_attempt_grant_receipts (
		namespace_id, evaluation_plan_digest, repository_commit, attempt_id, descriptor_digest,
		capability_descriptor_digest, generation, workspace_id, workspace_revision,
		verification_plan_digest, cell_id, request_digest, request_json, request_bytes,
		issuance_binding_digest, verification_attempt_grant_id, verification_attempt_grant_digest,
		receipt_digest, receipt_json, receipt_bytes, issued_at, expires_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22)
	ON CONFLICT DO NOTHING`, record.NamespaceID, record.EvaluationPlanDigest, record.RepositoryCommit,
		record.AttemptID, record.DescriptorDigest, record.CapabilityDescriptorDigest, record.Generation,
		record.WorkspaceID, record.WorkspaceRevision, record.VerificationPlanDigest, record.CellID,
		record.RequestDigest, string(record.RequestBytes), record.RequestBytes, record.IssuanceBindingDigest,
		record.VerificationAttemptGrantID, record.VerificationAttemptGrantDigest, record.ReceiptDigest,
		string(record.ReceiptBytes), record.ReceiptBytes, record.IssuedAt, record.ExpiresAt)
	if err != nil {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, false, err
	}
	if inserted == 1 {
		return record, false, nil
	}
	var existingRequest, existingReceipt []byte
	if err := repository.db.QueryRowContext(ctx, `SELECT request_bytes, receipt_bytes
		FROM agent_evaluation_verification_attempt_grant_receipts
		WHERE namespace_id=$1 AND evaluation_plan_digest=$2 AND attempt_id=$3 AND generation=$4
			AND verification_plan_digest=$5 AND cell_id=$6`, record.NamespaceID, record.EvaluationPlanDigest,
		record.AttemptID, record.Generation, record.VerificationPlanDigest, record.CellID).
		Scan(&existingRequest, &existingReceipt); errors.Is(err, sql.ErrNoRows) {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, false, ErrConflict
	} else if err != nil {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, false, err
	}
	if !bytes.Equal(existingRequest, record.RequestBytes) || !bytes.Equal(existingReceipt, record.ReceiptBytes) {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, false, conflict("evaluation Verification AttemptGrant receipt identity was reused with different immutable input")
	}
	return record, true, nil
}

func (repository *Repository) GetEvaluationVerificationAttemptGrantReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptDigest string,
) (EvaluationVerificationAttemptGrantReceiptRecord, error) {
	if err := repository.available(); err != nil {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil || !evaluationDigestPattern.MatchString(receiptDigest) {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	var record EvaluationVerificationAttemptGrantReceiptRecord
	err := repository.db.QueryRowContext(ctx, `SELECT namespace_id, evaluation_plan_digest, repository_commit,
		attempt_id, descriptor_digest, capability_descriptor_digest, generation, workspace_id,
		workspace_revision, verification_plan_digest, cell_id, request_digest, request_bytes,
		issuance_binding_digest, verification_attempt_grant_id, verification_attempt_grant_digest,
		receipt_digest, receipt_bytes, issued_at, expires_at
		FROM agent_evaluation_verification_attempt_grant_receipts
		WHERE namespace_id=$1 AND evaluation_plan_digest=$2 AND repository_commit=$3 AND receipt_digest=$4`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, receiptDigest).Scan(
		&record.NamespaceID, &record.EvaluationPlanDigest, &record.RepositoryCommit,
		&record.AttemptID, &record.DescriptorDigest, &record.CapabilityDescriptorDigest,
		&record.Generation, &record.WorkspaceID, &record.WorkspaceRevision,
		&record.VerificationPlanDigest, &record.CellID, &record.RequestDigest, &record.RequestBytes,
		&record.IssuanceBindingDigest, &record.VerificationAttemptGrantID,
		&record.VerificationAttemptGrantDigest, &record.ReceiptDigest, &record.ReceiptBytes,
		&record.IssuedAt, &record.ExpiresAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, err
	}
	receipt, _, err := decodeEvaluationVerificationAttemptGrantReceipt(record.ReceiptBytes)
	if err != nil {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, err
	}
	record.CaseID = receipt.CaseID
	if err := validatePersistedEvaluationVerificationAttemptGrantReceipt(record); err != nil {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, err
	}
	return record, nil
}

func validatePersistedEvaluationVerificationAttemptGrantReceipt(
	record EvaluationVerificationAttemptGrantReceiptRecord,
) error {
	receipt, canonical, err := decodeEvaluationVerificationAttemptGrantReceipt(record.ReceiptBytes)
	if err != nil {
		return err
	}
	request, err := decodeCanonicalEvaluationJSON(record.RequestBytes)
	if err != nil {
		return conflict("persisted evaluation Verification AttemptGrant request is invalid")
	}
	requestDigest, err := canonicaljson.Digest(request)
	if err != nil || requestDigest != record.RequestDigest ||
		!bytes.Equal(canonical, record.ReceiptBytes) ||
		receipt.NamespaceID != record.NamespaceID ||
		receipt.EvaluationPlanDigest != record.EvaluationPlanDigest ||
		receipt.RepositoryCommit != record.RepositoryCommit ||
		receipt.EvaluationAttemptID != record.AttemptID ||
		receipt.DescriptorDigest != record.DescriptorDigest ||
		receipt.CapabilityDescriptorDigest != record.CapabilityDescriptorDigest ||
		receipt.Generation != record.Generation || receipt.Grant.WorkspaceID != record.WorkspaceID ||
		receipt.Grant.WorkspaceRevision != record.WorkspaceRevision ||
		receipt.VerificationPlanDigest != record.VerificationPlanDigest || receipt.CellID != record.CellID ||
		receipt.RequestDigest != record.RequestDigest || receipt.IssuanceBindingDigest != record.IssuanceBindingDigest ||
		receipt.Grant.GrantID != record.VerificationAttemptGrantID ||
		receipt.Grant.GrantDigest != record.VerificationAttemptGrantDigest ||
		receipt.ReceiptDigest != record.ReceiptDigest {
		return conflict("persisted evaluation Verification AttemptGrant receipt metadata drifted")
	}
	issuedAt, _ := parseEvaluationServiceInstant(receipt.Grant.IssuedAt)
	expiresAt, _ := parseEvaluationServiceInstant(receipt.Grant.ExpiresAt)
	if !issuedAt.Equal(record.IssuedAt) || !expiresAt.Equal(record.ExpiresAt) {
		return conflict("persisted evaluation Verification AttemptGrant receipt time drifted")
	}
	record.CaseID = receipt.CaseID
	return nil
}

func queryEvaluationVerificationAttemptGrantReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
) ([]EvaluationVerificationAttemptGrantReceiptRecord, error) {
	condition := ""
	args := []any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}
	if attemptID != "" {
		condition = " AND attempt_id=$4"
		args = append(args, attemptID)
	}
	rows, err := queryer.QueryContext(ctx, `SELECT namespace_id, evaluation_plan_digest, repository_commit,
		attempt_id, descriptor_digest, capability_descriptor_digest, generation, workspace_id,
		workspace_revision, verification_plan_digest, cell_id, request_digest, request_bytes,
		issuance_binding_digest, verification_attempt_grant_id, verification_attempt_grant_digest,
		receipt_digest, receipt_bytes, issued_at, expires_at
		FROM agent_evaluation_verification_attempt_grant_receipts
		WHERE namespace_id=$1 AND evaluation_plan_digest=$2 AND repository_commit=$3`+condition+`
		ORDER BY attempt_id COLLATE "C", cell_id COLLATE "C", verification_attempt_grant_id COLLATE "C"`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationVerificationAttemptGrantReceiptRecord, 0)
	for rows.Next() {
		var record EvaluationVerificationAttemptGrantReceiptRecord
		if err := rows.Scan(
			&record.NamespaceID, &record.EvaluationPlanDigest, &record.RepositoryCommit,
			&record.AttemptID, &record.DescriptorDigest, &record.CapabilityDescriptorDigest,
			&record.Generation, &record.WorkspaceID, &record.WorkspaceRevision,
			&record.VerificationPlanDigest, &record.CellID, &record.RequestDigest, &record.RequestBytes,
			&record.IssuanceBindingDigest, &record.VerificationAttemptGrantID,
			&record.VerificationAttemptGrantDigest, &record.ReceiptDigest, &record.ReceiptBytes,
			&record.IssuedAt, &record.ExpiresAt,
		); err != nil {
			return nil, err
		}
		receipt, _, err := decodeEvaluationVerificationAttemptGrantReceipt(record.ReceiptBytes)
		if err != nil {
			return nil, err
		}
		record.CaseID = receipt.CaseID
		if err := validatePersistedEvaluationVerificationAttemptGrantReceipt(record); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *Repository) ListEvaluationVerificationAttemptGrantReceipts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationVerificationAttemptGrantReceiptRecord, error) {
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationVerificationAttemptGrantReceipts(
		readContext, tx, authority.NamespaceID, partition, "",
	)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return records, nil
}

func evaluationVerificationAttemptGrantReceiptSetDigest(
	records []EvaluationVerificationAttemptGrantReceiptRecord,
) (string, error) {
	ordered := append([]EvaluationVerificationAttemptGrantReceiptRecord(nil), records...)
	sort.Slice(ordered, func(left, right int) bool {
		if ordered[left].AttemptID != ordered[right].AttemptID {
			return ordered[left].AttemptID < ordered[right].AttemptID
		}
		if ordered[left].CellID != ordered[right].CellID {
			return ordered[left].CellID < ordered[right].CellID
		}
		return ordered[left].VerificationAttemptGrantID < ordered[right].VerificationAttemptGrantID
	})
	digests := make([]string, len(ordered))
	seen := make(map[string]struct{}, len(ordered))
	for index, record := range ordered {
		identity := record.AttemptID + "\x00" + record.CellID + "\x00" + record.VerificationAttemptGrantID
		if _, duplicate := seen[identity]; duplicate || !evaluationDigestPattern.MatchString(record.ReceiptDigest) {
			return "", conflict("evaluation Verification AttemptGrant receipt set contains duplicate or invalid authority")
		}
		seen[identity] = struct{}{}
		digests[index] = record.ReceiptDigest
	}
	return canonicaljson.Digest(map[string]any{
		"verificationAttemptGrantReceiptDigests": digests,
	})
}

func validateEvaluationVerificationAttemptGrantSnapshot(
	plan evaluationPlanFact,
	attemptRecords []EvaluationAttemptRecord,
	executionRecords []EvaluationExecutionReceiptRecord,
	runtimeRecords []EvaluationControlledRuntimeReceiptRecord,
	grantRecords []EvaluationVerificationAttemptGrantReceiptRecord,
	requireComplete bool,
) error {
	attempts := make(map[string]evaluationAttemptFact, len(attemptRecords))
	for _, record := range attemptRecords {
		attempt, err := decodeEvaluationAttempt(record.FactBytes)
		if err != nil {
			return err
		}
		attempts[attempt.AttemptID] = attempt
	}
	executions := make(map[string]evaluationExecutionReceipt, len(executionRecords))
	for _, record := range executionRecords {
		execution, err := decodeEvaluationExecutionReceipt(record.ReceiptBytes)
		if err != nil {
			return err
		}
		executions[execution.AttemptID] = execution
	}
	runtimes := make(map[string]evaluationControlledRuntimeReceipt, len(runtimeRecords))
	for _, record := range runtimeRecords {
		runtime, err := decodeEvaluationControlledRuntimeReceipt(record.ReceiptBytes)
		if err != nil {
			return err
		}
		runtimes[runtime.AttemptID] = runtime
	}
	byAttempt := make(map[string][]EvaluationVerificationAttemptGrantReceiptRecord)
	for _, record := range grantRecords {
		attempt, hasAttempt := attempts[record.AttemptID]
		if !hasAttempt {
			if requireComplete {
				return conflict("evaluation Verification AttemptGrant receipt is orphaned")
			}
			continue
		}
		descriptor, _ := objectMember(attempt.Value, "descriptor")
		if record.NamespaceID == "" || record.EvaluationPlanDigest != plan.PlanDigest ||
			record.RepositoryCommit != plan.RepositoryCommit || record.DescriptorDigest != attempt.DescriptorDigest ||
			record.CapabilityDescriptorDigest != stringMember(descriptor, "capabilityDescriptorDigest") ||
			record.CaseID != attempt.CaseID {
			return conflict("evaluation Verification AttemptGrant receipt drifted from the frozen attempt descriptor")
		}
		byAttempt[record.AttemptID] = append(byAttempt[record.AttemptID], record)
	}
	for attemptID, attempt := range attempts {
		records := byAttempt[attemptID]
		setDigest, err := evaluationVerificationAttemptGrantReceiptSetDigest(records)
		execution, hasExecution := executions[attemptID]
		if err != nil || !hasExecution {
			if requireComplete {
				return conflict("evaluation Verification AttemptGrant receipt set lacks execution authority")
			}
			continue
		}
		if setDigest != attempt.VerificationAttemptGrantReceiptSetDigest ||
			setDigest != execution.VerificationAttemptGrantReceiptSetDigest {
			return conflict("evaluation Verification AttemptGrant set digest drifted from attempt/execution")
		}
		runtime, hasRuntime := runtimes[attemptID]
		if !hasRuntime {
			if len(records) != 0 {
				return conflict("evaluation noncompleted attempt has Verification AttemptGrant receipts")
			}
			continue
		}
		digests := make([]any, len(records))
		for index := range records {
			digests[index] = records[index].ReceiptDigest
		}
		runtimeDigests, ok := runtime.Value["verificationAttemptGrantReceiptDigests"].([]any)
		runtimeSet := stringMember(runtime.Value, "verificationAttemptGrantReceiptSetDigest")
		if !ok || !sameEvaluationCanonicalValue(runtimeDigests, digests) ||
			(len(records) > 0) != (runtimeSet != "") || runtimeSet != func() string {
			if len(records) == 0 {
				return ""
			}
			return setDigest
		}() {
			return conflict("evaluation controlled runtime Verification AttemptGrant leaves drifted")
		}
	}
	return nil
}
