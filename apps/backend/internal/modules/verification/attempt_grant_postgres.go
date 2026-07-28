package verification

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const maximumAttemptGrantLifetime = 24 * time.Hour

func (authority *PostgreSQLAttemptGrantAuthority) IssueTrustedAttemptGrant(
	ctx context.Context,
	input TrustedAttemptGrantIssue,
) (AttemptGrantRecord, error) {
	if authority == nil || authority.db == nil || authority.targetPolicies == nil ||
		authority.now == nil {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Attempt grant authority is unavailable.",
		)
	}
	if err := validateTrustedAttemptGrantIssueIdentity(input); err != nil {
		return AttemptGrantRecord{}, err
	}
	plan, planBytes, err := decodeVerificationPlanWire(input.Plan)
	if err != nil {
		return AttemptGrantRecord{}, err
	}
	cell, err := uniqueSupportedAttemptGrantCell(plan, input.CellID)
	if err != nil {
		return AttemptGrantRecord{}, err
	}
	if err := validateIssuedRunAgainstPlanCell(input.Run, cell); err != nil {
		return AttemptGrantRecord{}, err
	}
	if !trustAllowedByPlanCell(input.TrustCeiling, cell.EvidenceRequirements) ||
		cell.ControlProfileRef.Digest == "" ||
		(cell.FixtureSetRef != nil && cell.FixtureSetRef.Digest == "") ||
		(cell.BaselineSetRef != nil && cell.BaselineSetRef.Digest == "") {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Attempt grant Plan cell is not fully digest-bound or trust-authorized.",
		)
	}
	policyCandidate := EvidenceCandidate{
		ProjectID:          input.ProjectID,
		WorkspaceID:        input.WorkspaceID,
		WorkspaceRevision:  plan.TargetRevision,
		PartitionRevisions: plan.TargetPartitionRevisions,
		PolicyRevision:     plan.PolicyRevision,
		PolicyDigest:       plan.PolicyDigest,
		TargetID:           cell.TargetID,
		Redaction: RedactionIdentity{
			TargetPolicy: cell.TargetPolicy,
		},
	}
	targetPolicy, err := authority.targetPolicies.ResolvePromotionPolicy(
		ctx,
		input.WorkspaceID,
		policyCandidate,
	)
	if err != nil {
		return AttemptGrantRecord{}, err
	}
	if err := validateTargetPolicyAuthorityResolution(
		policyCandidate,
		targetPolicy,
	); err != nil {
		return AttemptGrantRecord{}, err
	}
	if plan.WorkspaceID != input.WorkspaceID ||
		plan.PolicyRevision != targetPolicy.PolicyRevision ||
		plan.PolicyDigest != targetPolicy.PolicyDigest ||
		plan.RetentionRequest != targetPolicy.RetentionRequest ||
		cell.TargetPolicy != targetPolicy.TargetPolicy ||
		plan.Budget.ClosureEvidenceRecords >
			int64(targetPolicy.MaximumClosureEvidenceRecords) {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Attempt grant Plan drifted from the current authoritative workspace or Policy.",
		)
	}
	partitionDigest, _, err := canonicalDigest(plan.TargetPartitionRevisions)
	if err != nil {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Attempt grant partition revisions cannot be canonicalized.",
		)
	}
	policyInstant, err := parseInstant(plan.PolicyEvaluationInstant)
	if err != nil {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Attempt grant policy evaluation instant is invalid.",
		)
	}
	now := canonicalTime(authority.now())
	issuedAt := now
	expiresAt := canonicalTime(input.ExpiresAt)
	if !expiresAt.After(now) ||
		expiresAt.Sub(issuedAt) > maximumAttemptGrantLifetime {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Attempt grant lifetime is invalid.",
		)
	}
	record := AttemptGrantRecord{
		WorkspaceID:                   input.WorkspaceID,
		ProjectID:                     input.ProjectID,
		WorkspaceRevision:             plan.TargetRevision,
		PartitionRevisionsDigest:      partitionDigest,
		PolicyRevision:                plan.PolicyRevision,
		PolicyDigest:                  plan.PolicyDigest,
		PolicyEvaluationInstant:       policyInstant,
		ImpactDigest:                  plan.ImpactDigest,
		PlanDigest:                    plan.PlanDigest,
		Plan:                          plan,
		PlanBytes:                     planBytes,
		CellID:                        cell.ID,
		CheckID:                       cell.CheckID,
		CheckKind:                     cell.CheckKind,
		TargetID:                      cell.TargetID,
		AttemptID:                     input.AttemptID,
		RunID:                         input.Run.RunID,
		ProviderID:                    input.Run.ProviderID,
		JobID:                         input.Run.JobID,
		SessionID:                     input.Run.SessionID,
		ProducerID:                    input.ProducerID,
		TrustCeiling:                  input.TrustCeiling,
		RetentionRequest:              targetPolicy.RetentionRequest,
		MaximumClosureEvidenceRecords: targetPolicy.MaximumClosureEvidenceRecords,
		IssuedBy:                      input.IssuedBy,
		IssuedAt:                      issuedAt,
		ExpiresAt:                     expiresAt,
	}
	record.GrantDigest, err = attemptGrantDigest(record)
	if err != nil {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Attempt grant cannot be canonicalized.",
		)
	}
	record.ID = "attempt-grant-" + record.GrantDigest[len("sha256-"):]
	return authority.insertAttemptGrant(ctx, record)
}

