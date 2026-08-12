package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourceRecoveryAuthorityIssuerID    = "authority.prodivix.hosted-retrieval-runtime-resource-recovery"
	evaluationHostedRetrievalRuntimeResourceRecoveryImplementationFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-implementation"
	maximumEvaluationHostedRetrievalRuntimeResourceReadReceipts          = 14_040
)

type evaluationHostedRetrievalRuntimeResourceReadLedgerEntry struct {
	LedgerRevision  int64
	Request         evaluationHostedRetrievalRuntimeResourceReadRequest
	Receipt         map[string]any
	CheckedAt       time.Time
	ExpiresAt       time.Time
	ClaimGeneration int64
}

type evaluationHostedRetrievalRuntimeResourceRecoveryCandidateState struct {
	Lifecycle                      string
	RuntimeResourceSetID           string
	RegistrationAuthorityDigest    string
	FrozenRunDigest                string
	RunConfigArtifactBindingDigest string
	ResourceSetCommitmentDigest    string
	ResourceExpiresAt              time.Time
	RegistrationExpiresAt          time.Time
	CurrentStateDigest             string
	PriorActiveStateDigest         sql.NullString
	FenceDigest                    string
	FenceSealedAt                  time.Time
	ClaimExpiresAt                 sql.NullTime
	CleanupReadRootDigest          sql.NullString
	LatestReadLedgerRevision       int64
	ReadRootBytes                  []byte
}

func evaluationHostedRetrievalRuntimeResourceRecoveryImplementationDigest() (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":                    evaluationHostedRetrievalRuntimeResourceRecoveryImplementationFormat,
		"version":                   evaluationHostedRetrievalRuntimeResourceVersion,
		"recoveryAuthorityIssuerId": evaluationHostedRetrievalRuntimeResourceRecoveryAuthorityIssuerID,
	})
}

