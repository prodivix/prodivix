package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourceCleanupClaimAuthorityIssuerID    = "authority.prodivix.hosted-retrieval-runtime-cleanup-claims"
	evaluationHostedRetrievalRuntimeResourceCleanupClaimImplementationFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-claim-implementation"
)

type evaluationHostedRetrievalRuntimeResourceCleanupClaimSource struct {
	ClaimSource                    string
	NamespaceID                    string
	RepositoryCommit               string
	PlanDigest                     string
	FrozenRunDigest                string
	RunConfigArtifactBindingDigest string
	RuntimeResourceSetID           string
	AuthorityDigest                string
	ResourceSetCommitmentDigest    string
	ClaimSourceReceiptDigest       string
	CandidateDigest                any
	ExpectedActiveStateDigest      string
	ExpectedReadLeaseRootDigest    string
	ExpectedTerminalFenceDigest    string
	ExpectedResourceExpiresAt      time.Time
	ExpectedEligibleAt             time.Time
	ExpectedDisposition            string
	CleanupOwnerInstanceID         string
	ClaimedAt                      time.Time
	MinimumClaimExpiresAt          time.Time
	RequestDigest                  string
	RequestValue                   map[string]any
	RequestCanonical               []byte
}

type evaluationHostedRetrievalRuntimeResourceCleanupContext struct {
	RegistrationRequestDigest        string
	RuntimeResourceSetID             string
	ResourceSetCommitmentDigest      string
	ProviderResourceKind             string
	ProviderResourceID               string
	ResourceExpiresAt                time.Time
	ActiveOwnerInstanceID            string
	ClaimGeneration                  int64
	Lifecycle                        string
	ReadLeaseNotAfter                *time.Time
	CurrentStateDigest               string
	CurrentState                     map[string]any
	CurrentStateUpdatedAt            time.Time
	CurrentCleanupClaimReceiptDigest *string
	CurrentCleanupRequestDigest      *string
	PriorActiveStateDigest           string
	PriorActiveState                 map[string]any
	RegistrationResult               map[string]any
	ResourceSetCommitment            map[string]any
	StoredRunTerminalFence           map[string]any
	ReadLeaseLedgerRoot              map[string]any
	OverdueReceipt                   any
}

func evaluationHostedRetrievalRuntimeResourceCleanupClaimImplementationDigest() (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":                 evaluationHostedRetrievalRuntimeResourceCleanupClaimImplementationFormat,
		"version":                evaluationHostedRetrievalRuntimeResourceVersion,
		"claimAuthorityIssuerId": evaluationHostedRetrievalRuntimeResourceCleanupClaimAuthorityIssuerID,
	})
}

func evaluationHostedRetrievalRuntimeResourcePostMatrixClaimSource(
	request evaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequest,
) evaluationHostedRetrievalRuntimeResourceCleanupClaimSource {
	return evaluationHostedRetrievalRuntimeResourceCleanupClaimSource{
		ClaimSource: "post-matrix", NamespaceID: request.NamespaceID, RepositoryCommit: request.RepositoryCommit,
		PlanDigest: request.PlanDigest, FrozenRunDigest: request.FrozenRunDigest,
		RunConfigArtifactBindingDigest: request.RunConfigArtifactBindingDigest, RuntimeResourceSetID: request.RuntimeResourceSetID,
		AuthorityDigest: request.AuthorityDigest, ResourceSetCommitmentDigest: request.ResourceSetCommitmentDigest,
		ClaimSourceReceiptDigest: request.TerminalFenceDeriveReceipt.ReceiptDigest, CandidateDigest: nil,
		CleanupOwnerInstanceID: request.CleanupOwnerInstanceID, ClaimedAt: request.ClaimedAt,
		MinimumClaimExpiresAt: request.MinimumClaimExpiresAt, RequestDigest: request.RequestDigest,
		RequestValue: request.Value, RequestCanonical: request.Canonical,
	}
}