func (authority *PostgreSQLAttemptGrantAuthority) ResolvePromotionAttempt(
	ctx context.Context,
	workspaceID string,
	candidate EvidenceCandidate,
	trust TrustClass,
) (AttemptGrantAuthorityResolution, error) {
	if authority == nil || authority.db == nil || authority.targetPolicies == nil ||
		authority.now == nil {
		return AttemptGrantAuthorityResolution{}, attemptGrantFailure(
			"Attempt grant authority is unavailable.",
		)
	}
	record, err := authority.loadAttemptGrantByIdentity(
		ctx,
		workspaceID,
		candidate.PlanDigest,
		candidate.CellID,
		candidate.AttemptID,
	)
	if err != nil {
		return AttemptGrantAuthorityResolution{}, err
	}
	return authority.resolveAttemptGrant(ctx, record, candidate, trust)
}

func (authority *PostgreSQLAttemptGrantAuthority) RevalidatePromotionAttempt(
	ctx context.Context,
	promotion Promotion,
) (AttemptGrantAuthorityResolution, error) {
	if authority == nil || authority.db == nil || authority.targetPolicies == nil ||
		authority.now == nil ||
		validateIdentifier(promotion.AttemptGrantID, "attempt grant id") != nil ||
		!digestPattern.MatchString(promotion.AttemptGrantDigest) {
		return AttemptGrantAuthorityResolution{}, attemptGrantFailure(
			"Persisted promotion attempt grant identity is invalid.",
		)
	}
	record, err := authority.loadAttemptGrantByID(
		ctx,
		promotion.WorkspaceID,
		promotion.AttemptGrantID,
	)
	if err != nil {
		return AttemptGrantAuthorityResolution{}, err
	}
	resolution, err := authority.resolveAttemptGrant(
		ctx,
		record,
		promotion.Candidate,
		promotion.Trust,
	)
	if err != nil {
		return AttemptGrantAuthorityResolution{}, err
	}
	if resolution.GrantDigest != promotion.AttemptGrantDigest ||
		resolution.Retention != promotion.Retention ||
		resolution.ProtectReleaseEvidence != promotion.ProtectReleaseEvidence ||
		resolution.MaximumClosureEvidenceRecords !=
			promotion.MaximumClosureEvidenceRecords ||
		!bytes.Equal(
			resolution.CanonicalPlanBytes,
			promotion.VerificationPlanBytes,
		) {
		return AttemptGrantAuthorityResolution{}, attemptGrantFailure(
			"Promotion attempt grant snapshot drifted before finalization.",
		)
	}
	if err := authority.verifyAttemptGrantClaim(
		ctx,
		record.ID,
		promotion.ID,
		promotion.CandidateDigest,
	); err != nil {
		return AttemptGrantAuthorityResolution{}, err
	}
	return resolution, nil
}

