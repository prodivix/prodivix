package agent

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/jackc/pgx/v5/pgconn"
)

const evaluationCapabilityEffectSourceConsumptionClaimFormat = "prodivix.agent-evaluation-capability-effect-source-consumption-claim"

type evaluationCapabilityEffectSourceConsumptionClaim struct {
	NamespaceID                      string
	PlanDigest                       string
	RepositoryCommit                 string
	SourceHandleDigest               string
	RequestRefAuthorityReceiptDigest string
	AttemptID                        string
	DescriptorDigest                 string
	TurnIndex                        int64
	InvocationID                     string
	BindingKind                      string
	ClaimedAt                        time.Time
	ClaimDigest                      string
	Value                            map[string]any
	Bytes                            []byte
}

func createEvaluationCapabilityEffectSourceConsumptionClaim(
	request evaluationCapabilityEffectRequestRefAuthorityRequest,
	requestRefReceiptDigest string,
	sourceHandleDigest string,
) (evaluationCapabilityEffectSourceConsumptionClaim, error) {
	if !evaluationDigestPattern.MatchString(requestRefReceiptDigest) ||
		!evaluationDigestPattern.MatchString(sourceHandleDigest) ||
		request.BindingKind == "hosted-retrieval-query" {
		return evaluationCapabilityEffectSourceConsumptionClaim{}, ErrInvalid
	}
	base := map[string]any{
		"format": evaluationCapabilityEffectSourceConsumptionClaimFormat, "version": int64(1),
		"namespaceId": request.NamespaceID, "planDigest": request.PlanDigest,
		"repositoryCommit": request.RepositoryCommit, "sourceHandleDigest": sourceHandleDigest,
		"requestRefAuthorityReceiptDigest": requestRefReceiptDigest,
		"attemptId":                        request.AttemptID, "descriptorDigest": request.DescriptorDigest,
		"turnIndex": request.TurnIndex, "invocationId": request.InvocationID,
		"bindingKind": request.BindingKind, "claimedAt": evaluationExportInstant(request.IssuedAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationCapabilityEffectSourceConsumptionClaim{}, err
	}
	value := cloneEvaluationObject(base)
	value["claimDigest"] = digest
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > maximumEvaluationServiceControlBytes {
		return evaluationCapabilityEffectSourceConsumptionClaim{}, ErrInvalid
	}
	return evaluationCapabilityEffectSourceConsumptionClaim{
		NamespaceID: request.NamespaceID, PlanDigest: request.PlanDigest,
		RepositoryCommit: request.RepositoryCommit, SourceHandleDigest: sourceHandleDigest,
		RequestRefAuthorityReceiptDigest: requestRefReceiptDigest, AttemptID: request.AttemptID,
		DescriptorDigest: request.DescriptorDigest, TurnIndex: request.TurnIndex,
		InvocationID: request.InvocationID, BindingKind: request.BindingKind,
		ClaimedAt: request.IssuedAt, ClaimDigest: digest, Value: value, Bytes: canonical,
	}, nil
}

func decodeEvaluationCapabilityEffectSourceConsumptionClaim(
	source []byte,
) (evaluationCapabilityEffectSourceConsumptionClaim, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationServiceControlBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "sourceHandleDigest",
		"requestRefAuthorityReceiptDigest", "attemptId", "descriptorDigest", "turnIndex", "invocationId",
		"bindingKind", "claimedAt", "claimDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectSourceConsumptionClaimFormat ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(value, "claimDigest") {
		return evaluationCapabilityEffectSourceConsumptionClaim{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turnIndex, turnOK := integerMember(value, "turnIndex")
	claimedAt, claimedErr := evaluationInstant(value["claimedAt"], "capability effect source consumption claim")
	claim := evaluationCapabilityEffectSourceConsumptionClaim{
		NamespaceID: stringMember(value, "namespaceId"), PlanDigest: stringMember(value, "planDigest"),
		RepositoryCommit: stringMember(value, "repositoryCommit"), SourceHandleDigest: stringMember(value, "sourceHandleDigest"),
		RequestRefAuthorityReceiptDigest: stringMember(value, "requestRefAuthorityReceiptDigest"),
		AttemptID:                        stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"),
		TurnIndex: turnIndex, InvocationID: stringMember(value, "invocationId"), BindingKind: stringMember(value, "bindingKind"),
		ClaimedAt: claimedAt, ClaimDigest: stringMember(value, "claimDigest"), Value: value, Bytes: canonical,
	}
	if !versionOK || version != 1 || !turnOK || turnIndex < 0 || turnIndex >= maximumEvaluationOptionalFactAuthorityTurns ||
		claimedErr != nil || !validEvaluationAgentControlIdentity(claim.NamespaceID) ||
		!evaluationDigestPattern.MatchString(claim.PlanDigest) ||
		!evaluationRepositoryCommitPattern.MatchString(claim.RepositoryCommit) ||
		!evaluationDigestPattern.MatchString(claim.SourceHandleDigest) ||
		!evaluationDigestPattern.MatchString(claim.RequestRefAuthorityReceiptDigest) ||
		!validEvaluationAgentControlIdentity(claim.AttemptID) ||
		!evaluationDigestPattern.MatchString(claim.DescriptorDigest) ||
		!validEvaluationAgentControlIdentity(claim.InvocationID) ||
		!oneOfString(claim.BindingKind, "provider-job", "provider-cache", "opaque-continuation") {
		return evaluationCapabilityEffectSourceConsumptionClaim{}, ErrConflict
	}
	return claim, nil
}

func storeEvaluationCapabilityEffectSourceConsumptionClaimTx(
	ctx context.Context,
	tx *sql.Tx,
	claim evaluationCapabilityEffectSourceConsumptionClaim,
) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_source_consumption_claims (
		namespace_id,plan_digest,repository_commit,claim_digest,source_handle_digest,
		request_ref_authority_receipt_digest,attempt_id,descriptor_digest,turn_index,invocation_id,
		binding_kind,status,claimed_at,terminal_owner_request_digest,terminal_journal_result_record_digest,
		terminal_journal_abandonment_record_digest,terminal_at,claim_json,claim_bytes,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'claimed',$12,NULL,NULL,NULL,NULL,$13::jsonb,$14,TRUE)`,
		claim.NamespaceID, claim.PlanDigest, claim.RepositoryCommit, claim.ClaimDigest, claim.SourceHandleDigest,
		claim.RequestRefAuthorityReceiptDigest, claim.AttemptID, claim.DescriptorDigest, claim.TurnIndex,
		claim.InvocationID, claim.BindingKind, claim.ClaimedAt, string(claim.Bytes), claim.Bytes)
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) && postgresError.Code == "23505" {
		return conflict("capability effect source is already claimed or consumed")
	}
	return err
}

func requireEvaluationCapabilityEffectSourceConsumptionClaimReplayTx(
	ctx context.Context,
	tx *sql.Tx,
	record EvaluationCapabilityEffectRequestRefAuthorityRecord,
) error {
	if record.BindingKind == "hosted-retrieval-query" {
		return nil
	}
	var status, sourceHandleDigest string
	var claimBytes []byte
	err := tx.QueryRowContext(ctx, `SELECT status,source_handle_digest,claim_bytes
		FROM agent_evaluation_capability_effect_source_consumption_claims
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND request_ref_authority_receipt_digest=$4 FOR SHARE`, record.NamespaceID,
		record.PlanDigest, record.RepositoryCommit, record.ReceiptDigest).Scan(&status, &sourceHandleDigest, &claimBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return conflict("capability effect request-ref replay lacks its source consumption claim")
	}
	if err != nil {
		return err
	}
	claim, err := decodeEvaluationCapabilityEffectSourceConsumptionClaim(claimBytes)
	if err != nil || claim.RequestRefAuthorityReceiptDigest != record.ReceiptDigest ||
		claim.SourceHandleDigest != sourceHandleDigest || sourceHandleDigest != record.SelectedSourceHandleDigest ||
		status == "released" || !oneOfString(status, "claimed", "consumed") {
		return ErrConflict
	}
	return nil
}

func evaluationCapabilityEffectSourceClaimReceiptDigest(stage EvaluationCapabilityEffectProviderJournalStageRecord) (string, error) {
	binding, ok := objectMember(stage.PreEffectIntent, "inputAuthorityBinding")
	if !ok {
		return "", ErrConflict
	}
	digest := stringMember(binding, "requestRefAuthorityReceiptDigest")
	if !evaluationDigestPattern.MatchString(digest) {
		return "", ErrConflict
	}
	return digest, nil
}

func requireEvaluationCapabilityEffectSourceClaimForStageTx(
	ctx context.Context,
	tx *sql.Tx,
	stage EvaluationCapabilityEffectProviderJournalStageRecord,
	ownerInstanceID string,
) error {
	if stage.BindingKind == "hosted-retrieval-query" {
		return nil
	}
	binding, ok := objectMember(stage.PreEffectIntent, "inputAuthorityBinding")
	if !ok {
		return ErrConflict
	}
	receiptDigest := stringMember(binding, "requestRefAuthorityReceiptDigest")
	sourceHandleDigest := stringMember(binding, "sourceHandleDigest")
	if !evaluationDigestPattern.MatchString(receiptDigest) || !evaluationDigestPattern.MatchString(sourceHandleDigest) {
		return ErrConflict
	}
	var storedSourceHandleDigest, status string
	var storedOwnerInstanceID sql.NullString
	var claimBytes []byte
	if err := tx.QueryRowContext(ctx, `SELECT source_handle_digest,status,owner_instance_id,claim_bytes
		FROM agent_evaluation_capability_effect_source_consumption_claims
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND request_ref_authority_receipt_digest=$4 FOR SHARE`, stage.NamespaceID,
		stage.PlanDigest, stage.RepositoryCommit, receiptDigest).Scan(
		&storedSourceHandleDigest, &status, &storedOwnerInstanceID, &claimBytes,
	); err != nil {
		return err
	}
	claim, err := decodeEvaluationCapabilityEffectSourceConsumptionClaim(claimBytes)
	if err != nil || status != "claimed" || storedOwnerInstanceID.Valid ||
		!ValidEvaluationCapabilityEffectProviderJournalOwnerInstanceID(ownerInstanceID) ||
		claim.SourceHandleDigest != sourceHandleDigest ||
		storedSourceHandleDigest != sourceHandleDigest || claim.AttemptID != stage.AttemptID ||
		claim.DescriptorDigest != stage.DescriptorDigest || claim.InvocationID != stage.InvocationID ||
		claim.BindingKind != stage.BindingKind {
		return ErrConflict
	}
	return nil
}

func consumeEvaluationCapabilityEffectSourceClaimTx(
	ctx context.Context,
	tx *sql.Tx,
	stage EvaluationCapabilityEffectProviderJournalStageRecord,
	ownerInstanceID string,
	consumedAt time.Time,
) error {
	if stage.BindingKind == "hosted-retrieval-query" {
		return nil
	}
	receiptDigest, err := evaluationCapabilityEffectSourceClaimReceiptDigest(stage)
	if err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_capability_effect_source_consumption_claims
		SET status='consumed',owner_instance_id=$5,terminal_owner_request_digest=$6,terminal_at=$7
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND request_ref_authority_receipt_digest=$4 AND status='claimed' AND owner_instance_id IS NULL`, stage.NamespaceID,
		stage.PlanDigest, stage.RepositoryCommit, receiptDigest, ownerInstanceID, stage.OwnerRequestDigest, consumedAt)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 1 {
		return nil
	}
	var status, storedOwnerInstanceID, ownerRequestDigest string
	if err := tx.QueryRowContext(ctx, `SELECT status,COALESCE(owner_instance_id,''),COALESCE(terminal_owner_request_digest,'')
		FROM agent_evaluation_capability_effect_source_consumption_claims
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND request_ref_authority_receipt_digest=$4 FOR UPDATE`, stage.NamespaceID,
		stage.PlanDigest, stage.RepositoryCommit, receiptDigest).Scan(&status, &storedOwnerInstanceID, &ownerRequestDigest); err != nil {
		return err
	}
	if status != "consumed" || storedOwnerInstanceID != ownerInstanceID || ownerRequestDigest != stage.OwnerRequestDigest {
		return ErrConflict
	}
	return nil
}

