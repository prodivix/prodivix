package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	maximumEvaluationControlledAuthorityResponseBytes = 33_554_432
	maximumEvaluationSandboxRegistrationResponseBytes = 65_536
)

type EvaluationControlledAuthorityRequestBinding struct {
	ServiceKind                                   string
	Operation                                     string
	RouteBinding                                  string
	RequestDigest                                 string
	RequestBindingDigest                          string
	OwnerImplementationDigest                     string
	AttemptID                                     string
	DescriptorDigest                              string
	GrantDigest                                   string
	Generation                                    int64
	ShardLeaseOwnerID                             string
	ShardLeaseGeneration                          int64
	VerificationGrantGeneration                   int64
	VerificationGrantReceiptSetDigest             string
	ProviderCapabilityObservationReceiptSetDigest string
	PreEffectIntentDigest                         string
	PreEffectIntentBytes                          []byte
}

type EvaluationControlledAuthorityRequestRecord struct {
	NamespaceID      string
	PlanDigest       string
	RepositoryCommit string
	V46Eligible      bool
	EvaluationControlledAuthorityRequestBinding
	State             string
	ClaimGeneration   int64
	ResponseDigest    string
	ResponseBytes     []byte
	StageDigest       string
	DispatchAckDigest string
	ClaimedAt         time.Time
	DispatchedAt      time.Time
	SealedAt          time.Time
}

type EvaluationVerificationSandboxRegistrationRecord struct {
	NamespaceID            string
	PlanDigest             string
	RepositoryCommit       string
	AttemptID              string
	DescriptorDigest       string
	Generation             int64
	WorkspaceID            string
	WorkspaceRevision      int64
	VerificationPlanDigest string
	AuthorityDigest        string
	GrantReceiptSetDigest  string
	IdempotencyKeyDigest   string
	RequestDigest          string
	RegistrationID         string
	RegistrationDigest     string
	ReceiptDigest          string
	ResponseBytes          []byte
	RegisteredAt           time.Time
}

func evaluationG3CellAdmissionBindingKind(binding EvaluationControlledAuthorityRequestBinding) bool {
	return binding.ServiceKind == "controlled-workspace" &&
		binding.Operation == evaluationG3CellAdmissionOperation &&
		binding.RouteBinding == evaluationG3CellAdmissionRouteBinding
}