func evaluationHostedRetrievalRuntimeResourceRecoveryClaimSource(
	request evaluationHostedRetrievalRuntimeResourceRecoveryClaimRequest,
) evaluationHostedRetrievalRuntimeResourceCleanupClaimSource {
	return evaluationHostedRetrievalRuntimeResourceCleanupClaimSource{
		ClaimSource: "recovery", NamespaceID: request.NamespaceID, RepositoryCommit: request.Candidate.RepositoryCommit,
		PlanDigest: request.Candidate.PlanDigest, FrozenRunDigest: request.Candidate.FrozenRunDigest,
		RunConfigArtifactBindingDigest: request.Candidate.RunConfigArtifactBindingDigest,
		RuntimeResourceSetID:           request.Candidate.RuntimeResourceSetID, AuthorityDigest: request.Candidate.AuthorityDigest,
		ResourceSetCommitmentDigest: request.Candidate.ResourceSetCommitmentDigest,
		ClaimSourceReceiptDigest:    request.RecoveryPageDigest, CandidateDigest: request.Candidate.CandidateDigest,
		ExpectedActiveStateDigest:   request.ExpectedActiveStateDigest,
		ExpectedReadLeaseRootDigest: request.Candidate.ReadLeaseLedgerRootDigest,
		ExpectedTerminalFenceDigest: request.Candidate.StoredRunTerminalFenceDigest,
		ExpectedResourceExpiresAt:   request.Candidate.ResourceExpiresAt, ExpectedEligibleAt: request.Candidate.EligibleAt,
		ExpectedDisposition: request.Candidate.Disposition, CleanupOwnerInstanceID: request.CleanupOwnerInstanceID,
		ClaimedAt: request.ClaimedAt, RequestDigest: request.RequestDigest, RequestValue: request.Value, RequestCanonical: request.Canonical,
	}
}