func (authority *PostgreSQLAttemptGrantAuthority) resolveAttemptGrant(
	ctx context.Context,
	record AttemptGrantRecord,
	candidate EvidenceCandidate,
	trust TrustClass,
) (AttemptGrantAuthorityResolution, error) {
	if !canonicalTime(authority.now()).Before(record.ExpiresAt) ||
		record.WorkspaceID != candidate.WorkspaceID ||
		record.ProjectID != candidate.ProjectID ||
		record.WorkspaceRevision != candidate.WorkspaceRevision ||
		record.PolicyRevision != candidate.PolicyRevision ||
		record.PolicyDigest != candidate.PolicyDigest ||
		record.ImpactDigest != candidate.ImpactDigest ||
		record.PlanDigest != candidate.PlanDigest ||
		record.CellID != candidate.CellID ||
		record.CheckID != candidate.CheckID ||
		record.CheckKind != candidate.CheckKind ||
		record.TargetID != candidate.TargetID ||
		record.AttemptID != candidate.AttemptID ||
		record.RunID != candidate.Run.RunID ||
		record.ProviderID != candidate.Run.ProviderID ||
		record.JobID != candidate.Run.JobID ||
		record.SessionID != candidate.Run.SessionID ||
		record.ProducerID != candidate.Provenance.ProducerID ||
		record.TrustCeiling != trust {
		return AttemptGrantAuthorityResolution{}, attemptGrantFailure(
			"Candidate does not match the immutable attempt grant.",
		)
	}
	startedAt, startedErr := parseInstant(candidate.Timing.StartedAt)
	completedAt, completedErr := parseInstant(candidate.Timing.CompletedAt)
	deadline, deadlineErr := parseInstant(candidate.Promotion.Deadline)
	if startedErr != nil || completedErr != nil || deadlineErr != nil ||
		startedAt.Before(record.IssuedAt) ||
		completedAt.After(record.ExpiresAt) ||
		deadline.After(record.ExpiresAt) {
		return AttemptGrantAuthorityResolution{}, attemptGrantFailure(
			"Candidate execution is outside its pre-run attempt grant.",
		)
	}
	partitionDigest, _, err := canonicalDigest(candidate.PartitionRevisions)
	if err != nil || partitionDigest != record.PartitionRevisionsDigest {
		return AttemptGrantAuthorityResolution{}, attemptGrantFailure(
			"Candidate partition revisions drifted from the attempt grant.",
		)
	}
	targetPolicy, err := authority.targetPolicies.ResolvePromotionPolicy(
		ctx,
		record.WorkspaceID,
		candidate,
	)
	if err != nil {
		return AttemptGrantAuthorityResolution{}, err
	}
	if err := validateTargetPolicyAuthorityResolution(candidate, targetPolicy); err != nil {
		return AttemptGrantAuthorityResolution{}, err
	}
	if record.RetentionRequest != targetPolicy.RetentionRequest ||
		record.MaximumClosureEvidenceRecords !=
			targetPolicy.MaximumClosureEvidenceRecords {
		return AttemptGrantAuthorityResolution{}, attemptGrantFailure(
			"Attempt grant Policy projection drifted.",
		)
	}
	if err := validateCandidateAgainstVerificationPlan(
		candidate,
		trust,
		record.Plan,
		targetPolicy,
	); err != nil {
		return AttemptGrantAuthorityResolution{}, err
	}
	retention, ok := authoritativeRetentionForOutcome(
		record.RetentionRequest,
		candidate.Result.Outcome,
	)
	if !ok || candidate.RequestedRetention != retention ||
		validateRetentionRequest(retention, trust) != nil {
		return AttemptGrantAuthorityResolution{}, attemptGrantFailure(
			"Candidate retention is not the authoritative outcome mapping.",
		)
	}
	digest, err := attemptGrantDigest(record)
	if err != nil || digest != record.GrantDigest {
		return AttemptGrantAuthorityResolution{}, attemptGrantFailure(
			"Persisted attempt grant digest does not match its immutable fields.",
		)
	}
	return AttemptGrantAuthorityResolution{
		Authority:          "verification-attempt-grant",
		GrantID:            record.ID,
		GrantDigest:        record.GrantDigest,
		PlanDigest:         record.PlanDigest,
		CanonicalPlanBytes: append([]byte(nil), record.PlanBytes...),
		Retention:          retention,
		ProtectReleaseEvidence: retention == RetentionRelease &&
			record.RetentionRequest.ProtectReleaseEvidence,
		MaximumClosureEvidenceRecords: record.MaximumClosureEvidenceRecords,
		TargetPolicy:                  targetPolicy,
	}, nil
}