func evaluationCanonicalByteDigest(source []byte, maximum int) (string, error) {
	if len(source) == 0 || len(source) > maximum ||
		canonicaljson.ValidateRawEnvelope(source, maximum) != nil {
		return "", ErrInvalid
	}
	var value any
	if err := decodeEvaluationServiceRawJSON(source, &value); err != nil {
		return "", ErrInvalid
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || !bytes.Equal(canonical, source) {
		return "", ErrInvalid
	}
	digest := sha256.Sum256(source)
	return fmt.Sprintf("sha256-%x", digest), nil
}

func validateEvaluationControlledAuthorityBinding(
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
) error {
	if err := validateEvaluationPartition(partition); err != nil {
		return err
	}
	if !oneOfString(binding.ServiceKind, "controlled-workspace", "verification-evidence", "provider-capability", "attempt-grading") ||
		!validEvaluationServiceIdentity(binding.Operation) ||
		binding.RouteBinding == "" || len(binding.RouteBinding) > 1_024 ||
		strings.TrimSpace(binding.RouteBinding) != binding.RouteBinding ||
		!evaluationDigestPattern.MatchString(binding.RequestDigest) ||
		!evaluationDigestPattern.MatchString(binding.RequestBindingDigest) {
		return ErrInvalid
	}
	if binding.AttemptID != "" && !validEvaluationAgentControlIdentity(binding.AttemptID) {
		return ErrInvalid
	}
	if binding.DescriptorDigest != "" && !evaluationDigestPattern.MatchString(binding.DescriptorDigest) {
		return ErrInvalid
	}
	if binding.GrantDigest != "" && !evaluationDigestPattern.MatchString(binding.GrantDigest) {
		return ErrInvalid
	}
	if binding.OwnerImplementationDigest != "" &&
		!evaluationDigestPattern.MatchString(binding.OwnerImplementationDigest) {
		return ErrInvalid
	}
	if binding.ShardLeaseOwnerID != "" && !validEvaluationAgentControlIdentity(binding.ShardLeaseOwnerID) {
		return ErrInvalid
	}
	if binding.VerificationGrantReceiptSetDigest != "" &&
		!evaluationDigestPattern.MatchString(binding.VerificationGrantReceiptSetDigest) {
		return ErrInvalid
	}
	if binding.ProviderCapabilityObservationReceiptSetDigest != "" &&
		!evaluationDigestPattern.MatchString(binding.ProviderCapabilityObservationReceiptSetDigest) {
		return ErrInvalid
	}
	hasPreEffect := binding.PreEffectIntentDigest != "" || len(binding.PreEffectIntentBytes) != 0
	if hasPreEffect {
		intent, err := decodeCanonicalEvaluationObject(binding.PreEffectIntentBytes, 16_384)
		if err != nil || !evaluationDigestPattern.MatchString(binding.PreEffectIntentDigest) ||
			stringMember(intent, "intentDigest") != binding.PreEffectIntentDigest ||
			binding.ServiceKind != "provider-capability" || binding.Operation != "tool.execute" {
			return ErrInvalid
		}
	}
	if binding.Generation < 0 || binding.Generation > 9_007_199_254_740_991 {
		return ErrInvalid
	}
	if binding.ShardLeaseGeneration < 0 || binding.ShardLeaseGeneration > 9_007_199_254_740_991 ||
		binding.VerificationGrantGeneration < 0 || binding.VerificationGrantGeneration > 9_007_199_254_740_991 {
		return ErrInvalid
	}
	attemptAuthority := oneOfString(binding.ServiceKind, "provider-capability", "attempt-grading")
	g3CellAdmission := evaluationG3CellAdmissionBindingKind(binding)
	if attemptAuthority != (binding.ShardLeaseOwnerID != "" && binding.ShardLeaseGeneration > 0 &&
		binding.VerificationGrantGeneration > 0 && binding.VerificationGrantReceiptSetDigest != "" &&
		binding.ProviderCapabilityObservationReceiptSetDigest != "" && binding.OwnerImplementationDigest != "") ||
		attemptAuthority && (binding.AttemptID == "" || binding.DescriptorDigest == "") ||
		attemptAuthority && binding.Generation != 0 ||
		!attemptAuthority && (binding.ShardLeaseOwnerID != "" || binding.ShardLeaseGeneration != 0 ||
			binding.VerificationGrantGeneration != 0 || binding.VerificationGrantReceiptSetDigest != "" ||
			binding.ProviderCapabilityObservationReceiptSetDigest != "") {
		return ErrInvalid
	}
	if g3CellAdmission && (binding.AttemptID == "" || binding.DescriptorDigest == "" ||
		binding.Generation < 1 || binding.OwnerImplementationDigest == "" || binding.GrantDigest != "") {
		return ErrInvalid
	}
	return nil
}

func authorizeEvaluationAttemptAuthorityClaim(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimedAt time.Time,
) error {
	var planBytes []byte
	if err := tx.QueryRowContext(ctx, `SELECT plan_bytes
		FROM agent_evaluation_plans
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		FOR SHARE`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit).
		Scan(&planBytes); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	plan, err := decodeEvaluationPlan(planBytes)
	if err != nil {
		return err
	}
	plannedAttempts, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		return err
	}
	var planned evaluationStatusPlannedAttempt
	found := false
	for _, candidate := range plannedAttempts {
		if candidate.AttemptID == binding.AttemptID {
			planned, found = candidate, true
			break
		}
	}
	if !found || planned.DescriptorDigest != binding.DescriptorDigest {
		return conflict("evaluation attempt authority descriptor is outside the frozen plan schedule")
	}
	var leaseOwnerID string
	var leaseGeneration int64
	var leaseAcquiredAt, leaseExpiresAt time.Time
	if err := tx.QueryRowContext(ctx, `SELECT owner_id, generation, acquired_at, expires_at
		FROM agent_evaluation_shard_leases
		WHERE namespace_id=$1 AND plan_digest=$2 AND shard_id=$3
		FOR SHARE`, authority.NamespaceID, partition.PlanDigest, planned.ShardID).
		Scan(&leaseOwnerID, &leaseGeneration, &leaseAcquiredAt, &leaseExpiresAt); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if leaseOwnerID != binding.ShardLeaseOwnerID || leaseGeneration != binding.ShardLeaseGeneration ||
		claimedAt.Before(leaseAcquiredAt) || !claimedAt.Before(leaseExpiresAt) {
		return conflict("evaluation attempt authority shard lease is stale or held by another worker")
	}
	receipts, err := queryEvaluationVerificationAttemptGrantReceipts(
		ctx, tx, authority.NamespaceID, partition, binding.AttemptID,
	)
	if err != nil {
		return err
	}
	if len(receipts) == 0 {
		return conflict("evaluation attempt authority Verification AttemptGrant receipt set is empty")
	}
	for _, receipt := range receipts {
		if receipt.AttemptID != binding.AttemptID || receipt.DescriptorDigest != binding.DescriptorDigest ||
			receipt.CaseID != planned.CaseID || receipt.Generation != binding.VerificationGrantGeneration ||
			claimedAt.Before(receipt.IssuedAt) || !claimedAt.Before(receipt.ExpiresAt) {
			return conflict("evaluation attempt authority Verification AttemptGrant receipt set drifted")
		}
	}
	setDigest, err := evaluationVerificationAttemptGrantReceiptSetDigest(receipts)
	if err != nil {
		return err
	}
	if setDigest != binding.VerificationGrantReceiptSetDigest {
		return conflict("evaluation attempt authority Verification AttemptGrant receipt set is incomplete or swapped")
	}
	return nil
}