func decodeEvaluationHostedRetrievalRuntimeResourceCanonicalArray(source []byte, maximum int) ([]any, error) {
	if len(source) == 0 || len(source) > maximum || canonicaljson.ValidateRawEnvelope(source, maximum) != nil {
		return nil, ErrInvalid
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var value []any
	if err := decoder.Decode(&value); err != nil || value == nil {
		return nil, ErrInvalid
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return nil, ErrInvalid
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || !bytes.Equal(canonical, source) || agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return nil, ErrInvalid
	}
	return value, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceReadLedgerEntry(
	ledgerRevision int64,
	requestBytes []byte,
	receiptBytes []byte,
) (evaluationHostedRetrievalRuntimeResourceReadLedgerEntry, error) {
	request, err := decodeEvaluationHostedRetrievalRuntimeResourceReadRequest(requestBytes)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceReadLedgerEntry{}, ErrConflict
	}
	receipt, err := decodeCanonicalEvaluationObject(receiptBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	activeState, stateOK := objectMember(receipt, "activeState")
	claimGeneration, generationOK := integerMember(receipt, "claimGeneration")
	checkedAt, checkedErr := evaluationInstant(receipt["checkedAt"], "checkedAt")
	expiresAt, expiresErr := evaluationInstant(receipt["expiresAt"], "expiresAt")
	if err != nil || !exactEvaluationKeys(receipt, []string{
		"format", "version", "readRequestDigest", "planDigest", "runConfigArtifactBindingDigest",
		"runtimeResourceSetId", "authorityDigest", "resourceSetCommitmentDigest", "readLeaseId",
		"activeOwnerInstanceId", "claimGeneration", "activeState", "activeStateDigest", "lifecycle",
		"checkedAt", "expiresAt", "receiptDigest",
	}) || stringMember(receipt, "format") != "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-read-receipt" ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(receipt) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(receipt, "receiptDigest") || !stateOK ||
		validateEvaluationHostedArchiveSelfDigest(activeState, evaluationHostedActiveStateKeys,
			evaluationHostedRetrievalRuntimeResourceActiveStateFormat, "stateDigest") != nil ||
		!generationOK || claimGeneration < 1 || checkedErr != nil || expiresErr != nil ||
		!expiresAt.After(checkedAt) || expiresAt.Sub(checkedAt) > 180*time.Second ||
		expiresAt.Before(request.MinimumExpiresAt) || stringMember(receipt, "lifecycle") != "active" ||
		stringMember(receipt, "readRequestDigest") != request.RequestDigest ||
		stringMember(receipt, "planDigest") != request.PlanDigest ||
		stringMember(receipt, "runConfigArtifactBindingDigest") != request.RunConfigArtifactBindingDigest ||
		stringMember(receipt, "runtimeResourceSetId") != request.RuntimeResourceSetID ||
		stringMember(receipt, "authorityDigest") != request.AuthorityDigest ||
		stringMember(receipt, "resourceSetCommitmentDigest") != request.ResourceSetCommitmentDigest ||
		stringMember(receipt, "readLeaseId") != request.ReadLeaseID ||
		stringMember(receipt, "activeStateDigest") != stringMember(activeState, "stateDigest") ||
		stringMember(activeState, "authorityDigest") != request.AuthorityDigest ||
		stringMember(activeState, "resourceSetCommitmentDigest") != request.ResourceSetCommitmentDigest ||
		integerMemberOrZero(activeState, "claimGeneration") != claimGeneration ||
		stringMember(activeState, "lifecycle") != "active" ||
		stringMember(activeState, "readLeaseNotAfter") != evaluationExportInstant(expiresAt) ||
		stringMember(activeState, "updatedAt") != evaluationExportInstant(checkedAt) {
		return evaluationHostedRetrievalRuntimeResourceReadLedgerEntry{}, ErrConflict
	}
	return evaluationHostedRetrievalRuntimeResourceReadLedgerEntry{
		LedgerRevision:  ledgerRevision,
		Request:         request,
		Receipt:         receipt,
		CheckedAt:       checkedAt,
		ExpiresAt:       expiresAt,
		ClaimGeneration: claimGeneration,
	}, nil
}

func createEvaluationHostedRetrievalRuntimeResourceReadLeaseRootValue(
	entries []evaluationHostedRetrievalRuntimeResourceReadLedgerEntry,
	planDigest string,
	runConfigArtifactBindingDigest string,
	runtimeResourceSetID string,
	authorityDigest string,
	resourceSetCommitmentDigest string,
	sealedAt time.Time,
) (map[string]any, []byte, error) {
	if sealedAt.IsZero() || len(entries) > maximumEvaluationHostedRetrievalRuntimeResourceReadReceipts {
		return nil, nil, ErrConflict
	}
	readLeaseIDs := make([]any, 0, len(entries))
	requestDigests := make([]any, 0, len(entries))
	receiptDigests := make([]any, 0, len(entries))
	activeStateDigests := make([]any, 0, len(entries))
	var minimumGeneration, maximumGeneration int64
	var firstCheckedAt, lastExpiresAt time.Time
	previousRequestDigest := ""
	seenLedgerRevisions := make(map[int64]struct{}, len(entries))
	for index, entry := range entries {
		if entry.LedgerRevision < 1 || entry.LedgerRevision > maximumEvaluationHostedRetrievalRuntimeResourceReadReceipts ||
			entry.Request.PlanDigest != planDigest ||
			entry.Request.RunConfigArtifactBindingDigest != runConfigArtifactBindingDigest ||
			entry.Request.RuntimeResourceSetID != runtimeResourceSetID ||
			entry.Request.AuthorityDigest != authorityDigest ||
			entry.Request.ResourceSetCommitmentDigest != resourceSetCommitmentDigest ||
			(index > 0 && bytes.Compare([]byte(previousRequestDigest), []byte(entry.Request.RequestDigest)) >= 0) {
			return nil, nil, ErrConflict
		}
		if _, duplicate := seenLedgerRevisions[entry.LedgerRevision]; duplicate {
			return nil, nil, ErrConflict
		}
		seenLedgerRevisions[entry.LedgerRevision] = struct{}{}
		previousRequestDigest = entry.Request.RequestDigest
		readLeaseIDs = append(readLeaseIDs, entry.Request.ReadLeaseID)
		requestDigests = append(requestDigests, entry.Request.RequestDigest)
		receiptDigests = append(receiptDigests, stringMember(entry.Receipt, "receiptDigest"))
		activeStateDigests = append(activeStateDigests, stringMember(entry.Receipt, "activeStateDigest"))
		if index == 0 || entry.ClaimGeneration < minimumGeneration {
			minimumGeneration = entry.ClaimGeneration
		}
		if index == 0 || entry.ClaimGeneration > maximumGeneration {
			maximumGeneration = entry.ClaimGeneration
		}
		if index == 0 || entry.CheckedAt.Before(firstCheckedAt) {
			firstCheckedAt = entry.CheckedAt
		}
		if index == 0 || entry.ExpiresAt.After(lastExpiresAt) {
			lastExpiresAt = entry.ExpiresAt
		}
	}
	ledgerRevision := int64(len(entries))
	var minimumGenerationValue, maximumGenerationValue, firstCheckedAtValue, lastExpiresAtValue any
	if len(entries) == 0 {
		ledgerRevision = 1
	} else {
		for revision := int64(1); revision <= ledgerRevision; revision++ {
			if _, ok := seenLedgerRevisions[revision]; !ok {
				return nil, nil, ErrConflict
			}
		}
		if sealedAt.Before(lastExpiresAt) {
			return nil, nil, ErrConflict
		}
		minimumGenerationValue = minimumGeneration
		maximumGenerationValue = maximumGeneration
		firstCheckedAtValue = evaluationExportInstant(firstCheckedAt)
		lastExpiresAtValue = evaluationExportInstant(lastExpiresAt)
	}
	readLeaseIDSetDigest, err := canonicaljson.Digest(readLeaseIDs)
	if err != nil {
		return nil, nil, err
	}
	readRequestDigestSetDigest, err := canonicaljson.Digest(requestDigests)
	if err != nil {
		return nil, nil, err
	}
	readReceiptDigestSetDigest, err := canonicaljson.Digest(receiptDigests)
	if err != nil {
		return nil, nil, err
	}
	activeStateDigestSetDigest, err := canonicaljson.Digest(activeStateDigests)
	if err != nil {
		return nil, nil, err
	}
	base := map[string]any{
		"format":                              evaluationHostedRetrievalRuntimeResourceReadLedgerRootFormat,
		"version":                             evaluationHostedRetrievalRuntimeResourceVersion,
		"ledgerAuthorityIssuerId":             evaluationHostedRetrievalRuntimeResourceReadLedgerAuthorityIssuerID,
		"ledgerAuthorityImplementationDigest": evaluationHostedRetrievalRuntimeResourceReadLedgerAuthorityImplementationDigest,
		"ledgerRevision":                      ledgerRevision,
		"planDigest":                          planDigest,
		"runConfigArtifactBindingDigest":      runConfigArtifactBindingDigest,
		"runtimeResourceSetId":                runtimeResourceSetID,
		"authorityDigest":                     authorityDigest,
		"resourceSetCommitmentDigest":         resourceSetCommitmentDigest,
		"readLeaseCount":                      int64(len(entries)),
		"readLeaseIdSetDigest":                readLeaseIDSetDigest,
		"readRequestDigestSetDigest":          readRequestDigestSetDigest,
		"readReceiptDigestSetDigest":          readReceiptDigestSetDigest,
		"activeStateDigestSetDigest":          activeStateDigestSetDigest,
		"minimumClaimGeneration":              minimumGenerationValue,
		"maximumClaimGeneration":              maximumGenerationValue,
		"firstCheckedAt":                      firstCheckedAtValue,
		"lastExpiresAt":                       lastExpiresAtValue,
		"sealedAt":                            evaluationExportInstant(sealedAt),
	}
	root, rootBytes, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(base, "rootDigest")
	if err != nil {
		return nil, nil, err
	}
	if len(rootBytes) > maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes {
		return nil, nil, conflict("hosted retrieval runtime read ledger root exceeds its bounded wire size")
	}
	root, err = decodeCanonicalEvaluationObject(rootBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		return nil, nil, conflict("hosted retrieval runtime read ledger root is not canonical")
	}
	if !exactEvaluationKeys(root, evaluationHostedReadLedgerRootKeys) {
		return nil, nil, conflict("hosted retrieval runtime read ledger root has a non-exact key set")
	}
	if stringMember(root, "format") != evaluationHostedRetrievalRuntimeResourceReadLedgerRootFormat {
		return nil, nil, conflict("hosted retrieval runtime read ledger root has an invalid format")
	}
	if !evaluationHostedRetrievalRuntimeResourceVersionOne(root) {
		return nil, nil, conflict("hosted retrieval runtime read ledger root has an invalid version")
	}
	if !evaluationHostedRetrievalRuntimeResourceSelfDigest(root, "rootDigest") {
		return nil, nil, conflict("hosted retrieval runtime read ledger root has an invalid self digest")
	}
	return root, rootBytes, nil
}

// sealEvaluationHostedRetrievalRuntimeResourceReadLeaseRootTx returns the
// exact root for the complete append-only read ledger visible in tx. A root is
// reused only when it covers the same receipt revision and was sealed no later
// than the caller's authoritative scan instant.
func sealEvaluationHostedRetrievalRuntimeResourceReadLeaseRootTx(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	planDigest string,
	repositoryCommit string,
	authorityDigest string,
	sealedAt time.Time,
) (map[string]any, []byte, error) {
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	if tx == nil || !validEvaluationAgentControlIdentity(namespaceID) ||
		!evaluationDigestPattern.MatchString(planDigest) ||
		!evaluationRepositoryCommitPattern.MatchString(repositoryCommit) ||
		!evaluationDigestPattern.MatchString(authorityDigest) || sealedAt.IsZero() {
		return nil, nil, ErrInvalid
	}
	var runtimeResourceSetID, resourceSetCommitmentDigest, runConfigArtifactBindingDigest string
	err := tx.QueryRowContext(ctx, `SELECT resource.runtime_resource_set_id,
		resource.resource_set_commitment_digest,resource_set.run_config_artifact_binding_digest
		FROM agent_evaluation_hosted_retrieval_runtime_resources resource
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_sets resource_set
		  ON resource_set.namespace_id=resource.namespace_id
		 AND resource_set.plan_digest=resource.plan_digest
		 AND resource_set.repository_commit=resource.repository_commit
		 AND resource_set.runtime_resource_set_id=resource.runtime_resource_set_id
		WHERE resource.namespace_id=$1 AND resource.plan_digest=$2
		  AND resource.repository_commit=$3 AND resource.authority_digest=$4
		FOR UPDATE OF resource`, namespaceID, planDigest, repositoryCommit, authorityDigest).Scan(
		&runtimeResourceSetID, &resourceSetCommitmentDigest, &runConfigArtifactBindingDigest,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, ErrNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT ledger_revision,request_bytes,receipt_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_read_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND authority_digest=$4
		ORDER BY request_digest COLLATE "C" FOR SHARE`, namespaceID, planDigest, repositoryCommit, authorityDigest)
	if err != nil {
		return nil, nil, err
	}
	entries := make([]evaluationHostedRetrievalRuntimeResourceReadLedgerEntry, 0)
	for rows.Next() {
		if len(entries) == maximumEvaluationHostedRetrievalRuntimeResourceReadReceipts {
			_ = rows.Close()
			return nil, nil, ErrConflict
		}
		var ledgerRevision int64
		var requestBytes, receiptBytes []byte
		if err := rows.Scan(&ledgerRevision, &requestBytes, &receiptBytes); err != nil {
			_ = rows.Close()
			return nil, nil, err
		}
		entry, err := decodeEvaluationHostedRetrievalRuntimeResourceReadLedgerEntry(ledgerRevision, requestBytes, receiptBytes)
		if err != nil || entry.Request.NamespaceID != namespaceID || entry.Request.PlanDigest != planDigest ||
			entry.Request.RepositoryCommit != repositoryCommit || entry.Request.AuthorityDigest != authorityDigest ||
			entry.Request.RuntimeResourceSetID != runtimeResourceSetID ||
			entry.Request.ResourceSetCommitmentDigest != resourceSetCommitmentDigest ||
			entry.Request.RunConfigArtifactBindingDigest != runConfigArtifactBindingDigest {
			_ = rows.Close()
			return nil, nil, ErrConflict
		}
		entries = append(entries, entry)
	}
	if err := rows.Close(); err != nil {
		return nil, nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	desiredRevision := int64(len(entries))
	if desiredRevision == 0 {
		desiredRevision = 1
	}
	var existingBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT root_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND authority_digest=$4 AND ledger_revision=$5 FOR SHARE`, namespaceID, planDigest,
		repositoryCommit, authorityDigest, desiredRevision).Scan(&existingBytes)
	if err == nil {
		existing, decodeErr := decodeCanonicalEvaluationObject(existingBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
		existingSealedAt, instantErr := evaluationInstant(existing["sealedAt"], "sealedAt")
		if decodeErr != nil || instantErr != nil || existingSealedAt.After(sealedAt) {
			return nil, nil, ErrConflict
		}
		expected, expectedBytes, createErr := createEvaluationHostedRetrievalRuntimeResourceReadLeaseRootValue(
			entries, planDigest, runConfigArtifactBindingDigest, runtimeResourceSetID, authorityDigest,
			resourceSetCommitmentDigest, existingSealedAt,
		)
		if createErr != nil || !bytes.Equal(existingBytes, expectedBytes) {
			return nil, nil, ErrConflict
		}
		return expected, existingBytes, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, nil, err
	}
	root, rootBytes, err := createEvaluationHostedRetrievalRuntimeResourceReadLeaseRootValue(
		entries, planDigest, runConfigArtifactBindingDigest, runtimeResourceSetID, authorityDigest,
		resourceSetCommitmentDigest, sealedAt,
	)
	if err != nil {
		return nil, nil, err
	}
	readLeaseCount := int64(len(entries))
	minimumGeneration, _ := integerMember(root, "minimumClaimGeneration")
	maximumGeneration, _ := integerMember(root, "maximumClaimGeneration")
	var minimumGenerationValue, maximumGenerationValue any
	var firstCheckedAtValue, lastExpiresAtValue any
	if readLeaseCount > 0 {
		minimumGenerationValue = minimumGeneration
		maximumGenerationValue = maximumGeneration
		firstCheckedAtValue = entries[0].CheckedAt
		lastExpiresAtValue = entries[0].ExpiresAt
		for _, entry := range entries[1:] {
			if entry.CheckedAt.Before(firstCheckedAtValue.(time.Time)) {
				firstCheckedAtValue = entry.CheckedAt
			}
			if entry.ExpiresAt.After(lastExpiresAtValue.(time.Time)) {
				lastExpiresAtValue = entry.ExpiresAt
			}
		}
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots (
		namespace_id,plan_digest,repository_commit,authority_digest,ledger_revision,root_digest,
		resource_set_commitment_digest,read_lease_count,minimum_claim_generation,maximum_claim_generation,
		first_checked_at,last_expires_at,sealed_at,root_json,root_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)`, namespaceID,
		planDigest, repositoryCommit, authorityDigest, desiredRevision, stringMember(root, "rootDigest"),
		resourceSetCommitmentDigest, readLeaseCount, minimumGenerationValue, maximumGenerationValue,
		firstCheckedAtValue, lastExpiresAtValue, sealedAt, string(rootBytes), rootBytes)
	if err != nil {
		return nil, nil, err
	}
	return root, rootBytes, nil
}

func prepareEvaluationHostedRetrievalRuntimeResourceRecoveryRootsTx(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	scannedAt time.Time,
) error {
	rows, err := tx.QueryContext(ctx, `SELECT resource.plan_digest,resource.repository_commit,resource.authority_digest
		FROM agent_evaluation_hosted_retrieval_runtime_resources resource
		WHERE resource.namespace_id=$1 AND resource.lifecycle='active'
		  AND EXISTS (
			SELECT 1 FROM agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences fence
			WHERE fence.namespace_id=resource.namespace_id AND fence.plan_digest=resource.plan_digest
			  AND fence.repository_commit=resource.repository_commit
			  AND fence.runtime_resource_set_id=resource.runtime_resource_set_id
			  AND fence.sealed_at<=$2
		  )
		  AND (resource.resource_expires_at<$2 OR EXISTS (
			SELECT 1 FROM agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences fence
			WHERE fence.namespace_id=resource.namespace_id AND fence.plan_digest=resource.plan_digest
			  AND fence.repository_commit=resource.repository_commit
			  AND fence.runtime_resource_set_id=resource.runtime_resource_set_id
			  AND fence.sealed_at<=$2
		  ))
		ORDER BY resource.plan_digest COLLATE "C",resource.repository_commit COLLATE "C",
			resource.authority_digest COLLATE "C" FOR UPDATE OF resource`, namespaceID, scannedAt)
	if err != nil {
		return err
	}
	type identity struct{ planDigest, repositoryCommit, authorityDigest string }
	identities := make([]identity, 0)
	for rows.Next() {
		var value identity
		if err := rows.Scan(&value.planDigest, &value.repositoryCommit, &value.authorityDigest); err != nil {
			_ = rows.Close()
			return err
		}
		identities = append(identities, value)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, identity := range identities {
		if _, _, err := sealEvaluationHostedRetrievalRuntimeResourceReadLeaseRootTx(
			ctx, tx, namespaceID, identity.planDigest, identity.repositoryCommit, identity.authorityDigest, scannedAt,
		); err != nil {
			return err
		}
	}
	var incompleteWithoutRoot int64
	err = tx.QueryRowContext(ctx, `SELECT COUNT(*)
		FROM agent_evaluation_hosted_retrieval_runtime_resources resource
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts claim
		  ON claim.namespace_id=resource.namespace_id AND claim.plan_digest=resource.plan_digest
		 AND claim.repository_commit=resource.repository_commit AND claim.authority_digest=resource.authority_digest
		 AND claim.receipt_digest=resource.current_cleanup_claim_receipt_digest
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests cleanup_request
		  ON cleanup_request.namespace_id=resource.namespace_id AND cleanup_request.plan_digest=resource.plan_digest
		 AND cleanup_request.repository_commit=resource.repository_commit
		 AND cleanup_request.authority_digest=resource.authority_digest
		 AND cleanup_request.request_digest=resource.cleanup_request_digest
		LEFT JOIN agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots root
		  ON root.namespace_id=resource.namespace_id
		 AND root.root_digest=cleanup_request.read_lease_ledger_root_digest
		WHERE resource.namespace_id=$1 AND resource.lifecycle='cleanup-in-progress'
		  AND claim.claim_expires_at<$2 AND root.root_digest IS NULL`, namespaceID, scannedAt).Scan(&incompleteWithoutRoot)
	if err != nil {
		return err
	}
	if incompleteWithoutRoot != 0 {
		return ErrConflict
	}
	return nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceRecoveryCandidates(
	source []byte,
	namespaceID string,
) ([]evaluationHostedRetrievalRuntimeResourceRecoveryCandidate, error) {
	rawCandidates, err := decodeEvaluationHostedRetrievalRuntimeResourceCanonicalArray(source, 1_048_576)
	if err != nil {
		return nil, err
	}
	candidates := make([]evaluationHostedRetrievalRuntimeResourceRecoveryCandidate, len(rawCandidates))
	var previousKey []byte
	for index, raw := range rawCandidates {
		value, ok := raw.(map[string]any)
		if !ok {
			return nil, ErrConflict
		}
		candidate, err := decodeEvaluationHostedRetrievalRuntimeResourceRecoveryCandidateValue(value)
		if err != nil || candidate.NamespaceID != namespaceID {
			return nil, ErrConflict
		}
		key, err := canonicaljson.Bytes([]any{evaluationExportInstant(candidate.EligibleAt), candidate.AuthorityDigest})
		if err != nil || (index > 0 && bytes.Compare(previousKey, key) >= 0) {
			return nil, ErrConflict
		}
		previousKey = key
		candidates[index] = candidate
	}
	return candidates, nil
}

func evaluationHostedRetrievalRuntimeResourceRecoveryDispositionMatches(
	candidate evaluationHostedRetrievalRuntimeResourceRecoveryCandidate,
	state evaluationHostedRetrievalRuntimeResourceRecoveryCandidateState,
	scannedAt time.Time,
) bool {
	switch candidate.Disposition {
	case "cleanup-incomplete":
		return state.Lifecycle == "cleanup-in-progress" && state.ClaimExpiresAt.Valid &&
			state.ClaimExpiresAt.Time.Before(scannedAt) && state.ClaimExpiresAt.Time.Equal(candidate.EligibleAt) &&
			state.PriorActiveStateDigest.Valid && state.PriorActiveStateDigest.String == candidate.ActiveStateDigest &&
			state.CleanupReadRootDigest.Valid && state.CleanupReadRootDigest.String == candidate.ReadLeaseLedgerRootDigest
	case "resource-expired":
		return state.Lifecycle == "active" && state.ResourceExpiresAt.Before(scannedAt) &&
			state.ResourceExpiresAt.Equal(candidate.EligibleAt) && state.CurrentStateDigest == candidate.ActiveStateDigest
	case "run-terminal":
		return state.Lifecycle == "active" && !state.ResourceExpiresAt.Before(scannedAt) &&
			!state.FenceSealedAt.After(scannedAt) && state.FenceSealedAt.Equal(candidate.EligibleAt) &&
			state.CurrentStateDigest == candidate.ActiveStateDigest
	default:
		return false
	}
}

func validateEvaluationHostedRetrievalRuntimeResourceRecoveryCandidateTx(
	ctx context.Context,
	tx *sql.Tx,
	candidate evaluationHostedRetrievalRuntimeResourceRecoveryCandidate,
	scannedAt time.Time,
) error {
	var state evaluationHostedRetrievalRuntimeResourceRecoveryCandidateState
	err := tx.QueryRowContext(ctx, `SELECT resource.lifecycle,resource.runtime_resource_set_id,
		registration.authority_digest,
		resource_set.frozen_run_digest,resource_set.run_config_artifact_binding_digest,
		resource.resource_set_commitment_digest,resource.resource_expires_at,registration.expires_at,
		resource.current_state_digest,cleanup_request.prior_active_state_digest,
		fence.fence_digest,fence.sealed_at,claim.claim_expires_at,
		cleanup_request.read_lease_ledger_root_digest,
		(SELECT COALESCE(MAX(read_receipt.ledger_revision),0)
		 FROM agent_evaluation_hosted_retrieval_runtime_resource_read_receipts read_receipt
		 WHERE read_receipt.namespace_id=resource.namespace_id
		   AND read_receipt.plan_digest=resource.plan_digest
		   AND read_receipt.repository_commit=resource.repository_commit
		   AND read_receipt.authority_digest=resource.authority_digest),root.root_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resources resource
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_registration_results registration
		  ON registration.namespace_id=resource.namespace_id AND registration.plan_digest=resource.plan_digest
		 AND registration.repository_commit=resource.repository_commit
		 AND registration.registration_request_digest=resource.registration_request_digest
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_sets resource_set
		  ON resource_set.namespace_id=resource.namespace_id AND resource_set.plan_digest=resource.plan_digest
		 AND resource_set.repository_commit=resource.repository_commit
		 AND resource_set.runtime_resource_set_id=resource.runtime_resource_set_id
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences fence
		  ON fence.namespace_id=resource.namespace_id AND fence.plan_digest=resource.plan_digest
		 AND fence.repository_commit=resource.repository_commit
		 AND fence.runtime_resource_set_id=resource.runtime_resource_set_id
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots root
		  ON root.namespace_id=resource.namespace_id AND root.root_digest=$5
		LEFT JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts claim
		  ON claim.namespace_id=resource.namespace_id AND claim.plan_digest=resource.plan_digest
		 AND claim.repository_commit=resource.repository_commit AND claim.authority_digest=resource.authority_digest
		 AND claim.receipt_digest=resource.current_cleanup_claim_receipt_digest
		LEFT JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests cleanup_request
		  ON cleanup_request.namespace_id=resource.namespace_id AND cleanup_request.plan_digest=resource.plan_digest
		 AND cleanup_request.repository_commit=resource.repository_commit
		 AND cleanup_request.authority_digest=resource.authority_digest
		 AND cleanup_request.request_digest=resource.cleanup_request_digest
		WHERE resource.namespace_id=$1 AND resource.plan_digest=$2
		  AND resource.repository_commit=$3 AND resource.authority_digest=$4 FOR SHARE OF resource`,
		candidate.NamespaceID, candidate.PlanDigest, candidate.RepositoryCommit, candidate.AuthorityDigest,
		candidate.ReadLeaseLedgerRootDigest).Scan(
		&state.Lifecycle, &state.RuntimeResourceSetID, &state.RegistrationAuthorityDigest, &state.FrozenRunDigest,
		&state.RunConfigArtifactBindingDigest, &state.ResourceSetCommitmentDigest,
		&state.ResourceExpiresAt, &state.RegistrationExpiresAt, &state.CurrentStateDigest,
		&state.PriorActiveStateDigest, &state.FenceDigest, &state.FenceSealedAt,
		&state.ClaimExpiresAt, &state.CleanupReadRootDigest, &state.LatestReadLedgerRevision, &state.ReadRootBytes,
	)
	if err != nil {
		return ErrConflict
	}
	readRoot, err := decodeCanonicalEvaluationObject(state.ReadRootBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	readRootSealedAt, sealedErr := evaluationInstant(readRoot["sealedAt"], "sealedAt")
	readRootLedgerRevision, readRootRevisionOK := integerMember(readRoot, "ledgerRevision")
	expectedReadRootRevision := state.LatestReadLedgerRevision
	if expectedReadRootRevision == 0 {
		expectedReadRootRevision = 1
	}
	if err != nil || sealedErr != nil || !readRootRevisionOK || readRootLedgerRevision != expectedReadRootRevision ||
		readRootSealedAt.After(scannedAt) ||
		validateEvaluationHostedArchiveSelfDigest(readRoot, evaluationHostedReadLedgerRootKeys,
			evaluationHostedRetrievalRuntimeResourceReadLedgerRootFormat, "rootDigest") != nil ||
		stringMember(readRoot, "rootDigest") != candidate.ReadLeaseLedgerRootDigest ||
		stringMember(readRoot, "authorityDigest") != candidate.AuthorityDigest ||
		stringMember(readRoot, "planDigest") != candidate.PlanDigest ||
		stringMember(readRoot, "runtimeResourceSetId") != candidate.RuntimeResourceSetID ||
		stringMember(readRoot, "resourceSetCommitmentDigest") != candidate.ResourceSetCommitmentDigest {
		return ErrConflict
	}
	if readRoot["lastExpiresAt"] != nil {
		lastExpiresAt, err := evaluationInstant(readRoot["lastExpiresAt"], "lastExpiresAt")
		if err != nil || lastExpiresAt.After(scannedAt) {
			return ErrConflict
		}
	}
	if state.RuntimeResourceSetID != candidate.RuntimeResourceSetID ||
		state.RegistrationAuthorityDigest != candidate.AuthorityDigest ||
		state.FrozenRunDigest != candidate.FrozenRunDigest ||
		state.RunConfigArtifactBindingDigest != candidate.RunConfigArtifactBindingDigest ||
		state.ResourceSetCommitmentDigest != candidate.ResourceSetCommitmentDigest ||
		state.FenceDigest != candidate.StoredRunTerminalFenceDigest ||
		!state.ResourceExpiresAt.Equal(candidate.ResourceExpiresAt) ||
		!state.RegistrationExpiresAt.Equal(candidate.ResourceExpiresAt) {
		return ErrConflict
	}
	if !evaluationHostedRetrievalRuntimeResourceRecoveryDispositionMatches(candidate, state, scannedAt) {
		return ErrConflict
	}
	return nil
}

func createEvaluationHostedRetrievalRuntimeResourceRecoveryPage(
	request evaluationHostedRetrievalRuntimeResourceRecoveryScanRequest,
	scanLedgerRevision int64,
	candidates []evaluationHostedRetrievalRuntimeResourceRecoveryCandidate,
) (map[string]any, []byte, error) {
	if scanLedgerRevision < 1 || request.PageSize < 1 ||
		request.PageSize > evaluationHostedRetrievalRuntimeResourceRecoveryPageMaximum || len(candidates) > 1_000_000 {
		return nil, nil, ErrConflict
	}
	start := 0
	if request.Cursor != nil {
		if request.Cursor.ScanLedgerRevision != scanLedgerRevision {
			return nil, nil, ErrConflict
		}
		cursorKey, err := canonicaljson.Bytes([]any{
			evaluationExportInstant(request.Cursor.AfterEligibleAt), request.Cursor.AfterAuthorityDigest,
		})
		if err != nil {
			return nil, nil, err
		}
		for start < len(candidates) {
			candidateKey, err := canonicaljson.Bytes([]any{
				evaluationExportInstant(candidates[start].EligibleAt), candidates[start].AuthorityDigest,
			})
			if err != nil {
				return nil, nil, err
			}
			if bytes.Compare(candidateKey, cursorKey) > 0 {
				break
			}
			start++
		}
	}
	end := start + int(request.PageSize)
	if end > len(candidates) {
		end = len(candidates)
	}
	pageCandidates := make([]any, end-start)
	candidateDigests := make([]any, end-start)
	for index, candidate := range candidates[start:end] {
		pageCandidates[index] = candidate.Value
		candidateDigests[index] = candidate.CandidateDigest
	}
	var nextCursor any
	if end < len(candidates) {
		last := candidates[end-1]
		cursorBase := map[string]any{
			"format":               evaluationHostedRetrievalRuntimeResourceRecoveryCursorFormat,
			"version":              evaluationHostedRetrievalRuntimeResourceVersion,
			"scanLedgerRevision":   scanLedgerRevision,
			"afterEligibleAt":      evaluationExportInstant(last.EligibleAt),
			"afterAuthorityDigest": last.AuthorityDigest,
		}
		cursor, _, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(cursorBase, "cursorDigest")
		if err != nil {
			return nil, nil, err
		}
		nextCursor = cursor
	}
	candidateSetDigest, err := canonicaljson.Digest(candidateDigests)
	if err != nil {
		return nil, nil, err
	}
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceRecoveryImplementationDigest()
	if err != nil {
		return nil, nil, err
	}
	base := map[string]any{
		"format":                                evaluationHostedRetrievalRuntimeResourceRecoveryPageFormat,
		"version":                               evaluationHostedRetrievalRuntimeResourceVersion,
		"requestDigest":                         request.RequestDigest,
		"recoveryAuthorityIssuerId":             evaluationHostedRetrievalRuntimeResourceRecoveryAuthorityIssuerID,
		"recoveryAuthorityImplementationDigest": implementationDigest,
		"scanLedgerRevision":                    scanLedgerRevision,
		"candidates":                            pageCandidates,
		"candidateSetDigest":                    candidateSetDigest,
		"nextCursor":                            nextCursor,
		"scannedAt":                             evaluationExportInstant(request.RequestedAt),
	}
	page, pageBytes, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(base, "pageDigest")
	if err != nil || len(pageBytes) > evaluationHostedRetrievalRuntimeResourceRecoveryPageMaxBytes {
		return nil, nil, ErrConflict
	}
	page, err = decodeCanonicalEvaluationObject(pageBytes, evaluationHostedRetrievalRuntimeResourceRecoveryPageMaxBytes)
	if err != nil {
		return nil, nil, ErrConflict
	}
	if _, _, err := decodeEvaluationHostedRetrievalRuntimeResourceRecoveryPageValue(page); err != nil {
		return nil, nil, err
	}
	return page, pageBytes, nil
}

// ListRecoveryCandidates freezes a namespace-scoped recovery snapshot and
// returns one exact bounded page. The bool reports a byte-identical replay.
func (owner *EvaluationHostedRetrievalRuntimeResource) ListRecoveryCandidates(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceRecoveryScanRequest,
) ([]byte, bool, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || request.NamespaceID != authority.NamespaceID {
		return nil, false, errEvaluationServiceUnavailable
	}
	now := owner.clock().UTC().Truncate(time.Millisecond)
	if now.IsZero() || now.Before(request.RequestedAt) {
		return nil, false, ErrConflict
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var existingRequest, existingPage []byte
	var scanLedgerRevision int64
	err = tx.QueryRowContext(ctx, `SELECT request.request_bytes,request.scan_ledger_revision,page.page_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_requests request
		LEFT JOIN agent_evaluation_hosted_retrieval_runtime_resource_recovery_pages page
		  ON page.namespace_id=request.namespace_id AND page.request_digest=request.request_digest
		WHERE request.namespace_id=$1 AND request.request_digest=$2 FOR SHARE OF request`,
		request.NamespaceID, request.RequestDigest).Scan(&existingRequest, &scanLedgerRevision, &existingPage)
	requestExists := err == nil
	if requestExists {
		if !bytes.Equal(existingRequest, request.Canonical) {
			return nil, false, ErrConflict
		}
		if len(existingPage) != 0 {
			page, decodeErr := decodeCanonicalEvaluationObject(existingPage, evaluationHostedRetrievalRuntimeResourceRecoveryPageMaxBytes)
			if decodeErr != nil {
				return nil, false, ErrConflict
			}
			if _, _, decodeErr = decodeEvaluationHostedRetrievalRuntimeResourceRecoveryPageValue(page); decodeErr != nil ||
				stringMember(page, "requestDigest") != request.RequestDigest {
				return nil, false, ErrConflict
			}
			if err := tx.Commit(); err != nil {
				return nil, false, err
			}
			return existingPage, true, nil
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	if !requestExists {
		if err := prepareEvaluationHostedRetrievalRuntimeResourceRecoveryRootsTx(
			ctx, tx, request.NamespaceID, request.RequestedAt,
		); err != nil {
			return nil, false, err
		}
		if request.Cursor == nil {
			err = tx.QueryRowContext(ctx, `SELECT ledger_revision
				FROM agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers
				WHERE namespace_id=$1 FOR SHARE`, request.NamespaceID).Scan(&scanLedgerRevision)
			if errors.Is(err, sql.ErrNoRows) {
				return nil, false, ErrNotFound
			}
			if err != nil {
				return nil, false, err
			}
		} else {
			scanLedgerRevision = request.Cursor.ScanLedgerRevision
		}
		expectedScanLedgerRevision := scanLedgerRevision
		cursorValue := any(nil)
		var cursorDigest any
		if request.Cursor != nil {
			cursorValue = request.Cursor.Value
			cursorDigest = request.Cursor.CursorDigest
		}
		cursorBytes, err := canonicaljson.Bytes(cursorValue)
		if err != nil {
			return nil, false, err
		}
		err = tx.QueryRowContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_requests (
			namespace_id,request_digest,scan_ledger_revision,page_size,cursor_digest,cursor_json,
			requested_at,request_json,request_bytes
		) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9)
		RETURNING scan_ledger_revision`, request.NamespaceID, request.RequestDigest, scanLedgerRevision,
			request.PageSize, cursorDigest, string(cursorBytes), request.RequestedAt,
			string(request.Canonical), request.Canonical).Scan(&scanLedgerRevision)
		if err != nil {
			return nil, false, err
		}
		if scanLedgerRevision != expectedScanLedgerRevision {
			return nil, false, ErrConflict
		}
	}
	var snapshotDigest string
	var candidatesBytes []byte
	var snapshotCreatedAt time.Time
	err = tx.QueryRowContext(ctx, `SELECT candidate_set_digest,candidates_bytes,created_at
		FROM agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_snapshots
		WHERE namespace_id=$1 AND scan_ledger_revision=$2 FOR SHARE`, request.NamespaceID, scanLedgerRevision).Scan(
		&snapshotDigest, &candidatesBytes, &snapshotCreatedAt,
	)
	if err != nil || snapshotCreatedAt.After(request.RequestedAt) {
		return nil, false, ErrConflict
	}
	rawCandidates, err := decodeEvaluationHostedRetrievalRuntimeResourceCanonicalArray(candidatesBytes, 1_048_576)
	if err != nil {
		return nil, false, ErrConflict
	}
	expectedSnapshotDigest, err := canonicaljson.Digest(rawCandidates)
	if err != nil || expectedSnapshotDigest != snapshotDigest {
		return nil, false, ErrConflict
	}
	candidates, err := decodeEvaluationHostedRetrievalRuntimeResourceRecoveryCandidates(candidatesBytes, request.NamespaceID)
	if err != nil {
		return nil, false, err
	}
	for _, candidate := range candidates {
		if err := validateEvaluationHostedRetrievalRuntimeResourceRecoveryCandidateTx(ctx, tx, candidate, request.RequestedAt); err != nil {
			return nil, false, err
		}
	}
	page, pageBytes, err := createEvaluationHostedRetrievalRuntimeResourceRecoveryPage(request, scanLedgerRevision, candidates)
	if err != nil {
		return nil, false, err
	}
	candidateValues, _ := arrayMember(page, "candidates")
	candidateValuesBytes, err := canonicaljson.Bytes(candidateValues)
	if err != nil {
		return nil, false, err
	}
	nextCursorBytes, err := canonicaljson.Bytes(page["nextCursor"])
	if err != nil {
		return nil, false, err
	}
	implementationDigest := stringMember(page, "recoveryAuthorityImplementationDigest")
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_recovery_pages (
		namespace_id,request_digest,page_digest,recovery_authority_issuer_id,
		recovery_authority_implementation_digest,scan_ledger_revision,candidate_set_digest,
		candidates_json,next_cursor_json,scanned_at,page_json,page_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12)`, request.NamespaceID,
		request.RequestDigest, stringMember(page, "pageDigest"), evaluationHostedRetrievalRuntimeResourceRecoveryAuthorityIssuerID,
		implementationDigest, scanLedgerRevision, stringMember(page, "candidateSetDigest"),
		string(candidateValuesBytes), string(nextCursorBytes), request.RequestedAt, string(pageBytes), pageBytes)
	if err != nil {
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return pageBytes, false, nil
}