func loadEvaluationHostedRetrievalRuntimeResourceCleanupContextTx(
	ctx context.Context,
	tx *sql.Tx,
	source evaluationHostedRetrievalRuntimeResourceCleanupClaimSource,
) (evaluationHostedRetrievalRuntimeResourceCleanupContext, error) {
	var result evaluationHostedRetrievalRuntimeResourceCleanupContext
	var readLeaseNotAfter sql.NullTime
	var currentClaim, currentRequest sql.NullString
	var currentStateBytes []byte
	err := tx.QueryRowContext(ctx, `SELECT registration_request_digest,runtime_resource_set_id,resource_set_commitment_digest,
		provider_resource_kind,provider_resource_id,resource_expires_at,active_owner_instance_id,claim_generation,
		lifecycle,read_lease_not_after,current_state_digest,current_state_bytes,current_state_updated_at,
		current_cleanup_claim_receipt_digest,cleanup_request_digest
		FROM agent_evaluation_hosted_retrieval_runtime_resources
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND authority_digest=$4 FOR UPDATE`,
		source.NamespaceID, source.PlanDigest, source.RepositoryCommit, source.AuthorityDigest).Scan(
		&result.RegistrationRequestDigest, &result.RuntimeResourceSetID, &result.ResourceSetCommitmentDigest,
		&result.ProviderResourceKind, &result.ProviderResourceID, &result.ResourceExpiresAt, &result.ActiveOwnerInstanceID,
		&result.ClaimGeneration, &result.Lifecycle, &readLeaseNotAfter, &result.CurrentStateDigest, &currentStateBytes,
		&result.CurrentStateUpdatedAt, &currentClaim, &currentRequest,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return result, ErrNotFound
	}
	if err != nil {
		return result, err
	}
	if readLeaseNotAfter.Valid {
		value := readLeaseNotAfter.Time.UTC().Truncate(time.Millisecond)
		result.ReadLeaseNotAfter = &value
	}
	if currentClaim.Valid {
		value := currentClaim.String
		result.CurrentCleanupClaimReceiptDigest = &value
	}
	if currentRequest.Valid {
		value := currentRequest.String
		result.CurrentCleanupRequestDigest = &value
	}
	result.CurrentState, err = decodeCanonicalEvaluationObject(currentStateBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil || result.RuntimeResourceSetID != source.RuntimeResourceSetID ||
		result.ResourceSetCommitmentDigest != source.ResourceSetCommitmentDigest {
		return result, ErrConflict
	}
	if result.Lifecycle == "active" {
		if stringMember(result.CurrentState, "stateDigest") != result.CurrentStateDigest {
			return result, ErrConflict
		}
	} else {
		digest, digestErr := canonicaljson.Digest(result.CurrentState)
		if digestErr != nil || digest != result.CurrentStateDigest {
			return result, ErrConflict
		}
	}
	result.PriorActiveStateDigest = result.CurrentStateDigest
	result.PriorActiveState = result.CurrentState
	if result.Lifecycle == "cleanup-in-progress" {
		if source.ClaimSource != "recovery" || result.CurrentCleanupClaimReceiptDigest == nil || result.CurrentCleanupRequestDigest == nil {
			return result, ErrConflict
		}
		var priorClaimExpiresAt time.Time
		err = tx.QueryRowContext(ctx, `SELECT request.prior_active_state_digest,claim.claim_expires_at
			FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts outer_claim
			JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims claim
			  ON claim.namespace_id=outer_claim.namespace_id
			 AND claim.receipt_digest=outer_claim.cleanup_claim_authority_receipt_digest
			JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests request
			  ON request.namespace_id=outer_claim.namespace_id AND request.request_digest=outer_claim.cleanup_request_digest
			WHERE outer_claim.namespace_id=$1 AND outer_claim.receipt_digest=$2 AND request.request_digest=$3 FOR SHARE`,
			source.NamespaceID, *result.CurrentCleanupClaimReceiptDigest, *result.CurrentCleanupRequestDigest).Scan(
			&result.PriorActiveStateDigest, &priorClaimExpiresAt,
		)
		if err != nil || !priorClaimExpiresAt.Before(source.ClaimedAt) {
			return result, ErrConflict
		}
		var priorStateBytes []byte
		err = tx.QueryRowContext(ctx, `SELECT convert_to(agent_evaluation_canonical_jsonb_text(
			agent_evaluation_hosted_runtime_active_state_by_digest($1,$2,$3,$4,$5)),'UTF8')`,
			source.NamespaceID, source.PlanDigest, source.RepositoryCommit, source.AuthorityDigest,
			result.PriorActiveStateDigest).Scan(&priorStateBytes)
		if err != nil {
			return result, err
		}
		result.PriorActiveState, err = decodeCanonicalEvaluationObject(priorStateBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
		if err != nil || stringMember(result.PriorActiveState, "stateDigest") != result.PriorActiveStateDigest {
			return result, ErrConflict
		}
	} else if result.Lifecycle != "active" {
		return result, ErrConflict
	}
	if source.ExpectedActiveStateDigest != "" && source.ExpectedActiveStateDigest != result.PriorActiveStateDigest {
		return result, ErrConflict
	}
	var registrationResultBytes, commitmentBytes, fenceBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT result.registration_result_bytes,set.resource_set_commitment_bytes,fence.fence_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_results result
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_sets set
		  ON set.namespace_id=result.namespace_id AND set.plan_digest=result.plan_digest
		 AND set.repository_commit=result.repository_commit AND set.runtime_resource_set_id=$5
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences fence
		  ON fence.namespace_id=set.namespace_id AND fence.plan_digest=set.plan_digest
		 AND fence.repository_commit=set.repository_commit AND fence.runtime_resource_set_id=set.runtime_resource_set_id
		WHERE result.namespace_id=$1 AND result.plan_digest=$2 AND result.repository_commit=$3
		  AND result.registration_request_digest=$4 FOR SHARE`, source.NamespaceID, source.PlanDigest,
		source.RepositoryCommit, result.RegistrationRequestDigest, source.RuntimeResourceSetID).Scan(
		&registrationResultBytes, &commitmentBytes, &fenceBytes,
	)
	if err != nil {
		return result, err
	}
	result.RegistrationResult, err = decodeCanonicalEvaluationObject(registrationResultBytes, maximumEvaluationHostedRetrievalRuntimeResourceRegistrationResultBytes)
	if err != nil {
		return result, ErrConflict
	}
	decodedRegistration, err := decodeEvaluationHostedRetrievalRuntimeResourceRegistrationResult(registrationResultBytes)
	if err != nil || decodedRegistration.AuthorityDigest != source.AuthorityDigest {
		return result, ErrConflict
	}
	result.ResourceSetCommitment, err = decodeCanonicalEvaluationObject(commitmentBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil || stringMember(result.ResourceSetCommitment, "commitmentDigest") != source.ResourceSetCommitmentDigest {
		return result, ErrConflict
	}
	result.StoredRunTerminalFence, err = decodeCanonicalEvaluationObject(fenceBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil || validateEvaluationHostedArchiveSelfDigest(result.StoredRunTerminalFence, evaluationHostedTerminalFenceKeys,
		evaluationHostedRetrievalRuntimeResourceTerminalFenceFormat, "fenceDigest") != nil ||
		stringMember(result.StoredRunTerminalFence, "runtimeResourceSetId") != source.RuntimeResourceSetID {
		return result, ErrConflict
	}
	fenceSealedAt, err := evaluationInstant(result.StoredRunTerminalFence["sealedAt"], "sealedAt")
	if err != nil || source.ClaimedAt.Before(fenceSealedAt) || source.ClaimedAt.Before(result.CurrentStateUpdatedAt) {
		return result, ErrConflict
	}
	root, _, err := sealEvaluationHostedRetrievalRuntimeResourceReadLeaseRootTx(
		ctx, tx, source.NamespaceID, source.PlanDigest, source.RepositoryCommit, source.AuthorityDigest, source.ClaimedAt,
	)
	if err != nil {
		return result, err
	}
	result.ReadLeaseLedgerRoot = root
	if source.ClaimSource == "recovery" && (stringMember(result.ReadLeaseLedgerRoot, "rootDigest") != source.ExpectedReadLeaseRootDigest ||
		stringMember(result.StoredRunTerminalFence, "fenceDigest") != source.ExpectedTerminalFenceDigest ||
		!result.ResourceExpiresAt.Equal(source.ExpectedResourceExpiresAt) ||
		source.ClaimedAt.Before(source.ExpectedEligibleAt)) {
		return result, ErrConflict
	}
	if source.ClaimSource == "recovery" {
		switch source.ExpectedDisposition {
		case "cleanup-incomplete":
			if result.Lifecycle != "cleanup-in-progress" || !source.ClaimedAt.After(source.ExpectedEligibleAt) {
				return result, ErrConflict
			}
		case "resource-expired":
			if result.Lifecycle != "active" || !source.ExpectedEligibleAt.Equal(result.ResourceExpiresAt) ||
				!source.ClaimedAt.After(result.ResourceExpiresAt) {
				return result, ErrConflict
			}
		case "run-terminal":
			if result.Lifecycle != "active" || !source.ExpectedEligibleAt.Equal(fenceSealedAt) {
				return result, ErrConflict
			}
		default:
			return result, ErrConflict
		}
	}
	if source.ClaimedAt.After(result.ResourceExpiresAt) {
		overdueBase := map[string]any{
			"format":  evaluationHostedRetrievalRuntimeResourceOverdueReceiptFormat,
			"version": evaluationHostedRetrievalRuntimeResourceVersion, "planDigest": source.PlanDigest,
			"runConfigArtifactBindingDigest": source.RunConfigArtifactBindingDigest, "runtimeResourceSetId": source.RuntimeResourceSetID,
			"authorityDigest": source.AuthorityDigest, "providerResourceKind": result.ProviderResourceKind,
			"providerResourceId": result.ProviderResourceID, "resourceExpiresAt": evaluationExportInstant(result.ResourceExpiresAt),
			"detectedAt": evaluationExportInstant(source.ClaimedAt), "disposition": "cleanup-required",
		}
		overdue, overdueBytes, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(overdueBase, "receiptDigest")
		if err != nil || len(overdueBytes) > maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes {
			return result, ErrConflict
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_overdue_receipts (
			namespace_id,plan_digest,repository_commit,authority_digest,receipt_digest,resource_expires_at,
			detected_at,receipt_json,receipt_bytes
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
		ON CONFLICT (namespace_id,plan_digest,repository_commit,authority_digest) DO NOTHING`, source.NamespaceID,
			source.PlanDigest, source.RepositoryCommit, source.AuthorityDigest, stringMember(overdue, "receiptDigest"),
			result.ResourceExpiresAt, source.ClaimedAt, string(overdueBytes), overdueBytes)
		if err != nil {
			return result, err
		}
		var storedOverdueBytes []byte
		if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes FROM agent_evaluation_hosted_retrieval_runtime_resource_overdue_receipts
			WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND authority_digest=$4 FOR SHARE`,
			source.NamespaceID, source.PlanDigest, source.RepositoryCommit, source.AuthorityDigest).Scan(&storedOverdueBytes); err != nil {
			return result, err
		}
		storedOverdue, err := decodeCanonicalEvaluationObject(storedOverdueBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
		if err != nil || stringMember(storedOverdue, "resourceExpiresAt") != evaluationExportInstant(result.ResourceExpiresAt) {
			return result, ErrConflict
		}
		result.OverdueReceipt = storedOverdue
	} else {
		result.OverdueReceipt = nil
	}
	return result, nil
}

func storeEvaluationHostedRetrievalRuntimeResourceCleanupClaimTx(
	ctx context.Context,
	tx *sql.Tx,
	source evaluationHostedRetrievalRuntimeResourceCleanupClaimSource,
	contextValue evaluationHostedRetrievalRuntimeResourceCleanupContext,
) ([]byte, error) {
	claimGeneration := contextValue.ClaimGeneration + 1
	if claimGeneration < 1 || claimGeneration > 9_007_199_254_740_991 {
		return nil, ErrConflict
	}
	claimExpiresAt := source.ClaimedAt.Add(15 * time.Minute)
	if !source.MinimumClaimExpiresAt.IsZero() && claimExpiresAt.Before(source.MinimumClaimExpiresAt) {
		return nil, ErrConflict
	}
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceCleanupClaimImplementationDigest()
	if err != nil {
		return nil, err
	}
	var claimLedgerRevision int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(claim_ledger_revision),0)+1
		FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND authority_digest=$4`,
		source.NamespaceID, source.PlanDigest, source.RepositoryCommit, source.AuthorityDigest).Scan(&claimLedgerRevision); err != nil {
		return nil, err
	}
	claimedStateBase := map[string]any{
		"format":  "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-claimed-state",
		"version": evaluationHostedRetrievalRuntimeResourceVersion, "authorityDigest": source.AuthorityDigest,
		"resourceSetCommitmentDigest": source.ResourceSetCommitmentDigest, "cleanupOwnerInstanceId": source.CleanupOwnerInstanceID,
		"claimGeneration": claimGeneration, "claimedAt": evaluationExportInstant(source.ClaimedAt), "lifecycle": "cleanup-in-progress",
	}
	claimedStateDigest, err := canonicaljson.Digest(claimedStateBase)
	if err != nil {
		return nil, err
	}
	claimBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceCleanupClaimFormat, "version": evaluationHostedRetrievalRuntimeResourceVersion,
		"claimId":                            "hosted-runtime-cleanup-claim." + strings.TrimPrefix(source.RequestDigest, "sha256-"),
		"claimAuthorityIssuerId":             evaluationHostedRetrievalRuntimeResourceCleanupClaimAuthorityIssuerID,
		"claimAuthorityImplementationDigest": implementationDigest, "claimLedgerRevision": claimLedgerRevision,
		"namespaceId": source.NamespaceID, "repositoryCommit": source.RepositoryCommit, "planDigest": source.PlanDigest,
		"frozenRunDigest": source.FrozenRunDigest, "runConfigArtifactBindingDigest": source.RunConfigArtifactBindingDigest,
		"runtimeResourceSetId": source.RuntimeResourceSetID, "authorityDigest": source.AuthorityDigest,
		"resourceSetCommitmentDigest": source.ResourceSetCommitmentDigest,
		"expectedActiveStateDigest":   contextValue.PriorActiveStateDigest, "cleanupOwnerInstanceId": source.CleanupOwnerInstanceID,
		"claimGeneration": claimGeneration, "claimedStateDigest": claimedStateDigest,
		"claimedAt": evaluationExportInstant(source.ClaimedAt), "claimExpiresAt": evaluationExportInstant(claimExpiresAt),
	}
	claim, claimBytes, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(claimBase, "receiptDigest")
	if err != nil || len(claimBytes) > maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes {
		return nil, ErrConflict
	}
	readRootDigest := stringMember(contextValue.ReadLeaseLedgerRoot, "rootDigest")
	fenceDigest := stringMember(contextValue.StoredRunTerminalFence, "fenceDigest")
	registrationResultBytes, err := canonicaljson.Bytes(contextValue.RegistrationResult)
	if err != nil {
		return nil, err
	}
	registration, err := decodeEvaluationHostedRetrievalRuntimeResourceRegistrationResult(registrationResultBytes)
	if err != nil {
		return nil, ErrConflict
	}
	cleanupReason := "matrix-terminal"
	var overdueDigest any
	if contextValue.OverdueReceipt != nil {
		cleanupReason = "expired"
		overdueDigest = stringMember(contextValue.OverdueReceipt.(map[string]any), "receiptDigest")
	} else if source.ClaimSource == "recovery" && contextValue.Lifecycle == "cleanup-in-progress" {
		cleanupReason = "startup-reconcile"
		overdueDigest = nil
	} else {
		overdueDigest = nil
	}
	deletionNotBefore := source.ClaimedAt
	if contextValue.ReadLeaseNotAfter != nil && contextValue.ReadLeaseNotAfter.After(deletionNotBefore) {
		deletionNotBefore = *contextValue.ReadLeaseNotAfter
	}
	cleanupRequestBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceCleanupRequestFormat, "version": evaluationHostedRetrievalRuntimeResourceVersion,
		"namespaceId": source.NamespaceID, "repositoryCommit": source.RepositoryCommit, "planDigest": source.PlanDigest,
		"frozenRunDigest": source.FrozenRunDigest, "runConfigArtifactBindingDigest": source.RunConfigArtifactBindingDigest,
		"runtimeResourceSetId": source.RuntimeResourceSetID, "authorityDigest": source.AuthorityDigest,
		"resourceSetCommitmentDigest": source.ResourceSetCommitmentDigest, "readLeaseLedgerRootDigest": readRootDigest,
		"cleanupClaimAuthorityReceiptDigest": stringMember(claim, "receiptDigest"),
		"deletionAuthorityReceiptDigest":     registration.DeletionAuthorityReceiptDigest,
		"cleanupOwnerInstanceId":             source.CleanupOwnerInstanceID, "claimGeneration": claimGeneration,
		"priorActiveState": contextValue.PriorActiveState, "priorActiveStateDigest": contextValue.PriorActiveStateDigest,
		"claimedLifecycle": "cleanup-in-progress", "runTerminalFence": contextValue.StoredRunTerminalFence,
		"runTerminalFenceDigest": fenceDigest, "cleanupReason": cleanupReason, "overdueReceiptDigest": overdueDigest,
		"requestedAt": evaluationExportInstant(source.ClaimedAt), "deletionNotBefore": evaluationExportInstant(deletionNotBefore),
	}
	cleanupRequest, cleanupRequestBytes, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(cleanupRequestBase, "requestDigest")
	if err != nil || len(cleanupRequestBytes) > maximumEvaluationHostedRetrievalRuntimeResourceCleanupRequestBytes {
		return nil, ErrConflict
	}
	transitionBase := map[string]any{
		"format":  evaluationHostedRetrievalRuntimeResourceRecoveryClaimTransitionFormat,
		"version": evaluationHostedRetrievalRuntimeResourceVersion, "claimSource": source.ClaimSource,
		"recoveryAuthorityIssuerId":             evaluationHostedRetrievalRuntimeResourceCleanupClaimAuthorityIssuerID,
		"recoveryAuthorityImplementationDigest": implementationDigest, "claimLedgerRevision": claimLedgerRevision,
		"requestDigest": source.RequestDigest, "claimSourceReceiptDigest": source.ClaimSourceReceiptDigest,
		"candidateDigest": source.CandidateDigest, "expectedActiveStateDigest": contextValue.PriorActiveStateDigest,
		"claimedStateDigest": claimedStateDigest, "cleanupClaimAuthorityReceiptDigest": stringMember(claim, "receiptDigest"),
	}
	transitionDigest, err := canonicaljson.Digest(transitionBase)
	if err != nil {
		return nil, err
	}
	outerBase := map[string]any{
		"format":  evaluationHostedRetrievalRuntimeResourceRecoveryClaimReceiptFormat,
		"version": evaluationHostedRetrievalRuntimeResourceVersion, "claimSource": source.ClaimSource,
		"requestDigest": source.RequestDigest, "claimSourceReceiptDigest": source.ClaimSourceReceiptDigest,
		"candidateDigest": source.CandidateDigest, "recoveryAuthorityIssuerId": evaluationHostedRetrievalRuntimeResourceCleanupClaimAuthorityIssuerID,
		"recoveryAuthorityImplementationDigest": implementationDigest, "claimLedgerRevision": claimLedgerRevision,
		"expectedActiveStateDigest": contextValue.PriorActiveStateDigest, "cleanupClaimAuthorityReceipt": claim,
		"cleanupClaimAuthorityReceiptDigest": stringMember(claim, "receiptDigest"), "registrationResult": contextValue.RegistrationResult,
		"resourceSetCommitment": contextValue.ResourceSetCommitment, "storedPriorActiveState": contextValue.PriorActiveState,
		"readLeaseLedgerRoot": contextValue.ReadLeaseLedgerRoot, "storedRunTerminalFence": contextValue.StoredRunTerminalFence,
		"overdueReceipt": contextValue.OverdueReceipt, "cleanupRequest": cleanupRequest, "cleanupClaimGeneration": claimGeneration,
		"claimedStateDigest": claimedStateDigest, "claimStateTransitionDigest": transitionDigest,
		"claimedAt": evaluationExportInstant(source.ClaimedAt), "claimExpiresAt": evaluationExportInstant(claimExpiresAt),
	}
	outer, outerBytes, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(outerBase, "receiptDigest")
	if err != nil || len(outerBytes) > evaluationHostedRetrievalRuntimeResourceRecoveryClaimReceiptMaxBytes {
		return nil, ErrConflict
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims (
		namespace_id,plan_digest,repository_commit,authority_digest,receipt_digest,claim_id,claim_authority_issuer_id,
		claim_authority_implementation_digest,claim_ledger_revision,expected_active_state_digest,cleanup_owner_instance_id,
		claim_generation,claimed_state_digest,claimed_at,claim_expires_at,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)`, source.NamespaceID,
		source.PlanDigest, source.RepositoryCommit, source.AuthorityDigest, stringMember(claim, "receiptDigest"),
		stringMember(claim, "claimId"), evaluationHostedRetrievalRuntimeResourceCleanupClaimAuthorityIssuerID, implementationDigest,
		claimLedgerRevision, contextValue.PriorActiveStateDigest, source.CleanupOwnerInstanceID, claimGeneration, claimedStateDigest,
		source.ClaimedAt, claimExpiresAt, string(claimBytes), claimBytes)
	if err != nil {
		return nil, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests (
		namespace_id,plan_digest,repository_commit,authority_digest,request_digest,resource_set_commitment_digest,
		read_lease_ledger_root_digest,cleanup_claim_authority_receipt_digest,deletion_authority_receipt_digest,
		cleanup_owner_instance_id,claim_generation,prior_active_state_digest,run_terminal_fence_digest,cleanup_reason,
		overdue_receipt_digest,requested_at,deletion_not_before,request_json,request_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19)`, source.NamespaceID,
		source.PlanDigest, source.RepositoryCommit, source.AuthorityDigest, stringMember(cleanupRequest, "requestDigest"),
		source.ResourceSetCommitmentDigest, readRootDigest, stringMember(claim, "receiptDigest"), registration.DeletionAuthorityReceiptDigest,
		source.CleanupOwnerInstanceID, claimGeneration, contextValue.PriorActiveStateDigest, fenceDigest, cleanupReason,
		evaluationHostedNullableString(overdueDigest), source.ClaimedAt, deletionNotBefore, string(cleanupRequestBytes), cleanupRequestBytes)
	if err != nil {
		return nil, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts (
		namespace_id,plan_digest,repository_commit,authority_digest,claim_generation,request_digest,receipt_digest,
		claim_source,claim_source_receipt_digest,candidate_digest,recovery_authority_issuer_id,
		recovery_authority_implementation_digest,claim_ledger_revision,expected_active_state_digest,
		cleanup_claim_authority_receipt_digest,cleanup_request_digest,claimed_state_digest,claim_state_transition_digest,
		claimed_at,claim_expires_at,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22)`,
		source.NamespaceID, source.PlanDigest, source.RepositoryCommit, source.AuthorityDigest, claimGeneration,
		source.RequestDigest, stringMember(outer, "receiptDigest"), source.ClaimSource, source.ClaimSourceReceiptDigest,
		evaluationHostedNullableString(source.CandidateDigest), evaluationHostedRetrievalRuntimeResourceCleanupClaimAuthorityIssuerID,
		implementationDigest, claimLedgerRevision, contextValue.PriorActiveStateDigest, stringMember(claim, "receiptDigest"),
		stringMember(cleanupRequest, "requestDigest"), claimedStateDigest, transitionDigest, source.ClaimedAt, claimExpiresAt,
		string(outerBytes), outerBytes)
	if err != nil {
		return nil, err
	}
	claimedState := cloneEvaluationObject(claimedStateBase)
	claimedStateBytes, err := canonicaljson.Bytes(claimedState)
	if err != nil {
		return nil, err
	}
	update, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_hosted_retrieval_runtime_resources SET
		active_owner_instance_id=$5,claim_generation=$6,lifecycle='cleanup-in-progress',read_lease_not_after=NULL,
		current_state_digest=$7,current_state_json=$8::jsonb,current_state_bytes=$9,current_state_updated_at=$10,
		current_cleanup_claim_receipt_digest=$11,cleanup_request_digest=$12
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND authority_digest=$4
		  AND claim_generation=$13 AND current_state_updated_at=$14`, source.NamespaceID, source.PlanDigest,
		source.RepositoryCommit, source.AuthorityDigest, source.CleanupOwnerInstanceID, claimGeneration, claimedStateDigest,
		string(claimedStateBytes), claimedStateBytes, source.ClaimedAt, stringMember(outer, "receiptDigest"),
		stringMember(cleanupRequest, "requestDigest"), contextValue.ClaimGeneration, contextValue.CurrentStateUpdatedAt)
	if err != nil {
		return nil, err
	}
	rows, err := update.RowsAffected()
	if err != nil || rows != 1 {
		return nil, ErrConflict
	}
	return outerBytes, nil
}