func validateTrustedAttemptGrantIssueIdentity(
	input TrustedAttemptGrantIssue,
) error {
	for field, value := range map[string]string{
		"workspaceId": input.WorkspaceID,
		"projectId":   input.ProjectID,
		"cellId":      input.CellID,
		"attemptId":   input.AttemptID,
		"runId":       input.Run.RunID,
		"providerId":  input.Run.ProviderID,
		"producerId":  input.ProducerID,
		"issuedBy":    input.IssuedBy,
	} {
		if validateIdentifier(value, "attempt grant "+field) != nil {
			return attemptGrantFailure("Attempt grant identity is invalid.")
		}
	}
	for _, optional := range []string{input.Run.JobID, input.Run.SessionID} {
		if optional != "" &&
			validateIdentifier(optional, "attempt grant run identity") != nil {
			return attemptGrantFailure("Attempt grant run identity is invalid.")
		}
	}
	if !validPlanTrust(input.TrustCeiling) {
		return attemptGrantFailure("Attempt grant trust ceiling is invalid.")
	}
	return nil
}

func uniqueSupportedAttemptGrantCell(
	plan VerificationPlanGrant,
	cellID string,
) (VerificationPlanCell, error) {
	var selected *VerificationPlanCell
	for index := range plan.Cells {
		if plan.Cells[index].ID != cellID {
			continue
		}
		if selected != nil {
			return VerificationPlanCell{}, attemptGrantFailure(
				"Attempt grant Plan cell is not unique.",
			)
		}
		selected = &plan.Cells[index]
	}
	if selected == nil || selected.Preflight.Status != "supported" {
		return VerificationPlanCell{}, attemptGrantFailure(
			"Attempt grant requires one supported Plan cell.",
		)
	}
	return *selected, nil
}

func validateIssuedRunAgainstPlanCell(
	run RunIdentity,
	cell VerificationPlanCell,
) error {
	if run.Surface != cell.Surface ||
		run.FrameworkTarget != cell.FrameworkTarget ||
		run.BrowserEngine != cell.BrowserEngine ||
		run.Viewport != cell.Viewport ||
		run.ColorScheme != cell.ColorScheme ||
		run.Motion != cell.Motion ||
		run.Locale != cell.Locale {
		return attemptGrantFailure(
			"Attempt grant run coordinate drifted from the Plan cell.",
		)
	}
	return nil
}