func scanEvaluationControlledAuthorityRequest(
	row *sql.Row,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
) (EvaluationControlledAuthorityRequestRecord, error) {
	var record EvaluationControlledAuthorityRequestRecord
	var ownerImplementationDigest, attemptID, descriptorDigest, grantDigest, shardLeaseOwnerID, verificationGrantReceiptSetDigest sql.NullString
	var providerCapabilityObservationReceiptSetDigest, stageDigest, dispatchAckDigest, preEffectIntentDigest sql.NullString
	var generation, shardLeaseGeneration, verificationGrantGeneration sql.NullInt64
	var responseDigest sql.NullString
	var responseBytes, preEffectIntentBytes []byte
	var dispatchedAt, sealedAt sql.NullTime
	err := row.Scan(
		&record.NamespaceID, &record.PlanDigest, &record.RepositoryCommit, &record.V46Eligible,
		&record.ServiceKind, &record.Operation, &record.RouteBinding,
		&record.RequestDigest, &record.RequestBindingDigest,
		&ownerImplementationDigest,
		&attemptID, &descriptorDigest, &grantDigest, &generation,
		&shardLeaseOwnerID, &shardLeaseGeneration, &verificationGrantGeneration,
		&verificationGrantReceiptSetDigest, &providerCapabilityObservationReceiptSetDigest,
		&preEffectIntentDigest, &preEffectIntentBytes,
		&stageDigest, &dispatchAckDigest,
		&record.State, &record.ClaimGeneration, &responseDigest, &responseBytes,
		&record.ClaimedAt, &dispatchedAt, &sealedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationControlledAuthorityRequestRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, err
	}
	if !record.V46Eligible {
		return EvaluationControlledAuthorityRequestRecord{}, conflict("evaluation controlled authority request is legacy-ineligible and requires requalification")
	}
	record.AttemptID, record.DescriptorDigest = attemptID.String, descriptorDigest.String
	record.OwnerImplementationDigest = ownerImplementationDigest.String
	record.GrantDigest, record.Generation = grantDigest.String, generation.Int64
	record.ShardLeaseOwnerID = shardLeaseOwnerID.String
	record.ShardLeaseGeneration = shardLeaseGeneration.Int64
	record.VerificationGrantGeneration = verificationGrantGeneration.Int64
	record.VerificationGrantReceiptSetDigest = verificationGrantReceiptSetDigest.String
	record.ProviderCapabilityObservationReceiptSetDigest = providerCapabilityObservationReceiptSetDigest.String
	record.PreEffectIntentDigest = preEffectIntentDigest.String
	record.PreEffectIntentBytes = append([]byte(nil), preEffectIntentBytes...)
	record.StageDigest, record.DispatchAckDigest = stageDigest.String, dispatchAckDigest.String
	record.ResponseDigest, record.ResponseBytes = responseDigest.String, append([]byte(nil), responseBytes...)
	record.DispatchedAt, record.SealedAt = dispatchedAt.Time, sealedAt.Time
	if record.PlanDigest != partition.PlanDigest || record.RepositoryCommit != partition.RepositoryCommit ||
		record.ServiceKind != binding.ServiceKind || record.Operation != binding.Operation ||
		record.RouteBinding != binding.RouteBinding || record.RequestDigest != binding.RequestDigest ||
		record.RequestBindingDigest != binding.RequestBindingDigest ||
		record.OwnerImplementationDigest != binding.OwnerImplementationDigest ||
		record.AttemptID != binding.AttemptID || record.DescriptorDigest != binding.DescriptorDigest ||
		record.GrantDigest != binding.GrantDigest || record.Generation != binding.Generation ||
		record.ShardLeaseOwnerID != binding.ShardLeaseOwnerID ||
		record.ShardLeaseGeneration != binding.ShardLeaseGeneration ||
		record.VerificationGrantGeneration != binding.VerificationGrantGeneration ||
		record.VerificationGrantReceiptSetDigest != binding.VerificationGrantReceiptSetDigest ||
		record.ProviderCapabilityObservationReceiptSetDigest != binding.ProviderCapabilityObservationReceiptSetDigest ||
		record.PreEffectIntentDigest != binding.PreEffectIntentDigest ||
		!bytes.Equal(record.PreEffectIntentBytes, binding.PreEffectIntentBytes) ||
		record.ClaimGeneration != 1 || !oneOfString(record.State, "claimed", "dispatched", "sealed") {
		return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
	}
	attemptAuthority := oneOfString(record.ServiceKind, "provider-capability", "attempt-grading")
	g3CellAdmission := evaluationG3CellAdmissionBindingKind(record.EvaluationControlledAuthorityRequestBinding)
	ownerStateful := evaluationOwnerStatefulOperation(record.ServiceKind, record.Operation, record.RouteBinding)
	if record.State == "claimed" {
		if record.ResponseDigest != "" || len(record.ResponseBytes) != 0 ||
			!record.DispatchedAt.IsZero() || !record.SealedAt.IsZero() || record.StageDigest != "" ||
			record.DispatchAckDigest != "" || record.ProviderCapabilityObservationReceiptSetDigest != "" {
			return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
		}
	} else if record.State == "dispatched" {
		if record.DispatchedAt.IsZero() || !record.SealedAt.IsZero() {
			return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
		}
		switch {
		case attemptAuthority:
			ownerResultSealed := record.ResponseDigest != "" || len(record.ResponseBytes) != 0 || record.DispatchAckDigest != ""
			if !evaluationDigestPattern.MatchString(record.StageDigest) ||
				record.ProviderCapabilityObservationReceiptSetDigest != binding.ProviderCapabilityObservationReceiptSetDigest {
				return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
			}
			if ownerResultSealed && (record.ServiceKind != "provider-capability" || record.Operation != "tool.execute" ||
				record.PreEffectIntentDigest == "" || len(record.PreEffectIntentBytes) == 0 ||
				!evaluationDigestPattern.MatchString(record.ResponseDigest) || len(record.ResponseBytes) == 0 ||
				!evaluationDigestPattern.MatchString(record.DispatchAckDigest)) {
				return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
			}
		case g3CellAdmission:
			acknowledged := evaluationDigestPattern.MatchString(record.DispatchAckDigest)
			if !evaluationDigestPattern.MatchString(record.StageDigest) ||
				record.ProviderCapabilityObservationReceiptSetDigest != "" ||
				acknowledged != (evaluationDigestPattern.MatchString(record.ResponseDigest) && len(record.ResponseBytes) != 0) ||
				!acknowledged && (record.ResponseDigest != "" || len(record.ResponseBytes) != 0 || record.DispatchAckDigest != "") {
				return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
			}
		case ownerStateful:
			if record.ResponseDigest != "" || len(record.ResponseBytes) != 0 ||
				!evaluationDigestPattern.MatchString(record.StageDigest) ||
				(record.DispatchAckDigest != "" && !evaluationDigestPattern.MatchString(record.DispatchAckDigest)) ||
				record.ProviderCapabilityObservationReceiptSetDigest != "" {
				return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
			}
		case record.ServiceKind == "controlled-workspace" && record.OwnerImplementationDigest != "":
			if !evaluationDigestPattern.MatchString(record.StageDigest) || record.ResponseDigest != "" ||
				len(record.ResponseBytes) != 0 || record.DispatchAckDigest != "" ||
				record.ProviderCapabilityObservationReceiptSetDigest != "" {
				return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
			}
		default:
			if record.ResponseDigest != "" || len(record.ResponseBytes) != 0 || record.StageDigest != "" ||
				record.DispatchAckDigest != "" || record.ProviderCapabilityObservationReceiptSetDigest != "" {
				return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
			}
		}
	} else {
		if !evaluationDigestPattern.MatchString(record.ResponseDigest) ||
			record.DispatchedAt.IsZero() || record.SealedAt.IsZero() {
			return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
		}
		switch {
		case attemptAuthority:
			if !evaluationDigestPattern.MatchString(record.StageDigest) ||
				!evaluationDigestPattern.MatchString(record.DispatchAckDigest) ||
				record.ProviderCapabilityObservationReceiptSetDigest != binding.ProviderCapabilityObservationReceiptSetDigest {
				return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
			}
		case g3CellAdmission:
			if !evaluationDigestPattern.MatchString(record.StageDigest) ||
				!evaluationDigestPattern.MatchString(record.DispatchAckDigest) ||
				record.ProviderCapabilityObservationReceiptSetDigest != "" {
				return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
			}
		case ownerStateful:
			if !evaluationDigestPattern.MatchString(record.StageDigest) ||
				!evaluationDigestPattern.MatchString(record.DispatchAckDigest) ||
				record.ProviderCapabilityObservationReceiptSetDigest != "" {
				return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
			}
		case record.ServiceKind == "controlled-workspace" && record.OwnerImplementationDigest != "":
			if !evaluationDigestPattern.MatchString(record.StageDigest) ||
				!evaluationDigestPattern.MatchString(record.DispatchAckDigest) ||
				record.ProviderCapabilityObservationReceiptSetDigest != "" {
				return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
			}
		default:
			if record.StageDigest != "" || record.DispatchAckDigest != "" ||
				record.ProviderCapabilityObservationReceiptSetDigest != "" {
				return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
			}
		}
		if len(record.ResponseBytes) != 0 {
			digest, err := evaluationCanonicalByteDigest(record.ResponseBytes, maximumEvaluationControlledAuthorityResponseBytes)
			if err != nil || digest != record.ResponseDigest {
				return EvaluationControlledAuthorityRequestRecord{}, ErrConflict
			}
		}
	}
	return record, nil
}