func evaluationHostedNullableString(value any) any {
	if value == nil {
		return nil
	}
	if text, ok := value.(string); ok && text != "" {
		return text
	}
	return nil
}

func (owner *EvaluationHostedRetrievalRuntimeResource) claimCleanup(
	ctx context.Context,
	authority EvaluationAuthority,
	source evaluationHostedRetrievalRuntimeResourceCleanupClaimSource,
) ([]byte, bool, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil || validateEvaluationAuthority(authority) != nil ||
		source.NamespaceID != authority.NamespaceID {
		return nil, false, errEvaluationServiceUnavailable
	}
	observedAt := owner.clock().UTC().Truncate(time.Millisecond)
	if observedAt.IsZero() {
		return nil, false, ErrConflict
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback() }()
	requestTable := "agent_evaluation_hosted_retrieval_runtime_resource_post_matrix_cleanup_claim_requests"
	if source.ClaimSource == "recovery" {
		requestTable = "agent_evaluation_hosted_retrieval_runtime_resource_recovery_claim_requests"
	}
	var existingRequest, existingReceipt []byte
	replayQuery := `SELECT request.request_bytes,receipt.receipt_bytes FROM ` + requestTable + ` request
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts receipt
		  ON receipt.namespace_id=request.namespace_id AND receipt.request_digest=request.request_digest
		WHERE request.namespace_id=$1 AND request.request_digest=$2 FOR SHARE`
	err = tx.QueryRowContext(ctx, replayQuery, source.NamespaceID, source.RequestDigest).Scan(&existingRequest, &existingReceipt)
	if err == nil {
		if !bytes.Equal(existingRequest, source.RequestCanonical) {
			return nil, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return nil, false, err
		}
		return existingReceipt, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	if observedAt.Before(source.ClaimedAt) || !observedAt.Before(source.ClaimedAt.Add(15*time.Minute)) {
		return nil, false, ErrConflict
	}
	if source.ClaimSource == "post-matrix" {
		_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_post_matrix_cleanup_claim_requests (
			namespace_id,plan_digest,repository_commit,authority_digest,request_digest,runtime_resource_set_id,
			resource_set_commitment_digest,terminal_fence_derive_receipt_digest,cleanup_owner_instance_id,
			claimed_at,minimum_claim_expires_at,request_json,request_bytes
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`, source.NamespaceID,
			source.PlanDigest, source.RepositoryCommit, source.AuthorityDigest, source.RequestDigest,
			source.RuntimeResourceSetID, source.ResourceSetCommitmentDigest, source.ClaimSourceReceiptDigest,
			source.CleanupOwnerInstanceID, source.ClaimedAt, source.MinimumClaimExpiresAt,
			string(source.RequestCanonical), source.RequestCanonical)
	} else {
		_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_recovery_claim_requests (
			namespace_id,plan_digest,repository_commit,authority_digest,request_digest,recovery_page_digest,
			candidate_digest,expected_active_state_digest,cleanup_owner_instance_id,claimed_at,request_json,request_bytes
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`, source.NamespaceID,
			source.PlanDigest, source.RepositoryCommit, source.AuthorityDigest, source.RequestDigest,
			source.ClaimSourceReceiptDigest, evaluationHostedNullableString(source.CandidateDigest), source.ExpectedActiveStateDigest,
			source.CleanupOwnerInstanceID, source.ClaimedAt, string(source.RequestCanonical), source.RequestCanonical)
	}
	if err != nil {
		return nil, false, err
	}
	contextValue, err := loadEvaluationHostedRetrievalRuntimeResourceCleanupContextTx(ctx, tx, source)
	if err != nil {
		return nil, false, err
	}
	receipt, err := storeEvaluationHostedRetrievalRuntimeResourceCleanupClaimTx(ctx, tx, source, contextValue)
	if err != nil {
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return receipt, false, nil
}

func (owner *EvaluationHostedRetrievalRuntimeResource) ClaimPostMatrixCleanup(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequest,
) ([]byte, bool, error) {
	return owner.claimCleanup(ctx, authority, evaluationHostedRetrievalRuntimeResourcePostMatrixClaimSource(request))
}

func (owner *EvaluationHostedRetrievalRuntimeResource) ClaimRecoveryCleanup(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceRecoveryClaimRequest,
) ([]byte, bool, error) {
	return owner.claimCleanup(ctx, authority, evaluationHostedRetrievalRuntimeResourceRecoveryClaimSource(request))
}