func attemptGrantDigest(record AttemptGrantRecord) (string, error) {
	digest, _, err := canonicalDigest(struct {
		Format                        string                        `json:"format"`
		Version                       int                           `json:"version"`
		WorkspaceID                   string                        `json:"workspaceId"`
		ProjectID                     string                        `json:"projectId"`
		WorkspaceRevision             int64                         `json:"workspaceRevision"`
		PartitionRevisionsDigest      string                        `json:"partitionRevisionsDigest"`
		PolicyRevision                int64                         `json:"policyRevision"`
		PolicyDigest                  string                        `json:"policyDigest"`
		PolicyEvaluationInstant       string                        `json:"policyEvaluationInstant"`
		ImpactDigest                  string                        `json:"impactDigest"`
		PlanDigest                    string                        `json:"planDigest"`
		CellID                        string                        `json:"cellId"`
		CheckID                       string                        `json:"checkId"`
		CheckKind                     string                        `json:"checkKind"`
		TargetID                      string                        `json:"targetId"`
		AttemptID                     string                        `json:"attemptId"`
		RunID                         string                        `json:"runId"`
		ProviderID                    string                        `json:"providerId"`
		JobID                         string                        `json:"jobId,omitempty"`
		SessionID                     string                        `json:"sessionId,omitempty"`
		ProducerID                    string                        `json:"producerId"`
		TrustCeiling                  TrustClass                    `json:"trustCeiling"`
		RetentionRequest              AuthoritativeRetentionRequest `json:"retentionRequest"`
		MaximumClosureEvidenceRecords int                           `json:"maximumClosureEvidenceRecords"`
		IssuedBy                      string                        `json:"issuedBy"`
		IssuedAt                      string                        `json:"issuedAt"`
		ExpiresAt                     string                        `json:"expiresAt"`
	}{
		Format:                        "prodivix.verification-attempt-grant",
		Version:                       1,
		WorkspaceID:                   record.WorkspaceID,
		ProjectID:                     record.ProjectID,
		WorkspaceRevision:             record.WorkspaceRevision,
		PartitionRevisionsDigest:      record.PartitionRevisionsDigest,
		PolicyRevision:                record.PolicyRevision,
		PolicyDigest:                  record.PolicyDigest,
		PolicyEvaluationInstant:       formatInstant(record.PolicyEvaluationInstant),
		ImpactDigest:                  record.ImpactDigest,
		PlanDigest:                    record.PlanDigest,
		CellID:                        record.CellID,
		CheckID:                       record.CheckID,
		CheckKind:                     record.CheckKind,
		TargetID:                      record.TargetID,
		AttemptID:                     record.AttemptID,
		RunID:                         record.RunID,
		ProviderID:                    record.ProviderID,
		JobID:                         record.JobID,
		SessionID:                     record.SessionID,
		ProducerID:                    record.ProducerID,
		TrustCeiling:                  record.TrustCeiling,
		RetentionRequest:              record.RetentionRequest,
		MaximumClosureEvidenceRecords: record.MaximumClosureEvidenceRecords,
		IssuedBy:                      record.IssuedBy,
		IssuedAt:                      formatInstant(record.IssuedAt),
		ExpiresAt:                     formatInstant(record.ExpiresAt),
	})
	return digest, err
}

func (authority *PostgreSQLAttemptGrantAuthority) insertAttemptGrant(
	ctx context.Context,
	record AttemptGrantRecord,
) (AttemptGrantRecord, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := authority.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return AttemptGrantRecord{}, err
	}
	defer func() { _ = tx.Rollback() }()
	var projectID string
	var workspaceRevision, routeRevision, operationSequence int64
	if err := tx.QueryRowContext(ctx, `SELECT project_id, workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR SHARE`, record.WorkspaceID).Scan(
		&projectID,
		&workspaceRevision,
		&routeRevision,
		&operationSequence,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return AttemptGrantRecord{}, ErrNotFound
		}
		return AttemptGrantRecord{}, err
	}
	if projectID != record.ProjectID ||
		workspaceRevision != record.WorkspaceRevision ||
		routeRevision != record.Plan.TargetPartitionRevisions.RouteRev ||
		operationSequence != record.Plan.TargetPartitionRevisions.OpSeq {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Workspace drifted while issuing the attempt grant.",
		)
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO verification_attempt_grants (
	id, workspace_id, project_id, workspace_revision, partition_revisions_digest,
	policy_revision, policy_digest, policy_evaluation_instant, impact_digest,
	plan_digest, plan_json, plan_bytes, cell_id, check_id, check_kind, target_id,
	attempt_id, run_id, provider_id, job_id, session_id, producer_id,
	trust_ceiling, successful_retention_class, failed_retention_class,
	protect_release_evidence, maximum_closure_evidence_records, grant_digest,
	issued_by, issued_at, expires_at, created_at
) VALUES (
	$1, $2, $3, $4, $5,
	$6, $7, $8, $9,
	$10, $11::jsonb, $12, $13, $14, $15, $16,
	$17, $18, $19, $20, $21, $22,
	$23, $24, $25, $26, $27, $28,
	$29, $30, $31, $30
)
ON CONFLICT DO NOTHING`,
		record.ID, record.WorkspaceID, record.ProjectID, record.WorkspaceRevision,
		record.PartitionRevisionsDigest, record.PolicyRevision, record.PolicyDigest,
		record.PolicyEvaluationInstant, record.ImpactDigest, record.PlanDigest,
		string(record.PlanBytes), record.PlanBytes, record.CellID, record.CheckID,
		record.CheckKind, record.TargetID, record.AttemptID, record.RunID,
		record.ProviderID, nullableString(record.JobID), nullableString(record.SessionID),
		record.ProducerID, record.TrustCeiling, record.RetentionRequest.Successful,
		record.RetentionRequest.Failed,
		record.RetentionRequest.ProtectReleaseEvidence,
		record.MaximumClosureEvidenceRecords, record.GrantDigest, record.IssuedBy,
		record.IssuedAt, record.ExpiresAt,
	)
	if err != nil {
		return AttemptGrantRecord{}, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return AttemptGrantRecord{}, err
	}
	if inserted == 0 {
		existing, err := loadAttemptGrantRow(tx.QueryRowContext(
			ctx,
			attemptGrantSelect+`
