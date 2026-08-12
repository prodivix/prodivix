package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"math/big"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(
	demand evaluationBudgetDemand,
	expected evaluationBudgetDemand,
) error {
	if demand.Digest != expected.Digest || !bytes.Equal(demand.Canonical, expected.Canonical) {
		return ErrConflict
	}
	if demand.Unknown || len(demand.Usage) != len(expected.Usage) || len(demand.Cost) != 0 ||
		demand.ModelInvocations != 0 || demand.ToolCalls != 0 || demand.RepairRounds != 0 ||
		demand.Transactions != 0 || demand.ArtifactBytes != 0 || demand.ElapsedMS != 0 {
		return ErrConflict
	}
	for unit, amount := range expected.Usage {
		actual, exists := demand.Usage[unit]
		if !exists || actual.Cmp(amount) != 0 {
			return ErrConflict
		}
	}
	return nil
}

func createEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(
	uploadBytes int64,
) (evaluationBudgetDemand, error) {
	if uploadBytes < 1 || uploadBytes > 9_007_199_254_740_991/691_200 {
		return evaluationBudgetDemand{}, ErrConflict
	}
	storageByteSeconds := new(big.Int).Mul(big.NewInt(uploadBytes), big.NewInt(691_200)).String()
	toolCalls := "3"
	uploadAmount := big.NewInt(uploadBytes).String()
	amounts := []any{
		map[string]any{
			"unit": "hosted-tool-call", "confidence": "estimated",
			"logicalAmount": toolCalls, "billableAmount": toolCalls,
		},
		map[string]any{
			"unit": "provider-storage-byte-second", "confidence": "estimated",
			"logicalAmount": storageByteSeconds, "billableAmount": storageByteSeconds,
		},
		map[string]any{
			"unit": "provider-upload-byte", "confidence": "measured",
			"logicalAmount": uploadAmount, "billableAmount": uploadAmount,
		},
	}
	vectorDigest, err := canonicaljson.Digest(amounts)
	if err != nil {
		return evaluationBudgetDemand{}, err
	}
	value := map[string]any{
		"usage": map[string]any{
			"amounts": amounts, "vectorDigest": vectorDigest,
		},
		"cost":             []any{},
		"modelInvocations": int64(0),
		"toolCalls":        int64(0),
		"repairRounds":     int64(0),
		"transactions":     int64(0),
		"artifactBytes":    int64(0),
		"elapsedMs":        int64(0),
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil {
		return evaluationBudgetDemand{}, err
	}
	return decodeEvaluationBudgetDemand(canonical, true)
}

func expectedEvaluationHostedRetrievalRuntimeResourceLifecycleDemandFromPlan(
	plan evaluationPlanFact,
	request evaluationHostedRetrievalRuntimeResourceRegistrationRequest,
) (evaluationBudgetDemand, error) {
	intent, intentOK := objectMember(request.Value, "registrationIntent")
	if plan.PlanDigest != request.PlanDigest || plan.RepositoryCommit != request.RepositoryCommit || !intentOK ||
		validateEvaluationHostedArchiveSelfDigest(
			intent, evaluationHostedRegistrationIntentKeys,
			evaluationHostedRetrievalRuntimeResourceRegistrationIntentFormat, "intentDigest",
		) != nil {
		return evaluationBudgetDemand{}, ErrConflict
	}
	targets, targetsOK := arrayMember(plan.Value, "capabilityQualificationTargets")
	if !targetsOK {
		return evaluationBudgetDemand{}, ErrConflict
	}
	var target map[string]any
	for _, rawTarget := range targets {
		candidate, candidateOK := rawTarget.(map[string]any)
		if !candidateOK {
			return evaluationBudgetDemand{}, ErrConflict
		}
		if stringMember(candidate, "protocolFamily") != request.ProtocolFamily ||
			stringMember(candidate, "capabilityProfileId") != request.CapabilityProfileID {
			continue
		}
		if target != nil {
			return evaluationBudgetDemand{}, ErrConflict
		}
		target = candidate
	}
	if target == nil {
		return evaluationBudgetDemand{}, ErrConflict
	}
	optionalAuthority, optionalOK := objectMember(target, "optionalCapabilitySupportAuthority")
	runtimeAuthority, runtimeOK := objectMember(optionalAuthority, "runtimeFactSourceAuthority")
	probeEvidence, probeOK := objectMember(optionalAuthority, "probeEvidence")
	storedProgram, storedProgramOK := objectMember(probeEvidence, "probeProgram")
	profileDigest := stringMember(request.Value, "capabilityProfileDigest")
	program, programErr := expectedEvaluationCapabilityProbeProgram(request.CapabilityProfileID, profileDigest)
	maximumLifetime, maximumLifetimeOK := integerMember(intent, "maximumResourceLifetimeMs")
	minimumLease, minimumLeaseOK := integerMember(intent, "minimumQueryReadLeaseMs")
	if !optionalOK || !runtimeOK || !probeOK || !storedProgramOK || programErr != nil ||
		!sameEvaluationCanonicalValue(storedProgram, program.Value) ||
		!maximumLifetimeOK || maximumLifetime != 691_200_000 ||
		!minimumLeaseOK || minimumLease != 155_000 ||
		!evaluationHostedArchiveStringsEqual(intent["requiredOperations"], []string{"create", "delete", "query", "upload"}) ||
		!exactEvaluationKeys(runtimeAuthority, []string{
			"kind", "sourceKind", "sourceAuthorityId", "sourceAuthorityImplementationDigest", "routeBinding",
			"capabilityProfileId", "capabilityProfileDigest", "capabilityId", "protocolFamily",
			"providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
			"registrationAuthorityIssuerId", "registrationReceiptDigest",
			"hostedRetrievalRuntimeResourceRegistrationIntentDigest", "authorityDigest",
		}) || stringMember(runtimeAuthority, "kind") != "shared-durable-capability" ||
		stringMember(runtimeAuthority, "sourceKind") != "sealed-hosted-owner-result" ||
		stringMember(runtimeAuthority, "capabilityId") != "provider.hosted-retrieval" ||
		stringMember(optionalAuthority, "capabilityId") != "provider.hosted-retrieval" ||
		stringMember(runtimeAuthority, "hostedRetrievalRuntimeResourceRegistrationIntentDigest") != request.RegistrationIntentDigest {
		return evaluationBudgetDemand{}, ErrConflict
	}
	runtimeAuthorityBase := cloneEvaluationObject(runtimeAuthority)
	delete(runtimeAuthorityBase, "authorityDigest")
	runtimeAuthorityDigest, err := canonicaljson.Digest(runtimeAuthorityBase)
	if err != nil || runtimeAuthorityDigest != stringMember(runtimeAuthority, "authorityDigest") {
		return evaluationBudgetDemand{}, ErrConflict
	}
	for _, binding := range []struct {
		field    string
		expected string
	}{
		{"providerConfigurationId", request.ProviderConfigurationID},
		{"protocolFamily", request.ProtocolFamily},
		{"modelId", stringMember(request.Value, "modelId")},
		{"modelLineageDigest", stringMember(request.Value, "modelLineageDigest")},
		{"adapterDigest", stringMember(request.Value, "adapterDigest")},
		{"capabilityProfileId", request.CapabilityProfileID},
		{"capabilityProfileDigest", profileDigest},
	} {
		if stringMember(intent, binding.field) != binding.expected ||
			stringMember(runtimeAuthority, binding.field) != binding.expected {
			return evaluationBudgetDemand{}, ErrConflict
		}
	}
	if request.RegistrationIntentDigest != stringMember(intent, "intentDigest") ||
		stringMember(request.Value, "registrationIntentDigest") != request.RegistrationIntentDigest ||
		stringMember(request.Value, "providerConfigurationId") != request.ProviderConfigurationID ||
		stringMember(request.Value, "providerConfigurationDigest") != request.ProviderConfigurationDigest ||
		stringMember(intent, "providerConfigurationDigest") != request.ProviderConfigurationDigest ||
		stringMember(target, "providerConfigurationId") != request.ProviderConfigurationID ||
		stringMember(target, "providerIdentityDigest") != request.ProviderConfigurationDigest ||
		stringMember(target, "protocolFamily") != request.ProtocolFamily ||
		stringMember(target, "modelId") != stringMember(request.Value, "modelId") ||
		stringMember(target, "modelLineageDigest") != stringMember(request.Value, "modelLineageDigest") ||
		stringMember(target, "capabilityProfileId") != request.CapabilityProfileID ||
		stringMember(target, "capabilityProfileDigest") != profileDigest ||
		stringMember(optionalAuthority, "qualificationCapabilityProfileId") != request.CapabilityProfileID ||
		stringMember(optionalAuthority, "qualificationCapabilityProfileDigest") != profileDigest ||
		stringMember(probeEvidence, "adapterDigest") != stringMember(request.Value, "adapterDigest") ||
		stringMember(request.Value, "probeProgramDigest") != program.ProgramDigest ||
		stringMember(intent, "probeProgramDigest") != program.ProgramDigest ||
		stringMember(request.Value, "publicResourceDescriptorDigest") != stringMember(program.PublicProbeResource, "descriptorDigest") ||
		stringMember(intent, "publicResourceDescriptorDigest") != stringMember(program.PublicProbeResource, "descriptorDigest") {
		return evaluationBudgetDemand{}, ErrConflict
	}
	content, err := evaluationCapabilityProbePublicResourceContent(
		stringMember(program.PublicProbeResource, "resourceKind"),
	)
	if err != nil {
		return evaluationBudgetDemand{}, ErrConflict
	}
	return createEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(int64(len([]byte(content))))
}

func validateEvaluationHostedRetrievalRuntimeResourceBudgetReservationTx(
	ctx context.Context,
	tx *sql.Tx,
	request evaluationHostedRetrievalRuntimeResourceRegistrationRequest,
	stagedAt time.Time,
) error {
	budget, ok := objectMember(request.Value, "budgetReservationAuthority")
	if !ok {
		return ErrConflict
	}
	reservationID := stringMember(budget, "reservationId")
	ledgerRevision, revisionOK := integerMember(budget, "ledgerRevision")
	reservedAt, instantErr := evaluationInstant(budget["reservedAt"], "reservedAt")
	stagedAt = stagedAt.UTC().Truncate(time.Millisecond)
	if reservationID == "" || !revisionOK || instantErr != nil || stagedAt.IsZero() {
		return ErrConflict
	}
	var planBytes []byte
	var storedPlannedAt, storedExpiresAt time.Time
	err := tx.QueryRowContext(ctx, `SELECT plan_bytes,planned_at,expires_at
		FROM agent_evaluation_plans
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 FOR SHARE`,
		request.NamespaceID, request.PlanDigest, request.RepositoryCommit).Scan(
		&planBytes, &storedPlannedAt, &storedExpiresAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	plan, err := decodeEvaluationPlan(planBytes)
	if err != nil || !bytes.Equal(plan.Canonical, planBytes) || plan.PlanDigest != request.PlanDigest ||
		plan.RepositoryCommit != request.RepositoryCommit ||
		!storedPlannedAt.UTC().Truncate(time.Millisecond).Equal(plan.PlannedAt) ||
		!storedExpiresAt.UTC().Truncate(time.Millisecond).Equal(plan.ExpiresAt) ||
		reservedAt.Before(plan.PlannedAt) || reservedAt.After(stagedAt) || !stagedAt.Before(plan.ExpiresAt) {
		return ErrConflict
	}
	expectedDemand, err := expectedEvaluationHostedRetrievalRuntimeResourceLifecycleDemandFromPlan(plan, request)
	if err != nil {
		return ErrConflict
	}
	var storedRevision int64
	var demandDigest string
	var demandBytes []byte
	var storedReservedAt time.Time
	var unsettled bool
	err = tx.QueryRowContext(ctx, `SELECT reservation.ledger_revision,reservation.demand_digest,
		reservation.demand_bytes,reservation.reserved_at,NOT EXISTS (
			SELECT 1 FROM agent_evaluation_budget_settlements settlement
			WHERE settlement.namespace_id=reservation.namespace_id
			  AND settlement.plan_digest=reservation.plan_digest
			  AND settlement.reservation_id=reservation.reservation_id)
		FROM agent_evaluation_budget_reservations reservation
		WHERE reservation.namespace_id=$1 AND reservation.plan_digest=$2
		  AND reservation.reservation_id=$3 FOR SHARE`,
		request.NamespaceID, request.PlanDigest, reservationID).Scan(
		&storedRevision, &demandDigest, &demandBytes, &storedReservedAt, &unsettled,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	demand, err := decodeEvaluationBudgetDemand(demandBytes, true)
	if err != nil || !unsettled || storedRevision != ledgerRevision || demand.Digest != demandDigest ||
		stringMember(budget, "demandDigest") != demandDigest ||
		stringMember(budget, "demandBytesDigest") != demand.Digest ||
		!storedReservedAt.UTC().Truncate(time.Millisecond).Equal(reservedAt) ||
		storedReservedAt.UTC().Truncate(time.Millisecond).After(stagedAt) {
		return ErrConflict
	}
	return validateEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(demand, expectedDemand)
}

func (owner *EvaluationHostedRetrievalRuntimeResource) StoreRegistrationRequest(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceRegistrationRequest,
) ([]byte, bool, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || request.NamespaceID != authority.NamespaceID {
		return nil, false, errEvaluationServiceUnavailable
	}
	stagedAt := owner.clock().UTC().Truncate(time.Millisecond)
	if stagedAt.IsZero() || !stagedAt.Before(request.MinimumExpiresAt) {
		return nil, false, ErrConflict
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var existing []byte
	err = tx.QueryRowContext(ctx, `SELECT request_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND request_digest=$4
		FOR UPDATE`, authority.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.RequestDigest).Scan(&existing)
	if err == nil {
		if !bytes.Equal(existing, request.Canonical) {
			return nil, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return nil, false, err
		}
		return existing, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceBudgetReservationTx(ctx, tx, request, stagedAt); err != nil {
		return nil, false, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_registration_requests (
		namespace_id,plan_digest,repository_commit,request_digest,runtime_resource_set_id,
		frozen_run_digest,run_config_artifact_binding_digest,registration_intent_digest,
		protocol_family,capability_profile_id,provider_configuration_id,provider_configuration_digest,
		minimum_expires_at,staged_at,request_json,request_bytes,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,TRUE)`,
		authority.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.RequestDigest,
		request.RuntimeResourceSetID, request.FrozenRunDigest, request.RunConfigArtifactBindingDigest,
		request.RegistrationIntentDigest, request.ProtocolFamily, request.CapabilityProfileID,
		request.ProviderConfigurationID, request.ProviderConfigurationDigest, request.MinimumExpiresAt,
		stagedAt, string(request.Canonical), request.Canonical)
	if err != nil {
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return request.Canonical, false, nil
}

func (owner *EvaluationHostedRetrievalRuntimeResource) StoreRegistrationResult(
	ctx context.Context,
	authority EvaluationAuthority,
	result evaluationHostedRetrievalRuntimeResourceRegistrationResult,
) ([]byte, bool, error) {
	request := result.Request
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || request.NamespaceID != authority.NamespaceID {
		return nil, false, errEvaluationServiceUnavailable
	}
	sealedAt := owner.clock().UTC().Truncate(time.Millisecond)
	if sealedAt.IsZero() || sealedAt.Before(result.RegisteredAt) || !sealedAt.Before(result.ExpiresAt) {
		return nil, false, ErrConflict
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var staged []byte
	if err := tx.QueryRowContext(ctx, `SELECT request_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND request_digest=$4
		FOR SHARE`, authority.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.RequestDigest).Scan(&staged); errors.Is(err, sql.ErrNoRows) {
		return nil, false, conflict("hosted retrieval runtime registration result lacks its durable request stage")
	} else if err != nil {
		return nil, false, err
	} else if !bytes.Equal(staged, request.Canonical) {
		return nil, false, ErrConflict
	}
	var existing []byte
	err = tx.QueryRowContext(ctx, `SELECT registration_result_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_results
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND registration_request_digest=$4
		FOR UPDATE`, authority.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.RequestDigest).Scan(&existing)
	if err == nil {
		if !bytes.Equal(existing, result.Canonical) {
			return nil, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return nil, false, err
		}
		return existing, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	budget, budgetOK := objectMember(request.Value, "budgetReservationAuthority")
	if !budgetOK {
		return nil, false, ErrInvalid
	}
	authorityBytes, err := canonicaljson.Bytes(result.Authority)
	if err != nil {
		return nil, false, err
	}
	deletionBytes, err := canonicaljson.Bytes(result.DeletionAuthorityReceipt)
	if err != nil {
		return nil, false, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_registration_results (
		namespace_id,plan_digest,repository_commit,registration_request_digest,registration_result_digest,
		runtime_resource_set_id,frozen_run_digest,run_config_artifact_binding_digest,registration_intent_digest,
		protocol_family,capability_profile_id,provider_configuration_id,provider_configuration_digest,
		budget_reservation_id,budget_reservation_authority_digest,network_policy_authority_digest,
		authority_digest,provider_resource_kind,provider_resource_id,resource_manifest_digest,
		deletion_authority_receipt_digest,registered_at,expires_at,registration_request_json,
		registration_request_bytes,registration_result_json,registration_result_bytes,authority_json,
		authority_bytes,deletion_authority_receipt_json,deletion_authority_receipt_bytes,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
		$24::jsonb,$25,$26::jsonb,$27,$28::jsonb,$29,$30::jsonb,$31,TRUE)`,
		authority.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.RequestDigest, result.ResultDigest,
		request.RuntimeResourceSetID, request.FrozenRunDigest, request.RunConfigArtifactBindingDigest,
		request.RegistrationIntentDigest, request.ProtocolFamily, request.CapabilityProfileID,
		request.ProviderConfigurationID, request.ProviderConfigurationDigest, stringMember(budget, "reservationId"),
		stringMember(request.Value, "budgetReservationAuthorityDigest"), stringMember(request.Value, "networkPolicyAuthorityDigest"),
		result.AuthorityDigest, result.ProviderResourceKind, result.ProviderResourceID, result.ResourceManifestDigest,
		result.DeletionAuthorityReceiptDigest, result.RegisteredAt, result.ExpiresAt, string(request.Canonical), request.Canonical,
		string(result.Canonical), result.Canonical, string(authorityBytes), authorityBytes, string(deletionBytes), deletionBytes)
	if err != nil {
		return nil, false, err
	}
	results, err := loadEvaluationHostedRetrievalRuntimeResourceRegistrationSetTx(
		ctx, tx, authority.NamespaceID, request.PlanDigest, request.RepositoryCommit,
	)
	if err != nil {
		return nil, false, err
	}
	if len(results) == 4 {
		if err := sealEvaluationHostedRetrievalRuntimeResourceSetTx(ctx, tx, results, sealedAt); err != nil {
			return nil, false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return result.Canonical, false, nil
}

func loadEvaluationHostedRetrievalRuntimeResourceRegistrationSetTx(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	planDigest string,
	repositoryCommit string,
) ([]evaluationHostedRetrievalRuntimeResourceRegistrationResult, error) {
	rows, err := tx.QueryContext(ctx, `SELECT registration_result_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_results
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		ORDER BY protocol_family COLLATE "C",capability_profile_id COLLATE "C" FOR SHARE`,
		namespaceID, planDigest, repositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]evaluationHostedRetrievalRuntimeResourceRegistrationResult, 0, 4)
	for rows.Next() {
		var source []byte
		if err := rows.Scan(&source); err != nil {
			return nil, err
		}
		result, err := decodeEvaluationHostedRetrievalRuntimeResourceRegistrationResult(source)
		if err != nil {
			return nil, ErrConflict
		}
		results = append(results, result)
		if len(results) > 4 {
			return nil, ErrConflict
		}
	}
	return results, rows.Err()
}

func sealEvaluationHostedRetrievalRuntimeResourceSetTx(
	ctx context.Context,
	tx *sql.Tx,
	results []evaluationHostedRetrievalRuntimeResourceRegistrationResult,
	sealedAt time.Time,
) error {
	authoritySet, commitment, err := createEvaluationHostedRetrievalRuntimeResourceAuthoritySet(results)
	if err != nil {
		return err
	}
	first := results[0].Request
	authoritySetBytes, err := canonicaljson.Bytes(authoritySet)
	if err != nil {
		return err
	}
	commitmentBytes, err := canonicaljson.Bytes(commitment)
	if err != nil {
		return err
	}
	var existingAuthoritySet []byte
	err = tx.QueryRowContext(ctx, `SELECT authority_set_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_sets
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND runtime_resource_set_id=$4
		FOR UPDATE`, first.NamespaceID, first.PlanDigest, first.RepositoryCommit, first.RuntimeResourceSetID).Scan(&existingAuthoritySet)
	if err == nil {
		if !bytes.Equal(existingAuthoritySet, authoritySetBytes) {
			return ErrConflict
		}
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_sets (
		namespace_id,plan_digest,repository_commit,runtime_resource_set_id,frozen_run_digest,
		run_config_artifact_binding_digest,authority_set_digest,resource_set_commitment_digest,
		authority_set_json,authority_set_bytes,resource_set_commitment_json,resource_set_commitment_bytes,
		sealed_at,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13,TRUE)`,
		first.NamespaceID, first.PlanDigest, first.RepositoryCommit, first.RuntimeResourceSetID,
		first.FrozenRunDigest, first.RunConfigArtifactBindingDigest, stringMember(authoritySet, "authoritySetDigest"),
		stringMember(commitment, "commitmentDigest"), string(authoritySetBytes), authoritySetBytes,
		string(commitmentBytes), commitmentBytes, sealedAt)
	if err != nil {
		return err
	}
	for _, result := range results {
		activeState, activeStateBytes, err := createEvaluationHostedRetrievalRuntimeResourceActiveState(
			result.AuthorityDigest, stringMember(commitment, "commitmentDigest"),
			evaluationHostedRetrievalRuntimeResourceOwnerAuthorityIssuerID, 1, nil, sealedAt,
		)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resources (
			namespace_id,plan_digest,repository_commit,authority_digest,registration_request_digest,
			runtime_resource_set_id,resource_set_commitment_digest,provider_resource_kind,provider_resource_id,
			resource_expires_at,active_owner_instance_id,claim_generation,lifecycle,read_lease_not_after,
			stored_active_state_digest,stored_active_state_json,stored_active_state_bytes,
			stored_active_owner_instance_id,stored_active_claim_generation,stored_active_read_lease_not_after,
			stored_active_updated_at,current_state_digest,current_state_json,current_state_bytes,
			current_state_updated_at,cleanup_request_digest,cleanup_receipt_digest,v46_eligible
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,'active',NULL,$12,$13::jsonb,$14,$11,1,NULL,$15,
			$12,$13::jsonb,$14,$15,NULL,NULL,TRUE)`,
			result.Request.NamespaceID, result.Request.PlanDigest, result.Request.RepositoryCommit,
			result.AuthorityDigest, result.Request.RequestDigest, result.Request.RuntimeResourceSetID,
			stringMember(commitment, "commitmentDigest"), result.ProviderResourceKind, result.ProviderResourceID,
			result.ExpiresAt, evaluationHostedRetrievalRuntimeResourceOwnerAuthorityIssuerID,
			stringMember(activeState, "stateDigest"), string(activeStateBytes), activeStateBytes, sealedAt)
		if err != nil {
			return err
		}
	}
	return nil
}

func (owner *EvaluationHostedRetrievalRuntimeResource) LookupRegistrationSet(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
) ([]byte, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || request.NamespaceID != authority.NamespaceID {
		return nil, errEvaluationServiceUnavailable
	}
	checkedAt := owner.clock().UTC().Truncate(time.Millisecond)
	if checkedAt.IsZero() || checkedAt.Before(request.RequestedAt) {
		return nil, ErrConflict
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var existingRequest, existingReceipt []byte
	err = tx.QueryRowContext(ctx, `SELECT request.request_bytes,receipt.receipt_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_requests request
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_receipts receipt
		  ON receipt.namespace_id=request.namespace_id AND receipt.plan_digest=request.plan_digest
		 AND receipt.repository_commit=request.repository_commit AND receipt.request_digest=request.request_digest
		WHERE request.namespace_id=$1 AND request.plan_digest=$2 AND request.repository_commit=$3
		  AND request.request_digest=$4 FOR SHARE`, authority.NamespaceID, request.PlanDigest,
		request.RepositoryCommit, request.RequestDigest).Scan(&existingRequest, &existingReceipt)
	if err == nil {
		if !bytes.Equal(existingRequest, request.Canonical) {
			return nil, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return existingReceipt, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	bindingsBytes, err := canonicaljson.Bytes(request.IntentBindings)
	if err != nil {
		return nil, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_requests (
		namespace_id,plan_digest,repository_commit,request_digest,frozen_run_digest,
		run_config_artifact_binding_digest,registration_intent_bindings_json,requested_at,request_json,request_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10)`, authority.NamespaceID,
		request.PlanDigest, request.RepositoryCommit, request.RequestDigest, request.FrozenRunDigest,
		request.RunConfigArtifactBindingDigest, string(bindingsBytes), request.RequestedAt,
		string(request.Canonical), request.Canonical)
	if err != nil {
		return nil, err
	}
	var runtimeResourceSetID string
	var authoritySetBytes, commitmentBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT runtime_resource_set_id,authority_set_bytes,resource_set_commitment_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_sets
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 FOR SHARE`,
		authority.NamespaceID, request.PlanDigest, request.RepositoryCommit).Scan(
		&runtimeResourceSetID, &authoritySetBytes, &commitmentBytes,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	results, err := loadEvaluationHostedRetrievalRuntimeResourceRegistrationSetTx(
		ctx, tx, authority.NamespaceID, request.PlanDigest, request.RepositoryCommit,
	)
	if err != nil || len(results) != 4 {
		return nil, ErrConflict
	}
	registrationResults := make([]any, 0, 4)
	minimumExpiresAt := results[0].ExpiresAt
	for _, result := range results {
		registrationResults = append(registrationResults, result.Value)
		if result.ExpiresAt.Before(minimumExpiresAt) {
			minimumExpiresAt = result.ExpiresAt
		}
	}
	if !checkedAt.Before(minimumExpiresAt) {
		return nil, ErrConflict
	}
	expiresAt := checkedAt.Add(125 * time.Second)
	if expiresAt.After(minimumExpiresAt) {
		expiresAt = minimumExpiresAt
	}
	if !expiresAt.After(checkedAt) {
		return nil, ErrConflict
	}
	authoritySet, err := decodeCanonicalEvaluationObject(authoritySetBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		return nil, ErrConflict
	}
	commitment, err := decodeCanonicalEvaluationObject(commitmentBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		return nil, ErrConflict
	}
	var lookupRevision int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(lookup_ledger_revision),0)+1
		FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`, authority.NamespaceID,
		request.PlanDigest, request.RepositoryCommit).Scan(&lookupRevision); err != nil {
		return nil, err
	}
	receiptBase := map[string]any{
		"format":                              "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-set-lookup-receipt",
		"version":                             int64(1),
		"requestDigest":                       request.RequestDigest,
		"namespaceId":                         request.NamespaceID,
		"repositoryCommit":                    request.RepositoryCommit,
		"planDigest":                          request.PlanDigest,
		"frozenRunDigest":                     request.FrozenRunDigest,
		"runConfigArtifactBindingDigest":      request.RunConfigArtifactBindingDigest,
		"runtimeResourceSetId":                runtimeResourceSetID,
		"lookupAuthorityIssuerId":             evaluationHostedRetrievalRuntimeResourceLookupAuthorityIssuerID,
		"lookupAuthorityImplementationDigest": evaluationHostedRetrievalRuntimeResourceLookupAuthorityImplementationDigest,
		"lookupLedgerRevision":                lookupRevision,
		"registrationResults":                 registrationResults,
		"authoritySet":                        authoritySet,
		"resourceSetCommitment":               commitment,
		"checkedAt":                           evaluationExportInstant(checkedAt),
		"expiresAt":                           evaluationExportInstant(expiresAt),
	}
	receiptDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil {
		return nil, err
	}
	receipt := cloneEvaluationObject(receiptBase)
	receipt["receiptDigest"] = receiptDigest
	receiptBytes, err := canonicaljson.Bytes(receipt)
	if err != nil || len(receiptBytes) > maximumEvaluationHostedRetrievalRuntimeResourceRegistrationSetLookupBytes {
		return nil, ErrConflict
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_receipts (
		namespace_id,plan_digest,repository_commit,request_digest,receipt_digest,runtime_resource_set_id,
		lookup_authority_issuer_id,lookup_authority_implementation_digest,lookup_ledger_revision,
		checked_at,expires_at,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`, authority.NamespaceID,
		request.PlanDigest, request.RepositoryCommit, request.RequestDigest, receiptDigest, runtimeResourceSetID,
		evaluationHostedRetrievalRuntimeResourceLookupAuthorityIssuerID,
		evaluationHostedRetrievalRuntimeResourceLookupAuthorityImplementationDigest, lookupRevision,
		checkedAt, expiresAt, string(receiptBytes), receiptBytes)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return receiptBytes, nil
}

func (owner *EvaluationHostedRetrievalRuntimeResource) ReadActiveResource(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceReadRequest,
) ([]byte, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || request.NamespaceID != authority.NamespaceID {
		return nil, errEvaluationServiceUnavailable
	}
	checkedAt := owner.clock().UTC().Truncate(time.Millisecond)
	if checkedAt.IsZero() {
		return nil, ErrConflict
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var existingRequest, existingReceipt []byte
	err = tx.QueryRowContext(ctx, `SELECT request_bytes,receipt_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_read_receipts
		WHERE namespace_id=$1 AND request_digest=$2 FOR SHARE`, authority.NamespaceID, request.RequestDigest).Scan(
		&existingRequest, &existingReceipt,
	)
	if err == nil {
		if !bytes.Equal(existingRequest, request.Canonical) {
			return nil, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return existingReceipt, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	var runtimeResourceSetID, commitmentDigest, activeOwnerID, lifecycle string
	var currentGeneration int64
	var resourceExpiresAt, currentUpdatedAt time.Time
	var readLedgerOpen bool
	// Resource reads and ledger-root sealing serialize on this row. Once a root
	// exists, it is the immutable close of the complete read ledger.
	err = tx.QueryRowContext(ctx, `SELECT runtime_resource_set_id,resource_set_commitment_digest,
		active_owner_instance_id,claim_generation,lifecycle,resource_expires_at,current_state_updated_at,
		NOT EXISTS (
			SELECT 1 FROM agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots root
			WHERE root.namespace_id=resource.namespace_id AND root.plan_digest=resource.plan_digest
			  AND root.repository_commit=resource.repository_commit AND root.authority_digest=resource.authority_digest
		)
		FROM agent_evaluation_hosted_retrieval_runtime_resources resource
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND authority_digest=$4
		FOR UPDATE OF resource`, authority.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.AuthorityDigest).Scan(
		&runtimeResourceSetID, &commitmentDigest, &activeOwnerID, &currentGeneration,
		&lifecycle, &resourceExpiresAt, &currentUpdatedAt, &readLedgerOpen,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if lifecycle != "active" || runtimeResourceSetID != request.RuntimeResourceSetID ||
		commitmentDigest != request.ResourceSetCommitmentDigest || checkedAt.Before(currentUpdatedAt) ||
		!checkedAt.Before(resourceExpiresAt) || !readLedgerOpen {
		return nil, ErrConflict
	}
	expiresAt := checkedAt.Add(155 * time.Second)
	if request.MinimumExpiresAt.After(expiresAt) {
		expiresAt = request.MinimumExpiresAt
	}
	if expiresAt.After(checkedAt.Add(180*time.Second)) || expiresAt.After(resourceExpiresAt) || !expiresAt.After(checkedAt) {
		return nil, ErrConflict
	}
	claimGeneration := currentGeneration
	if activeOwnerID != request.ReaderOwnerInstanceID {
		claimGeneration++
	}
	if claimGeneration < 1 || claimGeneration > 9_007_199_254_740_991 {
		return nil, ErrConflict
	}
	activeState, activeStateBytes, err := createEvaluationHostedRetrievalRuntimeResourceActiveState(
		request.AuthorityDigest, request.ResourceSetCommitmentDigest, request.ReaderOwnerInstanceID,
		claimGeneration, &expiresAt, checkedAt,
	)
	if err != nil {
		return nil, err
	}
	receiptBase := map[string]any{
		"format":                         "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-read-receipt",
		"version":                        int64(1),
		"readRequestDigest":              request.RequestDigest,
		"planDigest":                     request.PlanDigest,
		"runConfigArtifactBindingDigest": request.RunConfigArtifactBindingDigest,
		"runtimeResourceSetId":           request.RuntimeResourceSetID,
		"authorityDigest":                request.AuthorityDigest,
		"resourceSetCommitmentDigest":    request.ResourceSetCommitmentDigest,
		"readLeaseId":                    request.ReadLeaseID,
		"activeOwnerInstanceId":          request.ReaderOwnerInstanceID,
		"claimGeneration":                claimGeneration,
		"activeState":                    activeState,
		"activeStateDigest":              stringMember(activeState, "stateDigest"),
		"lifecycle":                      "active",
		"checkedAt":                      evaluationExportInstant(checkedAt),
		"expiresAt":                      evaluationExportInstant(expiresAt),
	}
	receiptDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil {
		return nil, err
	}
	receipt := cloneEvaluationObject(receiptBase)
	receipt["receiptDigest"] = receiptDigest
	receiptBytes, err := canonicaljson.Bytes(receipt)
	if err != nil || len(receiptBytes) > maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes {
		return nil, ErrConflict
	}
	updateResult, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_hosted_retrieval_runtime_resources SET
		active_owner_instance_id=$5,claim_generation=$6,read_lease_not_after=$7,
		stored_active_state_digest=$8,stored_active_state_json=$9::jsonb,stored_active_state_bytes=$10,
		stored_active_owner_instance_id=$5,stored_active_claim_generation=$6,stored_active_read_lease_not_after=$7,
		stored_active_updated_at=$11,current_state_digest=$8,current_state_json=$9::jsonb,current_state_bytes=$10,
		current_state_updated_at=$11
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND authority_digest=$4
		  AND lifecycle='active' AND claim_generation=$12 AND current_state_updated_at=$13`,
		authority.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.AuthorityDigest,
		request.ReaderOwnerInstanceID, claimGeneration, expiresAt, stringMember(activeState, "stateDigest"),
		string(activeStateBytes), activeStateBytes, checkedAt, currentGeneration, currentUpdatedAt)
	if err != nil {
		return nil, err
	}
	updatedRows, err := updateResult.RowsAffected()
	if err != nil {
		return nil, err
	}
	if updatedRows != 1 {
		return nil, conflict("hosted retrieval runtime resource read lost its active-state compare-and-swap")
	}
	var ledgerRevision int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(ledger_revision),0)+1
		FROM agent_evaluation_hosted_retrieval_runtime_resource_read_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND authority_digest=$4`,
		authority.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.AuthorityDigest).Scan(&ledgerRevision); err != nil {
		return nil, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_read_receipts (
		namespace_id,plan_digest,repository_commit,authority_digest,ledger_revision,request_digest,receipt_digest,
		read_lease_id,reader_owner_instance_id,active_owner_instance_id,claim_generation,active_state_digest,
		checked_at,expires_at,request_json,request_bytes,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,$17)`,
		authority.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.AuthorityDigest,
		ledgerRevision, request.RequestDigest, receiptDigest, request.ReadLeaseID, request.ReaderOwnerInstanceID,
		claimGeneration, stringMember(activeState, "stateDigest"), checkedAt, expiresAt,
		string(request.Canonical), request.Canonical, string(receiptBytes), receiptBytes)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return receiptBytes, nil
}