func terminalizeEvaluationCapabilityEffectSourceClaimTx(
	ctx context.Context,
	tx *sql.Tx,
	stage EvaluationCapabilityEffectProviderJournalStageRecord,
	ownerInstanceID string,
	resultRecordDigest string,
	abandonmentRecordDigest string,
	terminalAt time.Time,
) error {
	if stage.BindingKind == "hosted-retrieval-query" {
		return nil
	}
	if (resultRecordDigest == "") == (abandonmentRecordDigest == "") {
		return ErrInvalid
	}
	receiptDigest, err := evaluationCapabilityEffectSourceClaimReceiptDigest(stage)
	if err != nil {
		return err
	}
	status := "consumed"
	result, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_capability_effect_source_consumption_claims
		SET status=$5,terminal_owner_request_digest=$6,
			terminal_journal_result_record_digest=NULLIF($7,''),
			terminal_journal_abandonment_record_digest=NULLIF($8,''),terminal_at=$9
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND request_ref_authority_receipt_digest=$4
		  AND owner_instance_id=$10 AND status='consumed'`, stage.NamespaceID, stage.PlanDigest, stage.RepositoryCommit,
		receiptDigest, status, stage.OwnerRequestDigest, resultRecordDigest, abandonmentRecordDigest, terminalAt,
		ownerInstanceID)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return ErrConflict
	}
	return nil
}