WHERE workspace_id = $1 AND plan_digest = $2 AND cell_id = $3 AND attempt_id = $4
FOR SHARE`,
			record.WorkspaceID,
			record.PlanDigest,
			record.CellID,
			record.AttemptID,
		))
		if err != nil {
			return AttemptGrantRecord{}, err
		}
		if !sameAttemptGrant(existing, record) {
			return AttemptGrantRecord{}, ErrConflict
		}
		record = existing
	}
	if err := tx.Commit(); err != nil {
		return AttemptGrantRecord{}, err
	}
	return record, nil
}

func (authority *PostgreSQLAttemptGrantAuthority) loadAttemptGrantByIdentity(
	ctx context.Context,
	workspaceID string,
	planDigest string,
	cellID string,
	attemptID string,
) (AttemptGrantRecord, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	record, err := loadAttemptGrantRow(authority.db.QueryRowContext(
		ctx,
		attemptGrantSelect+`
WHERE workspace_id = $1 AND plan_digest = $2 AND cell_id = $3 AND attempt_id = $4`,
		workspaceID,
		planDigest,
		cellID,
		attemptID,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"No immutable attempt grant authorizes this Candidate.",
		)
	}
	return record, err
}

func (authority *PostgreSQLAttemptGrantAuthority) loadAttemptGrantByID(
	ctx context.Context,
	workspaceID string,
	grantID string,
) (AttemptGrantRecord, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	record, err := loadAttemptGrantRow(authority.db.QueryRowContext(
		ctx,
		attemptGrantSelect+`
WHERE workspace_id = $1 AND id = $2`,
		workspaceID,
		grantID,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Promotion attempt grant does not exist.",
		)
	}
	return record, err
}

func (authority *PostgreSQLAttemptGrantAuthority) verifyAttemptGrantClaim(
	ctx context.Context,
	grantID string,
	promotionID string,
	candidateDigest string,
) error {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	var storedPromotionID, storedCandidateDigest string
	err := authority.db.QueryRowContext(ctx, `SELECT promotion_id, candidate_digest
FROM verification_attempt_grant_claims
WHERE grant_id = $1`, grantID).Scan(
		&storedPromotionID,
		&storedCandidateDigest,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return attemptGrantFailure("Attempt grant has not been claimed.")
	}
	if err != nil {
		return err
	}
	if storedPromotionID != promotionID ||
		storedCandidateDigest != candidateDigest {
		return attemptGrantFailure(
			"Attempt grant claim does not match the promotion.",
		)
	}
	return nil
}

const attemptGrantSelect = `SELECT id, workspace_id, project_id,
	workspace_revision, partition_revisions_digest, policy_revision,
	policy_digest, policy_evaluation_instant, impact_digest, plan_digest,
	plan_json, plan_bytes, cell_id, check_id, check_kind, target_id, attempt_id,
	run_id, provider_id, COALESCE(job_id, ''), COALESCE(session_id, ''),
	producer_id, trust_ceiling, successful_retention_class,
	failed_retention_class, protect_release_evidence,
	maximum_closure_evidence_records, grant_digest, issued_by,
	issued_at, expires_at