func queryEvaluationControlledAuthorityRequest(
	ctx context.Context,
	queryer interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	forUpdate ...bool,
) (EvaluationControlledAuthorityRequestRecord, error) {
	lock := ""
	if len(forUpdate) != 0 && forUpdate[0] {
		lock = " FOR UPDATE"
	}
	return scanEvaluationControlledAuthorityRequest(queryer.QueryRowContext(ctx, `SELECT
		namespace_id, plan_digest, repository_commit, v46_eligible, service_kind, operation,
		route_binding, request_digest, request_binding_digest, owner_implementation_digest, attempt_id,
		descriptor_digest, grant_digest, generation, shard_lease_owner_id,
		shard_lease_generation, verification_grant_generation,
		verification_grant_receipt_set_digest, provider_capability_observation_receipt_set_digest,
		pre_effect_intent_digest, pre_effect_intent_bytes,
		stage_digest, dispatch_ack_digest, state, claim_generation,
		response_digest, response_bytes, claimed_at, dispatched_at, sealed_at
	FROM agent_evaluation_controlled_authority_requests
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind=$4 AND request_digest=$5`+lock,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		binding.ServiceKind, binding.RequestDigest), partition, binding)
}

// ClaimEvaluationControlledAuthorityRequest establishes one durable dispatch
// identity before a server-only owner is invoked. A claimed replay may call
// the owner's request-digest keyed idempotent Execute again; dispatched replay
// is reconciliation-only and sealed replay may use safe response bytes.
func (repository *Repository) ClaimEvaluationControlledAuthorityRequest(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil || claimedAt.IsZero() {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrInvalid
	}
	claimedAt = claimedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if oneOfString(binding.ServiceKind, "provider-capability", "attempt-grading") {
		if err := authorizeEvaluationAttemptAuthorityClaim(
			ctx, tx, authority, partition, binding, claimedAt,
		); err != nil {
			return EvaluationControlledAuthorityRequestRecord{}, false, err
		}
	} else {
		var planExists bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(
			SELECT 1 FROM agent_evaluation_plans
			WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		)`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(&planExists); err != nil {
			return EvaluationControlledAuthorityRequestRecord{}, false, err
		}
		if !planExists {
			return EvaluationControlledAuthorityRequestRecord{}, false, ErrNotFound
		}
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_controlled_authority_requests (
		namespace_id, plan_digest, repository_commit, service_kind, operation,
		route_binding, request_digest, request_binding_digest, owner_implementation_digest, attempt_id,
		descriptor_digest, grant_digest, generation, shard_lease_owner_id,
		shard_lease_generation, verification_grant_generation,
		verification_grant_receipt_set_digest, pre_effect_intent_digest, pre_effect_intent_json,
		pre_effect_intent_bytes, state, claim_generation, claimed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,'claimed',1,$21)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		binding.ServiceKind, binding.Operation, binding.RouteBinding, binding.RequestDigest,
		binding.RequestBindingDigest, nullableEvaluationControlledString(binding.OwnerImplementationDigest),
		nullableEvaluationControlledString(binding.AttemptID),
		nullableEvaluationControlledString(binding.DescriptorDigest), nullableEvaluationControlledString(binding.GrantDigest),
		nullableInt64(binding.Generation), nullableEvaluationControlledString(binding.ShardLeaseOwnerID),
		nullableInt64(binding.ShardLeaseGeneration), nullableInt64(binding.VerificationGrantGeneration),
		nullableEvaluationControlledString(binding.VerificationGrantReceiptSetDigest),
		nullableEvaluationControlledString(binding.PreEffectIntentDigest), nullableEvaluationControlledJSON(binding.PreEffectIntentBytes),
		nullableBytes(binding.PreEffectIntentBytes), claimedAt)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	record, err := queryEvaluationControlledAuthorityRequest(ctx, tx, authority, partition, binding)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	return record, inserted == 1, nil
}

func nullableEvaluationControlledString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func nullableEvaluationControlledJSON(value []byte) any {
	if len(value) == 0 {
		return nil
	}
	return string(value)
}

func nullableInt64(value int64) any {
	if value == 0 {
		return nil
	}
	return value
}

// MarkEvaluationControlledAuthorityDispatched records a non-attempt owner
// dispatch. Attempt owners use the stage-bound variant below.
func (repository *Repository) MarkEvaluationControlledAuthorityDispatched(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimGeneration int64,
	dispatchedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil ||
		claimGeneration != 1 || dispatchedAt.IsZero() ||
		oneOfString(binding.ServiceKind, "provider-capability", "attempt-grading") {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrInvalid
	}
	dispatchedAt = dispatchedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
	SET state='dispatched', dispatched_at=$6
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind=$4 AND request_digest=$5 AND state='claimed'
		AND claim_generation=1 AND v46_eligible`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, binding.ServiceKind, binding.RequestDigest, dispatchedAt)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	record, err := queryEvaluationControlledAuthorityRequest(ctx, repository.db, authority, partition, binding)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if record.State != "dispatched" && record.State != "sealed" {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	return record, updated == 0, nil
}

func (repository *Repository) GetEvaluationControlledWorkspaceStatelessRequest(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
) (EvaluationControlledAuthorityRequestRecord, error) {
	if err := repository.available(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil ||
		binding.ServiceKind != "controlled-workspace" || binding.OwnerImplementationDigest == "" ||
		evaluationOwnerStatefulOperation(binding.ServiceKind, binding.Operation, binding.RouteBinding) ||
		evaluationG3CellAdmissionBindingKind(binding) {
		return EvaluationControlledAuthorityRequestRecord{}, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	return queryEvaluationControlledAuthorityRequest(ctx, repository.db, authority, partition, binding)
}

func (repository *Repository) StageEvaluationControlledWorkspaceStatelessDispatch(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimGeneration int64,
	stageDigest string,
	dispatchedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil ||
		binding.ServiceKind != "controlled-workspace" || binding.OwnerImplementationDigest == "" ||
		evaluationOwnerStatefulOperation(binding.ServiceKind, binding.Operation, binding.RouteBinding) ||
		evaluationG3CellAdmissionBindingKind(binding) || claimGeneration != 1 || dispatchedAt.IsZero() ||
		!evaluationDigestPattern.MatchString(stageDigest) {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrInvalid
	}
	dispatchedAt = dispatchedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
	SET state='dispatched',stage_digest=$6,dispatched_at=$7
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind='controlled-workspace' AND request_digest=$4
		AND owner_implementation_digest=$5 AND state='claimed' AND claim_generation=1 AND v46_eligible`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, binding.RequestDigest,
		binding.OwnerImplementationDigest, stageDigest, dispatchedAt)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	record, err := queryEvaluationControlledAuthorityRequest(ctx, repository.db, authority, partition, binding)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if !oneOfString(record.State, "dispatched", "sealed") || record.StageDigest != stageDigest {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	return record, updated == 0, nil
}

func (repository *Repository) SealEvaluationControlledWorkspaceStatelessResult(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimGeneration int64,
	stageDigest string,
	dispatchAckDigest string,
	responseDigest string,
	responseBytes []byte,
	sealedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	computed, digestErr := evaluationCanonicalByteDigest(responseBytes, maximumEvaluationControlledAuthorityResponseBytes)
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil ||
		binding.ServiceKind != "controlled-workspace" || binding.OwnerImplementationDigest == "" ||
		evaluationOwnerStatefulOperation(binding.ServiceKind, binding.Operation, binding.RouteBinding) ||
		evaluationG3CellAdmissionBindingKind(binding) || claimGeneration != 1 || sealedAt.IsZero() ||
		!evaluationDigestPattern.MatchString(stageDigest) || !evaluationDigestPattern.MatchString(dispatchAckDigest) ||
		digestErr != nil || computed != responseDigest {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrInvalid
	}
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
	SET state='sealed',response_digest=$7,response_bytes=$8,dispatch_ack_digest=$9,sealed_at=$10
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind='controlled-workspace' AND request_digest=$4
		AND owner_implementation_digest=$5 AND stage_digest=$6 AND state='dispatched'
		AND claim_generation=1 AND v46_eligible`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, binding.RequestDigest,
		binding.OwnerImplementationDigest, stageDigest, responseDigest, responseBytes, dispatchAckDigest, sealedAt)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	record, err := queryEvaluationControlledAuthorityRequest(ctx, repository.db, authority, partition, binding)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if record.State != "sealed" || record.StageDigest != stageDigest ||
		record.DispatchAckDigest != dispatchAckDigest || record.ResponseDigest != responseDigest ||
		!bytes.Equal(record.ResponseBytes, responseBytes) {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	return record, updated == 0, nil
}

// MarkEvaluationAttemptAuthorityDispatched persists the sidecar stage fence
// and the exact observation-set digest before provider/grader execution.
func (repository *Repository) MarkEvaluationAttemptAuthorityDispatched(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimGeneration int64,
	stageDigest string,
	providerCapabilityObservationReceiptSetDigest string,
	dispatchedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil ||
		claimGeneration != 1 || dispatchedAt.IsZero() ||
		!evaluationDigestPattern.MatchString(stageDigest) ||
		providerCapabilityObservationReceiptSetDigest != binding.ProviderCapabilityObservationReceiptSetDigest {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrInvalid
	}
	dispatchedAt = dispatchedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
	SET state='dispatched', stage_digest=$6,
		provider_capability_observation_receipt_set_digest=$7, dispatched_at=$8
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind=$4 AND request_digest=$5 AND state='claimed'
		AND claim_generation=1 AND v46_eligible`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, binding.ServiceKind, binding.RequestDigest, stageDigest,
		providerCapabilityObservationReceiptSetDigest, dispatchedAt)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	record, err := queryEvaluationControlledAuthorityRequest(ctx, repository.db, authority, partition, binding)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if record.State != "dispatched" && record.State != "sealed" {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	return record, updated == 0, nil
}

// SealEvaluationControlledAuthorityRequest commits only a canonical response
// digest. Safe controlled-Workspace ACK bytes may be persisted; Verification
// capabilities and nonces use a nil response and are always re-derived by the
// owning service on replay.
func (repository *Repository) SealEvaluationControlledAuthorityRequest(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimGeneration int64,
	responseDigest string,
	responseBytes []byte,
	sealedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil ||
		claimGeneration != 1 || !evaluationDigestPattern.MatchString(responseDigest) || sealedAt.IsZero() {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrInvalid
	}
	if len(responseBytes) != 0 {
		digest, err := evaluationCanonicalByteDigest(responseBytes, maximumEvaluationControlledAuthorityResponseBytes)
		if err != nil || digest != responseDigest {
			return EvaluationControlledAuthorityRequestRecord{}, false, ErrInvalid
		}
	}
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
	SET state='sealed', response_digest=$6, response_bytes=$7, sealed_at=$8
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind=$4 AND request_digest=$5 AND state='dispatched'
		AND claim_generation=1 AND v46_eligible`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, binding.ServiceKind, binding.RequestDigest,
		responseDigest, nullableBytes(responseBytes), sealedAt)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	record, err := queryEvaluationControlledAuthorityRequest(ctx, repository.db, authority, partition, binding)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if record.State != "sealed" || record.ResponseDigest != responseDigest ||
		(len(responseBytes) != 0 && !bytes.Equal(record.ResponseBytes, responseBytes)) {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	return record, updated == 0, nil
}

func nullableBytes(value []byte) any {
	if len(value) == 0 {
		return nil
	}
	return value
}

func decodeControlledWorkspaceGrantAcknowledgement(
	source []byte,
) (evaluationControlledWorkspaceGrant, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationControlledAuthorityResponseBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "operation", "requestDigest", "facts", "receiptDigest",
	}) || stringMember(value, "format") != evaluationControlledWorkspaceServiceFormat ||
		stringMember(value, "operation") != "grant.issue" ||
		!evaluationDigestPattern.MatchString(stringMember(value, "requestDigest")) ||
		!verificationEvidenceReceiptDigestMatches(value) {
		return evaluationControlledWorkspaceGrant{}, ErrConflict
	}
	version, versionOK := integerMember(value, "version")
	facts, factsOK := value["facts"].([]any)
	if !versionOK || version != evaluationControlledWorkspaceServiceVersion || !factsOK || len(facts) != 1 {
		return evaluationControlledWorkspaceGrant{}, ErrConflict
	}
	grantValue, ok := facts[0].(map[string]any)
	if !ok {
		return evaluationControlledWorkspaceGrant{}, ErrConflict
	}
	grant, err := decodeEvaluationControlledWorkspaceGrant(grantValue)
	if err != nil {
		return evaluationControlledWorkspaceGrant{}, ErrConflict
	}
	return grant, nil
}

// AuthorizeEvaluationControlledWorkspaceRequest fences the Workspace owner to
// the frozen plan schedule and to a previously sealed grant issued for the
// same attempt/descriptor/generation. A service credential alone cannot mint
// an out-of-plan execution identity.
func (repository *Repository) AuthorizeEvaluationControlledWorkspaceRequest(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
) error {
	if err := repository.available(); err != nil {
		return err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil {
		return err
	}
	if binding.Operation == "session.orphans.list" {
		return nil
	}
	if binding.Operation == "grant.issue" {
		planRecord, err := repository.GetEvaluationPlan(ctx, authority, partition)
		if err != nil {
			return err
		}
		plan, err := decodeEvaluationPlan(planRecord.FactBytes)
		if err != nil {
			return err
		}
		planned, err := evaluationStatusPlannedAttempts(plan)
		if err != nil {
			return err
		}
		for _, expected := range planned {
			if expected.AttemptID == binding.AttemptID {
				if expected.DescriptorDigest != binding.DescriptorDigest {
					return ErrConflict
				}
				return nil
			}
		}
		return ErrConflict
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	rows, err := repository.db.QueryContext(ctx, `SELECT response_bytes
		FROM agent_evaluation_controlled_authority_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind='controlled-workspace' AND operation='grant.issue'
			AND attempt_id=$4 AND state='sealed' AND v46_eligible AND response_bytes IS NOT NULL
		ORDER BY claimed_at ASC`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, binding.AttemptID)
	if err != nil {
		return err
	}
	defer rows.Close()
	matched := false
	for rows.Next() {
		var source []byte
		if err := rows.Scan(&source); err != nil {
			return err
		}
		grant, err := decodeControlledWorkspaceGrantAcknowledgement(source)
		if err != nil {
			return err
		}
		if grant.GrantDigest != binding.GrantDigest || grant.Generation != binding.Generation {
			continue
		}
		if grant.PlanDigest != partition.PlanDigest || grant.AttemptID != binding.AttemptID ||
			(binding.DescriptorDigest != "" && grant.DescriptorDigest != binding.DescriptorDigest) ||
			!time.Now().UTC().Before(grant.ExpiresAt) || matched {
			return ErrConflict
		}
		matched = true
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if !matched {
		return ErrNotFound
	}
	return nil
}

func validateEvaluationVerificationSandboxRegistration(
	partition EvaluationPlanPartition,
	record EvaluationVerificationSandboxRegistrationRecord,
) error {
	if err := validateEvaluationPartition(partition); err != nil {
		return err
	}
	for _, identity := range []string{record.AttemptID, record.WorkspaceID, record.RegistrationID} {
		if !validEvaluationServiceIdentity(identity) {
			return ErrInvalid
		}
	}
	for _, digest := range []string{
		record.PlanDigest, record.DescriptorDigest, record.VerificationPlanDigest,
		record.AuthorityDigest, record.GrantReceiptSetDigest,
		record.IdempotencyKeyDigest, record.RequestDigest,
		record.RegistrationDigest, record.ReceiptDigest,
	} {
		if !evaluationDigestPattern.MatchString(digest) {
			return ErrInvalid
		}
	}
	if record.PlanDigest != partition.PlanDigest || record.RepositoryCommit != partition.RepositoryCommit ||
		record.Generation < 1 || record.Generation > 9_007_199_254_740_991 ||
		record.WorkspaceRevision < 1 || record.WorkspaceRevision > 9_007_199_254_740_991 ||
		record.RegisteredAt.IsZero() || len(record.ResponseBytes) == 0 ||
		len(record.ResponseBytes) > maximumEvaluationSandboxRegistrationResponseBytes {
		return ErrInvalid
	}
	digest, err := evaluationCanonicalByteDigest(record.ResponseBytes, maximumEvaluationSandboxRegistrationResponseBytes)
	if err != nil {
		return err
	}
	var response struct {
		ReceiptDigest string `json:"receiptDigest"`
	}
	if err := decodeEvaluationServiceRawJSON(record.ResponseBytes, &response); err != nil ||
		response.ReceiptDigest != record.ReceiptDigest || digest == "" {
		return ErrInvalid
	}
	return nil
}

func (repository *Repository) StoreEvaluationVerificationSandboxRegistration(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	record EvaluationVerificationSandboxRegistrationRecord,
) (EvaluationVerificationSandboxRegistrationRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, false, err
	}
	record.NamespaceID = authority.NamespaceID
	record.PlanDigest = partition.PlanDigest
	record.RepositoryCommit = partition.RepositoryCommit
	if err := validateEvaluationVerificationSandboxRegistration(partition, record); err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, false, err
	}
	record.RegisteredAt = record.RegisteredAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `INSERT INTO agent_evaluation_verification_sandbox_registrations (
		namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest,
		generation, workspace_id, workspace_revision, verification_plan_digest,
		authority_digest, grant_receipt_set_digest, idempotency_key_digest,
		request_digest, registration_id, registration_digest, receipt_digest,
		response_bytes, registered_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
	ON CONFLICT DO NOTHING`, record.NamespaceID, record.PlanDigest,
		record.RepositoryCommit, record.AttemptID, record.DescriptorDigest,
		record.Generation, record.WorkspaceID, record.WorkspaceRevision,
		record.VerificationPlanDigest, record.AuthorityDigest,
		record.GrantReceiptSetDigest, record.IdempotencyKeyDigest,
		record.RequestDigest, record.RegistrationID, record.RegistrationDigest,
		record.ReceiptDigest, record.ResponseBytes, record.RegisteredAt)
	if err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, false, err
	}
	existing, err := repository.GetEvaluationVerificationSandboxRegistration(
		ctx, authority, partition, record.AttemptID,
	)
	if err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, false, err
	}
	if existing.DescriptorDigest != record.DescriptorDigest || existing.Generation != record.Generation ||
		existing.WorkspaceID != record.WorkspaceID || existing.WorkspaceRevision != record.WorkspaceRevision ||
		existing.VerificationPlanDigest != record.VerificationPlanDigest ||
		existing.AuthorityDigest != record.AuthorityDigest ||
		existing.GrantReceiptSetDigest != record.GrantReceiptSetDigest ||
		existing.IdempotencyKeyDigest != record.IdempotencyKeyDigest ||
		existing.RequestDigest != record.RequestDigest ||
		existing.RegistrationID != record.RegistrationID ||
		existing.RegistrationDigest != record.RegistrationDigest ||
		existing.ReceiptDigest != record.ReceiptDigest ||
		!bytes.Equal(existing.ResponseBytes, record.ResponseBytes) {
		return EvaluationVerificationSandboxRegistrationRecord{}, false, ErrConflict
	}
	return existing, inserted == 0, nil
}

