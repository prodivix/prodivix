package verification

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"
)

// claimAttemptGrantTx is the one write-side authority transition. The claim and
// promotion row commit together, so a process crash cannot consume a grant
// without leaving an idempotently recoverable promotion.
func claimAttemptGrantTx(
	ctx context.Context,
	tx *sql.Tx,
	promotion Promotion,
	claimedAt time.Time,
) error {
	if validateIdentifier(promotion.AttemptGrantID, "attempt grant id") != nil ||
		!digestPattern.MatchString(promotion.AttemptGrantDigest) {
		return attemptGrantFailure("Promotion attempt grant identity is invalid.")
	}
	var (
		workspaceID, projectID, planDigest, cellID, checkID, checkKind string
		targetID, attemptID, runID, providerID, jobID, sessionID       string
		producerID, trust, successfulRetention, failedRetention        string
		grantDigest                                                    string
		planBytes                                                      []byte
		protectReleaseEvidence                                         bool
		maximumRecords                                                 int
		issuedAt, expiresAt                                            time.Time
	)
	err := tx.QueryRowContext(ctx, `SELECT workspace_id, project_id, plan_digest,
	plan_bytes, cell_id, check_id, check_kind, target_id, attempt_id,
	run_id, provider_id, COALESCE(job_id, ''), COALESCE(session_id, ''),
	producer_id, trust_ceiling, successful_retention_class,
	failed_retention_class, protect_release_evidence,
	maximum_closure_evidence_records, grant_digest, issued_at, expires_at
FROM verification_attempt_grants
WHERE id = $1
FOR UPDATE`, promotion.AttemptGrantID).Scan(
		&workspaceID, &projectID, &planDigest, &planBytes, &cellID, &checkID,
		&checkKind, &targetID, &attemptID, &runID, &providerID, &jobID,
		&sessionID, &producerID, &trust, &successfulRetention, &failedRetention,
		&protectReleaseEvidence, &maximumRecords, &grantDigest, &issuedAt,
		&expiresAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return attemptGrantFailure("Attempt grant does not exist.")
	}
	if err != nil {
		return err
	}
	retentionRequest := AuthoritativeRetentionRequest{
		Successful:             RetentionClass(successfulRetention),
		Failed:                 RetentionClass(failedRetention),
		ProtectReleaseEvidence: protectReleaseEvidence,
	}
	retention, ok := authoritativeRetentionForOutcome(
		retentionRequest,
		promotion.Candidate.Result.Outcome,
	)
	expectedProtection := retention == RetentionRelease &&
		protectReleaseEvidence
	startedAt, startedErr := parseInstant(promotion.Candidate.Timing.StartedAt)
	completedAt, completedErr := parseInstant(promotion.Candidate.Timing.CompletedAt)
	deadline, deadlineErr := parseInstant(promotion.Candidate.Promotion.Deadline)
	if !ok ||
		workspaceID != promotion.WorkspaceID ||
		projectID != promotion.ProjectID ||
		planDigest != promotion.Candidate.PlanDigest ||
		cellID != promotion.Candidate.CellID ||
		checkID != promotion.Candidate.CheckID ||
		checkKind != promotion.Candidate.CheckKind ||
		targetID != promotion.Candidate.TargetID ||
		attemptID != promotion.Candidate.AttemptID ||
		runID != promotion.Candidate.Run.RunID ||
		providerID != promotion.Candidate.Run.ProviderID ||
		jobID != promotion.Candidate.Run.JobID ||
		sessionID != promotion.Candidate.Run.SessionID ||
		producerID != promotion.Candidate.Provenance.ProducerID ||
		TrustClass(trust) != promotion.Trust ||
		retention != promotion.Retention ||
		expectedProtection != promotion.ProtectReleaseEvidence ||
		maximumRecords != promotion.MaximumClosureEvidenceRecords ||
		grantDigest != promotion.AttemptGrantDigest ||
		!bytes.Equal(planBytes, promotion.VerificationPlanBytes) ||
		startedErr != nil || completedErr != nil || deadlineErr != nil ||
		startedAt.Before(issuedAt) ||
		completedAt.After(expiresAt) ||
		deadline.After(expiresAt) ||
		!claimedAt.Before(expiresAt) {
		return attemptGrantFailure(
			"Promotion does not match the immutable attempt grant.",
		)
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO verification_attempt_grant_claims (
	grant_id, promotion_id, candidate_digest, claimed_at
) VALUES ($1, $2, $3, $4)
ON CONFLICT DO NOTHING`,
		promotion.AttemptGrantID,
		promotion.ID,
		promotion.CandidateDigest,
		claimedAt.UTC(),
	)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if inserted == 1 {
		return nil
	}
	var existingPromotionID, existingCandidateDigest string
	err = tx.QueryRowContext(ctx, `SELECT promotion_id, candidate_digest
FROM verification_attempt_grant_claims
WHERE grant_id = $1
FOR SHARE`, promotion.AttemptGrantID).Scan(
		&existingPromotionID,
		&existingCandidateDigest,
	)
	if err != nil {
		return err
	}
	if existingPromotionID != promotion.ID ||
		existingCandidateDigest != promotion.CandidateDigest {
		return coded(
			"VER-5001",
			"Attempt grant was already claimed by a different promotion.",
			ErrConflict,
		)
	}
	return nil
}