FROM verification_attempt_grants
`

func loadAttemptGrantRow(row rowScanner) (AttemptGrantRecord, error) {
	var record AttemptGrantRecord
	var planJSON, planBytes []byte
	var trust, successfulRetention, failedRetention string
	err := row.Scan(
		&record.ID, &record.WorkspaceID, &record.ProjectID,
		&record.WorkspaceRevision, &record.PartitionRevisionsDigest,
		&record.PolicyRevision, &record.PolicyDigest,
		&record.PolicyEvaluationInstant, &record.ImpactDigest, &record.PlanDigest,
		&planJSON, &planBytes, &record.CellID, &record.CheckID, &record.CheckKind,
		&record.TargetID, &record.AttemptID, &record.RunID, &record.ProviderID,
		&record.JobID, &record.SessionID, &record.ProducerID, &trust,
		&successfulRetention, &failedRetention,
		&record.RetentionRequest.ProtectReleaseEvidence,
		&record.MaximumClosureEvidenceRecords, &record.GrantDigest,
		&record.IssuedBy, &record.IssuedAt, &record.ExpiresAt,
	)
	if err != nil {
		return AttemptGrantRecord{}, err
	}
	record.TrustCeiling = TrustClass(trust)
	record.RetentionRequest.Successful = RetentionClass(successfulRetention)
	record.RetentionRequest.Failed = RetentionClass(failedRetention)
	plan, canonicalPlanBytes, err := decodeCanonicalVerificationPlan(planBytes)
	if err != nil {
		return AttemptGrantRecord{}, fmt.Errorf(
			"decode stored attempt grant Plan: %w",
			err,
		)
	}
	var jsonPlan VerificationPlanGrant
	if err := jsonUnmarshalStrictStored(planJSON, &jsonPlan); err != nil {
		return AttemptGrantRecord{}, fmt.Errorf(
			"decode stored attempt grant Plan JSON: %w",
			err,
		)
	}
	jsonPlan, canonicalJSONPlanBytes, err := canonicalizeVerificationPlan(jsonPlan)
	if err != nil || !bytes.Equal(canonicalPlanBytes, canonicalJSONPlanBytes) {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Attempt grant Plan JSON and bytes disagree.",
		)
	}
	record.Plan = plan
	record.PlanBytes = canonicalPlanBytes
	if plan.PlanDigest != record.PlanDigest ||
		plan.WorkspaceID != record.WorkspaceID ||
		plan.TargetRevision != record.WorkspaceRevision ||
		plan.PolicyRevision != record.PolicyRevision ||
		plan.PolicyDigest != record.PolicyDigest ||
		plan.ImpactDigest != record.ImpactDigest ||
		!validPlanTrust(record.TrustCeiling) ||
		!validAuthoritativeRetentionRequest(record.RetentionRequest) ||
		record.MaximumClosureEvidenceRecords < 1 ||
		record.MaximumClosureEvidenceRecords > maximumClosureEvidenceRecords {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Attempt grant row identity is invalid.",
		)
	}
	partitionDigest, _, err := canonicalDigest(plan.TargetPartitionRevisions)
	if err != nil || partitionDigest != record.PartitionRevisionsDigest {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Attempt grant partition digest is invalid.",
		)
	}
	digest, err := attemptGrantDigest(record)
	if err != nil || digest != record.GrantDigest {
		return AttemptGrantRecord{}, attemptGrantFailure(
			"Attempt grant row digest is invalid.",
		)
	}
	return record, nil
}

func sameAttemptGrant(left AttemptGrantRecord, right AttemptGrantRecord) bool {
	return left.ID == right.ID &&
		left.WorkspaceID == right.WorkspaceID &&
		left.ProjectID == right.ProjectID &&
		left.PlanDigest == right.PlanDigest &&
		left.CellID == right.CellID &&
		left.AttemptID == right.AttemptID &&
		left.GrantDigest == right.GrantDigest &&
		bytes.Equal(left.PlanBytes, right.PlanBytes)
}