func (repository *Repository) GetEvaluationVerificationSandboxRegistration(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
) (EvaluationVerificationSandboxRegistrationRecord, error) {
	if err := repository.available(); err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil || !validEvaluationServiceIdentity(attemptID) {
		return EvaluationVerificationSandboxRegistrationRecord{}, ErrInvalid
	}
	ctx, cancel := evaluationReadContext(ctx)
	defer cancel()
	var record EvaluationVerificationSandboxRegistrationRecord
	record.NamespaceID, record.PlanDigest, record.RepositoryCommit = authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit
	err := repository.db.QueryRowContext(ctx, `SELECT attempt_id, descriptor_digest,
		generation, workspace_id, workspace_revision, verification_plan_digest,
		authority_digest, grant_receipt_set_digest, idempotency_key_digest,
		request_digest, registration_id, registration_digest, receipt_digest,
		response_bytes, registered_at
	FROM agent_evaluation_verification_sandbox_registrations
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND attempt_id=$4`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, attemptID).Scan(
		&record.AttemptID, &record.DescriptorDigest, &record.Generation,
		&record.WorkspaceID, &record.WorkspaceRevision, &record.VerificationPlanDigest,
		&record.AuthorityDigest, &record.GrantReceiptSetDigest,
		&record.IdempotencyKeyDigest, &record.RequestDigest, &record.RegistrationID,
		&record.RegistrationDigest, &record.ReceiptDigest, &record.ResponseBytes,
		&record.RegisteredAt)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationVerificationSandboxRegistrationRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, err
	}
	if err := validateEvaluationVerificationSandboxRegistration(partition, record); err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, ErrConflict
	}
	return record, nil
}
